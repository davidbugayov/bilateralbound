'use strict'
/**
 * Controller - Логика управления сессией BilateralBound v2.1
 * Современная модульная архитектура с улучшенной обработкой ошибок
 */
// Экспортируем функции для использования в тестах
/* exported setDirection, resetCenter, updateSpeed, setBallColor, setBallSize, setBackgroundColor, togglePlayPause, resetSession, setSoundEnabled, setSoundType */
/* global debugWarn, debugError, RealtimeClient */
if (typeof globalThis.BBDebug === 'undefined') {
  globalThis.BBDebug = { isEnabled: false, log: () => {} }
}
// 1. Глобальное состояние определяется в первую очередь, до загрузки DOM
globalThis.__current = {
  sessionId: null,
  viewerConnected: false,
  viewerScreenSize: { width: 0, height: 0 },
  isInitializing: true // Глобальный флаг инициализации
}
// 2. Рендерер для превью
globalThis.__previewRenderer = null
globalThis.__previewScale = 1 // Коэффициент масштабирования
// 3. Глобальные переменные для логики контроллера
const components = {}
// Экспортируем ссылку на компоненты для использования в новых функциях
if (typeof globalThis !== 'undefined') {
  globalThis.components = components
}

let lastServerState = null // Кэшируем последнее состояние от сервера
let directionState = { dx: 1, dy: 0 }

let isPlaying = false
let currentDirectionMode = 'horizontal'
let wsClient
let isInitialized = false // Флаг для предотвращения повторной инициализации
let __ignoreServerPausedUntilTs = 0 // Кратковременная блокировка переопределения isPlaying сервером
let __ignoreServerDirectionUntilTs = 0 // Кратковременная блокировка переопределения направления сервером
const isInitializing = true // Flag to prevent sending updates during initialization
// --- State ---
let previewPhysicsEngine = null // Локальный движок физики для превью
let hiddenThrottleMs = 100 // при скрытой вкладке обновляем ~10 FPS
if (globalThis.BBConfig?.rendering?.hiddenThrottleMs != null) {
  hiddenThrottleMs = globalThis.BBConfig.rendering.hiddenThrottleMs
}

let physicsInterval = null // Глобальный интервал физики для возможности остановки извне
// --- Elements ---
let previewFsCanvas = null
let previewFsRenderer = null
let isPreviewFullscreen = false
let fsPanelHideTimer = null
const fsPanelDrag = { active: false, offsetX: 0, offsetY: 0 }
// ====== СЧЁТЧИКИ: таймер/пасы/сеты ======
const bbCounters = {
  timerMs: 0,
  passes: 0,
  sets: 0,
  running: false,
  lastTickTs: 0,
  $timer: null,
  $passes: null,
  $sets: null,
  $passesPerSecond: null,
  $speedInfo: null,
  _lastBounceTs: 0,
  bounceHits: 0, // количество отдельных стуков (2 стука = 1 пасс)
  _passesHistory: [], // История пассов для расчета скорости
  _lastSpeedMeasurement: 0,
  _measurementInterval: null,
  _currentPassesPerSecond: 0,
  initDom() {
    this.$timer = document.getElementById('bbTimer')
    this.$passes = document.getElementById('bbPasses')
    this.$sets = document.getElementById('bbSets')
    this.$passesPerSecond = document.getElementById('bbPassesPerSecond')
    this.$speedInfo = document.getElementById('speedInfo')
    const resetBtn = document.getElementById('bbResetBtn')
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetAll())
    }

    // Инициализируем измерение скорости
    this.initSpeedMeasurement()
    this.render()
  },
  initSpeedMeasurement() {
    // Запускаем измерение скорости каждые 2 секунды
    this._measurementInterval = setInterval(() => {
      this.updatePassesPerSecond()
    }, 2000)
  },
  updatePassesPerSecond() {
    if (!this.running) {
      this._currentPassesPerSecond = 0
      return
    }

    const now = performance.now()
    // Удаляем старые записи старше 2 секунд
    this._passesHistory = this._passesHistory.filter(timestamp => now - timestamp < 2000)

    // Рассчитываем скорость пассов в секунду
    const passesInLast2Seconds = this._passesHistory.length / 2 // Делим на 2, т.к. считаем за 2 секунды
    this._currentPassesPerSecond = Math.round(passesInLast2Seconds * 10) / 10 // Округляем до 1 знака

    this.renderSpeedInfo()
  },
  addPassMeasurement() {
    this._passesHistory.push(performance.now())
    this.updatePassesPerSecond()
  },
  start() {
    this.running = true
    this.lastTickTs = performance.now()
    this._passesHistory = [] // Очищаем историю при старте
  },
  stop(incrementSet = false) {
    this.tick(performance.now())
    this.running = false
    if (incrementSet) {
      this.sets += 1
      // После каждого сета обнуляем пасы и счетчик стуков
      this.passes = 0
      this.bounceHits = 0
      this._lastBounceTs = 0
      this._passesHistory = [] // Очищаем историю
    }
    // По требованию: после Стоп таймер обнулять
    this.timerMs = 0
    this.render()
  },
  resetAll() {
    this.timerMs = 0
    this.passes = 0
    this.sets = 0
    this.bounceHits = 0
    this._lastBounceTs = 0
    this._passesHistory = []
    this._currentPassesPerSecond = 0
    this.render()
  },
  onBounce() {
    if (!this.running) return
    const now = performance.now()
    if (now - this._lastBounceTs < 120) return
    this._lastBounceTs = now
    // Учитываем, что 1 пасс = 2 стука (туда-обратно)
    this.bounceHits += 1
    if (this.bounceHits % 2 === 0) {
      this.passes += 1
      // Добавляем измерение для расчета скорости
      this.addPassMeasurement()
    }

    this.render()
  },
  tick(nowTs) {
    if (!this.running) return
    const dt = nowTs - this.lastTickTs
    if (dt > 0) {
      this.timerMs += dt
      this.lastTickTs = nowTs
      // не перерисовываем чаще 10/с
      if (!this?._lastRenderTs || nowTs - (this._lastRenderTs || 0) > 100) {
        this._lastRenderTs = nowTs
        this.render()
      }
    }
  },
  formatTime(ms) {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  },
  render() {
    if (this.$timer) this.$timer.textContent = this.formatTime(this.timerMs)
    if (this.$passes) this.$passes.textContent = String(this.passes)
    if (this.$sets) this.$sets.textContent = String(this.sets)
    this.renderSpeedInfo()
  },
  renderSpeedInfo() {
    if (this.$passesPerSecond) {
      this.$passesPerSecond.textContent = this._currentPassesPerSecond.toString()
    }

    if (components.speed && this.$speedInfo) {
      const currentSpeed = components.speed.getSpeed()
      let speedCategory = ''
      let speedColor = ''

      if (currentSpeed <= 15) {
        speedCategory = 'Очень медленно'
        speedColor = '#22c55e' // зеленый
      } else if (currentSpeed <= 25) {
        speedCategory = 'Медленно'
        speedColor = '#3b82f6' // синий
      } else if (currentSpeed <= 35) {
        speedCategory = 'Средне'
        speedColor = '#8b5cf6' // фиолетовый
      } else if (currentSpeed <= 50) {
        speedCategory = 'Быстро'
        speedColor = '#f59e0b' // оранжевый
      } else {
        speedCategory = 'Очень быстро'
        speedColor = '#ef4444' // красный
      }

      this.$speedInfo.textContent = speedCategory
      this.$speedInfo.style.color = speedColor
    }
  }
}
// Детектор отскоков по серверным state_update (для подсчёта пассов)
let __lastBounceTs = 0
let __lastVxSign = 0
let __lastVySign = 0
function _hasBounced(currentVelocity, lastSign, minSpeed) {
  const currentSign = Math.sign(currentVelocity)
  return (
    currentSign !== 0 &&
    lastSign !== 0 &&
    currentSign !== lastSign &&
    Math.abs(currentVelocity) > minSpeed
  )
}

/**
 * Обнаруживает и подсчитывает отскоки на основе обновлений состояния сервера.
 * Рефакторинг для снижения когнитивной сложности.
 * @param {object} prev - Предыдущее состояние.
 * @param {object} curr - Текущее состояние.
 */
function detectAndCountBounceFromServer(prev, curr) {
  try {
    if (!prev || !curr || !bbCounters.running) {
      return
    }

    const now = performance.now()
    if (now - __lastBounceTs < 120) {
      return
    }

    const minSpeed = 10
    const currVx = curr?.vx || 0
    const currVy = curr?.vy || 0

    if (__lastVxSign === 0) __lastVxSign = Math.sign(prev?.vx || 0)
    if (__lastVySign === 0) __lastVySign = Math.sign(prev?.vy || 0)

    const bouncedX = _hasBounced(currVx, __lastVxSign, minSpeed)
    const bouncedY = _hasBounced(currVy, __lastVySign, minSpeed)

    if (bouncedX || bouncedY) {
      __lastBounceTs = now
      bbCounters.onBounce()
    }

    const currSignX = Math.sign(currVx)
    if (currSignX !== 0) {
      __lastVxSign = currSignX
    }

    const currSignY = Math.sign(currVy)
    if (currSignY !== 0) {
      __lastVySign = currSignY
    }
  } catch (err) {
    debugWarn('Error in detectAndCountBounceFromServer:', err)
  }
}
// 4. Остальная логика выполняется после полной загрузки страницы
document.addEventListener('DOMContentLoaded', () => {
  // Тихая инициализация
  initializeController().catch(debugError)
  // Инициализируем DOM для счётчиков
  bbCounters.initDom()
  // При изменении размера окна контроллера — пересчитать превью по текущим размерам вьювера
  globalThis.addEventListener('resize', () => {
    const size = globalThis.__current?.viewerScreenSize
    if (size?.width > 0 && size?.height > 0) {
      updatePreviewSize(size)
    }
  })
})
/**
 * Современная инициализация контроллера с улучшенной обработкой ошибок
 */
async function initializeController() {
  const logger = createLogger('Controller')
  try {
    if (globalThis.__current) globalThis.__current.isInitializing = true
    // logger.info('Начинаем инициализацию контроллера')
    const sessionId = getSessionIdFromUrl()
    if (!sessionId) {
      debugError('ID сессии не найден в URL')
      showNotification('ID сессии не найден в URL', 'error')
      if (globalThis.__current) globalThis.__current.isInitializing = false
      return
    }

    globalThis.__current.sessionId = sessionId
    // logger.info(`Работаем с сессией: ${sessionId}`)

    await registerControllerOnServer(sessionId, logger)
    await initializeDOMElements(sessionId)

    // UI initialization
    await initializePreviewUI()
    initializeComponents()
    await initializePreview()
    setupFullscreenListeners()

    // Подключаемся к Realtime сразу
    await initializeWebSocketClient(sessionId)
    // logger.info('🔌 WebSocket клиент инициализирован')

    if (globalThis.__current) globalThis.__current.isInitializing = false
  } catch (error) {
    if (globalThis.__current) globalThis.__current.isInitializing = false
    debugError('Error initializing controller:', error)
    showNotification('Ошибка инициализации контроллера: ' + (error?.message || error), 'error')
  }
}

// Extracted helper functions to reduce cognitive complexity
async function registerControllerOnServer(sessionId, logger) {
  try {
    const connectResponse = await fetch(`/api/session/${sessionId}/controller/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    if (connectResponse.ok) {
      // logger.info('Контроллер зарегистрирован на сервере')
    } else {
      // logger.warning('Не удалось зарегистрировать контроллер на сервере')
    }
  } catch (error) {
    // logger.warning('Ошибка регистрации контроллера:', error)
  }
}

async function initializePreviewUI() {
  const previewWrap = document.getElementById('previewWrap')
  if (previewWrap) {
    previewWrap.style.display = 'block'
  }
}

function setupFullscreenListeners() {
  const openFsBtn = document.getElementById('openPreviewFullscreenBtn')
  const exitFsBtn = document.getElementById('exitPreviewFullscreenBtn')
  const overlay = document.getElementById('previewOverlay')
  previewFsCanvas = document.getElementById('previewFullscreenCanvas')

  // Регистрируем обработчики клавиш всегда с capture для надежности
  document.addEventListener('keydown', handleFullscreenKeydown, true)
  globalThis.addEventListener('popstate', handlePopState)

  // Регистрируем обработчик открытия независимо
  if (openFsBtn) {
    openFsBtn.addEventListener('click', () => {
      openPreviewFullscreen()
    })
  }

  // Регистрируем обработчик закрытия независимо
  if (exitFsBtn) {
    exitFsBtn.addEventListener('click', closePreviewFullscreen)
  }

  // Регистрируем resize
  globalThis.addEventListener('resize', () => {
    if (isPreviewFullscreen) resizePreviewFullscreen()
  })
}

function handleFullscreenKeydown(e) {
  // Игнорируем если фокус в input или textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return
  }

  const key = e?.key?.toLowerCase()

  // Обрабатываем клавишу F для полноэкранного режима
  if (key === 'f') {
    e.preventDefault()
    e.stopPropagation()
    if (isPreviewFullscreen) {
      closePreviewFullscreen()
    } else {
      openPreviewFullscreen()
    }
  } else if (key === 'escape' && isPreviewFullscreen) {
    e.preventDefault()
    e.stopPropagation()
    closePreviewFullscreen()
  }
}

function handlePopState() {
  if (isPreviewFullscreen) {
    closePreviewFullscreen()
  } else if (globalThis.location.hash === '#fullscreen-preview') {
    openPreviewFullscreen()
  }
}
/**
 * Завершает инициализацию после подключения вьювера
 */
async function completeInitialization() {
  // Функция разбита для снижения когнитивной сложности
  if (isInitialized) {
    return // Уже инициализировано
  }

  isInitialized = true
  const logger = createLogger('Controller')
  // logger.success('✅ Вьювер подключен! Завершаем инициализацию...')
  try {
    // Раньше здесь был initializePreview, теперь он вызывается сразу
    // logger.success('🎉 Контроллер полностью готов к работе!')
  } catch (error) {
    await handleInitializationError(error, logger)
  }
}
/**
 * Современная инициализация DOM элементов
 */
async function initializeDOMElements(sessionId) {
  // Функция разбита для снижения когнитивной сложности

  // Устанавливаем ID сессии
  const curSidEl = document.getElementById('curSid')
  if (curSidEl) {
    curSidEl.textContent = sessionId
  }

  // Устанавливаем информацию о сессии (название и время создания)
  const sessionInfoEl = document.getElementById('sessionInfo')
  if (sessionInfoEl) {
    const timestamp = new Date().toLocaleString()
    sessionInfoEl.textContent = `Создана: ${timestamp}`
  }

  // Устанавливаем время создания сессии
  const sessionTimestampEl = document.getElementById('sessionTimestamp')
  if (sessionTimestampEl) {
    sessionTimestampEl.textContent = `Создана: ${new Date().toLocaleString()}`
  }

  // Устанавливаем ID сессии viewer'а
  const viewerSessionIdEl = document.getElementById('viewerSessionId')
  if (viewerSessionIdEl) {
    viewerSessionIdEl.textContent = sessionId
  }

  // Устанавливаем статус viewer'а
  const viewerStatusEl = document.getElementById('viewerStatus')
  if (viewerStatusEl) {
    viewerStatusEl.textContent = 'ожидание'
    viewerStatusEl.classList.add('disconnected')
  }

  // Обновляем ссылку для зрителя сразу после инициализации
  updateViewerLink(sessionId)
}

function updateViewerLink(sessionId) {
  // Функция разбита для снижения когнитивной сложности
  const viewLinkInput = document.getElementById('view')
  if (viewLinkInput) {
    viewLinkInput.value = `${globalThis.location.origin}/s/${sessionId}`
  }
}
/**
 * Современная инициализация RealtimeClient (SSE по умолчанию)
 */
async function initializeWebSocketClient(sessionId) {
  // Функция разбита для снижения когнитивной сложности
  const logger = createLogger('RealtimeClient')

  // Создаем клиента с улучшенной конфигурацией
  // По умолчанию использует SSE для снижения нагрузки на сервер
  // Для принудительного использования WebSocket: { transport: 'websocket' }
  wsClient = new RealtimeClient(sessionId, 'controller', {
    maxReconnectAttempts: 10,
    reconnectInterval: 2000,
    heartbeatInterval: 25000,
    coalesceDelayMs: 8 // Уменьшаем задержку для большей плавности
  })
  globalThis.wsClient = wsClient

  // logger.info(`🔌 Используется транспорт: ${wsClient.getTransportType().toUpperCase()}`)

  // Настраиваем обработчики событий
  setupWebSocketEventHandlers(wsClient, logger, sessionId)

  // Подключаемся с таймаутом
  await Promise.race([
    (async () => {
      try {
        await wsClient.connect()
      } catch (error) {
        // Пробрасываем ошибку, чтобы Promise.race ее поймал
        throw new Error(`Realtime connection failed: ${error.message}`)
      }
    })(),
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('Realtime connection timeout')), 15000)
    )
  ])
  // logger.success('RealtimeClient успешно инициализирован')
}
/**
 * Настройка обработчиков RealtimeClient событий
 */
function setupWebSocketEventHandlers(wsClient, logger, sessionId) {
  // Сохраняем состояние для восстановления после reconnect
  let lastPlayingState = false
  
  wsClient.on('open', (event) => {
    updateConnectionStatus(true)

    // При reconnect запрашиваем синхронизацию и восстанавливаем состояние
    if (event?.isReconnection) {
      safeSend('request_state_sync', {
        timestamp: Date.now(),
        sessionId: sessionId,
        role: 'controller'
      })
      
      // Восстанавливаем воспроизведение если было активно
      if (lastPlayingState && globalThis.__current?.viewerConnected) {
        setTimeout(() => {
          if (previewPhysicsEngine) {
            previewPhysicsEngine.setPaused(false)
          }
          isPlaying = true
          globalThis.__current.isPlaying = true
          updatePlayPauseButton()
        }, 500)
      }
    }

    // Уведомляем сервер о подключении контроллера
    safeSend('controller_connected', {
      timestamp: Date.now(),
      sessionId: sessionId,
      role: 'controller'
    })
  })
  wsClient.on('close', event => {
    updateConnectionStatus(false)
    
    // Сохраняем состояние перед отключением
    lastPlayingState = isPlaying

    // Code 1006 - abnormal closure
    if (event.code === 1006) {
      if (previewPhysicsEngine) {
        previewPhysicsEngine.setPaused(true)
        const centerX = previewPhysicsEngine.centerX || (globalThis.__previewCanvas?.width || 500) / 2
        const centerY = previewPhysicsEngine.centerY || (globalThis.__previewCanvas?.height || 375) / 2
        previewPhysicsEngine.setPosition(centerX, centerY)
        previewPhysicsEngine.setVelocity(0, 0)
      }
      isPlaying = false
      globalThis.__current.viewerConnected = false
      updatePlayPauseButton()
    }

    updateViewerStatusUI()
  })
  wsClient.on('error', () => {
    // Ошибки соединения обрабатываются тихо - reconnect автоматический
  })
  wsClient.on(WS_MSG.viewerStatus, data => {
    const wasConnected = globalThis.__current.viewerConnected
    globalThis.__current.viewerConnected = data.connected

    if (data.screenSize) {
      globalThis.__current.viewerScreenSize = data.screenSize
    }

    // Если вьювер подключился, завершаем инициализацию
    if (data.connected) {
      completeInitialization().catch(debugError)
    }

    // Если вьювер отключился - сбрасываем состояние и останавливаем превью
    if (wasConnected && !data.connected) {
      // logger.info('Viewer отключился, сбрасываем состояние')

      // Сбрасываем ВСЕ состояние контроллера - забываем что viewer когда-то подключался

      // Сбрасываем флаги активации звука
      globalThis.__current.viewerAudioActivated = false

      // Очищаем размер экрана viewer чтобы UI показывал ожидание
      globalThis.__current.viewerScreenSize = null

      // Сбрасываем состояние воспроизведения ГЛОБАЛЬНО (ВТОРАЯ ГАРАНТИЯ)
      isPlaying = false
      globalThis.__current.isPlaying = false

      // Останавливаем превью если оно запущено
      if (previewPhysicsEngine) {
        previewPhysicsEngine.setPaused(true)
      }

      // Сбрасываем направление на горизонтальное (исходное состояние)
      directionState = { dx: 1, dy: 0 }
      currentDirectionMode = 'horizontal'
      updateDirectionDisplay(1, 0)
      updateDirectionButtons()

      // Сбрасываем счётчики на исходное состояние
      if (bbCounters && typeof bbCounters.resetAll === 'function') {
        bbCounters.resetAll()
      }

      // Сбрасываем кэш состояния с сервера
      lastServerState = null

      // Явно обновляем элемент viewerStatus - устанавливаем красное состояние "ожидание"
      const viewerStatusEl = document.getElementById('viewerStatus')
      if (viewerStatusEl) {
        viewerStatusEl.textContent = 'ожидание'
        viewerStatusEl.classList.remove('connected')
        viewerStatusEl.classList.add('disconnected')
        viewerStatusEl.style.fontWeight = '400'
      }

      // Центрируем мяч в preview контроллера при отключении viewer'а
      centerBallInViewer()

      // Показываем режим ожидания
      showWaitingForViewer()

      // ← НОВОЕ: Обновляем кнопку Play/Pause чтобы показать что она отключена
      updatePlayPauseButton()

      // Синхронизируем UI (показывает красный статус "ожидание")
      updateViewerStatusUI()
    }
  })
  wsClient.on(WS_MSG.initialState, state => {
    // logger.info('Получено начальное состояние', state)
    lastServerState = state // Кэшируем состояние

    // CRITICAL: Update viewer connection status from initial_state
    if (typeof state.viewerConnected === 'boolean') {
      globalThis.__current.viewerConnected = state.viewerConnected
    }

    // ВАЖНО: Сначала обновляем размер превью, если есть данные,
    // и только потом применяем состояние. Это решает проблему гонки состояний.
    if (state.viewerScreenSize && state.viewerScreenSize.width > 0) {
      globalThis.__current.viewerScreenSize = state.viewerScreenSize
      updatePreviewSize(state.viewerScreenSize)
      updateViewerInfo(state.viewerScreenSize)
    }

    // Применяем состояние от сервера к превью
    // В viewer режиме applyServerStateToPreview установит target координаты
    applyServerStateToPreview(state)
    syncUIWithState(state)
    updateViewerAudioIndicators() // Обновляем индикаторы звука
    updateViewerStatusUI() // Update status UI with connection info
  })
  // Включаем обратно: превью теперь "глупый" рендерер состояния сервера
  wsClient.on(WS_MSG.stateUpdate, state => {
    // Тихая обработка обновлений состояния
    lastServerState = state // Кэшируем состояние

    // CRITICAL: Update viewer connection status from state_update
    if (typeof state.viewerConnected === 'boolean') {
      const wasConnected = globalThis.__current.viewerConnected
      globalThis.__current.viewerConnected = state.viewerConnected

      // Update UI if connection status changed
      if (wasConnected !== state.viewerConnected) {
        updateViewerStatusUI()
      }

      // DYNAMIC MODE SWITCHING:
      // If server runs physics (clientSimulationOnly: false) AND viewer connected -> Follow viewer position
      // Otherwise -> Run local physics (clientSimulation: true)
      // 
      // CRITICAL FIX: When server has clientSimulationOnly=true, the server does NOT send x/y positions,
      // so preview must ALWAYS run local physics regardless of viewer connection status.
      if (previewPhysicsEngine) {
        const serverSendsPositions = state.clientSimulationOnly === false
        const shouldFollowViewer = serverSendsPositions && state.viewerConnected
        previewPhysicsEngine.options.clientSimulation = !shouldFollowViewer
      }
    }

    // Если пришли новые размеры экрана вьювера — обновим превью
    if (state.viewerScreenSize?.width > 0) {
      const prevSize = globalThis.__current?.viewerScreenSize || { width: 0, height: 0 }
      const nextSize = state.viewerScreenSize
      const sizeChanged =
        !prevSize || prevSize.width !== nextSize.width || prevSize.height !== nextSize.height
      globalThis.__current.viewerConnected = true
      globalThis.__current.viewerScreenSize = nextSize
      if (sizeChanged) {
        // IMPORTANT: При изменении размера сначала обновляем размер физики
        // но НЕ применяем состояние - это будет сделано ниже
        updatePhysicsEngineWorldSize(nextSize)
        const canvas = document.getElementById('preview')
        if (canvas) {
          const { previewWidth, previewHeight } = calculatePreviewDimensions(canvas, nextSize)
          setCanvasDimensions(canvas, previewWidth, previewHeight)
        }
        updateViewerInfo(nextSize)
        updateViewerStatusUI()
        // Обновляем статус в полноэкранном режиме если он открыт
        if (isPreviewFullscreen) {
          updateFullscreenViewerStatus()
        }
      }
    }

    // Применяем состояние ОДИН раз, без дублирования
    applyServerStateToPreview(state)
    updateViewerAudioIndicators() // Обновляем индикаторы звука при каждом обновлении состояния

    // ВАЖНО: Синхронизируем UI с состоянием сервера при каждом обновлении
    // Это особенно важно для кнопки Play/Pause, которая должна отражать реальное состояние мяча
    _syncUIPause(state)
    _syncUIDirection(state)
  })
  // АДАПТИВНАЯ адаптация сглаживания по сетевым метрикам (упрощенная версия для стабильности)
  wsClient.on(WS_MSG.netMetrics, ({ jitterMs }) => {
    if (!previewPhysicsEngine) return
    const base = globalThis.BBConfig?.smoothing || {}
    // Адаптивное демпфирование на основе джиттера (упрощено)
    const adaptiveDamping = Math.min(
      25,
      Math.max(15, (base.damping || 20) + jitterMs / 20)
    )
    // Адаптивная жесткость на основе условий сети (упрощена)
    const adaptiveStiffness = Math.min(
      35,
      Math.max(25, (base.stiffness || 30) - jitterMs / 30)
    )
    // Фиксированное время предикции для стабильности (не адаптируется по RTT)
    const fixedPredictTime = base.maxPredictSec || 0.02
    // Адаптивная дистанция снапа на основе стабильности сети
    const adaptiveSnapDistance = Math.min(
      0.4,
      Math.max(0.2, (base.snapDistance || 0.3) + (jitterMs > 15 ? 0.05 : 0))
    )
    previewPhysicsEngine.setSmoothingOptions({
      damping: adaptiveDamping,
      stiffness: adaptiveStiffness,
      maxPredictSec: fixedPredictTime, // Фиксированное значение для консистентности
      snapDistance: adaptiveSnapDistance,
      // Включаем продвинутые функции сглаживания
      exponentialSmoothing: base.exponentialSmoothing,
      stateBuffering: base.stateBuffering,
      bufferSize: base.bufferSize
    })
  })

  // Обработка активации звука зрителем
  wsClient.on(WS_MSG.viewerAudioActivated, data => {
    // Сохраняем статус активации
    if (globalThis.__current) {
      globalThis.__current.viewerAudioActivated = data.activated
    }
    updateViewerAudioIndicators()
  })
  wsClient.on('maxReconnectAttemptsReached', () => {
    logger.error('Исчерпаны попытки переподключения')
    showNotification('Не удается подключиться к серверу. Проверьте интернет-соединение.', 'error')
  })
}
/**
 * Применяет состояние от viewer/сервера к превью контроллера
 * АРХИТЕКТУРА: Превью в viewer режиме (isViewer: true) следует за состоянием от viewer через SSE
 */
function applyServerStateToPreview(state) {
  // Функция разбита для снижения когнитивной сложности
  if (!previewPhysicsEngine || !state) return

  // Синхронизируем размер мира движка с размерами экрана вьювера
  if (
    state.viewerScreenSize &&
    typeof state.viewerScreenSize.width === 'number' &&
    typeof state.viewerScreenSize.height === 'number' &&
    state.viewerScreenSize.width > 0 &&
    state.viewerScreenSize.height > 0
  ) {
    const currentW = previewPhysicsEngine.options.worldWidth
    const currentH = previewPhysicsEngine.options.worldHeight
    if (currentW !== state.viewerScreenSize.width || currentH !== state.viewerScreenSize.height) {
      previewPhysicsEngine.setWorldSize(state.viewerScreenSize.width, state.viewerScreenSize.height)
    }
  }

  // CRITICAL FIX: Применяем состояние в зависимости от режима
  // Если viewer подключен (clientSimulation: false) - следуем за viewer
  // Если viewer НЕ подключен (clientSimulation: true) - запускаем локальную физику
  if (previewPhysicsEngine.options.clientSimulation) {
    // LOCAL PHYSICS MODE: Preview runs its own physics
    // Apply only settings (direction, speed), NOT position AND NOT pause state from server!
    // Server is always paused when no viewer connected, so we ignore its pause state
    const localCommand = {
      dirX: state.dirX,
      dirY: state.dirY,
      speed: state.speed,
      // CRITICAL: Do NOT include paused from server in local mode!
      // paused: state.paused,  // REMOVED - local preview controls its own pause state
      colorBall: state.colorBall,
      colorBg: state.colorBg,
      ballSize: state.ballSize
    }

    // Sanitize direction for local mode to avoid stopping the ball with (0,0)
    if (
      localCommand.dirX !== undefined &&
      localCommand.dirY !== undefined &&
      Math.abs(localCommand.dirX) < 1e-6 &&
      Math.abs(localCommand.dirY) < 1e-6
    ) {
      delete localCommand.dirX
      delete localCommand.dirY
    }

    previewPhysicsEngine.applyCommand(localCommand)
  } else {
    // FOLLOW VIEWER MODE: Preview follows viewer position
    // Apply full state including position/velocity/pause
    previewPhysicsEngine.applyCommand(state)
  }

  // Синхронизируем таймеры с состоянием паузы
  // В локальном режиме используем локальное состояние паузы
  const pausedState = previewPhysicsEngine.options.clientSimulation
    ? previewPhysicsEngine.state.paused
    : state.paused

  if (typeof pausedState === 'boolean') {
    if (pausedState) {
      bbCounters.stop(false)
    } else {
      bbCounters.start()
    }
  }

  // Детект пасов на основе смены направления — на каждом апдейте состояния
  if (lastServerState) {
    detectAndCountBounceFromServer(lastServerState, state)
  }
}
/**
 * Улучшенный рендер-цикл с лучшей интерполяцией
 */
// Глобальные переменные для нового цикла
const PHYSICS_TICK_RATE = 60 // Гц
const PHYSICS_DT = 1000 / PHYSICS_TICK_RATE
function physicsLoop() {
  // Функция разбита для снижения когнитивной сложности
  if (previewPhysicsEngine) {
    previewPhysicsEngine.update(PHYSICS_DT / 1000)
  }
}

function renderPreviewLoop(timestamp) {
  // Функция разбита для снижения когнитивной сложности
  if (!previewPhysicsEngine || !globalThis.__previewRenderer) {
    requestAnimationFrame(renderPreviewLoop)
    return
  }
  // Вычисляем alpha для интерполяции на основе реального времени последнего обновления физики
  const now = performance.now()
  const lastPhysicsUpdate = previewPhysicsEngine?.__lastPhysicsUpdateTs ?? now
  const alpha = Math.max(0, Math.min(1, (now - lastPhysicsUpdate) / PHYSICS_DT))
  // Обновляем таймер счётчиков
  bbCounters.tick(timestamp)
  // Получаем интерполированное состояние
  const interpolatedState = previewPhysicsEngine.getInterpolatedBall(alpha)
  const stateToRender = getScaledState(interpolatedState)
  // Рендерим кадр
  globalThis.__previewRenderer?.drawFrame(stateToRender)
  if (document.hidden) {
    setTimeout(() => requestAnimationFrame(renderPreviewLoop), hiddenThrottleMs)
  } else {
    requestAnimationFrame(renderPreviewLoop)
  }
}
/**
 * Обновление статуса соединения
 */
function updateConnectionStatus(isConnected) {
  // Функция разбита для снижения когнитивной сложности
  const wsStatus = document.getElementById('wsStatus')
  if (wsStatus) {
    wsStatus.className = isConnected
      ? 'status-indicator connected'
      : 'status-indicator disconnected'
    wsStatus.textContent = isConnected ? 'Подключен' : 'Отключен'
  }
}

/**
 * Создание логгера для модуля
 */
function createLogger(moduleName) {
  // Функция разбита для снижения когнитивной сложности
  const startTime = performance.now()
  return {
    info: () => {
      // Параметры не используются
    },
    success: () => {},
    warning: () => {},
    error: (message, data) => {
      // Только критические ошибки в production
      if (data?.type === 'connection_closed' || message.includes('соединение')) return
      console.error(`[${moduleName}] ${message}`, data || '')
    }
  }
}
/**
 * Кастомная ошибка приложения
 */
class AppError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.timestamp = new Date().toISOString()
  }
}
/**
 * Обработка ошибок инициализации
 */
async function handleInitializationError(error, logger) {
  // Функция разбита для снижения когнитивной сложности
  logger.error('Критическая ошибка инициализации:', error)
  if (error instanceof AppError) {
    // Показываем ошибку пользователю
  }
  // Показываем ошибку пользователю
  // Логируем для отладки
}
// ===== СИНХРОНИЗАЦИЯ UI =====
function _syncUISpeed(ballState) {
  if (ballState.speed !== undefined) {
    components.speed?.setSpeed(ballState.speed)
  }
}

function _syncUISize(ballState) {
  if (ballState.radius !== undefined && components.size && typeof components.size.setSize === 'function') {
    // Find the closest predefined size to the server radius
    const sizes = [20, 40, 80, 100]
    const closestSize = sizes.reduce((prev, curr) =>
      Math.abs(curr - ballState.radius) < Math.abs(prev - ballState.radius) ? curr : prev,
      sizes[0] // initial value
    )
    components.size.setSize(closestSize)
  }
}

function _syncUIColors(ballState) {
  if (ballState.colorBall && components.ballColor && typeof components.ballColor.setColor === 'function') {
    components.ballColor.setColor(ballState.colorBall)
  }
  if (ballState.colorBg && components.bgColor && typeof components.bgColor.setColor === 'function') {
    components.bgColor.setColor(ballState.colorBg)
  }
}

function _syncUIPause(ballState) {
  if (ballState.paused !== undefined) {
    const now = performance.now()
    if (now >= __ignoreServerPausedUntilTs) {
      isPlaying = !ballState.paused
      updatePlayPauseButton()
      syncFsPlayPauseButton() // Синхронизируем и полноэкранную кнопку
    }
  }
}

function _getDirectionMode(dirX, dirY) {
  // Нормализуем шум/погрешность: сервер может присылать неидеальные значения (например 0.904/0.426)
  // Мы хотим маппить их на ближайший режим, иначе UI будет "скакать".
  const ax = Math.abs(dirX)
  const ay = Math.abs(dirY)

  // Явно вертикально/горизонтально (с запасом)
  if (ax > 0.9 && ay < 0.2) return 'horizontal'
  if (ay > 0.9 && ax < 0.2) return 'vertical'

  // Если это не чистая ось, но доминирование сильное — считаем осевым режимом
  if (ax > ay * 2) return 'horizontal'
  if (ay > ax * 2) return 'vertical'

  // Диагонали (примерно равные компоненты)
  if (dirX > 0 && dirY > 0) return 'diagRL' // TL→BR
  if (dirX > 0 && dirY < 0) return 'diagRLL' // BL→TR
  return null
}

function _syncUIDirection(ballState) {
  if (ballState.dirX !== undefined && ballState.dirY !== undefined) {
    // Не перезаписываем направление, если недавно изменили его локально
    const now = performance.now()
    if (now < __ignoreServerDirectionUntilTs) {
      return
    }

    const mode = _getDirectionMode(ballState.dirX, ballState.dirY)

    // Обновляем UI только если режим действительно изменился
    if (mode && mode !== currentDirectionMode) {
      directionState = { dx: ballState.dirX, dy: ballState.dirY }
      currentDirectionMode = mode
      updateDirectionButtons()
      updateDirectionDisplay(ballState.dirX, ballState.dirY)
    }
  }
}

function syncUIWithState(ballState) {
  try {
    if (!ballState) return

    updatePreviewSize(ballState.viewerScreenSize)
    globalThis.__current.viewerConnected = ballState.viewerConnected
    globalThis.__current.viewerScreenSize = ballState.viewerScreenSize
    updateViewerStatusUI()

    _syncUISpeed(ballState)
    _syncUISize(ballState)
    _syncUIColors(ballState)
    _syncUIPause(ballState)
    _syncUIDirection(ballState)

    // Синхронизируем параметры звука с UI
    if (ballState.soundEnabled !== undefined) {
      const soundEnabledCheckbox = document.getElementById('soundEnabledCheckbox')
      if (soundEnabledCheckbox) {
        soundEnabledCheckbox.checked = Boolean(ballState.soundEnabled)
        // Обновляем состояние контрола типа звука
        const soundTypeControl = document.getElementById('soundTypeControl')
        if (soundTypeControl) {
          if (ballState.soundEnabled) {
            soundTypeControl.style.opacity = '1'
            soundTypeControl.style.pointerEvents = 'auto'
          } else {
            soundTypeControl.style.opacity = '0.5'
            soundTypeControl.style.pointerEvents = 'none'
          }
        }
      }
    }
    if (ballState.soundType) {
      const soundTypeSelect = document.getElementById('soundTypeSelect')
      if (soundTypeSelect) {
        soundTypeSelect.value = ballState.soundType
      }
    }
  } catch (err) {
    debugWarn('Error in syncUIWithState:', err)
  }
}
// ===== ИНИЦИАЛИЗИРОВАНИЕ КОМПОНЕНТОВ =====
function _initializeSpeedControl() {
  const container = document.getElementById('speedControl')
  if (!container) {
    return
  }
  components.speed = sharedComponents.createSpeedControl(container, {
    onSpeedChange: throttle(speed => {
      updateSpeed(speed)
    }, 100)
  })
}

function _initializeBallColorControl() {
  const container = document.getElementById('ballColorControl')
  if (!container) {
    return
  }
  components.ballColor = sharedComponents.createColorControl(container, {
    colors: [
      '#60a5fa',
      '#ef4444',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#f97316',
      '#06b6d4',
      '#84cc16',
      '#fb7185',
      '#ffffff',
      '#a855f7',
      '#14b8a6'
    ],
    defaultValue: '#60a5fa',
    title: '',
    onColorChange: color => {
      setBallColor(color)
    }
  })
}

function _initializeBgColorControl() {
  const container = document.getElementById('bgColorControl')
  if (!container) {
    return
  }
  components.bgColor = sharedComponents.createColorControl(container, {
    colors: [
      '#020617',
      '#000000',
      '#111827',
      '#0a2540',
      '#052e16',
      '#1a102a',
      '#fef3c7',
      '#dbeafe',
      '#fce7f3',
      '#f3f4f6',
      '#e5e7eb',
      '#d1d5db'
    ],
    defaultValue: '#020617',
    title: '',
    onColorChange: color => {
      setBackgroundColor(color)
    }
  })
}

function _initializeSizeControl() {
  const container = document.getElementById('sizeControl')
  if (!container) {
    return
  }
  components.size = sharedComponents.createSizeControl(container, {
    sizes: [20, 40, 80, 100],
    defaultValue: 20,
    title: '',
    onSizeChange: size => {
      setBallSize(size)
    }
  })
}

function _initializeSoundControls() {
  const soundEnabledCheckbox = document.getElementById('soundEnabledCheckbox')
  const soundTypeSelect = document.getElementById('soundTypeSelect')
  const soundTypeControl = document.getElementById('soundTypeControl')

  if (!soundEnabledCheckbox || !soundTypeSelect || !soundTypeControl) {
    return
  }

  try {
    // Handle sound enabled toggle
    soundEnabledCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked
      setSoundEnabled(enabled)

      // Enable/disable sound type selector
      if (enabled) {
        soundTypeControl.style.opacity = '1'
        soundTypeControl.style.pointerEvents = 'auto'
      } else {
        soundTypeControl.style.opacity = '0.5'
        soundTypeControl.style.pointerEvents = 'none'
      }

      // Обновляем индикаторы звука
      if (lastServerState) {
        lastServerState.soundEnabled = enabled
      }
      updateViewerAudioIndicators()
    })

    // Handle sound type selection
    soundTypeSelect.addEventListener('change', (e) => {
      const soundType = e.target.value
      setSoundType(soundType)

      // Обновляем состояние
      if (lastServerState) {
        lastServerState.soundType = soundType
      }
    })

    // Initialize from server state if available
    if (lastServerState) {
      if (typeof lastServerState.soundEnabled === 'boolean') {
        soundEnabledCheckbox.checked = lastServerState.soundEnabled
        if (lastServerState.soundEnabled) {
          soundTypeControl.style.opacity = '1'
          soundTypeControl.style.pointerEvents = 'auto'
        }
      }
      if (lastServerState.soundType) {
        soundTypeSelect.value = lastServerState.soundType
      }
    }
  } catch (error) {
    console.error('Error initializing sound controls:', error)
  }
}

function initializeComponents() {
  _initializeSpeedControl()
  _initializeBallColorControl()
  _initializeBgColorControl()
  _initializeSizeControl()
  _initializeSoundControls()

  // ИСПРАВЛЕНИЕ: Включаем управление всегда, для работы с локальным превью
  setControlsEnabled(true)

  // Инициализируем отображение направления
  updateDirectionDisplay(1, 0)
}

function setControlsEnabled(enabled) {
  const toggle = id => {
    const el = document.getElementById(id)
    if (!el) return
    el.style.pointerEvents = enabled ? '' : 'none'
    el.style.opacity = enabled ? '1' : '0.5'
    el.querySelectorAll('button,input,select').forEach(node => {
      node.disabled = !enabled
    })
  }
  toggle('ballColorControl')
  toggle('bgColorControl')
  toggle('sizeControl')
  toggle('speedControl')
}
// ===== ФУНКЦИИ УПРАВЛЕНИЯ =====
function safeSend(type, payload) {
  // Функция разбита для снижения когнитивной сложности
  try {
    if (typeof wsClient?.send === 'function') {
      wsClient.send(type, payload)
    } else {
    }
  } catch (e) {
  }
}

function updateSpeed(speed) {

  // Отправляем изменение скорости
  try {
    safeSend(WS_MSG.controllerUpdate, { speed })
  } catch (err) {
    debugWarn('Error updating speed:', err)
  }
}

async function initializePreview() {
  // Функция разбита для снижения когнитивной сложности
  // Показываем текст ожидания подключения вьювера
  showWaitingForViewer()
  const previewWrap = document.getElementById('previewWrap')
  if (previewWrap) {
    previewWrap.style.display = 'block'
  }

  const canvas = document.getElementById('preview')
  if (!canvas) {
    return
  }
  // Проверяем и устанавливаем размеры canvas
  if (canvas.width === 0 || canvas.height === 0) {
    // Используем размеры контейнера для начального размера
    const container = canvas.parentElement
    const containerRect = container.getBoundingClientRect()
    const initialWidth = Math.min(containerRect.width - 40, 500)
    const initialHeight = Math.min(400, initialWidth * 0.75)
    canvas.width = initialWidth
    canvas.height = initialHeight
    canvas.style.width = canvas.width + 'px'
    canvas.style.height = canvas.height + 'px'
  }

  try {
    // Создаем движок физики для превью - КРИТИЧНО: используем isViewer: true
    // clientSimulation: true по умолчанию для локальной работы.
    // Если подключится вьювер, мы автоматически переключимся на clientSimulation: false
    previewPhysicsEngine = new PhysicsEngine({
      sessionId: 'preview',
      isViewer: true,
      clientSimulation: true // Start with local simulation (failsafe)
    })
    // Экспортируем для UI‑тестов
    try {
      globalThis.__previewPhysics = previewPhysicsEngine
    } catch (err) {
      // Silently handle case where globalThis is not writable
      debugWarn('Unable to export preview physics engine:', err)
    }

    // Явно устанавливаем паузу и центрируем мяч при загрузке
    // Это гарантирует правильную позицию в preview
    previewPhysicsEngine.setPaused(true)
    // Считаем пасы по локальным событиям отскока
    globalThis.addEventListener('bb_bounce', () => bbCounters.onBounce())
    // Применяем глобальные настройки сглаживания, если есть
    if (globalThis.BBConfig?.smoothing) {
      previewPhysicsEngine.setSmoothingOptions(globalThis.BBConfig.smoothing)
    }
    // Запускаем ЦИКЛ ФИЗИКИ с фиксированным шагом
    if (physicsInterval) clearInterval(physicsInterval)
    physicsInterval = setInterval(physicsLoop, PHYSICS_DT)
    // Запускаем ЦИКЛ РЕНДЕРИНГА
    requestAnimationFrame(renderPreviewLoop)
    // Создаем рендерер в режиме viewer - он только отображает состояние, не запускает физику
    globalThis.__previewRenderer = new BallRenderer(canvas, previewPhysicsEngine, {
      localPhysics: false // Превью следует за состоянием от viewer через SSE
    })
    globalThis.__previewCanvas = canvas
    // Центрируем мяч в превью при инициализации
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    // Если есть размеры вьювера, используем их как основу для мира физики
    if (globalThis.__current.viewerScreenSize && globalThis.__current.viewerScreenSize.width > 0) {
      previewPhysicsEngine.setWorldSize(
        globalThis.__current.viewerScreenSize.width,
        globalThis.__current.viewerScreenSize.height
      )
      // Центрируем мяч относительно размеров вьювера
      const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2
      const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2
      // В viewer режиме setPosition устанавливает и ball.x/y и target.x/y
      previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY)
      previewPhysicsEngine.setVelocity(0, 0)
    } else {
      // Если нет размеров вьювера, используем размеры canvas как мир
      previewPhysicsEngine.setWorldSize(canvasWidth, canvasHeight)
      // Центрируем мяч в центре canvas
      previewPhysicsEngine.setPosition(canvasWidth / 2, canvasHeight / 2)
      previewPhysicsEngine.setVelocity(0, 0)
    }
  } catch (error) {
  }
}

function showWaitingForViewer() {
  // Функция разбита для снижения когнитивной сложности
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.textContent = '⏳ Ожидание подключения вьювера'
    viewerInfo.style.display = 'block'
  }

  // Останавливаем мяч в центре превью когда вьювер отключен
  if (previewPhysicsEngine) {
    const canvas = document.getElementById('preview')
    if (canvas) {
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      previewPhysicsEngine.setPosition(centerX, centerY)
      previewPhysicsEngine.setVelocity(0, 0)
      previewPhysicsEngine.setPaused(true)
    }
  }
}

function hideWaitingForViewer() {
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.style.display = 'none'
  }
}

/**
 * Проверяет, является ли текущий режим направления диагональным
 * @returns {boolean} true если режим diagRL или diagRLL
 */
function isDiagonalMode() {
  return currentDirectionMode === 'diagRL' || currentDirectionMode === 'diagRLL'
}

/**
 * Пересчитывает и применяет диагональное направление при изменении размера экрана
 * Центрирует мяч и возобновляет движение с новым направлением от центра
 */
function recalculateDiagonalDirectionIfNeeded() {
  // Пересчитываем только если текущий режим диагональный
  if (!isDiagonalMode()) {
    return
  }

  // Получаем новый вектор направления с учетом обновленных размеров экрана
  const directionVector = getDirectionVector(currentDirectionMode)
  if (!directionVector) {
    return
  }

  const { dirX, dirY } = directionVector

  // Обновляем внутреннее состояние направления
  directionState = { dx: dirX, dy: dirY }

  // Если сессия активна, центрируем мяч и возобновляем движение
  if (isPlaying) {
    // Шаг 1: Пауза и центрирование
    safeSend(WS_MSG.controllerUpdate, {
      paused: true,
      returnToCenter: true
    })

    // Шаг 2: Возобновление с новым направлением через короткую задержку
    setTimeout(() => {
      safeSend(WS_MSG.controllerUpdate, {
        paused: false,
        dirX,
        dirY
      })
    }, 200)
  } else {
    // Если на паузе, просто обновляем направление без центрирования
    safeSend(WS_MSG.controllerUpdate, {
      dirX,
      dirY
    })
  }
}

function updatePreviewSize(viewerScreenSize) {
  if (canUpdatePreview(viewerScreenSize)) {
    const canvas = document.getElementById('preview')
    if (!canvas) return

    const { previewWidth, previewHeight } = calculatePreviewDimensions(canvas, viewerScreenSize)
    setCanvasDimensions(canvas, previewWidth, previewHeight)
    updatePhysicsEngineWorldSize(viewerScreenSize)
    recalculateDiagonalDirectionIfNeeded()
    applyServerStateOrCenter()
    updateViewerInfo(viewerScreenSize)
  } else {
    showWaitingForViewer()
    // Явно центрируем мяч в preview при отключении viewer'а
    centerBallInViewer()
  }
}

function canUpdatePreview(viewerScreenSize) {
  const isReady = viewerScreenSize && globalThis.__previewRenderer && previewPhysicsEngine
  return Boolean(isReady)
}

function calculatePreviewDimensions(canvas, viewerScreenSize) {
  const container = canvas.parentElement
  const containerRect = container.getBoundingClientRect()
  const maxWidth = Math.min(containerRect.width - 40, 500)
  const maxHeight = Math.min(400, maxWidth * 0.75)
  const viewerRatio = viewerScreenSize.width / viewerScreenSize.height
  let previewWidth = maxWidth
  let previewHeight = previewWidth / viewerRatio
  if (previewHeight > maxHeight) {
    previewHeight = maxHeight
    previewWidth = previewHeight * viewerRatio
  }
  return { previewWidth, previewHeight }
}

function setCanvasDimensions(canvas, previewWidth, previewHeight) {
  canvas.width = previewWidth
  canvas.height = previewHeight
  canvas.style.width = canvas.width + 'px'
  canvas.style.height = canvas.height + 'px'
}

function updatePhysicsEngineWorldSize(viewerScreenSize) {
  if (
    previewPhysicsEngine &&
    viewerScreenSize &&
    typeof viewerScreenSize.width === 'number' &&
    typeof viewerScreenSize.height === 'number'
  ) {
    previewPhysicsEngine.setWorldSize(viewerScreenSize.width, viewerScreenSize.height)
  }
}

function applyServerStateOrCenter() {
  if (lastServerState) {
    previewPhysicsEngine.applyCommand(lastServerState)
  } else {
    centerBallInViewer()
  }
}

function centerBallInViewer() {
  if (!previewPhysicsEngine) return

  // Пытаемся использовать размеры вьювера если они известны
  if (globalThis.__current?.viewerScreenSize?.width > 0) {
    const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2
    const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2
    previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY)
    previewPhysicsEngine.setVelocity(0, 0)
  }
  // Fallback: используем размеры canvas превью
  else if (isPreviewFullscreen && previewFsCanvas) {
    const centerX = previewFsCanvas.width / 2
    const centerY = previewFsCanvas.height / 2
    previewPhysicsEngine.setPosition(centerX, centerY)
    previewPhysicsEngine.setVelocity(0, 0)
  }
  // Fallback: используем размеры обычного canvas превью
  else if (globalThis.__previewCanvas) {
    const centerX = globalThis.__previewCanvas.width / 2
    const centerY = globalThis.__previewCanvas.height / 2
    previewPhysicsEngine.setPosition(centerX, centerY)
    previewPhysicsEngine.setVelocity(0, 0)
  }
}

function updateViewerInfo(viewerScreenSize) {
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.textContent = `Вьювер: ${viewerScreenSize.width}×${viewerScreenSize.height}`
    viewerInfo.style.display = 'block'
  }
}
// ===== ФУНКЦИИ УПРАВЛЕНИЯ МЯЧОМ =====
/**
 * Преобразует текстовый режим в вектор направления.
 * @param {string} directionMode - Режим направления ('horizontal', 'vertical', 'diagRL', 'diagRLL', 'random').
 * @returns {{dirX: number, dirY: number}|null} Возвращает объект с вектором направления или null, если режим неизвестен.
 */
function getDirectionVector(directionMode) {
  switch (directionMode) {
    case 'horizontal':
      return { dirX: 1, dirY: 0 }
    case 'vertical':
      return { dirX: 0, dirY: 1 }
    case 'diagRL': {
      // Движение из верхнего левого угла в нижний правый (TL→BR)
      // Вычисляем точный угол на основе размеров вьювера
      const width = globalThis.__current?.viewerScreenSize?.width || 800
      const height = globalThis.__current?.viewerScreenSize?.height || 600
      const diagonal = Math.hypot(width, height)
      return { dirX: width / diagonal, dirY: height / diagonal }
    }
    case 'diagRLL': {
      // Движение из нижнего левого угла в верхний правый (BL→TR)
      // Вычисляем точный угол на основе размеров вьювера
      const width = globalThis.__current?.viewerScreenSize?.width || 800
      const height = globalThis.__current?.viewerScreenSize?.height || 600
      const diagonal = Math.hypot(width, height)
      return { dirX: width / diagonal, dirY: -height / diagonal }
    }
    // @suppress {checkTypes} Math.random безопасен для визуального эффекта
    case 'random': {
      const angle = Math.random() * 2 * Math.PI
      return { dirX: Math.cos(angle), dirY: Math.sin(angle) }
    }
    default:
      return null
  }
}

/**
 * @private
 * Handles the direction change logic when the session is active.
 * It smoothly transitions by pausing, centering, and then resuming with the new direction.
 * @param {number} dirX - The new X direction component.
 * @param {number} dirY - The new Y direction component.
 */
function _applyDirectionChangeWhenPlaying(dirX, dirY) {
  // Send to server
  safeSend(WS_MSG.controllerUpdate, {
    paused: true,
    returnToCenter: true
  })
  
  // Apply same logic to local preview: pause -> center -> new direction -> resume
  if (previewPhysicsEngine) {
    previewPhysicsEngine.setPaused(true)
    centerBallInViewer()
  }
  
  setTimeout(() => {
    safeSend(WS_MSG.controllerUpdate, {
      paused: false,
      dirX,
      dirY
    })
    
    // Resume local preview with new direction
    if (previewPhysicsEngine) {
      previewPhysicsEngine.setDirection(dirX, dirY)
      previewPhysicsEngine.setPaused(false)
    }
  }, 200)
}

/**
 * @private
 * Handles the direction change logic when the session is paused.
 * It updates the direction on the server without starting the movement.
 * @param {number} dirX - The new X direction component.
 * @param {number} dirY - The new Y direction component.
 */
function _applyDirectionChangeWhenPaused(dirX, dirY) {
  safeSend(WS_MSG.controllerUpdate, {
    dirX,
    dirY
  })
}

/**
 * Устанавливает направление движения шарика.
 * @param {string} directionMode - Режим направления для установки.
 */
function setDirection(directionMode) {
  if (!directionMode) return

  try {
    const directionVector = getDirectionVector(directionMode)
    if (!directionVector) return

    const { dirX, dirY } = directionVector
    directionState = { dx: dirX, dy: dirY }
    currentDirectionMode = directionMode

    // Блокируем переопределение сервером на 1500ms (увеличено для стабильности)
    __ignoreServerDirectionUntilTs = performance.now() + 1500

    // Отправляем на сервер и обновляем превью
    // При игре: пауза -> центр -> новое направление -> старт (как во viewer)
    // На паузе: просто обновляем направление
    if (isPlaying) {
      _applyDirectionChangeWhenPlaying(dirX, dirY)
    } else {
      // На паузе просто обновляем направление в превью и на сервере
      if (previewPhysicsEngine) {
        previewPhysicsEngine.setDirection(dirX, dirY)
      }
      _applyDirectionChangeWhenPaused(dirX, dirY)
    }

    updateDirectionButtons()
    updateDirectionDisplay(dirX, dirY)
  } catch (error) {
    console.error('Ошибка установки направления:', error)
  }
}

function setBallColor(color) {
  // Update local preview immediately
  if (globalThis.__previewRenderer) {
    // This might need a method on renderer, but usually color comes from state
  }

  // If initializing, just save state but don't warn or send
  if (globalThis.__current?.isInitializing) {
    if (lastServerState) {
        lastServerState.colorBall = color
    }
    return
  }

  // Проверяем подключение viewer'а перед изменением цвета
  if (!globalThis.__current?.viewerConnected) {
    // Silently update local state or preview if needed, but don't warn during normal operation if just disconnected momentarily
     if (lastServerState) {
        lastServerState.colorBall = color
    }
    // Only warn if user explicitly interacted, but here we can just return
    return
  }

  safeSend(WS_MSG.controllerUpdate, { colorBall: color })
}

function setBallSize(size) {
  if (globalThis.__current?.isInitializing) {
     if (lastServerState) {
        lastServerState.radius = size
    }
    return
  }

  // Проверяем подключение viewer'а перед изменением размера
  if (!globalThis.__current.viewerConnected) {
    if (lastServerState) {
        lastServerState.radius = size
    }
    return
  }

  safeSend(WS_MSG.controllerUpdate, { radius: size })
}

function setSoundEnabled(enabled) {
  // Проверяем подключение viewer'а перед изменением состояния звука
  if (!globalThis.__current?.viewerConnected) {
    // Не показываем уведомление при старте, только при попытке изменения
    return
  }

  safeSend(WS_MSG.controllerUpdate, { soundEnabled: Boolean(enabled) })

  // Обновляем индикаторы звука при изменении состояния
  if (lastServerState) {
    lastServerState.soundEnabled = Boolean(enabled)
  }
  updateViewerAudioIndicators()
}

function setSoundType(soundType) {
  // Проверяем подключение viewer'а перед изменением типа звука
  if (!globalThis.__current?.viewerConnected) {
    // Не показываем уведомление при старте, только при попытке изменения
    return
  }

  safeSend(WS_MSG.controllerUpdate, { soundType: soundType })
}

function setBallSizeMultiplier(multiplier) {
  // Функция разбита для снижения когнитивной сложности
  // Базовый размер 20, умножаем на множитель
  const baseSize = 20
  const newSize = baseSize * multiplier
  setBallSize(newSize)
}

function setBackgroundColor(color) {
  // Обновляем фон в превью всегда
  if (globalThis.__previewRenderer) {
    globalThis.__previewRenderer.setBackgroundColor(color)
  }
  if (previewFsRenderer) {
    previewFsRenderer.setBackgroundColor(color)
  }

  if (globalThis.__current?.isInitializing) {
     if (lastServerState) {
        lastServerState.colorBg = color
    }
    return
  }

  // Проверяем подключение viewer'а перед изменением цвета фона
  if (!globalThis.__current?.viewerConnected) {
    if (lastServerState) {
        lastServerState.colorBg = color
    }
    return
  }

  // Отправляем изменение на сервер
  safeSend(WS_MSG.controllerUpdate, { colorBg: color })
}

function updateDirectionButtons() {
  const directionButtons = document.querySelectorAll('[data-mode]')
  for (const button of directionButtons) {
    button.classList.toggle('active', button.dataset.mode === currentDirectionMode)
  }

  const fsDirectionButtons = {
    fsDirH: 'horizontal',
    fsDirV: 'vertical',
    fsDirDL: 'diagRLL',
    fsDirDR: 'diagRL',
    fsDirRandom: 'random'
  }

  for (const [id, mode] of Object.entries(fsDirectionButtons)) {
    const button = document.getElementById(id)
    if (button) {
      button.classList.toggle('active', mode === currentDirectionMode)
    }
  }
}
/**
 * Получает иконку и текст для текущего режима направления
 */
function getDirectionInfo(mode) {
  switch (mode) {
    case 'horizontal':
      return { text: 'Горизонтальное', icon: '↔️' }
    case 'vertical':
      return { text: 'Вертикальное', icon: '↕️' }
    case 'diagRL':
      return { text: 'Диагональ ↖️ → ↘️', icon: '↘️' }
    case 'diagRLL':
      return { text: 'Диагональ ↙️ → ↗️', icon: '↗️' }
    case 'random':
      return { text: 'Случайное', icon: '🎲' }
    default:
      return { text: 'Неизвестное направление', icon: '❓' }
  }
}

/**
 * Обновляет индикатор направления и отображает информацию о текущем направлении.
 * @param {number} dirX - Компонент X вектора направления.
 * @param {number} dirY - Компонент Y вектора направления.
 * @param {string|null} [customText=null] - Пользовательский текст для отображения.
 */
function updateDirectionDisplay(dirX, dirY, customText = null) {
  try {
    // Ищем элемент для отображения направления
    const directionDisplay = document.getElementById('currentDirectionDisplay')
    let directionText = customText || 'Неизвестно'
    let directionIcon

    if (!customText) {
      // ОПРЕДЕЛЯЕМ НАПРАВЛЕНИЕ ТОЛЬКО ПО currentDirectionMode - игнорируем dirX/dirY
      const directionInfo = getDirectionInfo(currentDirectionMode)
      directionText = directionInfo.text
      directionIcon = directionInfo.icon
    }

    if (directionDisplay) {
      directionDisplay.textContent = directionIcon || '❓'
      directionDisplay.title = directionText
    }

    // Обновляем иконку направления в полноэкранном режиме
    const fsDirectionDisplay = document.getElementById('fsCurrentDirection')
    if (fsDirectionDisplay) {
      fsDirectionDisplay.innerHTML = directionDisplay
        ? directionDisplay.textContent
        : `${directionIcon || '❓'}`
    }
  } catch (error) {
    console.error('Ошибка обновления отображения направления:', error)
  }
}

function updatePlayPauseButton() {
  // Функция разбита для снижения когнитивной сложности
  const button = document.getElementById('playPauseBtn')
  if (button) {
    if (isPlaying) {
      button.textContent = '⏸ Стоп'
      button.classList.add('playing')
      button.disabled = false  // Кнопка активна при воспроизведении
    } else {
      button.textContent = '▶️ Старт'
      button.classList.remove('playing')
      // ИСПРАВЛЕНИЕ: Кнопка всегда активна, чтобы можно было запустить локальное превью
      button.disabled = false
    }
  }
}

/**
 * Единая функция для управления состоянием Play/Pause.
 * Объединяет проверки подключения, отправку команд и обновление UI.
 * @param {boolean} shouldPlay - true для старта, false для паузы
 * @private
 */
function _setPlayPauseState(shouldPlay) {
  // Если viewer'а нет, просто предупреждаем, но не блокируем
  if (!globalThis.__current?.viewerConnected) {
    if (shouldPlay) {
       showNotification('Внимание: клиент не подключен, анимация может не работать', 'warning')
    }
  }

  // Формируем payload в зависимости от действия
  const payload = shouldPlay
    ? {
        paused: false,
        // ВАЖНО: всегда отправляем КАНОНИЧЕСКИЙ вектор выбранного режима.
        // Это исключает накопление погрешности и "уход" в диагональ после паузы.
        ...(getDirectionVector(currentDirectionMode) || { dirX: 1, dirY: 0 }),
        speed: Number(components.speed?.getSpeed() ?? 40)
      }
    : {
        paused: true,
        returnToCenter: true
      }

  // Отправляем команду на сервер
  safeSend(WS_MSG.controllerUpdate, payload)

  // Обновляем локальное состояние
  isPlaying = shouldPlay
  globalThis.forcePauseUntilUserAction = false

  // Управляем счётчиком
  if (shouldPlay) {
    bbCounters.start()
  } else {
    bbCounters.stop(true)
  }

  // Обновляем preview движок физики
  if (previewPhysicsEngine) {
    previewPhysicsEngine.applyCommand(payload)
    // При паузе центрируем мяч
    if (!shouldPlay) {
      centerBallInViewer()
    }
  }

  // Блокируем переопределение сервером на 800ms
  __ignoreServerPausedUntilTs = performance.now() + 800

  // Обновляем UI с анимацией
  _schedulePlayPauseAnimations()

  return true
}

/**
 * Переключает состояние воспроизведения/паузы сессии.
 * Отправляет соответствующие команды на сервер и обновляет UI.
 */
function togglePlayPause() {
  // Переключаем на противоположное состояние
  _setPlayPauseState(!isPlaying)
}

/**
 * Обновляет все кнопки Play/Pause (основную и полноэкранную).
 * @private
 */
function _updateAllPlayPauseButtons() {
  updatePlayPauseButton()
  syncFsPlayPauseButton()
}

/**
 * Планирует обновления кнопок с анимацией.
 * @private
 */
function _schedulePlayPauseAnimations() {
  // Обновляем кнопки сразу
  _updateAllPlayPauseButtons()

  // Планируем дополнительные обновления для анимации через разные интервалы
  setTimeout(() => _updateAllPlayPauseButtons(), 150)
  setTimeout(() => _updateAllPlayPauseButtons(), 300)
}

// ===== УТИЛИТЫ =====
/**
 * Нормализует координату, проверяя, является ли она конечным числом.
 * @param {*} coord - Значение координаты для нормализации.
 * @param {*} fallback - Значение по умолчанию, если координата не является конечным числом.
 * @returns {number} Нормализованная координата или значение по умолчанию.
 * @private
 */
function _normalizeCoordinate(coord, fallback) {
  return typeof coord === 'number' && Number.isFinite(coord) ? coord : fallback
}

/**
 * Масштабирует состояние мяча из координат вьювера в координаты превью.
 * @param {object} state - Состояние мяча для масштабирования.
 * @returns {object} - Масштабированное состояние.
 */
function getScaledState(state) {
  const canScale = globalThis.__current.viewerScreenSize && globalThis.__previewCanvas && state
  if (canScale) {
    const viewerSize = globalThis.__current.viewerScreenSize
    const previewSize = {
      width: globalThis.__previewCanvas.width,
      height: globalThis.__previewCanvas.height
    }

    if (viewerSize.width > 0 && viewerSize.height > 0) {
      const scaleX = previewSize.width / viewerSize.width
      const scaleY = previewSize.height / viewerSize.height
      const scaleRadius = Math.min(scaleX, scaleY)
      const scaledState = { ...state }
      const rawX = _normalizeCoordinate(state.x, viewerSize.width / 2)
      const rawY = _normalizeCoordinate(state.y, viewerSize.height / 2)
      scaledState.x = rawX * scaleX
      scaledState.y = rawY * scaleY
      if (typeof scaledState.radius === 'number') {
        scaledState.radius *= scaleRadius
      }
      return scaledState
    }
  }
  return state
}

function updateViewerStatusUI() {
  // Функция разбита для снижения когнитивной сложности
  // Обновляем статус вьювера
  const viewerStatusEl = document.getElementById('viewerStatus')
  if (viewerStatusEl) {
    if (globalThis.__current.viewerConnected) {
      viewerStatusEl.textContent = 'подключен'
      viewerStatusEl.classList.add('connected')
      viewerStatusEl.classList.remove('disconnected')
      viewerStatusEl.style.fontWeight = '600' // делаем текст жирным для лучшей видимости
      hideWaitingForViewer()
      if (globalThis.__current.viewerScreenSize?.width > 0) {
        updatePreviewSize(globalThis.__current.viewerScreenSize)
      }
      setControlsEnabled(true)
    } else {
      viewerStatusEl.textContent = 'ожидание'
      viewerStatusEl.classList.add('disconnected')
      viewerStatusEl.classList.remove('connected')
      viewerStatusEl.style.fontWeight = '400'
      showWaitingForViewer()
      setControlsEnabled(false)
    }
  }

  // Обновляем индикаторы звука
  updateViewerAudioIndicators()

  // Обновляем визуальное выделение ссылки для клиента
  updateViewerLinkVisualState()
}

/**
 * Обновляет визуальное состояние ссылки для клиента в зависимости от подключения вьювера
 */
function updateViewerLinkVisualState() {
  const viewInput = document.getElementById('view')
  if (!viewInput) return

  if (globalThis.__current.viewerConnected) {
    // Вьювер подключен - обычная ссылка
    viewInput.style.borderColor = '#94a3b8'
    viewInput.style.backgroundColor = '#ffffff'
    viewInput.style.color = '#1f2937'
    viewInput.placeholder = ''
  } else {
    // Вьювер не подключен - выделяем красным и добавляем текст ожидания
    viewInput.style.borderColor = '#ef4444'
    viewInput.style.backgroundColor = '#fef2f2'
    viewInput.style.color = '#ef4444'
    viewInput.placeholder = 'Ожидание подключения вьювера...'
  }
}

/**
 * Обновляет индикаторы звука зрителя на основе состояния
 */
function updateViewerAudioIndicators() {
  const audioIndicator = document.getElementById('viewerAudioIndicator')
  const audioText = document.getElementById('viewerAudioText')
  const soundPlayingIndicator = document.getElementById('viewerSoundPlayingIndicator')

  if (!audioIndicator || !audioText || !soundPlayingIndicator) {
    return
  }

  const isViewerConnected = globalThis.__current?.viewerConnected
  const soundEnabled = lastServerState?.soundEnabled ?? false
  const isPlaying = globalThis.__current?.isPlaying ?? false
  const viewerAudioActivated = globalThis.__current?.viewerAudioActivated ?? false

  // Кэшируем предыдущее состояние для предотвращения лишних обновлений
  const currentState = `${soundEnabled}-${viewerAudioActivated}-${isPlaying}`
  if (updateViewerAudioIndicators._lastState === currentState) {
    return // Состояние не изменилось, не обновляем
  }
  updateViewerAudioIndicators._lastState = currentState

  // Показываем индикаторы когда звук включен в контроллере
  if (soundEnabled) {
    // Если зритель еще не активировал звук - показываем предупреждение
    if (!viewerAudioActivated) {
      audioIndicator.classList.remove('hidden')
      audioIndicator.classList.remove('ready')
      audioIndicator.classList.add('warning')
      audioText.textContent = 'Ожидание: зритель должен нажать "Включить звук"'
      soundPlayingIndicator.classList.add('hidden')
      soundPlayingIndicator.classList.remove('active')
    }
    // Зритель активировал звук - показываем что звук готов
    else {
      audioIndicator.classList.remove('hidden')
      audioIndicator.classList.add('ready')
      audioIndicator.classList.remove('warning')
      audioText.textContent = 'Звук активирован у зрителя'

      // Показываем индикатор воспроизведения если звук играет
      if ( isPlaying) {
        soundPlayingIndicator.classList.remove('hidden')
        soundPlayingIndicator.classList.add('active')
      } else {
        soundPlayingIndicator.classList.add('hidden')
        soundPlayingIndicator.classList.remove('active')
      }
    }
  } else {
    // Скрываем все индикаторы когда звук выключен на контроллере
    audioIndicator.classList.add('hidden')
    soundPlayingIndicator.classList.add('hidden')
  }
}

function _initializeFullscreenRenderer() {
  try {
    if (!previewPhysicsEngine) {
      // Используем одно и то же преviewPhysicsEngine, которое уже инициализировано
      // Это гарантирует согласованность между обычным и полноэкранным превью
      return
    }

    if (previewFsRenderer) {
      previewFsRenderer.setPhysicsEngine(previewPhysicsEngine)
    } else {
      previewFsRenderer = new BallRenderer(previewFsCanvas, previewPhysicsEngine, {
        localPhysics: false
      })
      previewFsRenderer.start()
    }
  } catch (err) {
    // Gracefully handle fullscreen preview errors
    debugError('Error initializing fullscreen preview:', err)
  }
}

/**
 * Открывает оверлей полноэкранного предпросмотра.
 * Рефакторинг для снижения когнитивной сложности.
 */
function openPreviewFullscreen() {
  const overlay = document.getElementById('previewOverlay')
  if (!overlay || !previewFsCanvas) {
    return
  }

  const currentUrl = globalThis.location.href
  const fullscreenUrl = currentUrl.split('#')[0] + '#fullscreen-preview'
  history.pushState({ fullscreen: true, returnUrl: currentUrl }, '', fullscreenUrl)

  overlay.style.display = 'block'
  isPreviewFullscreen = true

  // Добавляем класс к body для скрытия кнопки "На главную"
  document.body.classList.add('fullscreen-active')

  _initializeFullscreenRenderer()

  resizePreviewFullscreen()
  setupFsPanelAutoHide()
  setupFsPanelDrag()
  setupFullscreenGestures()
  syncFsPlayPauseButton()
  wireFullscreenControls()
  fillFsSessionInfo()

  // Центрируем мяч если вьювер не подключен
  if (!globalThis.__current?.viewerConnected && previewPhysicsEngine) {
    centerBallInViewer()
  }
}

function closePreviewFullscreen() {
  // Функция разбита для снижения когнитивной сложности
  const overlay = document.getElementById('previewOverlay')
  if (!overlay) return
  // Убираем хэш из URL без изменения истории
  const currentUrl = globalThis.location.href
  const baseUrl = currentUrl.split('#')[0]

  history.replaceState(null, '', baseUrl)
  overlay.style.display = 'none'
  isPreviewFullscreen = false

  // Убираем класс от body
  document.body.classList.remove('fullscreen-active')
}

function resizePreviewFullscreen() {
  // Функция разбита для снижения когнитивной сложности
  if (!previewFsCanvas) return
  previewFsCanvas.width = globalThis.innerWidth
  previewFsCanvas.height = globalThis.innerHeight
  if (previewPhysicsEngine) {
    const vs = globalThis.__current?.viewerScreenSize
    if (vs && vs.width > 0 && vs.height > 0) {
      previewPhysicsEngine.setWorldSize(vs.width, vs.height)
    } else {
      // Фолбэк на размеры окна, если размеры вьювера ещё неизвестны
      previewPhysicsEngine.setWorldSize(globalThis.innerWidth, globalThis.innerHeight)
      // Центрируем мяч после установки размеров
      if (!globalThis.__current?.viewerConnected) {
        centerBallInViewer()
      }
    }
  }
}

function setupFsPanelAutoHide() {
  // Функция разбита для снижения когнитивной сложности
  const panel = document.getElementById('previewFsPanel')
  const overlay = document.getElementById('previewOverlay')
  if (!panel || !overlay) return
  const show = () => {
    panel.style.opacity = '1'
  }

  const hide = () => {
    panel.style.opacity = '0'
  }

  const scheduleHide = () => {
    clearTimeout(fsPanelHideTimer)
    fsPanelHideTimer = setTimeout(hide, 2000)
  }
  // Показ при движении мыши и нажатиях
  overlay.addEventListener('mousemove', () => {
    show()
    scheduleHide()
  })
  overlay.addEventListener('click', () => {
    show()
    scheduleHide()
  })
  show()
  scheduleHide()
}

function setupFsPanelDrag() {
  // Функция разбита для снижения когнитивной сложности
  const panel = document.getElementById('previewFsPanel')
  const overlay = document.getElementById('previewOverlay')
  if (!panel || !overlay) return
  const onDown = (x, y) => {
    const rect = panel.getBoundingClientRect()
    fsPanelDrag.active = true
    fsPanelDrag.offsetX = x - rect.left
    fsPanelDrag.offsetY = y - rect.top
  }

  const onMove = (x, y) => {
    if (fsPanelDrag.active) {
      panel.style.left = `${x - fsPanelDrag.offsetX}px`
      panel.style.top = `${y - fsPanelDrag.offsetY}px`
      panel.style.transform = 'translateX(0)'
    }
  }

  const onUp = () => {
    fsPanelDrag.active = false
  }

  panel.addEventListener('mousedown', e => {
    onDown(e.clientX, e.clientY)
  })
  overlay.addEventListener('mousemove', e => {
    onMove(e.clientX, e.clientY)
  })
  globalThis.addEventListener('mouseup', onUp)
  panel.addEventListener(
    'touchstart',
    e => {
      const t = e.touches[0]

      onDown(t.clientX, t.clientY)
    },
    { passive: true }
  )
  overlay.addEventListener(
    'touchmove',
    e => {
      const t = e.touches[0]

      onMove(t.clientX, t.clientY)
    },
    { passive: true }
  )
  globalThis.addEventListener('touchend', onUp, { passive: true })
}

/**
 * Обрабатывает свайп-жесты в полноэкранном режиме для управления направлением и воспроизведением.
 * @param {number} dx - Смещение по оси X.
 * @param {number} dy - Смещение по оси Y.
 * @param {number} threshold - Порог для срабатывания жеста.
 * @private
 */
function _handleFullscreenSwipe(dx, dy, threshold) {
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
    if (dx > 0) {
      setDirection('horizontal')
    } else {
      setDirection('vertical')
    }
  } else if (Math.abs(dy) > threshold) {
    const isSwipedUp = dy < 0
    const isSwipedDown = dy > 0

    if ((isSwipedUp && !isPlaying) || (isSwipedDown && isPlaying)) {
      togglePlayPause()
    }
  }
}

/**
 * Настраивает обработку жестов в полноэкранном режиме.
 */
function setupFullscreenGestures() {
  const overlay = document.getElementById('previewOverlay')
  if (!overlay) return

  let startX = 0
  let startY = 0
  let swiping = false
  const threshold = 40

  const handleTouchStart = e => {
    const t = e.touches[0]
    startX = t.clientX
    startY = t.clientY
    swiping = true
  }

  const handleTouchEnd = e => {
    if (swiping) {
      swiping = false
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      _handleFullscreenSwipe(dx, dy, threshold)
    }
  }

  overlay.addEventListener('touchstart', handleTouchStart, { passive: true })
  // overlay.addEventListener('touchmove', e => e.preventDefault(), { passive: false })
  overlay.addEventListener('touchend', handleTouchEnd, { passive: true })
}

function syncFsPlayPauseButton() {
  // Функция разбита для снижения когнитивной сложности
  const btn = document.getElementById('fsPlayPauseBtn')
  if (!btn) return
  if (isPlaying) {
    btn.textContent = '⏸ Стоп'
  } else {
    btn.textContent = '▶️ Старт'
  }
}

function wireFullscreenControls() {
  // Функция разбита для снижения когнитивной сложности
  setupFullscreenSpeedControl()
  setupFullscreenSizeControls()
  setupFullscreenDirectionControls()
  setupFullscreenColorControls()
}

function setupFullscreenSpeedControl() {
  const speed = document.getElementById('fsSpeed')
  if (speed) {
    if (components.speed?.getSpeed) {
      speed.value = components.speed.getSpeed()
    } else {
      speed.value = 40
    }
    speed.oninput = e => {
      const target = e?.target
      if (target?.value !== undefined) {
        updateSpeed(Number(target.value))
      }
    }
  }
}

function setupFullscreenSizeControls() {
  const size1 = document.getElementById('fsSize1')
  const size2 = document.getElementById('fsSize2')
  const size3 = document.getElementById('fsSize3')
  const size4 = document.getElementById('fsSize4')

  if (size1) size1.onclick = () => setBallSizeMultiplier(1)
  if (size2) size2.onclick = () => setBallSizeMultiplier(2)
  if (size3) size3.onclick = () => setBallSizeMultiplier(3)
  if (size4) size4.onclick = () => setBallSizeMultiplier(4)
}

function setupFullscreenDirectionControls() {
  const dH = document.getElementById('fsDirH')
  const dV = document.getElementById('fsDirV')
  const dDL = document.getElementById('fsDirDL')
  const dDR = document.getElementById('fsDirDR')
  const dRandom = document.getElementById('fsDirRandom')

  if (dH) dH.onclick = () => setDirection('horizontal')
  if (dV) dV.onclick = () => setDirection('vertical')
  if (dDL) dDL.onclick = () => setDirection('diagRLL')
  if (dDR) dDR.onclick = () => setDirection('diagRL')
  if (dRandom) dRandom.onclick = () => setDirection('random')
}

function setupFullscreenColorControls() {
  setupFullscreenBallColorControls()
  setupFullscreenBackgroundColorControls()
}

function setupFullscreenBallColorControls() {
  const ballColors = [
    '#60a5fa',
    '#ef4444',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#f97316',
    '#06b6d4',
    '#84cc16',
    '#fb7185',
    '#ffffff',
    '#a855f7',
    '#14b8a6'
  ]

  for (let i = 1; i <= 12; i++) {
    const btn = document.getElementById(`fsBallCol${i}`)
    if (btn) btn.onclick = () => setBallColor(ballColors[i - 1])
  }
}

function setupFullscreenBackgroundColorControls() {
  const bgColors = [
    '#020617',
    '#000000',
    '#111827',
    '#0a2540',
    '#052e16',
    '#1a102a',
    '#fef3c7',
    '#dbeafe',
    '#fce7f3',
    '#f3f4f6',
    '#e5e7eb',
    '#d1d5db'
  ]

  for (let i = 1; i <= 12; i++) {
    const btn = document.getElementById(`fsBg${i}`)
    if (btn) btn.onclick = () => setBackgroundColor(bgColors[i - 1])
  }
}

function fillFsSessionInfo() {
  // Функция разбита для снижения когнитивной сложности
  try {
    const sid = globalThis.__current?.sessionId ?? '...'
    const fsSid = document.getElementById('fsCurSid')
    if (fsSid) fsSid.textContent = `SID: ${sid}`
    const fsLink = document.getElementById('fsViewLink')
    if (fsLink) fsLink.value = `${globalThis.location.origin}/s/${sid}`

    // Обновляем статус вьювера в полноэкранном режиме
    updateFullscreenViewerStatus()
  } catch (err) {
    debugWarn('Error in fillFsSessionInfo:', err)
  }
}

/**
 * Обновляет индикатор статуса вьювера в полноэкранном режиме
 */
function updateFullscreenViewerStatus() {
  const fsViewerStatus = document.getElementById('fsViewerStatus')
  if (!fsViewerStatus) return

  const statusText = fsViewerStatus.querySelector('.fs-status-text')
  if (!statusText) return

  if (globalThis.__current?.viewerConnected) {
    fsViewerStatus.classList.add('connected')
    statusText.textContent = 'Подключен'
  } else {
    fsViewerStatus.classList.remove('connected')
    statusText.textContent = 'Ожидание...'
  }
}


/**
 * Сбрасывает состояние сессии (счётчики, позицию мяча)
 */

function resetSession() {
  try {
    // Сбрасываем счётчики
    bbCounters.resetAll()

    // Останавливаем игру если она активна
    if (isPlaying) {
      _setPlayPauseState(false)
    }

    // Возвращаем мяч в центр
    safeSend(WS_MSG.controllerUpdate, {
      paused: true,
      returnToCenter: true
    })

    // Сбрасываем направление на горизонтальное
    setDirection('horizontal')

    // Показываем уведомление
    showNotification('Сессия сброшена', 'info')
  } catch (error) {
    console.error('❌ Ошибка при сбросе сессии:', error)
    showNotification('Ошибка при сбросе сессии', 'error')
  }
}

/**
 * Отображает уведомление пользователю
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип уведомления ('info', 'success', 'warning', 'error')
 */
function showNotification(message, type = 'info') {
  try {
    if (globalThis.notificationSystem?.show) {
      globalThis.notificationSystem.show({ message, type })
    } else if (globalThis.showSuccessNotification && type === 'success') {
      globalThis.showSuccessNotification('Успех', message)
    } else if (globalThis.showErrorNotification && type === 'error') {
      globalThis.showErrorNotification('Ошибка', message)
    } else {
      // Фолбэк: используем alert только для критических ошибок
      if (type === 'error') {
        alert(`Ошибка: ${message}`)
      }
    }
  } catch (error) {
    console.error('Error showing notification:', error)
    alert(message)
  }
}
