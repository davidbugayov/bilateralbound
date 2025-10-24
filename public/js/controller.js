'use strict'
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
  _lastBounceTs: 0,
  bounceHits: 0, // количество отдельных стуков (2 стука = 1 пасс)
  initDom() {
    this.$timer = document.getElementById('bbTimer')
    this.$passes = document.getElementById('bbPasses')
    this.$sets = document.getElementById('bbSets')
    const resetBtn = document.getElementById('bbResetBtn')
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetAll())
    }

    this.render()
  },
  start() {
    this.running = true
    this.lastTickTs = performance.now()
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
  }
}
// Детектор отскоков по серверным state_update (для подсчёта пасов)
let __lastBounceTs = 0
let __lastVxSign = 0
let __lastVySign = 0
function _hasBounced(currentVelocity, lastSign, minSpeed) {
  const currentSign = Math.sign(currentVelocity)
  return currentSign !== 0 && lastSign !== 0 && currentSign !== lastSign && Math.abs(currentVelocity) > minSpeed
}

function detectAndCountBounceFromServer(prev, curr) {
  // Функция разбита для снижения когнитивной сложности
  try {
    if (prev && curr && bbCounters.running) {
      const now = performance.now()
      if (now - __lastBounceTs >= 120) {
        const minSpeed = 10 // пикс/с, фильтр дрожания
        const currVx = curr?.vx || 0
        const currVy = curr?.vy || 0

        // Восстанавливаем последние ненулевые знаки, чтобы переживать кадры с vx/vy=0
        if (__lastVxSign === 0) __lastVxSign = Math.sign(prev?.vx || 0)
        if (__lastVySign === 0) __lastVySign = Math.sign(prev?.vy || 0)

        if (_hasBounced(currVx, __lastVxSign, minSpeed) || _hasBounced(currVy, __lastVySign, minSpeed)) {
          __lastBounceTs = now
          bbCounters.onBounce()
        }

        // Обновляем последние знаки только если текущие ненулевые — чтобы нули не затирали память
        const currSignX = Math.sign(currVx)
        const currSignY = Math.sign(currVy)
        if (currSignX !== 0) __lastVxSign = currSignX
        if (currSignY !== 0) __lastVySign = currSignY
      }
    }
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
    logger.info('Начинаем инициализацию контроллера')
    const sessionId = getSessionIdFromUrl()
    if (!sessionId) {
      console.error('ID сессии не найден в URL')
      showNotification('ID сессии не найден в URL', 'error')
      return
    }

    globalThis.__current.sessionId = sessionId
    logger.info(`Работаем с сессией: ${sessionId}`)

    await registerControllerOnServer(sessionId, logger)
    await initializeDOMElements(sessionId)

    // UI initialization
    await initializePreviewUI()
    initializeComponents()
    await initializePreview()
    setupFullscreenListeners()

    await initializeWebSocketClient(sessionId)
    logger.info('🔌 WebSocket клиент инициализирован, ожидаем подключения вьювера...')
  } catch {
    console.warn('Error initializing controller')
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
      logger.info('Контроллер зарегистрирован на сервере')
    } else {
      logger.warn('Не удалось зарегистрировать контроллер на сервере')
    }
  } catch (error) {
    logger.warn('Ошибка регистрации контроллера:', error)
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

  if (openFsBtn && exitFsBtn && overlay && previewFsCanvas) {
    openFsBtn.addEventListener('click', openPreviewFullscreen)
    exitFsBtn.addEventListener('click', closePreviewFullscreen)

    globalThis.addEventListener('resize', () => {
      if (isPreviewFullscreen) resizePreviewFullscreen()
    })

    document.addEventListener('keydown', handleFullscreenKeydown)
    globalThis.addEventListener('popstate', handlePopState)
  }
}

function handleFullscreenKeydown(e) {
  const key = e?.key?.toLowerCase()
  if (key === 'f') {
    if (isPreviewFullscreen) {
      closePreviewFullscreen()
    } else {
      openPreviewFullscreen()
    }
  } else if (key === 'escape' && isPreviewFullscreen) {
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
async function initializeDOMElements(sessionId) {
  // Функция разбита для снижения когнитивной сложности
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
    if (element) {
      initializedElements[key] = element
    } else {
      missingElements.push(id)
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

function updateViewerLink(sessionId) {
  // Функция разбита для снижения когнитивной сложности
  const viewLinkInput = document.getElementById('view')
  if (viewLinkInput) {
    viewLinkInput.value = `${globalThis.location.origin}/s/${sessionId}`
  }
}
/**
 * Современная инициализация WebSocket клиента
 */
async function initializeWebSocketClient(sessionId) {
  // Функция разбита для снижения когнитивной сложности
  const logger = createLogger('WebSocket')
  // Создаем клиента с улучшенной конфигурацией
  wsClient = new WebSocketClient(sessionId, 'controller', {
    maxReconnectAttempts: 10,
    reconnectInterval: 2000,
    heartbeatInterval: 25000,
    coalesceDelayMs: 8 // Уменьшаем задержку для большей плавности
  })
  // Настраиваем обработчики событий
  setupWebSocketEventHandlers(wsClient, logger, sessionId)
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
function setupWebSocketEventHandlers(wsClient, logger, sessionId) {
  // Функция разбита для снижения когнитивной сложности
  wsClient.on('open', () => {
    logger.success('WebSocket соединение установлено')
    updateConnectionStatus(true)
    // Уведомляем сервер о подключении контроллера
    safeSend('controller_connected', {
      timestamp: Date.now(),
      sessionId: sessionId,
      role: 'controller'
    })
  })
  wsClient.on('close', event => {
    logger.warning(`WebSocket соединение закрыто (код: ${event.code})`)
    updateConnectionStatus(false)
    globalThis.__current.viewerConnected = false
    updateViewerStatusUI()
  })
  wsClient.on('error', error => {
    logger.error(`WebSocket ошибка: ${error?.type}`, error)
    if (error?.type === 'connection') {
      showNotification('Потеряно соединение с сервером', 'error')
    }
  })
  wsClient.on(WS_MSG.viewerStatus, data => {
    logger.info('Получен статус viewer', data)
    globalThis.__current.viewerConnected = data.connected
    if (data.screenSize) {
      globalThis.__current.viewerScreenSize = data.screenSize
    }
    // Если вьювер подключился, завершаем инициализацию
    if (data.connected) {
      completeInitialization().catch(console.error)
    }

    updateViewerStatusUI()
  })
  wsClient.on(WS_MSG.initialState, state => {
    logger.info('Получено начальное состояние', state)
    lastServerState = state // Кэшируем состояние
    // ВАЖНО: Сначала обновляем размер превью, если есть данные,
    // и только потом применяем состояние. Это решает проблему гонки состояний.
    if (state.viewerScreenSize && state.viewerScreenSize.width > 0) {
      globalThis.__current.viewerScreenSize = state.viewerScreenSize
      updatePreviewSize(state.viewerScreenSize)
    }
    // Мгновенно выравниваем позицию в превью по центру из initial_state (без интерполяции),
    // всегда центрируем мяч в превью относительно центра вьювера (в координатах вьювера)
    try {
      if (previewPhysicsEngine) {
        // Всегда центрируем мяч в превью относительно центра вьювера (в координатах вьювера)
        if (
          globalThis.__current?.viewerScreenSize?.width > 0
        ) {
          const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2
          const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2
          previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY)
          previewPhysicsEngine.setVelocity(0, 0)
          // Принудительно устанавливаем центр в state, чтобы applyServerStateToPreview использовал его
          if (typeof state.x === 'number' || typeof state.y === 'number') {
            state.x = viewerCenterX
            state.y = viewerCenterY
          }
        }
      }
    } catch (error) {
      console.warn('Canvas not ready during initial state setup', error)
    }

    applyServerStateToPreview(state)
    syncUIWithState(state)
  })
  // Включаем обратно: превью теперь "глупый" рендерер состояния сервера
  wsClient.on(WS_MSG.stateUpdate, state => {
    // Тихая обработка обновлений состояния
    lastServerState = state // Кэшируем состояние
    // Если пришли новые размеры экрана вьювера — обновим превью
    if (state.viewerScreenSize?.width > 0) {
      const prevSize = globalThis.__current?.viewerScreenSize || { width: 0, height: 0 }
      const nextSize = state.viewerScreenSize
      const sizeChanged =
        !prevSize || prevSize.width !== nextSize.width || prevSize.height !== nextSize.height
      globalThis.__current.viewerConnected = true
      globalThis.__current.viewerScreenSize = nextSize
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
    const base = globalThis.BBConfig?.smoothing || {}
    // Адаптивное демпфирование на основе джиттера (улучшено)
    const adaptiveDamping = Math.min(
      25,
      Math.max(10, (base.damping || 15) + jitterMs / 15 + rttMs / 50)
    )
    // Адаптивная жесткость на основе условий сети
    const adaptiveStiffness = Math.min(
      35,
      Math.max(20, (base.stiffness || 25) - jitterMs / 50 + (rttMs > 100 ? 5 : 0))
    )
    // Адаптивное время предикции на основе RTT
    const adaptivePredictTime = Math.min(
      0.15,
      Math.max(0.08, (base.maxPredictSec || 0.1) + Math.max(0, (rttMs / 1000 - 0.05) * 0.3))
    )
    // Адаптивная дистанция снапа на основе стабильности сети
    const adaptiveSnapDistance = Math.min(
      0.4,
      Math.max(0.15, (base.snapDistance || 0.2) + (jitterMs > 20 ? 0.1 : 0))
    )
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
function applyServerStateToPreview(state) {
  // Функция разбита для снижения когнитивной сложности
  if (!previewPhysicsEngine || !state) return
  // Синхронизируем размер мира движка с размерами экрана вьювера
  if (
    state.viewerScreenSize &&
    typeof state.viewerScreenSize.width === 'number' &&
    typeof state.viewerScreenSize.height === 'number'
  ) {
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
 * Показ уведомления
 */
function showNotification(message, type = 'info') {
  // Функция разбита для снижения когнитивной сложности
  // Обертка для ожидания инициализации notificationSystem
  const tryShowNotification = (attempt = 0) => {
    if (globalThis.notificationSystem) {
      const titles = {
        success: '',
        error: 'Ошибка',
        warning: 'Внимание',
        info: ''
      }
      const title = titles[type] || ''
      globalThis.notificationSystem.show({
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
function createLogger(moduleName) {
  // Функция разбита для снижения когнитивной сложности
  const startTime = performance.now()
  return {
    info: () => {
      // Параметры не используются
    },
    success: () => {
      // Неиспользуемая переменная timestamp удалена
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
  constructor(code, message, details = {}) {
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
  if (ballState.radius !== undefined) {
    components.size?.setSize(ballState.radius)
  }
}

function _syncUIColors(ballState) {
  if (ballState.colorBall) {
    components.ballColor?.setColor(ballState.colorBall)
  }
  if (ballState.colorBg) {
    components.bgColor?.setColor(ballState.colorBg)
  }
}

function _syncUIPause(ballState) {
  if (ballState.paused !== undefined) {
    const now = performance.now()
    if (now >= __ignoreServerPausedUntilTs) {
      isPlaying = !ballState.paused
      updatePlayPauseButton()
    }
  }
}

function _getDirectionMode(dirX, dirY) {
  if (Math.abs(dirX) > 0.9) return 'horizontal'
  if (Math.abs(dirY) > 0.9) return 'vertical'
  if (dirX > 0 && dirY > 0) return 'diagRL'
  if (dirX > 0 && dirY < 0) return 'diagRLL'
  return null
}

function _syncUIDirection(ballState) {
  if (ballState.dirX !== undefined && ballState.dirY !== undefined) {
    directionState = { dx: ballState.dirX, dy: ballState.dirY }
    const mode = _getDirectionMode(ballState.dirX, ballState.dirY)
    if (mode) currentDirectionMode = mode
    updateDirectionButtons()
    updateDirectionDisplay(ballState.dirX, ballState.dirY)
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
  } catch {
    console.warn('Error in syncUIWithState')
  }
}
// ===== ИНИЦИАЛИЗАЦИЯ КОМПОНЕНТОВ =====
function _initializeSpeedControl() {
  components.speed = sharedComponents.createSpeedControl(document.getElementById('speedControl'), {
    onSpeedChange: throttle(speed => {
      updateSpeed(speed)
    }, 100)
  })
}

function _initializeBallColorControl() {
  components.ballColor = sharedComponents.createColorControl(
    document.getElementById('ballColorControl'),
    {
      colors: ['#60a5fa', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16', '#fb7185', '#ffffff'],
      defaultValue: '#60a5fa',
      title: '',
      onColorChange: color => {
        setBallColor(color)
      }
    }
  )
}

function _initializeBgColorControl() {
  components.bgColor = sharedComponents.createColorControl(
    document.getElementById('bgColorControl'),
    {
      colors: ['#020617', '#000000', '#111827', '#0a2540', '#052e16', '#1a102a', '#2b1b0e', '#032f2f', '#2a0e14', '#0f172a'],
      defaultValue: '#020617',
      title: '',
      onColorChange: color => {
        setBackgroundColor(color)
      }
    }
  )
}

function _initializeSizeControl() {
  components.size = sharedComponents.createSizeControl(document.getElementById('sizeControl'), {
    sizes: [20, 40, 80, 100],
    defaultValue: 20,
    title: '',
    onSizeChange: size => {
      setBallSize(size)
    }
  })
}

function initializeComponents() {
  _initializeSpeedControl()
  _initializeBallColorControl()
  _initializeBgColorControl()
  _initializeSizeControl()
}
// ===== ФУНКЦИИ УПРАВЛЕНИЯ =====
function safeSend(type, payload) {
  // Функция разбита для снижения когнитивной сложности
  try {
    if (typeof wsClient?.send === 'function') {
      wsClient.send(type, payload)
    }
  } catch {
    console.warn('Failed to send WebSocket message')
  }
}

function updateSpeed(speed) {
  // Функция разбита для снижения когнитивной сложности
  try {
    // Отправляем изменение скорости всегда, даже если вьювер ещё не подключен
    // (сервер сохранит значение и применит при старте)
    safeSend(WS_MSG.controllerUpdate, { speed })
  } catch {
    console.warn('Error updating speed')
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
    // Создаем движок физики для превью
    previewPhysicsEngine = new PhysicsEngine({ sessionId: 'preview' })
    // Экспортируем для UI‑тестов
    try {
      globalThis.__previewPhysics = previewPhysicsEngine
    } catch {
      /* ignore */
    }
    // Клиент теперь вычисляет физику локально (включая отскоки), сервер только синхронизирует
    previewPhysicsEngine.isViewer = true
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
    // Создаем рендерер, который НЕ будет обновлять физику
    globalThis.__previewRenderer = new BallRenderer(canvas, previewPhysicsEngine, {
      localPhysics: false // Рендерер только рисует, физика обновляется отдельно
    })
    globalThis.__previewRenderer.setFrameCallback(() => {
      // Дополнительная логика для превью может быть добавлена здесь
      // deltaTime параметр сохранен для совместимости с интерфейсом
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
    console.warn('Error initializing preview:', error)
  }
}

function showWaitingForViewer() {
  // Функция разбита для снижения когнитивной сложности
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.textContent = '⏳ Ожидание подключения вьювера'
    viewerInfo.style.display = 'block'
  }
}

function updatePreviewSize(viewerScreenSize) {
  if (!canUpdatePreview(viewerScreenSize)) {
    showWaitingForViewer()
    return
  }

  const canvas = document.getElementById('preview')
  if (!canvas) return

  const { previewWidth, previewHeight } = calculatePreviewDimensions(canvas, viewerScreenSize)
  setCanvasDimensions(canvas, previewWidth, previewHeight)
  updatePhysicsEngineWorldSize(viewerScreenSize)
  applyServerStateOrCenter()
  updateViewerInfo(viewerScreenSize)
}

function canUpdatePreview(viewerScreenSize) {
  return (
    viewerScreenSize &&
    globalThis.__previewRenderer &&
    previewPhysicsEngine
  )
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
  if (globalThis.__current.viewerScreenSize?.width > 0) {
    const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2
    const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2
    previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY)
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
function getDirectionVector (directionMode) {
  switch (directionMode) {
    case 'horizontal':
      return { dirX: 1, dirY: 0 }
    case 'vertical':
      return { dirX: 0, dirY: 1 }
    case 'diagRL': // Диагональ вправо-вниз
      return { dirX: 0.707, dirY: 0.707 }
    case 'diagRLL': // Диагональ вправо-вверх
      return { dirX: 0.707, dirY: -0.707 }
    case 'random': {
      // Случайное направление
      const angle = Math.random() * 2 * Math.PI
      return { dirX: Math.cos(angle), dirY: Math.sin(angle) }
    }
    default:
      console.warn('Неизвестный режим направления:', directionMode)
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
function _applyDirectionChangeWhenPlaying (dirX, dirY) {
  safeSend(WS_MSG.controllerUpdate, {
    paused: true,
    returnToCenter: true
  })
  setTimeout(() => {
    safeSend(WS_MSG.controllerUpdate, {
      paused: false,
      dirX,
      dirY
    })
  }, 200)
}

/**
 * @private
 * Handles the direction change logic when the session is paused.
 * It updates the direction on the server without starting the movement.
 * @param {number} dirX - The new X direction component.
 * @param {number} dirY - The new Y direction component.
 */
function _applyDirectionChangeWhenPaused (dirX, dirY) {
  safeSend(WS_MSG.controllerUpdate, {
    dirX,
    dirY
  })
}

/**
 * Устанавливает направление движения шарика.
 * @param {string} directionMode - Режим направления для установки.
 */
function setDirection (directionMode) {
  if (!directionMode) return

  try {
    const directionVector = getDirectionVector(directionMode)
    if (!directionVector) return

    const { dirX, dirY } = directionVector
    directionState = { dx: dirX, dy: dirY }
    currentDirectionMode = directionMode

    if (isPlaying) {
      _applyDirectionChangeWhenPlaying(dirX, dirY)
    } else {
      _applyDirectionChangeWhenPaused(dirX, dirY)
    }

    updateDirectionButtons()
    updateDirectionDisplay(dirX, dirY)
    console.log(
      `🎯 Направление изменено: ${directionMode} (${dirX.toFixed(2)}, ${dirY.toFixed(2)}), isPlaying: ${isPlaying}`
    )
  } catch (error) {
    console.error('Ошибка установки направления:', error)
  }
}

function setBallColor(color) {
  // Функция разбита для снижения когнитивной сложности
  // Оптимизация: меньше обновлений когда нет вьювера
  if (globalThis.__current?.viewerConnected) {
    safeSend(WS_MSG.controllerUpdate, { colorBall: color })
  }
}

function setBallSize(size) {
  // Функция разбита для снижения когнитивной сложности
  // Оптимизация: меньше обновлений когда нет вьювера
  if (globalThis.__current.viewerConnected) {
    safeSend(WS_MSG.controllerUpdate, { radius: size })
  }
}

function setBallSizeMultiplier(multiplier) {
  // Функция разбита для снижения когнитивной сложности
  // Базовый размер 20, умножаем на множитель
  const baseSize = 20
  const newSize = baseSize * multiplier
  setBallSize(newSize)
}

function setBackgroundColor(color) {
  // Функция разбита для снижения когнитивной сложности
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
function updateDirectionButtons() {
  // Функция разбита для снижения когнитивной сложности
  // Обновляем активное состояние кнопок направления в основном интерфейсе
  const directionButtons = document.querySelectorAll('[data-mode]')
  for (const button of directionButtons) {
    const buttonDirection = button.dataset.mode
    if (buttonDirection === currentDirectionMode) {
      button.classList.add('active')
    } else {
      button.classList.remove('active')
    }
  }
  // Обновляем кнопки направления в полноэкранном режиме
  const fsDirectionButtons = document.querySelectorAll('[id^="fsDir"]')
  for (const button of fsDirectionButtons) {
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
      return { text: 'Диагональ (право-вниз)', icon: '↘️' }
    case 'diagRLL':
      return { text: 'Диагональ (право-верх)', icon: '↗️' }
    case 'random':
      return { text: 'Случайное', icon: '🎲' }
    default:
      console.warn(`Неизвестный режим направления: ${mode}`)
      return { text: 'Неизвестное направление', icon: '❓' }
  }
}

/**
 * Обновляет индикатор направления и отображает информацию о текущем направлении
 */
function updateDirectionDisplay(dirX, dirY, customText = null) {
  try {
    // Ищем элемент для отображения направления
    const directionDisplay = document.getElementById('currentDirection')
    let directionText = customText || 'Неизвестно'
    let directionIcon

    if (!customText) {
      // ОПРЕДЕЛЯЕМ НАПРАВЛЕНИЕ ТОЛЬКО ПО currentDirectionMode - игнорируем dirX/dirY
      const directionInfo = getDirectionInfo(currentDirectionMode)
      directionText = directionInfo.text
      directionIcon = directionInfo.icon
    }

    if (directionDisplay) {
      directionDisplay.innerHTML = `${directionIcon}`
    }

    // Обновляем иконку направления в полноэкранном режиме
    const fsDirectionDisplay = document.getElementById('fsCurrentDirection')
    if (fsDirectionDisplay) {
      const displayContent = directionDisplay ? directionDisplay.innerHTML : `${directionIcon || '❓'} <span>${directionText || 'Неизвестно'}</span>`
      fsDirectionDisplay.innerHTML = displayContent
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
    } else {
      button.textContent = '▶️ Старт'
      button.classList.remove('playing')
    }
  }
}

function _handlePlay() {
  let currentDirection = directionState || { dx: 1, dy: 0 }
  if (currentDirection.dx === 0 && currentDirection.dy === 0) {
    currentDirection = { dx: 1, dy: 0 }
  }
  const payload = {
    paused: false,
    dirX: currentDirection.dx,
    dirY: currentDirection.dy,
    speed: components.speed?.getSpeed() ?? 40
  }
  safeSend(WS_MSG.controllerUpdate, payload)
  isPlaying = true
  bbCounters.start()
  if (previewPhysicsEngine) {
    previewPhysicsEngine.applyCommand(payload)
  }
  globalThis.forcePauseUntilUserAction = false
}

function _handlePause() {
  const payload = {
    paused: true,
    returnToCenter: true
  }
  safeSend(WS_MSG.controllerUpdate, payload)
  isPlaying = false
  bbCounters.stop(true)
  if (previewPhysicsEngine) {
    previewPhysicsEngine.applyCommand(payload)
  }
}

function togglePlayPause() {
  const wasPlaying = isPlaying
  if (wasPlaying) {
    _handlePauseTransition()
  } else {
    _handlePlayTransition()
  }

  _schedulePlayPauseAnimations()
  _syncFullscreenPlayPause()
}

function _handlePauseTransition() {
  _handlePause()
  __ignoreServerPausedUntilTs = performance.now() + 800
}

function _handlePlayTransition() {
  _handlePlay()
  __ignoreServerPausedUntilTs = performance.now() + 800
}

function _schedulePlayPauseAnimations() {
  // Обновляем кнопку сразу
  updatePlayPauseButton()

  // Планируем дополнительные обновления для анимации через разные интервалы
  setTimeout(() => updatePlayPauseButton(), 150)
  setTimeout(() => updatePlayPauseButton(), 300)
}

function _syncFullscreenPlayPause() {
  syncFsPlayPauseButton()
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

function getScaledState(state) {
  if (!globalThis.__current.viewerScreenSize || !globalThis.__previewCanvas || !state) {
    return state
  }

  const viewerSize = globalThis.__current.viewerScreenSize
  const previewSize = {
    width: globalThis.__previewCanvas.width,
    height: globalThis.__previewCanvas.height
  }

  if (viewerSize.width <= 0 || viewerSize.height <= 0) {
    return state
  }

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

function updateViewerStatusUI() {
  // Функция разбита для снижения когнитивной сложности
  // Обновляем статус вьювера
  const viewerStatusEl = document.getElementById('viewerStatus')
  if (viewerStatusEl) {
    if (globalThis.__current.viewerConnected) {
      viewerStatusEl.textContent = 'Подключен'
      viewerStatusEl.style.color = '#22c55e' // ярко-зеленый цвет
      viewerStatusEl.style.fontWeight = '600' // делаем текст жирным для лучшей видимости
      if (globalThis.__current.viewerScreenSize?.width > 0) {
        updatePreviewSize(globalThis.__current.viewerScreenSize)
      }
    } else {
      viewerStatusEl.textContent = 'Ожидание...'
      viewerStatusEl.style.color = '#ef4444' // красный
      viewerStatusEl.style.fontWeight = '400'
      showWaitingForViewer()
    }
  }
}

function openPreviewFullscreen() {
  // Функция разбита для снижения когнитивной сложности
  const overlay = document.getElementById('previewOverlay')
  if (!overlay || !previewFsCanvas) return
  // Добавляем запись в историю браузера для корректного возврата
  const currentUrl = globalThis.location.href
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
      previewFsRenderer = new BallRenderer(previewFsCanvas, previewPhysicsEngine, {
        localPhysics: false
      })
      previewFsRenderer.start()
    } else {
      previewFsRenderer.setPhysicsEngine(previewPhysicsEngine)
    }
  } catch {
    /* ignore */
  }

  resizePreviewFullscreen()
  setupFsPanelAutoHide()
  setupFsPanelDrag()
  setupFullscreenGestures()
  syncFsPlayPauseButton()
  wireFullscreenControls()
  fillFsSessionInfo()
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
    if (!fsPanelDrag.active) return
    panel.style.left = x - fsPanelDrag.offsetX + 'px'
    panel.style.top = y - fsPanelDrag.offsetY + 'px'
    panel.style.transform = 'translateX(0)'
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

function setupFullscreenGestures() {
  // Функция разбита для снижения когнитивной сложности
  const overlay = document.getElementById('previewOverlay')
  if (!overlay) return
  let startX = 0
  let startY = 0
  let swiping = false
  const threshold = 40
  overlay.addEventListener(
    'touchstart',
    e => {
      const t = e.touches[0]

      startX = t.clientX
      startY = t.clientY
      swiping = true
    },
    { passive: true }
  )
  overlay.addEventListener(
    'touchmove',
    e => {
      // жесты без блокировки скролла/зумов
      e.preventDefault() // Предотвращаем прокрутку страницы при жестах
    },
    { passive: true }
  )
  overlay.addEventListener(
    'touchend',
    e => {
      if (swiping) {
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
            if (isPlaying === false) togglePlayPause()
          } else if (isPlaying) {
            // свайп вниз — стоп
            togglePlayPause()
          }
        }
      }
    },
    { passive: true }
  )
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
    '#60a5fa', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#f97316', '#06b6d4', '#84cc16', '#fb7185', '#ffffff'
  ]

  for (let i = 1; i <= 10; i++) {
    const btn = document.getElementById(`fsBallCol${i}`)
    if (btn) btn.onclick = () => setBallColor(ballColors[i - 1])
  }
}

function setupFullscreenBackgroundColorControls() {
  const bgColors = [
    '#020617', '#000000', '#111827', '#0a2540', '#052e16',
    '#1a102a', '#2b1b0e', '#032f2f', '#2a0e14', '#0f172a'
  ]

  for (let i = 1; i <= 10; i++) {
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
  } catch {
    console.warn('Error in fillFsSessionInfo')
  }
}
