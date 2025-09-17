/**
 * Controller - Логика управления сессией BilateralBound
 * Современная модульная архитектура с улучшенной обработкой ошибок
 */
/* global WebSocketClient, PhysicsEngine, BallRenderer, sharedComponents, debugLog, debugError, throttle, getSessionIdFromUrl */
/* exported setDir, setDirection, setDirFromDirection, resetCenter, resetSession, resumePlay, pausePlay, copy, goBack */
// 1. Глобальное состояние определяется в первую очередь, до загрузки DOM
window.__current = {
  sessionId: null,
  viewerConnected: false,
  viewerScreenSize: { width: 0, height: 0 }
}

// 2. Рендерер для превью
window.__previewRenderer = null
window.__previewScale = 1 // Коэффициент масштабирования

// 3. Глобальные переменные для логики контроллера
const components = {}
let lastServerState = null // Кэшируем последнее состояние от сервера
let directionState = { dx: 1, dy: 0 }
let isPlaying = false
let currentDirectionMode = 'horizontal'
let wsClient
let isInitialized = false // Флаг для предотвращения повторной инициализации
let forcePauseUntilUserAction = false // После ресайза вьювера игнорировать paused=false до нажатия Старт
let __ignoreServerPausedUntilTs = 0 // Кратковременная блокировка переопределения isPlaying сервером

// --- State ---
let previewPhysicsEngine = null // Локальный движок физики для превью
let lastPreviewRenderTime = 0
let hiddenThrottleMs = 100 // при скрытой вкладке обновляем ~10 FPS
if (typeof window !== 'undefined' && window.BBConfig && window.BBConfig.rendering && typeof window.BBConfig.rendering.hiddenThrottleMs === 'number') {
  hiddenThrottleMs = window.BBConfig.rendering.hiddenThrottleMs
}

// --- Elements ---
const previewCanvas = document.getElementById('preview')

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
  _lastBounceTs: 0,
  initDom () {
    this.$timer = document.getElementById('bbTimer')
    this.$passes = document.getElementById('bbPasses')
    this.$sets = document.getElementById('bbSets')
    const resetBtn = document.getElementById('bbResetBtn')
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetAll())
    }
    this.render()
  },
  start () {
    this.running = true
    this.lastTickTs = performance.now()
  },
  stop (incrementSet = false) {
    this.tick(performance.now())
    this.running = false
    if (incrementSet) {
      this.sets += 1
    }
    // По требованию: после Стоп таймер обнулять
    this.timerMs = 0
    this.render()
  },
  resetAll () {
    this.timerMs = 0
    this.passes = 0
    this.sets = 0
    this.render()
  },
  onBounce () {
    if (!this.running) return
    const now = performance.now()
    if (now - this._lastBounceTs < 120) return
    this._lastBounceTs = now
    this.passes += 1
    this.render()
  },
  tick (nowTs) {
    if (!this.running) return
    const dt = nowTs - this.lastTickTs
    if (dt > 0) {
      this.timerMs += dt
      this.lastTickTs = nowTs
      // не перерисовываем чаще 10/с
      if (this._lastRenderTs === undefined || nowTs - this._lastRenderTs > 100) {
        this._lastRenderTs = nowTs
        this.render()
      }
    }
  },
  formatTime (ms) {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  },
  render () {
    if (this.$timer) this.$timer.textContent = this.formatTime(this.timerMs)
    if (this.$passes) this.$passes.textContent = String(this.passes)
    if (this.$sets) this.$sets.textContent = String(this.sets)
  }
}

// Детектор отскоков по серверным state_update (для подсчёта пасов)
let __lastBounceTs = 0
let __lastVxSign = 0
let __lastVySign = 0
function detectAndCountBounceFromServer (prev, curr) {
  try {
    if (!prev || !curr) return
    if (!bbCounters.running) return
    const now = performance.now()
    if (now - __lastBounceTs < 120) return // защита от дабл‑триггера

    const minSpeed = 10 // пикс/с, фильтр дрожания

    const prevVx = typeof prev.vx === 'number' ? prev.vx : 0
    const prevVy = typeof prev.vy === 'number' ? prev.vy : 0
    const currVx = typeof curr.vx === 'number' ? curr.vx : 0
    const currVy = typeof curr.vy === 'number' ? curr.vy : 0

    // Восстанавливаем последние ненулевые знаки, чтобы переживать кадры с vx/vy=0
    const prevSignX = Math.sign(prevVx)
    const prevSignY = Math.sign(prevVy)
    if (__lastVxSign === 0 && prevSignX !== 0) __lastVxSign = prevSignX
    if (__lastVySign === 0 && prevSignY !== 0) __lastVySign = prevSignY

    const currSignX = Math.sign(currVx)
    const currSignY = Math.sign(currVy)

    let bounced = false

    if (currSignX !== 0 && __lastVxSign !== 0 && currSignX !== __lastVxSign && Math.abs(currVx) > minSpeed) {
      bounced = true
    }
    if (currSignY !== 0 && __lastVySign !== 0 && currSignY !== __lastVySign && Math.abs(currVy) > minSpeed) {
      bounced = true
    }

    if (bounced) {
      __lastBounceTs = now
      bbCounters.onBounce()
    }

    // Обновляем последние знаки только если текущие ненулевые — чтобы нули не затирали память
    if (currSignX !== 0) __lastVxSign = currSignX
    if (currSignY !== 0) __lastVySign = currSignY
  } catch {}
}

// 4. Остальная логика выполняется после полной загрузки страницы
document.addEventListener('DOMContentLoaded', () => {
  // Тихая инициализация
  initializeController()
  // Инициализируем DOM для счётчиков
  bbCounters.initDom()

  // При изменении размера окна контроллера — пересчитать превью по текущим размерам вьювера
  window.addEventListener('resize', () => {
    const size = window.__current && window.__current.viewerScreenSize
    if (size && size.width > 0 && size.height > 0) {
      updatePreviewSize(size)
    }
  })
})

/**
 * Современная инициализация контроллера с улучшенной обработкой ошибок
 */
async function initializeController () {
  const logger = createLogger('Controller')

  try {
    logger.info('🚀 Начинаем инициализацию контроллера')

    // 1. Валидация и получение сессии
    const sessionId = getSessionIdFromUrl()
    if (!sessionId) {
      throw new AppError('SESSION_ID_MISSING', 'ID сессии не найден в URL')
    }

    window.__current.sessionId = sessionId
    logger.info(`📋 Работаем с сессией: ${sessionId}`)

    // 2. Инициализация DOM элементов - делаем это сразу
    await initializeDOMElements(sessionId)

    // Показываем блок превью сразу, но без запущенной анимации
    const previewWrap = document.getElementById('previewWrap')
    if (previewWrap) {
      previewWrap.style.display = 'block'
    }

    // Инициализируем компоненты сразу
    initializeComponents()

    // Инициализируем превью сразу, чтобы пользователь видел мяч
    initializePreview()

    // 3. Инициализация WebSocket с современным API
    await initializeWebSocketClient(sessionId)

    logger.info('🔌 WebSocket клиент инициализирован, ожидаем подключения вьювера...')
  } catch (error) {
    await handleInitializationError(error, logger)
  }
}

/**
 * Завершает инициализацию после подключения вьювера
 */
async function completeInitialization () {
  if (isInitialized) {
    return // Уже инициализировано
  }
  isInitialized = true

  const logger = createLogger('Controller')
  logger.success('✅ Вьювер подключен! Завершаем инициализацию...')

  try {
    // Раньше здесь был initializePreview, теперь он вызывается сразу
    logger.success('🎉 Контроллер полностью готов к работе!')
  } catch (error) {
    await handleInitializationError(error, logger)
  }
}

/**
 * Современная инициализация DOM элементов
 */
async function initializeDOMElements (sessionId) {
  const elements = {
    curSid: 'curSid',
    view: 'view',
    sessionInfo: 'sessionInfo',
    viewerStatus: 'viewerStatus'
  }

  const missingElements = []
  const initializedElements = {}

  for (const [key, id] of Object.entries(elements)) {
    const element = document.getElementById(id)
    if (!element) {
      missingElements.push(id)
    } else {
      initializedElements[key] = element
    }
  }

  if (missingElements.length > 0) {
    throw new AppError('DOM_ELEMENTS_MISSING',
      `Не найдены HTML элементы: ${missingElements.join(', ')}`)
  }

  // Настройка элементов
  initializedElements.curSid.textContent = sessionId
  initializedElements.view.value = `${window.location.origin}/s/${sessionId}`
  initializedElements.sessionInfo.textContent = `Создана: ${new Date().toLocaleString()}`
  initializedElements.viewerStatus.textContent = 'Ожидание...'

  return initializedElements
}

/**
 * Современная инициализация WebSocket клиента
 */
async function initializeWebSocketClient (sessionId) {
  const logger = createLogger('WebSocket')

  // Создаем клиента с улучшенной конфигурацией
  wsClient = new WebSocketClient(sessionId, 'controller', {
    maxReconnectAttempts: 10,
    reconnectInterval: 2000,
    heartbeatInterval: 25000
  })

  // Настраиваем обработчики событий
  setupWebSocketEventHandlers(wsClient, logger)

  // Подключаемся с таймаутом
  await Promise.race([
    (async () => {
      try {
        await wsClient.connect()
      } catch (error) {
        // Пробрасываем ошибку, чтобы Promise.race ее поймал
        throw new Error(`WebSocket connection failed: ${error.message}`)
      }
    })(),
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 15000)
    )
  ])

  logger.success('WebSocket клиент успешно инициализирован')
}

/**
 * Настройка обработчиков WebSocket событий
 */
function setupWebSocketEventHandlers (wsClient, logger) {
  wsClient.on('open', (data) => {
    logger.success('WebSocket соединение установлено')
    updateConnectionStatus(true)
  })

  wsClient.on('close', (event) => {
    logger.warning(`WebSocket соединение закрыто (код: ${event.code})`)
    updateConnectionStatus(false)
    window.__current.viewerConnected = false
    updateViewerStatusUI()
  })

  wsClient.on('error', (error) => {
    logger.error(`WebSocket ошибка: ${error.type}`, error)
    if (error.type === 'connection') {
      showErrorNotification('Потеряно соединение с сервером')
    }
  })

  wsClient.on('viewer_status', (data) => {
    logger.info('Получен статус viewer', data)
    window.__current.viewerConnected = data.connected
    if (data.screenSize) {
      window.__current.viewerScreenSize = data.screenSize
    }

    // Если вьювер подключился, завершаем инициализацию
    if (data.connected) {
      completeInitialization()
    }

    updateViewerStatusUI()
  })

  wsClient.on(WS_MSG.initialState, (state) => {
    logger.info('Получено начальное состояние', state)
    lastServerState = state // Кэшируем состояние

    // ВАЖНО: Сначала обновляем размер превью, если есть данные,
    // и только потом применяем состояние. Это решает проблему гонки состояний.
    if (state.viewerScreenSize && state.viewerScreenSize.width > 0) {
      window.__current.viewerScreenSize = state.viewerScreenSize
      updatePreviewSize()
    }

    // Мгновенно выравниваем позицию в превью по центру из initial_state (без интерполяции),
    // используем СЫРЫЕ координаты вьювера (скейл будет на отрисовке)
    try {
      if (previewPhysicsEngine && state.x !== undefined && state.y !== undefined) {
        previewPhysicsEngine.setPosition(state.x, state.y)
        previewPhysicsEngine.setVelocity(0, 0)
      }
    } catch (e) {
      // Тихо игнорируем, если в момент старта ещё нет канваса
    }

    applyServerStateToPreview(state)
    syncUIWithState(state)
  })

  // Включаем обратно: превью теперь "глупый" рендерер состояния сервера
  wsClient.on(WS_MSG.stateUpdate, (state) => {
    // Игнорируем обновления и логи, пока вьювер не подключится.
    if (!window.__current.viewerConnected) {
      return
    }
    // Тихая обработка обновлений состояния
    lastServerState = state // Кэшируем состояние
    // Если пришли новые размеры экрана вьювера — обновим превью
    if (state.viewerScreenSize && state.viewerScreenSize.width > 0) {
      const prevSize = window.__current.viewerScreenSize || { width: 0, height: 0 }
      const nextSize = state.viewerScreenSize
      const sizeChanged = !prevSize || prevSize.width !== nextSize.width || prevSize.height !== nextSize.height

      window.__current.viewerConnected = true
      window.__current.viewerScreenSize = nextSize

      if (sizeChanged) {
        updatePreviewSize(nextSize)
        updateViewerStatusUI()
        // Только при реальном изменении размеров — переводим UI в паузу и ждём ручного старта
        isPlaying = false
        forcePauseUntilUserAction = true
        updatePlayPauseButton()
      }
    }
    applyServerStateToPreview(state)
  })

  // Адаптация сглаживания по сетевым метрикам
  wsClient.on('net_metrics', ({ rttMs, jitterMs }) => {
    if (!previewPhysicsEngine) return
    // Чем больше джиттер — тем выше демпфирование и шире окно предикции
    const base = (window.BBConfig && window.BBConfig.smoothing) || {}
    const damping = Math.min(22, Math.max(8, (base.damping || 10) + (jitterMs / 20)))
    const stiffness = Math.min(50, Math.max(15, (base.stiffness || 30) - (jitterMs / 40)))
    const maxPredictSec = Math.min(0.35, Math.max(0.06, (base.maxPredictSec || 0.25) + (rttMs / 1000 - 0.1) * 0.25))
    previewPhysicsEngine.setSmoothingOptions({ damping, stiffness, maxPredictSec })
  })

  wsClient.on('maxReconnectAttemptsReached', () => {
    logger.error('Исчерпаны попытки переподключения')
    showErrorNotification('Не удается подключиться к серверу. Проверьте интернет-соединение.')
  })
}

/**
 * Применяет состояние от сервера к превью, управляя позиционированием и интерполяцией.
 * @param {object} state - Состояние мяча от сервера.
 */
function applyServerStateToPreview (state) {
  if (!previewPhysicsEngine || !state) return

  // НЕ меняем размер мира движка под viewerScreenSize,
  // движок хранит сырые viewer-координаты, масштабирование делает отрисовка
  // if (state.viewerScreenSize) {
  //   previewPhysicsEngine.setWorldSize(state.viewerScreenSize.width, state.viewerScreenSize.height);
  // }
  // Применяем состояние от сервера, чтобы обновить целевые координаты для интерполяции (в viewer-координатах)
  previewPhysicsEngine.applyCommand(state)

  // Если пришло новое значение paused — синхронизируем таймеры
  if (typeof state.paused === 'boolean') {
    if (state.paused) {
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

function renderPreviewLoop (timestamp) {
  if (!previewPhysicsEngine) {
    requestAnimationFrame(renderPreviewLoop)
    return
  }

  const deltaTime = lastPreviewRenderTime > 0 ? (timestamp - lastPreviewRenderTime) / 1000 : 0
  lastPreviewRenderTime = timestamp

  // Обновляем таймер счётчиков (в миллисекундах)
  bbCounters.tick(timestamp)

  // Обновляем локальную симуляцию превью для интерполяции
  // Frame skipping: большие провалы делим на равные шаги по 16ms
  if (deltaTime > 0.032) {
    const steps = Math.min(3, Math.ceil(deltaTime / 0.016))
    const stepDt = deltaTime / steps
    for (let i = 0; i < steps; i++) {
      previewPhysicsEngine.update(stepDt)
    }
  } else {
    previewPhysicsEngine.update(deltaTime)
  }
  const state = previewPhysicsEngine.getState()

  // Масштабируем состояние, если вьювер подключен
  const stateToRender = getScaledState(state)

  // Используем рендерер для отрисовки
  if (window.__previewRenderer) {
    window.__previewRenderer.drawFrame(stateToRender)
  }

  if (document.hidden) {
    // при скрытой вкладке — редкий апдейт, чтобы экономить ресурсы
    setTimeout(() => requestAnimationFrame(renderPreviewLoop), hiddenThrottleMs)
  } else {
    requestAnimationFrame(renderPreviewLoop)
  }
}

/**
 * Обновление статуса соединения
 */
function updateConnectionStatus (isConnected) {
  const wsStatus = document.getElementById('wsStatus')
  if (wsStatus) {
    wsStatus.className = isConnected ? 'status-indicator connected' : 'status-indicator disconnected'
    wsStatus.textContent = isConnected ? 'Подключен' : 'Отключен'
  }
}

/**
 * Показ уведомления об ошибке
 */
function showErrorNotification (message) {
  const wrapper = document.createElement('div')
  wrapper.className = 'bb-toast'
  wrapper.innerHTML = `
    <div class="bb-toast__content">
      <strong>Ошибка:</strong> <span>${message}</span>
      <button class="bb-toast__close" aria-label="Close" onclick="this.closest('.bb-toast').remove()">×</button>
    </div>
  `
  document.body.appendChild(wrapper)

  setTimeout(() => {
    if (wrapper.parentElement) {
      wrapper.remove()
    }
  }, 5000)
}

/**
 * Создание логгера для модуля
 */
function createLogger (moduleName) {
  return {
    info: (message, data) => {
      // Тихое логирование информации
    },
    success: (message, data) => {
      // Тихое логирование успехов
    },
    warning: (message, data) => {
      console.warn(`%c[${moduleName}] ⚠️ ${message}`, 'color: #f59e0b; font-weight: bold;', data || '')
    },
    error: (message, data) => {
      console.error(`%c[${moduleName}] ❌ ${message}`, 'color: #ef4444; font-weight: bold;', data || '')
    }
  }
}

/**
 * Кастомная ошибка приложения
 */
class AppError extends Error {
  constructor (code, message, details = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
    this.timestamp = new Date().toISOString()
  }
}

/**
 * Обработка ошибок инициализации
 */
async function handleInitializationError (error, logger) {
  logger.error('Критическая ошибка инициализации:', error)

  let userMessage = 'Произошла неизвестная ошибка при инициализации'

  if (error instanceof AppError) {
    switch (error.code) {
    case 'SESSION_ID_MISSING':
      userMessage = 'Ссылка недействительна. Попробуйте создать новую сессию.'
      break
    case 'DOM_ELEMENTS_MISSING':
      userMessage = 'Ошибка интерфейса приложения. Попробуйте перезагрузить страницу.'
      break
    default:
      userMessage = error.message
    }
  } else if (error.message) {
    userMessage = error.message
  }

  // Показываем ошибку пользователю
  alert(`Ошибка инициализации: ${userMessage}`)

  // Логируем для отладки
  console.error('Полная информация об ошибке:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    timestamp: new Date().toISOString()
  })
}

// ===== СИНХРОНИЗАЦИЯ UI =====

function syncUIWithState (ballState) {
  try {
    // debugLog('🔄 Синхронизируем UI с состоянием от сервера', ballState)

    if (!ballState) {
      // debugWarn('syncUIWithState вызван с пустым состоянием.')
      return
    }

    updatePreviewSize(ballState.viewerScreenSize)

    window.__current.viewerConnected = ballState.viewerConnected
    window.__current.viewerScreenSize = ballState.viewerScreenSize
    updateViewerStatusUI()

    if (ballState.speed !== undefined && components.speed) {
      components.speed.setSpeed(ballState.speed)
    }
    if (ballState.radius !== undefined && components.size) {
      components.size.setSize(ballState.radius)
    }
    if (ballState.colorBall && components.ballColor) {
      components.ballColor.setColor(ballState.colorBall)
    }
    if (ballState.colorBg && components.bgColor) {
      components.bgColor.setColor(ballState.colorBg)
    }
    if (ballState.paused !== undefined) {
      // Если только что был локальный клик Старт/Стоп — не даём серверу мгновенно
      // перетянуть состояние кнопки обратно (оптимистичный UI)
      const now = performance.now()
      if (now < __ignoreServerPausedUntilTs) {
        // Но всё равно обновим предупреждающе фон кнопки, если рассинхрон
        updatePlayPauseButton()
        return
      }
      // Если стоит принудительная пауза (после ресайза), игнорируем paused=false,
      // пока пользователь явно не нажмёт «Старт»
      const effectivePaused = forcePauseUntilUserAction ? true : ballState.paused
      // debugLog(`🎮 Обновляем состояние игры: paused=${ballState.paused} (effective=${effectivePaused}), isPlaying будет=${!effectivePaused}`)
      isPlaying = !effectivePaused
      updatePlayPauseButton()
    }

    if (ballState.dirX !== undefined && ballState.dirY !== undefined) {
      directionState = { dx: ballState.dirX, dy: ballState.dirY }

      // Определяем режим направления по вектору
      if (Math.abs(ballState.dirX) > 0.9) currentDirectionMode = 'horizontal'
      else if (Math.abs(ballState.dirY) > 0.9) currentDirectionMode = 'vertical'
      else if (ballState.dirX > 0 && ballState.dirY > 0) currentDirectionMode = 'diagRL'
      else if (ballState.dirX > 0 && ballState.dirY < 0) currentDirectionMode = 'diagRLL'

      updateDirectionButtons()
      updateDirectionDisplay(ballState.dirX, ballState.dirY)
    }

    // debugLog('✅ UI синхронизирован')
  } catch (error) {
    debugError('Ошибка при синхронизации UI:', error)
  }
}

// ===== ИНИЦИАЛИЗАЦИЯ КОМПОНЕНТОВ =====

function initializeComponents () {
  // Создаем компонент управления скоростью
  components.speed = sharedComponents.createSpeedControl(
    document.getElementById('speedControl'),
    {
      onSpeedChange: throttle((speed) => {
        updateSpeed(speed)
      }, 100) // Ограничиваем отправку: не чаще чем раз в 100 мс
    }
  )

  // Создаем компонент управления цветом шарика
  components.ballColor = sharedComponents.createColorControl(
    document.getElementById('ballColorControl'),
    {
      colors: ['#60a5fa', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16', '#fb7185', '#ffffff'],
      defaultValue: '#60a5fa', // Дефолтный цвет мяча
      title: '🎨 Цвет шарика',
      onColorChange: (color) => {
        setBallColor(color)
        // Не меняем радиус превью при смене цвета
      }
    }
  )

  // Создаем компонент управления цветом фона
  components.bgColor = sharedComponents.createColorControl(
    document.getElementById('bgColorControl'),
    {
      colors: ['#020617', '#000000', '#111827', '#0a2540', '#052e16', '#1a102a', '#2b1b0e', '#032f2f', '#2a0e14', '#0f172a'],
      defaultValue: '#020617', // Дефолтный цвет фона
      title: '🎨 Цвет фона',
      onColorChange: (color) => {
        setBgColor(color)
        // Не меняем радиус превью при смене фона
      }
    }
  )

  // Создаем компонент управления размером
  components.size = sharedComponents.createSizeControl(
    document.getElementById('sizeControl'),
    {
      sizes: [20, 40, 80, 100],
      defaultValue: 20,
      title: '📏 Размер шарика',
      onSizeChange: (size) => {
        setBallSize(size)
      }
    }
  )
}

// ===== ФУНКЦИИ УПРАВЛЕНИЯ =====

function safeSend (type, payload) {
  try {
    if (wsClient && typeof wsClient.send === 'function') {
      wsClient.send(type, payload)
    }
  } catch (_) {}
}

async function updateSpeed (speed) {
  try {
    // Оптимизация: меньше обновлений когда нет вьювера
    if (!window.__current.viewerConnected) {
      // Тихо пропускаем обновление скорости
      return
    }

    await wsClient.send(WS_MSG.controllerUpdate, { speed })
    debugLog('✅ Скорость обновлена через WebSocket:', speed)
  } catch (error) {
    debugError('Ошибка при обновлении скорости:', error)
    alert('Ошибка при обновлении скорости', error.message)
  }
}

// ===== ПРЕВЬЮ =====

async function initializePreview () {
  debugLog('🎮 Начинаем инициализацию превью')

  // Показываем текст ожидания подключения вьювера
  showWaitingForViewer()

  const previewWrap = document.getElementById('previewWrap')
  if (previewWrap) {
    previewWrap.style.display = 'block'
    debugLog('✅ Превью контейнер показан')
  }

  const canvas = document.getElementById('preview')
  if (!canvas) {
    debugError('Preview canvas not found')
    return
  }
  debugLog('✅ Canvas элемент найден')

  // Проверяем размеры canvas
  debugLog(`📏 Исходные размеры canvas: ${canvas.width}x${canvas.height}`)
  if (canvas.width === 0 || canvas.height === 0) {
    debugLog('⚠️ Неверные размеры canvas, устанавливаем по умолчанию')
    canvas.width = 400
    canvas.height = 300
    // Жестко задаем CSS размеры, чтобы исключить неравномерное масштабирование
    canvas.style.width = canvas.width + 'px'
    canvas.style.height = canvas.height + 'px'
  }

  try {
    // Создаем движок физики для превью
    previewPhysicsEngine = new PhysicsEngine({ sessionId: 'preview' })
    // Включаем режим зрителя для корректной интерполяции
    previewPhysicsEngine.isViewer = true
    // Считаем пасы по локальным событиям отскока
    window.addEventListener('bb_bounce', () => bbCounters.onBounce())
    // Применяем глобальные настройки сглаживания, если есть
    if (window.BBConfig && window.BBConfig.smoothing) {
      previewPhysicsEngine.setSmoothingOptions(window.BBConfig.smoothing)
    }

    // Запускаем цикл рендеринга для превью
    requestAnimationFrame(renderPreviewLoop)
    debugLog('✅ PhysicsEngine создан')

    // Создаем рендерер, который будет сам обновлять физику (для интерполяции)
    window.__previewRenderer = new BallRenderer(canvas, previewPhysicsEngine, {
      localPhysics: false // ВАЖНО: Превью теперь не симулирует физику, а только отображает
    })
    debugLog('✅ BallRenderer создан')

    window.__previewRenderer.setFrameCallback((deltaTime) => {
      // Дополнительная логика для превью может быть добавлена здесь
    })

    window.__previewCanvas = canvas
    debugLog('✅ Глобальные переменные установлены')

    // window.__previewRenderer.start() // Отключаем внутренний цикл рендерера
    // debugLog('✅ Renderer запущен')

    // Если вьювер ещё не подключен, показываем мяч по центру превью
    if (!window.__current.viewerScreenSize || !window.__current.viewerScreenSize.width) {
      // Настраиваем мир превью под размеры canvas
      previewPhysicsEngine.setWorldSize(canvas.width, canvas.height)
      // Ставим мяч в центр превью и останавливаем
      previewPhysicsEngine.setPosition(canvas.width / 2, canvas.height / 2)
      previewPhysicsEngine.setVelocity(0, 0)
      debugLog('✅ Мяч инициализирован в центре превью (вьювер не подключен)')
    }

    debugLog('🎉 Инициализация превью завершена успешно')
  } catch (error) {
    debugError('❌ Ошибка при инициализации превью: ' + error.message)
    console.error('Preview initialization error:', error)
    alert('Ошибка при инициализации превью', error.message)
  }
}

function showWaitingForViewer () {
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.textContent = '⏳ Ожидание подключения вьювера'
    viewerInfo.style.display = 'block'
  }
}

function updatePreviewSize (viewerScreenSize) {
  if (!viewerScreenSize || !window.__previewRenderer || !previewPhysicsEngine) {
    showWaitingForViewer()
    return
  }

  const canvas = document.getElementById('preview')
  if (!canvas) {
    return
  }

  const container = canvas.parentElement
  const containerRect = container.getBoundingClientRect()

  // Увеличенные размеры для превью
  const maxWidth = Math.min(containerRect.width - 40, 500)
  const maxHeight = Math.min(400, maxWidth * 0.75)

  const viewerRatio = viewerScreenSize.width / viewerScreenSize.height

  // **ИСПРАВЛЕННАЯ ЛОГИКА СОХРАНЕНИЯ ПРОПОРЦИЙ**
  let previewWidth = maxWidth
  let previewHeight = previewWidth / viewerRatio

  if (previewHeight > maxHeight) {
    previewHeight = maxHeight
    previewWidth = previewHeight * viewerRatio
  }

  // Устанавливаем итоговые размеры
  canvas.width = previewWidth
  canvas.height = previewHeight

  // Синхронизируем CSS размеры с внутренними, чтобы круг не сплющивался
  canvas.style.width = canvas.width + 'px'
  canvas.style.height = canvas.height + 'px'

  // Тихо устанавливаем размер превью

  // ВАЖНО: Не масштабируем радиус в движке, масштаб произойдёт в отрисовке

  // После изменения размера, немедленно перерисовываем последнее известное состояние в новом масштабе
  if (lastServerState) {
    // Применяем СЫРОЕ состояние сервера (в координатах вьювера),
    // отрисовка сама выполнит масштабирование
    previewPhysicsEngine.applyCommand(lastServerState)
  } else {
    // Если нет состояния сервера, но есть размеры вьювера, центрируем мяч относительно них
    if (window.__current.viewerScreenSize && window.__current.viewerScreenSize.width > 0) {
      const viewerCenterX = window.__current.viewerScreenSize.width / 2
      const viewerCenterY = window.__current.viewerScreenSize.height / 2

      const scaleX = canvas.width / window.__current.viewerScreenSize.width
      const scaleY = canvas.height / window.__current.viewerScreenSize.height

      const previewCenterX = viewerCenterX * scaleX
      const previewCenterY = viewerCenterY * scaleY

      previewPhysicsEngine.setPosition(previewCenterX, previewCenterY)
      debugLog(`📏 Размер превью обновлен, мяч центрирован: (${viewerCenterX}, ${viewerCenterY}) → (${previewCenterX.toFixed(1)}, ${previewCenterY.toFixed(1)})`)
    }
  }

  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.textContent = `Вьювер: ${viewerScreenSize.width}×${viewerScreenSize.height}`
    viewerInfo.style.display = 'block'
  }

  // Тихо завершаем обновление размера превью
}

// ===== ФУНКЦИИ УПРАВЛЕНИЯ НАПРАВЛЕНИЕМ =====

function setDir (mode) {
  let dx = 0; let dy = 0
  switch (mode) {
  case 'horizontal': dx = 1; dy = 0; break
  case 'vertical': dx = 0; dy = 1; break
  case 'diagRL': dx = 0.707; dy = 0.707; break
  case 'diagRLL': dx = 0.707; dy = -0.707; break
  }

  directionState = { dx, dy }
  updateDirectionDisplay(dx, dy)

  // Отправляем команду изменения направления через WebSocket
  safeSend(WS_MSG.controllerUpdate, {
    dirX: dx,
    dirY: dy,
    resume: true // Если мяч движется, сразу меняем направление
  })
  debugLog(`✅ Направление изменено через WS: dx=${dx}, dy=${dy}`)
}

// Функция для обновления активного состояния кнопок направлений
function updateDirectionButtons () {
  // Снимаем активное состояние со всех кнопок
  document.querySelectorAll('.direction-btn').forEach(btn => { btn.classList.remove('active') })
  document.querySelectorAll('.segmented .seg-btn').forEach(btn => { btn.classList.remove('active') })

  // Добавляем активное состояние к текущей кнопке
  const activeSeg = document.querySelector(`.segmented .seg-btn[data-mode="${currentDirectionMode}"]`)
  if (activeSeg) { activeSeg.classList.add('active') }
}

// Функция установки направления (как в тесте)
function setDirection (mode) {
  currentDirectionMode = mode

  let dx = 0; let dy = 0
  switch (mode) {
  case 'horizontal': dx = 1; dy = 0; break
  case 'vertical': dx = 0; dy = 1; break
  case 'diagRL': dx = 0.707; dy = 0.707; break
  case 'diagRLL': dx = 0.707; dy = -0.707; break
  }

  directionState = { dx, dy }
  updateDirectionDisplay(dx, dy)
  updateDirectionButtons() // Обновляем выделение кнопок

  // Отправляем команду на сервер (только установка направления, без запуска движения)
  safeSend(WS_MSG.controllerUpdate, {
    dirX: dx,
    dirY: dy
  })
  debugLog('✅ Направление и движение установлены через WS:', mode, { dx, dy })
}

function setDirFromDirection (direction) {
  const dx = direction.x
  const dy = direction.y

  directionState = { dx, dy }
  updateDirectionDisplay(dx, dy)

  safeSend(WS_MSG.controllerUpdate, { dirX: dx, dirY: dy })
}

function updateDirectionDisplay (dx, dy) {
  const currentDirection = document.getElementById('currentDirection')
  if (!currentDirection) return

  let directionText = '↔️ Горизонтально'
  if (dx === 0 && dy === 1) directionText = '↕️ Вертикально'
  else if (dx > 0 && dy > 0) directionText = '↗️ Диагональ L→R'
  else if (dx > 0 && dy < 0) directionText = '↙️ Диагональ R→L'
  else if (dx < 0 && dy > 0) directionText = '↖️ Диагональ R→L'
  else if (dx < 0 && dy < 0) directionText = '↙️ Диагональ L→R'

  currentDirection.textContent = directionText
}

// ===== ФУНКЦИИ УПРАВЛЕНИЯ МЯЧОМ =====

function resetCenter () {
  debugLog('🎯 Центрирование мяча...')
  // Отправляем команду на сервер
  safeSend(WS_MSG.controllerUpdate, { reset: true })

  // И немедленно центрируем мяч в локальном превью для мгновенной обратной связи
  if (previewPhysicsEngine && previewCanvas && window.__current.viewerScreenSize) {
    // Центрируем относительно размеров вьювера, а не превью
    const viewerCenterX = window.__current.viewerScreenSize.width / 2
    const viewerCenterY = window.__current.viewerScreenSize.height / 2

    // Масштабируем центр вьювера к размерам превью
    const scaleX = previewCanvas.width / window.__current.viewerScreenSize.width
    const scaleY = previewCanvas.height / window.__current.viewerScreenSize.height

    const previewCenterX = viewerCenterX * scaleX
    const previewCenterY = viewerCenterY * scaleY

    // Устанавливаем позицию и target координаты для корректной интерполяции
    previewPhysicsEngine.setPosition(previewCenterX, previewCenterY)

    debugLog(`✅ Мяч центрирован относительно вьювера: (${viewerCenterX}, ${viewerCenterY}) → (${previewCenterX.toFixed(1)}, ${previewCenterY.toFixed(1)})`)
  } else if (previewPhysicsEngine && previewCanvas) {
    // Fallback: центрируем относительно превью, если размеры вьювера неизвестны
    const centerX = previewCanvas.width / 2
    const centerY = previewCanvas.height / 2
    previewPhysicsEngine.setPosition(centerX, centerY)
    debugLog('✅ Мяч центрирован относительно превью (размеры вьювера неизвестны)')
  }
  debugLog('✅ Команда центрирования отправлена, превью обновлено локально')
}

function resetSession () {
  if (confirm('Вы уверены, что хотите сбросить сессию?')) {
    // Закрываем текущий WebSocket
    if (wsClient) wsClient.disconnect()

    fetch('/api/session', { method: 'POST' }).then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      return response.json()
    }).then(data => {
      const newSessionId = data.sessionId

      debugLog(`🔄 Сессия сброшена. Новая сессия: ${newSessionId}`)

      // Обновляем URL и перезагружаем страницу
      const newUrl = new URL(window.location)
      newUrl.searchParams.set('sessionId', newSessionId)
      window.location.href = newUrl.toString()
    }).catch(error => {
      debugError('Error resetting session:', error)
      alert('Ошибка при сбросе сессии', error.message)
    })
  }
}

function setBallColor (color) {
  // Оптимизация: меньше обновлений когда нет вьювера
  if (!window.__current.viewerConnected) {
    // Тихо пропускаем обновление цвета мяча
    return
  }
  safeSend(WS_MSG.controllerUpdate, { colorBall: color })
}

function setBgColor (color) {
  // Оптимизация: меньше обновлений когда нет вьювера
  if (!window.__current.viewerConnected) {
    // Тихо пропускаем обновление цвета фона
    return
  }
  safeSend(WS_MSG.controllerUpdate, { colorBg: color })
}

function setBallSize (size) {
  // Оптимизация: меньше обновлений когда нет вьювера
  if (!window.__current.viewerConnected) {
    // Тихо пропускаем обновление размера мяча
    return
  }
  safeSend(WS_MSG.controllerUpdate, { radius: size })
}

// ===== ФУНКЦИИ ВОСПРОИЗВЕДЕНИЯ =====

// Глобальная переменная для отслеживания состояния игры
// let isPlaying = false; // Перенесено наверх

// Удаляем hasViewer, так как теперь используем window.__current.viewerConnected
// let hasViewer = false;

// Глобальная переменная для отслеживания текущего направления
// let currentDirectionMode = 'horizontal'; // Перенесено наверх

function updatePlayPauseButton () {
  const button = document.getElementById('playPauseBtn')
  if (!button) return

  if (isPlaying) {
    button.textContent = '⏸ Стоп'
    button.style.background = '#f59e0b'
  } else {
    button.textContent = '▶️ Старт'
    button.style.background = '#10b981'
  }
}

function togglePlayPause () {
  const payload = {}

  if (isPlaying) {
    // Останавливаем игру
    payload.paused = true
    safeSend(WS_MSG.controllerUpdate, { paused: true })
    isPlaying = false
    updatePlayPauseButton() // мгновенный отклик UI
    // При остановке увеличиваем сет
    bbCounters.stop(true)
    // Не позволяем серверному paused мгновенно вернуть кнопку в Старт/Стоп некорректно
    __ignoreServerPausedUntilTs = performance.now() + 800
    // Двойная фиксация UI после возможных синхронных апдейтов
    setTimeout(updatePlayPauseButton, 0)
    setTimeout(updatePlayPauseButton, 300)
  } else {
    // Запускаем игру
    let currentDirection = directionState || { dx: 1, dy: 0 }
    if (currentDirection.dx === 0 && currentDirection.dy === 0) {
      currentDirection = { dx: 1, dy: 0 }
    }

    Object.assign(payload, {
      paused: false,
      dirX: currentDirection.dx,
      dirY: currentDirection.dy,
      speed: components.speed ? components.speed.getSpeed() : 40
    })

    safeSend('controller_update', payload)
    isPlaying = true
    updatePlayPauseButton() // мгновенный отклик UI
    // Запускаем таймер
    bbCounters.start()
    __ignoreServerPausedUntilTs = performance.now() + 800
    setTimeout(updatePlayPauseButton, 0)
    setTimeout(updatePlayPauseButton, 300)
  }

  // Немедленно применяем команду к локальному движку для мгновенной реакции
  if (previewPhysicsEngine) {
    previewPhysicsEngine.applyCommand(payload)
  }
  // Пользователь явно нажал кнопку — снимаем принудительную паузу
  if (!isPlaying) {
    // сейчас мы перешли в режим паузы
  } else {
    // режим «Старт» — больше не блокируем paused=false от сервера
    forcePauseUntilUserAction = false
  }

  // Финальное подтверждение состояния на кнопке
  updatePlayPauseButton()
}

// Устаревшие функции (оставлены для совместимости)
function resumePlay () {
  if (!isPlaying) {
    togglePlayPause()
  }
}

function pausePlay () {
  if (isPlaying) {
    togglePlayPause()
  }
}

// ===== УТИЛИТЫ =====

/**
 * Масштабирует состояние вьювера к размерам превью
 */
function getScaledState (state) {
  if (!window.__current.viewerScreenSize || !window.__previewCanvas || !state) {
    return state // Возвращаем как есть, если нет данных для масштабирования
  }

  const viewerSize = window.__current.viewerScreenSize
  const previewSize = { width: window.__previewCanvas.width, height: window.__previewCanvas.height }

  if (viewerSize.width <= 0 || viewerSize.height <= 0) {
    return state
  }

  // **МАТЕМАТИЧЕСКИ КОРРЕКТНОЕ МАСШТАБИРОВАНИЕ**
  const scaleX = previewSize.width / viewerSize.width
  const scaleY = previewSize.height / viewerSize.height
  // Для радиуса используем минимальный масштаб, чтобы он точно вписывался и не искажался
  const scaleRadius = Math.min(scaleX, scaleY)

  const scaledState = { ...state }

  // Фолбэк: если координаты нечисловые (undefined/null/NaN) — ставим центр экрана вьювера
  // Это происходит когда вьювер подключился, но размер экрана еще не установлен
  const rawX = (typeof state.x === 'number' && !Number.isNaN(state.x))
    ? state.x
    : (viewerSize.width / 2)
  const rawY = (typeof state.y === 'number' && !Number.isNaN(state.y))
    ? state.y
    : (viewerSize.height / 2)

  scaledState.x = rawX * scaleX
  scaledState.y = rawY * scaleY
  if (scaledState.radius !== undefined) scaledState.radius *= scaleRadius
  else if (typeof state.radius === 'number') scaledState.radius = state.radius * scaleRadius

  return scaledState
}

function copy (id) {
  const element = document.getElementById(id)
  if (!element) return
  element.select()
  navigator.clipboard.writeText(element.value)
    .then(() => {
      const btn = (window.event && window.event.target) || null
      if (btn) {
        const originalText = btn.textContent
        btn.textContent = '✅ Скопировано!'
        setTimeout(() => { btn.textContent = originalText }, 2000)
      }
    })
    .catch(err => {
      debugError('Failed to copy: ', err)
      alert('Ошибка копирования', err.message)
    })
}

function goBack () {
  if (confirm('Вы уверены, что хотите вернуться на главную страницу? Текущая сессия будет сохранена.')) {
    window.location.href = '/'
  }
}

function updateViewerStatusUI () {
  // Тихо обновляем статус вьювера
  const viewerStatusEl = document.getElementById('viewerStatus')
  if (viewerStatusEl) {
    if (window.__current.viewerConnected) {
      viewerStatusEl.textContent = 'Подключен'
      viewerStatusEl.style.color = '#10b981' // зеленый
      if (window.__current.viewerScreenSize && window.__current.viewerScreenSize.width > 0) {
        updatePreviewSize(window.__current.viewerScreenSize)
      }
    } else {
      viewerStatusEl.textContent = 'Ожидание...'
      viewerStatusEl.style.color = '#ef4444' // красный
      showWaitingForViewer()
    }
  }
}
