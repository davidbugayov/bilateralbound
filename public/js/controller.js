/**
 * Controller - Логика управления сессией BilateralBound v2.1
 * Современная модульная архитектура с улучшенной обработкой ошибок
 */

// Экспортируем функции для использования в тестах
/* exported setDirection, resetCenter, updateSpeed, setBallColor, setBallSize, setBackgroundColor, togglePlayPause */
// 1. Глобальное состояние определяется в первую очередь, до загрузки DOM
globalThis.__current = {
  sessionId: null,
  viewerConnected: false,
  viewerScreenSize: { width: 0, height: 0 }
}

// 2. Рендерер для превью
globalThis.__previewRenderer = null
globalThis.__previewScale = 1 // Коэффициент масштабирования

// 3. Глобальные переменные для логики контроллера
const components = {}
// Экспортируем ссылку на компоненты для использования в новых функциях
if (typeof window !== 'undefined') {
  window.components = components
}
let lastServerState = null // Кэшируем последнее состояние от сервера
let directionState = { dx: 1, dy: 0 }
let isPlaying = false
let currentDirectionMode = 'horizontal'
let wsClient
let isInitialized = false // Флаг для предотвращения повторной инициализации

let __ignoreServerPausedUntilTs = 0 // Кратковременная блокировка переопределения isPlaying сервером

// --- State ---
let previewPhysicsEngine = null // Локальный движок физики для превью
let hiddenThrottleMs = 100 // при скрытой вкладке обновляем ~10 FPS
if (typeof window !== 'undefined' && window.BBConfig && window.BBConfig.rendering && typeof window.BBConfig.rendering.hiddenThrottleMs === 'number') {
  hiddenThrottleMs = window.BBConfig.rendering.hiddenThrottleMs
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
  _lastBounceTs: 0,
  bounceHits: 0, // количество отдельных стуков (2 стука = 1 пасс)
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
      // После каждого сета обнуляем пасы и счетчик стуков
      this.passes = 0
      this.bounceHits = 0
      this._lastBounceTs = 0
    }
    // По требованию: после Стоп таймер обнулять
    this.timerMs = 0
    this.render()
  },
  resetAll () {
    this.timerMs = 0
    this.passes = 0
    this.sets = 0
    this.bounceHits = 0
    this._lastBounceTs = 0
    this.render()
  },
  onBounce () {
    if (!this.running) return
    const now = performance.now()
    if (now - this._lastBounceTs < 120) return
    this._lastBounceTs = now
    // Учитываем, что 1 пасс = 2 стука (туда-обратно)
    this.bounceHits += 1
    if (this.bounceHits % 2 === 0) {
      this.passes += 1
    }

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
  } catch {
    console.warn('Error in detectAndCountBounceFromServer')
  }
}

// 4. Остальная логика выполняется после полной загрузки страницы
document.addEventListener('DOMContentLoaded', () => {
  // Тихая инициализация
  initializeController().catch(console.error)
  // Инициализируем DOM для счётчиков
  bbCounters.initDom()

  // При изменении размера окна контроллера — пересчитать превью по текущим размерам вьювера
  window.addEventListener('resize', () => {
    const size = window.__current?.viewerScreenSize
    if (size?.width > 0 && size?.height > 0) {
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
      console.error('ID сессии не найден в URL')
      showNotification('ID сессии не найден в URL', 'error')
      return
    }

    // Сохраняем sessionId в глобальном состоянии
    globalThis.__current.sessionId = sessionId

    logger.info(`📋 Работаем с сессией: ${sessionId}`)

    // Уведомляем сервер о подключении контроллера (для постоянных ссылок)
    try {
      const connectResponse = await fetch(`/api/session/${sessionId}/controller/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (connectResponse.ok) {
        logger.info('✅ Контроллер зарегистрирован на сервере')
      } else {
        logger.warn('⚠️ Не удалось зарегистрировать контроллер на сервере')
      }
    } catch (error) {
      logger.warn('⚠️ Ошибка регистрации контроллера:', error)
    }

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
    await initializePreview()

    // Навешиваем обработчики полноэкранного превью
    const openFsBtn = document.getElementById('openPreviewFullscreenBtn')
    const exitFsBtn = document.getElementById('exitPreviewFullscreenBtn')
    const overlay = document.getElementById('previewOverlay')
    previewFsCanvas = document.getElementById('previewFullscreenCanvas')
    if (openFsBtn && exitFsBtn && overlay && previewFsCanvas) {
      openFsBtn.addEventListener('click', openPreviewFullscreen)
      exitFsBtn.addEventListener('click', closePreviewFullscreen)
      window.addEventListener('resize', () => {
        if (isPreviewFullscreen) resizePreviewFullscreen()
      })
      // Горячие клавиши: F – toggle, Esc – закрыть
      document.addEventListener('keydown', (e) => {
        const key = e.key?.toLowerCase()
        if (key === 'f') {
          if (!isPreviewFullscreen) openPreviewFullscreen()
          else closePreviewFullscreen()
        } else if (key === 'escape') {
          if (isPreviewFullscreen) closePreviewFullscreen()
        }
      })
    }

    // Обработчик навигации назад в браузере
    window.addEventListener('popstate', (event) => {
      console.log('🔙 Popstate event:', event.state, 'Hash:', window.location.hash, 'Fullscreen:', isPreviewFullscreen)

      if (isPreviewFullscreen) {
        // Если мы в полноэкранном режиме и произошла навигация назад
        closePreviewFullscreen()
      } else if (window.location.hash === '#fullscreen-preview' && !isPreviewFullscreen) {
        // Если пользователь попал на хэш полноэкранного режима, но режим не активен
        openPreviewFullscreen()
      }
    })

    // 3. Инициализация WebSocket с современным API
    await initializeWebSocketClient(sessionId)

    logger.info('🔌 WebSocket клиент инициализирован, ожидаем подключения вьювера...')
  } catch {
    console.warn('Error initializing controller')
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
    console.warn(`Не найдены HTML элементы: ${missingElements.join(', ')}`)
    // Не выбрасываем ошибку, если элементы не найдены - они могут быть необязательными
  }

  // Настройка элементов (проверяем существование перед использованием)
  if (initializedElements.curSid) {
    initializedElements.curSid.textContent = sessionId
  }

  if (initializedElements.sessionInfo) {
    initializedElements.sessionInfo.textContent = `Создана: ${new Date().toLocaleString()}`
  }

  if (initializedElements.viewerStatus) {
    initializedElements.viewerStatus.textContent = 'Ожидание...'
  }

  // Обновляем ссылку для зрителя сразу после инициализации
  updateViewerLink(sessionId)

  return initializedElements
}

function updateViewerLink (sessionId) {
  const viewLinkInput = document.getElementById('view')
  if (viewLinkInput) {
    viewLinkInput.value = `${window.location.origin}/s/${sessionId}`
  }
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
    heartbeatInterval: 25000,
    coalesceDelayMs: 8 // Уменьшаем задержку для большей плавности
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
  wsClient.on('open', () => {
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
      showNotification('Потеряно соединение с сервером', 'error')
    }
  })

  wsClient.on(WS_MSG.viewerStatus, (data) => {
    logger.info('Получен статус viewer', data)
    window.__current.viewerConnected = data.connected
    if (data.screenSize) {
      window.__current.viewerScreenSize = data.screenSize
    }

    // Если вьювер подключился, завершаем инициализацию
    if (data.connected) {
      completeInitialization().catch(console.error)
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
      updatePreviewSize(state.viewerScreenSize)
    }

    // Мгновенно выравниваем позицию в превью по центру из initial_state (без интерполяции),
    // используем СЫРЫЕ координаты вьювера (скейл будет на отрисовке)
    try {
      if (previewPhysicsEngine) {
        const hasValidX = typeof state.x === 'number' && !Number.isNaN(state.x)
        const hasValidY = typeof state.y === 'number' && !Number.isNaN(state.y)

        if (hasValidX && hasValidY) {
          previewPhysicsEngine.setPosition(state.x, state.y)
          previewPhysicsEngine.setVelocity(0, 0)
        } else if (window.__current.viewerScreenSize && window.__current.viewerScreenSize.width > 0) {
          // Фолбэк: если координаты не пришли, центрируем относительно размеров вьювера
          const canvas = window.__previewCanvas || document.getElementById('preview')
          if (canvas) {
            const viewerCenterX = window.__current.viewerScreenSize.width / 2
            const viewerCenterY = window.__current.viewerScreenSize.height / 2
            const scaleX = canvas.width / window.__current.viewerScreenSize.width
            const scaleY = canvas.height / window.__current.viewerScreenSize.height
            const previewCenterX = viewerCenterX * scaleX
            const previewCenterY = viewerCenterY * scaleY
            previewPhysicsEngine.setPosition(previewCenterX, previewCenterY)
            previewPhysicsEngine.setVelocity(0, 0)
          }
        }
      }
  } catch {
    // Тихо игнорируем, если в момент старта ещё нет канваса
    console.warn('Canvas not ready during initial state setup')
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
        // При изменении размеров обновляем превью, но не останавливаем игру
        // Игра должна продолжать работать
      }
    }
    applyServerStateToPreview(state)
  })

  // АДАПТИВНАЯ адаптация сглаживания по сетевым метрикам (улучшенная версия)
  wsClient.on(WS_MSG.netMetrics, ({ rttMs, jitterMs }) => {
    if (!previewPhysicsEngine) return

    const base = (window.BBConfig && window.BBConfig.smoothing) || {}

    // Адаптивное демпфирование на основе джиттера (улучшено)
    const adaptiveDamping = Math.min(25, Math.max(10,
      (base.damping || 15) + (jitterMs / 15) + (rttMs / 50)
    ))

    // Адаптивная жесткость на основе условий сети
    const adaptiveStiffness = Math.min(35, Math.max(20,
      (base.stiffness || 25) - (jitterMs / 50) + (rttMs > 100 ? 5 : 0)
    ))

    // Адаптивное время предикции на основе RTT
    const adaptivePredictTime = Math.min(0.15, Math.max(0.08,
      (base.maxPredictSec || 0.1) + Math.max(0, (rttMs / 1000 - 0.05) * 0.3)
    ))

    // Адаптивная дистанция снапа на основе стабильности сети
    const adaptiveSnapDistance = Math.min(0.4, Math.max(0.15,
      (base.snapDistance || 0.2) + (jitterMs > 20 ? 0.1 : 0)
    ))

    previewPhysicsEngine.setSmoothingOptions({
      damping: adaptiveDamping,
      stiffness: adaptiveStiffness,
      maxPredictSec: adaptivePredictTime,
      snapDistance: adaptiveSnapDistance,
      // Включаем продвинутые функции сглаживания
      exponentialSmoothing: base.exponentialSmoothing,
      stateBuffering: base.stateBuffering,
      bufferSize: base.bufferSize
    })
  })

  wsClient.on('maxReconnectAttemptsReached', () => {
    logger.error('Исчерпаны попытки переподключения')
    showNotification('Не удается подключиться к серверу. Проверьте интернет-соединение.', 'error')
  })
}

/**
 * Улучшенная локальная симуляция для более плавного движения
 */
function applyServerStateToPreview (state) {
  if (!previewPhysicsEngine || !state) return

  // Синхронизируем размер мира движка с размерами экрана вьювера
  if (state.viewerScreenSize && typeof state.viewerScreenSize.width === 'number' && typeof state.viewerScreenSize.height === 'number') {
    previewPhysicsEngine.setWorldSize(state.viewerScreenSize.width, state.viewerScreenSize.height)
  }

  // Применяем состояние от сервера для обновления целевых координат
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

/**
 * Улучшенный рендер-цикл с лучшей интерполяцией
 */
// Глобальные переменные для нового цикла
const PHYSICS_TICK_RATE = 60 // Гц
const PHYSICS_DT = 1000 / PHYSICS_TICK_RATE

function physicsLoop () {
  if (previewPhysicsEngine) {
    previewPhysicsEngine.update(PHYSICS_DT / 1000)
  }
}

function renderPreviewLoop (timestamp) {
  if (!previewPhysicsEngine || !globalThis.__previewRenderer) {
    requestAnimationFrame(renderPreviewLoop)
    return
  }

  // Вычисляем alpha для интерполяции на основе реального времени последнего обновления физики
  const now = performance.now()
  const lastPhysicsUpdate = (previewPhysicsEngine && previewPhysicsEngine.__lastPhysicsUpdateTs) || now
  const alpha = Math.max(0, Math.min(1, (now - lastPhysicsUpdate) / PHYSICS_DT))

  // Обновляем таймер счётчиков
  bbCounters.tick(timestamp)

  // Получаем интерполированное состояние
  const interpolatedState = previewPhysicsEngine.getInterpolatedBall(alpha)
  const stateToRender = getScaledState(interpolatedState)

  // Рендерим кадр
  globalThis.__previewRenderer.drawFrame(stateToRender)

  if (document.hidden) {
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
 * Показ уведомления
 */
function showNotification (message, type = 'info') {
  // Обертка для ожидания инициализации notificationSystem
  const tryShowNotification = (attempt = 0) => {
    if (window.notificationSystem) {
      const titles = {
        success: '',
        error: 'Ошибка',
        warning: 'Внимание',
        info: ''
      }
      const title = titles[type] || ''
      window.notificationSystem.show({
        type: type,
        title: title,
        message: message
      })
    } else if (attempt < 5) {
      // Если система еще не готова, пробуем еще раз через 100 мс
      setTimeout(() => tryShowNotification(attempt + 1), 100)
    } else {
      // Fallback, если notificationSystem так и не появилась
      console.warn('Notification system not found, using fallback.')
      const fallbackToast = document.createElement('div')
      fallbackToast.className = 'theme-notification'
      fallbackToast.style.background = type === 'success' ? '#10b981' : '#ef4444'
      fallbackToast.textContent = message
      document.body.appendChild(fallbackToast)
      setTimeout(() => fallbackToast.remove(), 3000)
    }
  }
  tryShowNotification()
}

/**
 * Создание логгера для модуля
 */
function createLogger (moduleName) {
  const startTime = performance.now()

  return {
    info: (message, data) => {
      const timestamp = ((performance.now() - startTime) / 1000).toFixed(2)
      console.log(`[${timestamp}s] ${moduleName}: ${message}`, data || '')
    },
    success: (message, data) => {
      const timestamp = ((performance.now() - startTime) / 1000).toFixed(2)
      console.log(`[${timestamp}s] ✅ ${moduleName}: ${message}`, data || '')
    },
    warning: (message, data) => {
      const timestamp = ((performance.now() - startTime) / 1000).toFixed(2)
      console.warn(`[${timestamp}s] ⚠️ ${moduleName}: ${message}`, data || '')
    },
    error: (message, data) => {
      const timestamp = ((performance.now() - startTime) / 1000).toFixed(2)
      console.error(`[${timestamp}s] ❌ ${moduleName}: ${message}`, data || '')
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

  if (error instanceof AppError) {
    switch (error.code) {
      case 'SESSION_ID_MISSING':
        // Показываем ошибку пользователю
        break
      case 'DOM_ELEMENTS_MISSING':
        // Показываем ошибку пользователю
        break
      default:
        // Показываем ошибку пользователю
    }
  }

    // Показываем ошибку пользователю
    // Логируем для отладки
}

// ===== СИНХРОНИЗАЦИЯ UI =====

function syncUIWithState (ballState) {
  try {
    if (!ballState) {
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
      // Обновляем состояние игры на основе серверного состояния
      isPlaying = !ballState.paused
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
  } catch {
    console.warn('Error in syncUIWithState')
  }
}

// ===== ИНИЦИАЛИЗАЦИЯ КОМПОНЕНТОВ =====

function initializeComponents () {
  // Создаем компонент управления скоростью
  components.speed = sharedComponents.createSpeedControl(
    document.getElementById('speedControl'),
    {
      onSpeedChange: throttle((speed) => {
        updateSpeed(speed).catch(console.error)
      }, 100) // Ограничиваем отправку: не чаще чем раз в 100 мс
    }
  )

  // Создаем компонент управления цветом шарика
  components.ballColor = sharedComponents.createColorControl(
    document.getElementById('ballColorControl'),
    {
      colors: ['#60a5fa', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16', '#fb7185', '#ffffff'],
      defaultValue: '#60a5fa', // Дефолтный цвет мяча
      title: '', // Заголовок уже есть в HTML
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
      title: '', // Заголовок уже есть в HTML
      onColorChange: (color) => {
        setBackgroundColor(color)
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
      title: '', // Заголовок уже есть в HTML
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
  } catch {
    console.warn('Failed to send WebSocket message')
  }
}

async function updateSpeed (speed) {
  try {
    // Отправляем изменение скорости всегда, даже если вьювер ещё не подключен
    // (сервер сохранит значение и применит при старте)
    await safeSend(WS_MSG.controllerUpdate, { speed })
  } catch {
    console.warn('Error updating speed')
  }
}

async function initializePreview () {
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

  // Проверяем размеры canvas
  if (canvas.width === 0 || canvas.height === 0) {
    canvas.width = 400
    canvas.height = 300
    // Жестко задаем CSS размеры, чтобы исключить неравномерное масштабирование
    canvas.style.width = canvas.width + 'px'
    canvas.style.height = canvas.height + 'px'
  }

  try {
    // Создаем движок физики для превью
    previewPhysicsEngine = new PhysicsEngine({ sessionId: 'preview' })
    // Экспортируем для UI‑тестов
    try { window.__previewPhysics = previewPhysicsEngine } catch { /* ignore */ }
    // Клиент теперь вычисляет физику локально (включая отскоки), сервер только синхронизирует
    previewPhysicsEngine.isViewer = true
    // Считаем пасы по локальным событиям отскока
    window.addEventListener('bb_bounce', () => bbCounters.onBounce())
    // Применяем глобальные настройки сглаживания, если есть
    if (window.BBConfig && window.BBConfig.smoothing) {
      previewPhysicsEngine.setSmoothingOptions(window.BBConfig.smoothing)
    }

    // Запускаем ЦИКЛ ФИЗИКИ с фиксированным шагом
    if (physicsInterval) clearInterval(physicsInterval)
    physicsInterval = setInterval(physicsLoop, PHYSICS_DT)

    // Запускаем ЦИКЛ РЕНДЕРИНГА
    requestAnimationFrame(renderPreviewLoop)

    // Создаем рендерер, который НЕ будет обновлять физику
    window.__previewRenderer = new BallRenderer(canvas, previewPhysicsEngine, {
      localPhysics: false // Рендерер только рисует, физика обновляется отдельно
    })

     window.__previewRenderer.setFrameCallback((deltaTime) => {
       // Дополнительная логика для превью может быть добавлена здесь
       // deltaTime параметр сохранен для совместимости с интерфейсом
       console.log('Preview frame callback called with deltaTime:', deltaTime);
     })

    globalThis.__previewCanvas = canvas

    // Если вьювер ещё не подключен, показываем мяч по центру превью
    if (!window.__current.viewerScreenSize || !window.__current.viewerScreenSize.width) {
      // Настраиваем мир превью под размеры canvas
      previewPhysicsEngine.setWorldSize(canvas.width, canvas.height)
      // Ставим мяч в центр превью и останавливаем
      previewPhysicsEngine.setPosition(canvas.width / 2, canvas.height / 2)
      previewPhysicsEngine.setVelocity(0, 0)
    }
  } catch {
    console.warn('Error initializing preview')
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
  if (!viewerScreenSize || !globalThis.__previewRenderer || !previewPhysicsEngine) {
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

  // Синхронизируем размер мира движка с размерами экрана вьювера,
  // чтобы предикция и клампинг соответствовали реальным границам вьювера
  if (previewPhysicsEngine && viewerScreenSize && typeof viewerScreenSize.width === 'number' && typeof viewerScreenSize.height === 'number') {
    previewPhysicsEngine.setWorldSize(viewerScreenSize.width, viewerScreenSize.height)
  }

  // ВАЖНО: Не масштабируем радиус в движке, масштаб произойдёт в отрисовке

  // После изменения размера, немедленно перерисовываем последнее известное состояние в новом масштабе
  if (lastServerState) {
    // Применяем СЫРОЕ состояние сервера (в координатах вьювера),
    // отрисовка сама выполнит масштабирование
    previewPhysicsEngine.applyCommand(lastServerState)
  } else {
    // Если нет состояния сервера, но есть размеры вьювера, центрируем мяч относительно них
    // Физика работает в координатах вьювера, поэтому используем их напрямую
    if (globalThis.__current.viewerScreenSize && globalThis.__current.viewerScreenSize.width > 0) {
      const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2
      const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2

      previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY)
      previewPhysicsEngine.setVelocity(0, 0)
    }
  }

  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.textContent = `Вьювер: ${viewerScreenSize.width}×${viewerScreenSize.height}`
    viewerInfo.style.display = 'block'
  }

  // Тихо завершаем обновление размера превью
}

// ===== ФУНКЦИИ УПРАВЛЕНИЯ МЯЧОМ =====

/**
 * Устанавливает направление движения шарика
 */
function setDirection (directionMode) {
  if (!directionMode) return

  try {
    // Преобразуем текстовый режим в вектор направления
    let dirX = 0
    let dirY = 0
    let displayText = 'Неизвестно'

    switch (directionMode) {
      case 'horizontal':
        dirX = 1
        dirY = 0
        displayText = 'Горизонтальное'
        break
      case 'vertical':
        dirX = 0
        dirY = 1
        displayText = 'Вертикальное'
        break
      case 'diagRL': // Диагональ вправо-вниз
        dirX = 0.707
        dirY = 0.707
        displayText = 'Диагональ (право-вниз)'
        break
      case 'diagRLL': // Диагональ вправо-вверх
        dirX = 0.707
        dirY = -0.707
        displayText = 'Диагональ (право-верх)'
        break
      case 'random': { // Случайное направление
        // Генерируем случайный угол в радианах
        const angle = Math.random() * 2 * Math.PI
        dirX = Math.cos(angle)
        dirY = Math.sin(angle)
        displayText = 'Случайное'
        break
      }
      default:
        console.warn('Неизвестный режим направления:', directionMode)
        return
    }

    // Обновляем глобальное состояние направления
    directionState = { dx: dirX, dy: dirY }
    currentDirectionMode = directionMode

    if (isPlaying) {
      // Если игра идет, плавно меняем направление через центр
      safeSend(WS_MSG.controllerUpdate, {
        paused: true,
        returnToCenter: true
      })

      setTimeout(() => {
        safeSend(WS_MSG.controllerUpdate, {
          paused: false,
          dirX: dirX,
          dirY: dirY
        })
      }, 200) // Уменьшаем задержку для более быстрого отклика
    } else {
      // Если игра на паузе, просто обновляем направление без запуска движения
      safeSend(WS_MSG.controllerUpdate, {
        dirX: dirX,
        dirY: dirY
        // `paused` не отправляем, чтобы не менять текущее состояние паузы
      })
    }

    // Обновляем UI для обратной связи
    updateDirectionButtons()
    updateDirectionDisplay(dirX, dirY, displayText)

    console.log(`🎯 Направление изменено: ${directionMode} (${dirX.toFixed(2)}, ${dirY.toFixed(2)}), isPlaying: ${isPlaying}`)
  } catch (error) {
    console.error('Ошибка установки направления:', error)
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

function setBallSize (size) {
  // Оптимизация: меньше обновлений когда нет вьювера
  if (!window.__current.viewerConnected) {
    // Тихо пропускаем обновление размера мяча
    return
  }
  safeSend(WS_MSG.controllerUpdate, { radius: size })
}

function setBallSizeMultiplier (multiplier) {
  // Базовый размер 20, умножаем на множитель
  const baseSize = 20
  const newSize = baseSize * multiplier
  setBallSize(newSize)
}

function setBackgroundColor (color) {
  // Отправляем изменение на сервер
  if (globalThis.__current.viewerConnected) {
    safeSend(WS_MSG.controllerUpdate, { colorBg: color })
  }

  // Обновляем фон в превью
  if (globalThis.previewRenderer) {
    globalThis.previewRenderer.setBackgroundColor(color)
  }
  // Обновляем фон в полноэкранном превью
  if (globalThis.fullscreenPreviewRenderer) {
    globalThis.fullscreenPreviewRenderer.setBackgroundColor(color)
  }
}


/**
 * Обновляет состояние кнопок направления
 */
function updateDirectionButtons () {
  // Обновляем активное состояние кнопок направления в основном интерфейсе
  const directionButtons = document.querySelectorAll('[data-mode]')
  directionButtons.forEach(button => {
    const buttonDirection = button.getAttribute('data-mode')
    if (buttonDirection === currentDirectionMode) {
      button.classList.add('active')
    } else {
      button.classList.remove('active')
    }
  })

  // Обновляем кнопки направления в полноэкранном режиме
  const fsDirectionButtons = document.querySelectorAll('[id^="fsDir"]')
  fsDirectionButtons.forEach(button => {
    let buttonDirection = null
    if (button.id === 'fsDirH') buttonDirection = 'horizontal'
    else if (button.id === 'fsDirV') buttonDirection = 'vertical'
    else if (button.id === 'fsDirDL') buttonDirection = 'diagRLL'
    else if (button.id === 'fsDirDR') buttonDirection = 'diagRL'
    else if (button.id === 'fsDirRandom') buttonDirection = 'random'
    
    if (buttonDirection === currentDirectionMode) {
      button.classList.add('active')
    } else {
      button.classList.remove('active')
    }
  })
}

/**
 * Обновляет индикатор направления и отображает информацию о текущем направлении
 */
function updateDirectionDisplay (dirX, dirY, customText = null) {
  try {
    // Ищем элемент для отображения направления
    const directionDisplay = document.getElementById('currentDirection')
    let directionText = customText || 'Неизвестно'
    let directionIcon = '❓'

    if (!customText) {
      // ОПРЕДЕЛЯЕМ НАПРАВЛЕНИЕ ТОЛЬКО ПО currentDirectionMode - игнорируем dirX/dirY
      console.log(`🎯 Определяем направление по режиму: ${currentDirectionMode}`)

      if (currentDirectionMode === 'horizontal') {
        directionText = 'Горизонтальное'
        directionIcon = '↔️'
      } else if (currentDirectionMode === 'vertical') {
        directionText = 'Вертикальное'
        directionIcon = '↕️'
      } else if (currentDirectionMode === 'diagRL') {
        directionText = 'Диагональ (право-вниз)'
        directionIcon = '↘️'
      } else if (currentDirectionMode === 'diagRLL') {
        directionText = 'Диагональ (право-верх)'
        directionIcon = '↗️'
      } else if (currentDirectionMode === 'random') {
        directionText = 'Случайное'
        directionIcon = '🎲'
      } else {
        // Если режим неизвестен, показываем вопрос
        directionText = 'Неизвестное направление'
        directionIcon = '❓'
        console.warn(`🎯 Неизвестный режим направления: ${currentDirectionMode}`)
      }
    }

    if (directionDisplay) {
      directionDisplay.innerHTML = `${directionIcon}`
    }

    // Обновляем иконку направления в полноэкранном режиме
    const fsDirectionDisplay = document.getElementById('fsCurrentDirection')
    if (fsDirectionDisplay) {
      fsDirectionDisplay.innerHTML = directionDisplay ? directionDisplay.innerHTML : `${directionIcon || '❓'} <span>${directionText || 'Неизвестно'}</span>`
    }

    console.log(`🎯 Отображение направления обновлено: ${directionText} (режим: ${currentDirectionMode}) - игнорируем dirX/dirY`)
  } catch (error) {
    console.error('Ошибка обновления отображения направления:', error)
  }
}

function updatePlayPauseButton () {
  const button = document.getElementById('playPauseBtn')
  if (!button) return

  if (isPlaying) {
    button.textContent = '⏸ Стоп'
    button.classList.add('playing')
  } else {
    button.textContent = '▶️ Старт'
    button.classList.remove('playing')
  }
}

function togglePlayPause () {
  const payload = {}

  if (isPlaying) {
    // Останавливаем игру с плавным возвратом в центр
    payload.paused = true
    payload.returnToCenter = true // Флаг для плавного возврата в центр
    safeSend(WS_MSG.controllerUpdate, payload)
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
      speed: (components.speed && typeof components.speed.getSpeed === 'function') ? components.speed.getSpeed() : 40
    })

    safeSend(WS_MSG.controllerUpdate, payload)
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
    window.forcePauseUntilUserAction = false
  }

  // Финальное подтверждение состояния на кнопке
  updatePlayPauseButton()
  syncFsPlayPauseButton()
}

// ===== УТИЛИТЫ =====

/**
 * Масштабирует состояние вьювера к размерам превью
 */
function getScaledState (state) {
  if (!globalThis.__current.viewerScreenSize || !globalThis.__previewCanvas || !state) {
    return state // Возвращаем как есть, если нет данных для масштабирования
  }

  const viewerSize = globalThis.__current.viewerScreenSize
  const previewSize = { width: globalThis.__previewCanvas.width, height: globalThis.__previewCanvas.height }

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

function openPreviewFullscreen () {
  const overlay = document.getElementById('previewOverlay')
  if (!overlay || !previewFsCanvas) return

  console.log('🚀 Opening fullscreen preview')

  // Добавляем запись в историю браузера для корректного возврата
  const currentUrl = window.location.href
  const fullscreenUrl = currentUrl + '#fullscreen-preview'
  history.pushState({ fullscreen: true, returnUrl: currentUrl }, '', fullscreenUrl)

  overlay.style.display = 'block'
  isPreviewFullscreen = true

  try {
    if (!previewPhysicsEngine) {
      previewPhysicsEngine = new PhysicsEngine({ sessionId: 'preview' })
      previewPhysicsEngine.isViewer = true
    }
    if (!previewFsRenderer) {
      previewFsRenderer = new BallRenderer(previewFsCanvas, previewPhysicsEngine, { localPhysics: false })
      previewFsRenderer.start()
    } else {
      previewFsRenderer.setPhysicsEngine(previewPhysicsEngine)
    }
  } catch { /* ignore */ }

  resizePreviewFullscreen()
  setupFsPanelAutoHide()
  setupFsPanelDrag()
  setupFullscreenGestures()
  syncFsPlayPauseButton()
  wireFullscreenControls()
  fillFsSessionInfo()
}

function closePreviewFullscreen () {
  const overlay = document.getElementById('previewOverlay')
  if (!overlay) return

  console.log('🚪 Closing fullscreen preview')

  // Убираем хэш из URL без изменения истории
  const currentUrl = window.location.href
  const baseUrl = currentUrl.split('#')[0]
  history.replaceState(null, '', baseUrl)

  overlay.style.display = 'none'
  isPreviewFullscreen = false
}

function resizePreviewFullscreen () {
  if (!previewFsCanvas) return
  previewFsCanvas.width = window.innerWidth
  previewFsCanvas.height = window.innerHeight
  if (previewPhysicsEngine) {
    const vs = (window.__current && window.__current.viewerScreenSize) || null
    if (vs && typeof vs.width === 'number' && typeof vs.height === 'number' && vs.width > 0 && vs.height > 0) {
      previewPhysicsEngine.setWorldSize(vs.width, vs.height)
    } else {
      // Фолбэк на размеры окна, если размеры вьювера ещё неизвестны
      previewPhysicsEngine.setWorldSize(window.innerWidth, window.innerHeight)
    }
  }
}

function setupFsPanelAutoHide () {
  const panel = document.getElementById('previewFsPanel')
  const overlay = document.getElementById('previewOverlay')
  if (!panel || !overlay) return
  const show = () => { panel.style.opacity = '1' }
  const hide = () => { panel.style.opacity = '0' }
  const scheduleHide = () => {
    clearTimeout(fsPanelHideTimer)
    fsPanelHideTimer = setTimeout(hide, 2000)
  }
  // Показ при движении мыши и нажатиях
  overlay.addEventListener('mousemove', () => { show(); scheduleHide() })
  overlay.addEventListener('click', () => { show(); scheduleHide() })
  show(); scheduleHide()
}

function setupFsPanelDrag () {
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
    if (!fsPanelDrag.active) return
    panel.style.left = (x - fsPanelDrag.offsetX) + 'px'
    panel.style.top = (y - fsPanelDrag.offsetY) + 'px'
    panel.style.transform = 'translateX(0)'
  }
  const onUp = () => { fsPanelDrag.active = false }

  panel.addEventListener('mousedown', (e) => { onDown(e.clientX, e.clientY) })
  overlay.addEventListener('mousemove', (e) => { onMove(e.clientX, e.clientY) })
  window.addEventListener('mouseup', onUp)

  panel.addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    onDown(t.clientX, t.clientY)
  }, { passive: true })
  overlay.addEventListener('touchmove', (e) => {
    const t = e.touches[0]
    onMove(t.clientX, t.clientY)
  }, { passive: true })
  window.addEventListener('touchend', onUp, { passive: true })
}

function setupFullscreenGestures () {
  const overlay = document.getElementById('previewOverlay')
  if (!overlay) return

  let startX = 0; let startY = 0; let swiping = false
  const threshold = 40

  overlay.addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    startX = t.clientX
    startY = t.clientY
    swiping = true
  }, { passive: true })

  overlay.addEventListener('touchmove', (e) => {
    // жесты без блокировки скролла/зумов
    e.preventDefault(); // Предотвращаем прокрутку страницы при жестах
  }, { passive: true })

  overlay.addEventListener('touchend', (e) => {
    if (!swiping) return
    swiping = false
    const t = e.changedTouches[0]
    const dx = t.clientX - startX
    const dy = t.clientY - startY
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      // горизонтальные свайпы — смена направления
      if (dx > 0) {
        setDirection('horizontal')
      } else {
        // горизонтально влево — диагональ как альтернатива
        setDirection('vertical')
      }
    } else if (Math.abs(dy) > threshold) {
      // вертикальные свайпы — старт/стоп
      if (dy < 0) {
        // свайп вверх — старт
        if (!isPlaying) togglePlayPause()
      } else {
        // свайп вниз — стоп
        if (isPlaying) togglePlayPause()
      }
    }
  }, { passive: true })
}

function syncFsPlayPauseButton () {
  const btn = document.getElementById('fsPlayPauseBtn')
  if (!btn) return
  if (isPlaying) {
    btn.textContent = '⏸ Стоп'
  } else {
    btn.textContent = '▶️ Старт'
  }
}

function wireFullscreenControls () {
  const speed = document.getElementById('fsSpeed')
  if (speed) {
    speed.value = (components.speed && typeof components.speed.getSpeed === 'function') ? components.speed.getSpeed() : 40
    speed.oninput = (e) => updateSpeed(Number(e.target.value))
  }

  const size1 = document.getElementById('fsSize1')
  const size2 = document.getElementById('fsSize2')
  const size3 = document.getElementById('fsSize3')
  const size4 = document.getElementById('fsSize4')
  if (size1) size1.onclick = () => setBallSizeMultiplier(1)
  if (size2) size2.onclick = () => setBallSizeMultiplier(2)
  if (size3) size3.onclick = () => setBallSizeMultiplier(3)
  if (size4) size4.onclick = () => setBallSizeMultiplier(4)

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

  // Ball color buttons (10 colors from main preview)
  const ballColors = ['#60a5fa', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16', '#fb7185', '#ffffff']
  for (let i = 1; i <= 10; i++) {
    const btn = document.getElementById(`fsBallCol${i}`)
    if (btn) btn.onclick = () => setBallColor(ballColors[i - 1])
  }

  // Background color buttons (10 colors from main preview)
  const bgColors = ['#020617', '#000000', '#111827', '#0a2540', '#052e16', '#1a102a', '#2b1b0e', '#032f2f', '#2a0e14', '#0f172a']
  for (let i = 1; i <= 10; i++) {
    const btn = document.getElementById(`fsBg${i}`)
    if (btn) btn.onclick = () => setBackgroundColor(bgColors[i - 1])
  }
}

function fillFsSessionInfo () {
  try {
    const sid = globalThis.__current?.sessionId || '...'
    const fsSid = document.getElementById('fsCurSid')
    if (fsSid) fsSid.textContent = `SID: ${sid}`
    const fsLink = document.getElementById('fsViewLink')
    if (fsLink) fsLink.value = `${globalThis.location.origin}/s/${sid}`
  } catch {
    console.warn('Error in fillFsSessionInfo')
  }
}
