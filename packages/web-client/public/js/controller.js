'use strict'
/**
 * Controller - Логика управления сессией BilateralBound v2.1
 * Современная модульная архитектура с улучшенной обработкой ошибок
 */
/* exported setDirection, resetCenter, updateSpeed, setBallColor, setBallSize, setBackgroundColor, togglePlayPause, resetSession, setSoundEnabled, setSoundType */
/* global debugWarn, debugError, RealtimeClient */
// Защита от повторной загрузки
if (typeof globalThis.__controllerLoaded !== 'undefined') {
  console.warn('Controller already loaded, skipping')
} else {
globalThis.__controllerLoaded = true

if (typeof globalThis.BBDebug === 'undefined') {
  globalThis.BBDebug = { isEnabled: false, log: () => {} }
}
globalThis.__current = globalThis.__current || {
  sessionId: null,
  viewerConnected: false,
  viewerScreenSize: { width: 0, height: 0 },
  isInitializing: true // Глобальный флаг инициализации
}
globalThis.__previewRenderer = globalThis.__previewRenderer || null
globalThis.__previewScale = globalThis.__previewScale || 1 // Коэффициент масштабирования
const components = globalThis.components || {}
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
let previewPhysicsEngine = null // Локальный движок физики для превью
let hiddenThrottleMs = 100 // при скрытой вкладке обновляем ~10 FPS
if (globalThis.BBConfig?.rendering?.hiddenThrottleMs != null) {
  hiddenThrottleMs = globalThis.BBConfig.rendering.hiddenThrottleMs
}
let physicsInterval = null // Глобальный интервал физики для возможности остановки извне
let previewFsCanvas = null
let previewFsRenderer = null
let isPreviewFullscreen = false
let fsPanelHideTimer = null
const fsPanelDrag = { active: false, offsetX: 0, offsetY: 0 }
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
    this.initSpeedMeasurement()
    this.render()
  },
  initSpeedMeasurement() {
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
    this._passesHistory = this._passesHistory.filter(timestamp => now - timestamp < 2000)
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
      this.passes = 0
      this.bounceHits = 0
      this._lastBounceTs = 0
      this._passesHistory = [] // Очищаем историю
    }
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
    this.bounceHits += 1
    if (this.bounceHits % 2 === 0) {
      this.passes += 1
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
document.addEventListener('DOMContentLoaded', () => {
  initializeController().catch(debugError)
  bbCounters.initDom()
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
    const sessionId = getSessionIdFromUrl()
    if (!sessionId) {
      debugError('ID сессии не найден в URL')
      showNotification('ID сессии не найден в URL', 'error')
      if (globalThis.__current) globalThis.__current.isInitializing = false
      return
    }
    globalThis.__current.sessionId = sessionId
    await registerControllerOnServer(sessionId, logger)
    await initializeDOMElements(sessionId)
    await initializePreviewUI()
    initializeComponents()
    await initializePreview()
    setupFullscreenListeners()
    await initializeWebSocketClient(sessionId)
    if (globalThis.__current) globalThis.__current.isInitializing = false
  } catch (error) {
    if (globalThis.__current) globalThis.__current.isInitializing = false
    debugError('Error initializing controller:', error)
    let errorMsg = error?.message || error
    if (errorMsg?.includes('Session with this ID not found') || errorMsg?.includes('not found')) {
      errorMsg = globalThis.i18n?.t('restore.notFound') || 'Session with this ID not found. Please check the URL and try again.'
    } else if (errorMsg?.includes('Realtime connection')) {
      errorMsg = globalThis.i18n?.t('controller.connectionError') || 'Failed to connect to session. Please reload the page and try again.'
    }
    showNotification(errorMsg, 'error')
  }
}
async function registerControllerOnServer(sessionId, logger) {
  try {
    const connectResponse = await fetch(`/api/session/${sessionId}/controller/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    if (connectResponse.ok) {
      // Connection established
    } else {
      // Connection failed
    }
  } catch (error) {
    // Silently ignore connection errors
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
  document.addEventListener('keydown', handleFullscreenKeydown, true)
  globalThis.addEventListener('popstate', handlePopState)
  if (openFsBtn) {
    openFsBtn.addEventListener('click', () => {
      openPreviewFullscreen()
    })
  }
  if (exitFsBtn) {
    exitFsBtn.addEventListener('click', closePreviewFullscreen)
  }
  globalThis.addEventListener('resize', () => {
    if (isPreviewFullscreen) resizePreviewFullscreen()
  })
}
function handleFullscreenKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return
  }
  const key = e?.key?.toLowerCase()
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
  if (isInitialized) {
    return // Уже инициализировано
  }
  isInitialized = true
  const logger = createLogger('Controller')
  try {
    // Initialization logic will be added here
  } catch (error) {
    await handleInitializationError(error, logger)
  }
}
/**
 * Современная инициализация DOM элементов
 */
async function initializeDOMElements(sessionId) {
  const curSidEl = document.getElementById('curSid')
  if (curSidEl) {
    curSidEl.textContent = sessionId
  }
  const sessionInfoEl = document.getElementById('sessionInfo')
  if (sessionInfoEl) {
    const timestamp = new Date().toLocaleString()
    sessionInfoEl.textContent = `Создана: ${timestamp}`
  }
  const sessionTimestampEl = document.getElementById('sessionTimestamp')
  if (sessionTimestampEl) {
    sessionTimestampEl.textContent = `Создана: ${new Date().toLocaleString()}`
  }
  const viewerSessionIdEl = document.getElementById('viewerSessionId')
  if (viewerSessionIdEl) {
    viewerSessionIdEl.textContent = sessionId
  }
  const viewerStatusEl = document.getElementById('viewerStatus')
  if (viewerStatusEl) {
    viewerStatusEl.textContent = globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
    viewerStatusEl.classList.add('disconnected')
  }
  updateViewerLink(sessionId)
}
function updateViewerLink(sessionId) {
  const viewLinkInput = document.getElementById('view')
  if (viewLinkInput) {
    viewLinkInput.value = `${globalThis.location.origin}/s/${sessionId}`
  }
}
/**
 * Современная инициализация RealtimeClient (WebSocket по умолчанию)
 */
async function initializeWebSocketClient(sessionId) {
  const logger = createLogger('RealtimeClient')
  wsClient = new RealtimeClient(sessionId, 'controller', {
    maxReconnectAttempts: 10,
    reconnectInterval: 2000,
    heartbeatInterval: 25000,
    coalesceDelayMs: 8 // Уменьшаем задержку для большей плавности
  })
  globalThis.wsClient = wsClient
  setupWebSocketEventHandlers(wsClient, logger, sessionId)
  await Promise.race([
    (async () => {
      try {
        await wsClient.connect()
      } catch (error) {
        throw new Error(`Realtime connection failed: ${error.message}`)
      }
    })(),
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('Realtime connection timeout')), 15000)
    )
  ])
}
/**
 * Настройка обработчиков RealtimeClient событий
 */
function setupWebSocketEventHandlers(wsClient, logger, sessionId) {
  let lastPlayingState = false
  wsClient.on('open', (event) => {
    updateConnectionStatus(true)
    // Lazy-load non-critical modules after SSE connection established
    if (!event?.isReconnection && !globalThis.__nonCriticalLoaded) {
      globalThis.__nonCriticalLoaded = true
      const s = document.createElement('script')
      s.src = '/js/new-features.js?v=' + (document.querySelector('meta[name="version"]')?.content || '')
      s.defer = true
      document.body.appendChild(s)
    }
    // Sync current language to session so viewer gets the same locale
    const currentLang = localStorage.getItem('emdr-language')
    if (currentLang && sessionId) {
      fetch(`/api/session/${sessionId}/language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: currentLang })
      }).catch(() => {})
    }
    if (event?.isReconnection) {
      safeSend('request_state_sync', {
        timestamp: Date.now(),
        sessionId: sessionId,
        role: 'controller'
      })
      if (lastPlayingState && globalThis.__current?.viewerConnected) {
        setTimeout(async () => {
          // Don't restore if user explicitly changed play state recently
          if (performance.now() < __ignoreServerPausedUntilTs) return
          // Verify server is actually playing before restoring local state
          try {
            const resp = await fetch(`/api/session/${sessionId}/state`)
            if (!resp.ok) return
            const state = await resp.json()
            if (state.paused === true) return // Server is paused, don't restore
          } catch (e) {
            return // If fetch fails, don't restore
          }
          if (previewPhysicsEngine) {
            previewPhysicsEngine.setPaused(false)
          }
          isPlaying = true
          globalThis.__current.isPlaying = true
          globalThis.isPlaying = true
          updatePlayPauseButton()
        }, 500)
      }
    }
    safeSend('controller_connected', {
      timestamp: Date.now(),
      sessionId: sessionId,
      role: 'controller'
    })
  })
  wsClient.on('close', event => {
    updateConnectionStatus(false)
    lastPlayingState = isPlaying
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
  })
  wsClient.on(WS_MSG.viewerStatus, data => {
    // console.log('[CONTROLLER] 📊 viewer_status event received:', JSON.stringify(data))
    const wasConnected = globalThis.__current.viewerConnected
    const isConnected = data.connected === true || data.viewerConnected === true
    // console.log('[CONTROLLER] ✅ Setting viewerConnected to:', isConnected)
    globalThis.__current.viewerConnected = isConnected
    if (data.screenSize) {
      globalThis.__current.viewerScreenSize = data.screenSize
    }
    if (isConnected) {
      completeInitialization().catch(debugError)
      updateViewerStatusUI()
    }
    if (wasConnected && !isConnected) {
      globalThis.__current.viewerAudioActivated = false
      globalThis.__current.viewerScreenSize = null
      isPlaying = false
      globalThis.__current.isPlaying = false
      if (previewPhysicsEngine) {
        previewPhysicsEngine.setPaused(true)
      }
      directionState = { dx: 1, dy: 0 }
      currentDirectionMode = 'horizontal'
      updateDirectionDisplay(1, 0)
      updateDirectionButtons()
      if (bbCounters && typeof bbCounters.resetAll === 'function') {
        bbCounters.resetAll()
      }
      lastServerState = null
      const viewerStatusEl = document.getElementById('viewerStatus')
      if (viewerStatusEl) {
        viewerStatusEl.textContent = globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
        viewerStatusEl.classList.remove('connected')
        viewerStatusEl.classList.add('disconnected')
        viewerStatusEl.style.fontWeight = '400'
      }
      centerBallInViewer()
      showWaitingForViewer()
      updatePlayPauseButton()
      updateViewerStatusUI()
    }
  })
  wsClient.on(WS_MSG.initialState, state => {
    lastServerState = state // Кэшируем состояние
    if (typeof state.viewerConnected === 'boolean') {
      globalThis.__current.viewerConnected = state.viewerConnected
    }
    if (typeof state.viewerAudioActivated === 'boolean') {
      globalThis.__current.viewerAudioActivated = state.viewerAudioActivated
    }
    if (state.viewerScreenSize && state.viewerScreenSize.width > 0) {
      globalThis.__current.viewerScreenSize = state.viewerScreenSize
      updatePreviewSize(state.viewerScreenSize)
      updateViewerInfo(state.viewerScreenSize)
    }
    applyServerStateToPreview(state)
    syncUIWithState(state)
    updateViewerAudioIndicators() // Обновляем индикаторы звука
    updateViewerStatusUI() // Update status UI with connection info
  })
  wsClient.on(WS_MSG.stateUpdate, state => {
    lastServerState = state // Кэшируем состояние
    if (typeof state.viewerConnected === 'boolean') {
      const wasConnected = globalThis.__current.viewerConnected
      globalThis.__current.viewerConnected = state.viewerConnected
      if (wasConnected !== state.viewerConnected) {
        updateViewerStatusUI()
      }
      if (previewPhysicsEngine) {
        const serverSendsPositions = state.clientSimulationOnly === false
        const shouldFollowViewer = serverSendsPositions && state.viewerConnected
        previewPhysicsEngine.options.clientSimulation = !shouldFollowViewer
      }
    }
    if (state.viewerScreenSize?.width > 0) {
      const prevSize = globalThis.__current?.viewerScreenSize || { width: 0, height: 0 }
      const nextSize = state.viewerScreenSize
      const sizeChanged =
        !prevSize || prevSize.width !== nextSize.width || prevSize.height !== nextSize.height
      globalThis.__current.viewerConnected = true
      globalThis.__current.viewerScreenSize = nextSize
      if (sizeChanged) {
        updatePhysicsEngineWorldSize(nextSize)
        const canvas = document.getElementById('preview')
        if (canvas) {
          const { previewWidth, previewHeight } = calculatePreviewDimensions(canvas, nextSize)
          setCanvasDimensions(canvas, previewWidth, previewHeight)
        }
        updateViewerInfo(nextSize)
        updateViewerStatusUI()
        if (isPreviewFullscreen) {
          updateFullscreenViewerStatus()
        }
      }
    }
    applyServerStateToPreview(state)
    updateViewerAudioIndicators() // Обновляем индикаторы звука при каждом обновлении состояния
    _syncUIPause(state)
    _syncUIDirection(state)
  })
  wsClient.on(WS_MSG.netMetrics, ({ jitterMs }) => {
    if (!previewPhysicsEngine) return
    const base = globalThis.BBConfig?.smoothing || {}
    const adaptiveDamping = Math.min(
      25,
      Math.max(15, (base.damping || 20) + jitterMs / 20)
    )
    const adaptiveStiffness = Math.min(
      35,
      Math.max(25, (base.stiffness || 30) - jitterMs / 30)
    )
    const fixedPredictTime = base.maxPredictSec || 0.02
    const adaptiveSnapDistance = Math.min(
      0.4,
      Math.max(0.2, (base.snapDistance || 0.3) + (jitterMs > 15 ? 0.05 : 0))
    )
    previewPhysicsEngine.setSmoothingOptions({
      damping: adaptiveDamping,
      stiffness: adaptiveStiffness,
      maxPredictSec: fixedPredictTime, // Фиксированное значение для консистентности
      snapDistance: adaptiveSnapDistance,
      exponentialSmoothing: base.exponentialSmoothing,
      stateBuffering: base.stateBuffering,
      bufferSize: base.bufferSize
    })
  })
  wsClient.on(WS_MSG.viewerAudioActivated, data => {
    if (globalThis.__current) {
      globalThis.__current.viewerAudioActivated = data.activated
    }
    updateViewerAudioIndicators()
  })
  // Bounce sync - snap preview to viewer's exact bounce position + direction
  wsClient.on(WS_MSG.bounceSync, data => {
    if (!previewPhysicsEngine) return
    if (typeof data.x === 'number' && typeof data.y === 'number') {
      // Snap position
      previewPhysicsEngine.ball.x = data.x
      previewPhysicsEngine.ball.y = data.y
      previewPhysicsEngine._prevPos.x = data.x
      previewPhysicsEngine._prevPos.y = data.y
      previewPhysicsEngine._currPos.x = data.x
      previewPhysicsEngine._currPos.y = data.y
      // Sync direction (was incorrectly writing to state.dirX instead of state.lastDirection.x)
      if (typeof data.dirX === 'number' && typeof data.dirY === 'number') {
        previewPhysicsEngine.state.lastDirection.x = data.dirX
        previewPhysicsEngine.state.lastDirection.y = data.dirY
        // Recalculate velocity from new direction
        const pps = (previewPhysicsEngine.ball.speed / 100) * previewPhysicsEngine.options.maxSpeed
        previewPhysicsEngine.ball.vx = data.dirX * pps
        previewPhysicsEngine.ball.vy = data.dirY * pps
      }
      // Sync side info for debugging
      if (data.side) {
        previewPhysicsEngine._lastBounceSide = data.side
      }
    }
  })
  wsClient.on('maxReconnectAttemptsReached', () => {
    logger.error('Max reconnect attempts reached')
    showNotification(globalThis.i18n?.t('controller.connectionFailed') || 'Cannot connect to server. Check your internet connection.', 'error')
  })
  wsClient.on('session_lost', () => {
    logger.error('Session lost (evicted by server)')
    const msg = globalThis.i18n?.t('controller.sessionLost') || 'Session expired. Please reload the page.'
    showNotification(msg, 'error')
  })
}
/**
 * Применяет состояние от viewer/сервера к превью контроллера
 * АРХИТЕКТУРА: Превью в viewer режиме (isViewer: true) следует за состоянием от viewer через SSE
 */
function applyServerStateToPreview(state) {
  if (!previewPhysicsEngine || !state) return
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
  if (previewPhysicsEngine.options.clientSimulation) {
    const localCommand = {
      dirX: state.dirX,
      dirY: state.dirY,
      speed: state.speed,
      colorBall: state.colorBall,
      colorBg: state.colorBg,
      ballSize: state.ballSize
    }
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
    // Position sync: on each state_update (~15Hz), correct drift toward server position.
    if (typeof state.x === 'number' && typeof state.y === 'number'
        && !previewPhysicsEngine.state.paused) {
      const dx = state.x - previewPhysicsEngine.ball.x
      const dy = state.y - previewPhysicsEngine.ball.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      // First update after play: hard-snap to server position to start in sync
      if (!previewPhysicsEngine._hasReceivedFirstMovingUpdate) {
        previewPhysicsEngine._hasReceivedFirstMovingUpdate = true
        previewPhysicsEngine.ball.x = state.x
        previewPhysicsEngine.ball.y = state.y
        previewPhysicsEngine._prevPos.x = state.x
        previewPhysicsEngine._prevPos.y = state.y
        previewPhysicsEngine._currPos.x = state.x
        previewPhysicsEngine._currPos.y = state.y
      } else if (dist > 2) {
        // Aggressive alpha: preview should closely track server/viewer
        const alpha = dist > 80 ? 0.7 : dist > 30 ? 0.4 : 0.25
        previewPhysicsEngine.ball.x += dx * alpha
        previewPhysicsEngine.ball.y += dy * alpha
        previewPhysicsEngine._currPos.x = previewPhysicsEngine.ball.x
        previewPhysicsEngine._currPos.y = previewPhysicsEngine.ball.y
      }
    }
  } else {
    previewPhysicsEngine.applyCommand(state)
  }
  const pausedState = previewPhysicsEngine.options.clientSimulation
    ? previewPhysicsEngine.state.paused
    : state.paused
  // Apply paused state from server to preview physics engine
  if (typeof state.paused === 'boolean') {
    previewPhysicsEngine.setPaused(state.paused)
    // Reset first-update flag on pause so next play starts with hard-snap
    if (state.paused) {
      previewPhysicsEngine._hasReceivedFirstMovingUpdate = false
    }
  }
  if (typeof pausedState === 'boolean') {
    // Sync isPlaying with server state
    const newIsPlaying = !state.paused
    if (isPlaying !== newIsPlaying) {
      isPlaying = newIsPlaying
      updatePlayPauseButton()
    }
    if (state.paused) {
      bbCounters.stop(false)
    } else {
      bbCounters.start()
    }
  }
  if (lastServerState) {
    detectAndCountBounceFromServer(lastServerState, state)
  }
}
/**
 * Улучшенный рендер-цикл с лучшей интерполяцией
 */
const PHYSICS_TICK_RATE = 60 // Гц
const PHYSICS_DT = 1000 / PHYSICS_TICK_RATE
function physicsLoop() {
  if (previewPhysicsEngine) {
    previewPhysicsEngine.update(PHYSICS_DT / 1000)
  }
}
function renderPreviewLoop(timestamp) {
  if (!previewPhysicsEngine || !globalThis.__previewRenderer) {
    requestAnimationFrame(renderPreviewLoop)
    return
  }
  const now = performance.now()
  const lastPhysicsUpdate = previewPhysicsEngine?.__lastPhysicsUpdateTs ?? now
  const alpha = Math.max(0, Math.min(1, (now - lastPhysicsUpdate) / PHYSICS_DT))
  bbCounters.tick(timestamp)
  const interpolatedState = previewPhysicsEngine.getInterpolatedBall(alpha)
  const stateToRender = getScaledState(interpolatedState)
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
  const wsStatus = document.getElementById('wsStatus')
  if (wsStatus) {
    wsStatus.className = isConnected
      ? 'status-indicator connected'
      : 'status-indicator disconnected'
    wsStatus.textContent = isConnected
      ? (globalThis.i18n?.t('controller.connected') || 'Connected')
      : (globalThis.i18n?.t('controller.disconnected') || 'Disconnected')
  }
}
/**
 * Создание логгера для модуля
 */
function createLogger(moduleName) {
  const startTime = performance.now()
  return {
    info: () => {
    },
    success: () => {},
    warning: () => {},
    error: (message, data) => {
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
  logger.error('Критическая ошибка инициализации:', error)
  if (error instanceof AppError) {
    // AppError already logged with context
  }
}
function _syncUISpeed(ballState) {
  if (ballState.speed !== undefined) {
    components.speed?.setSpeed(ballState.speed)
  }
}
function _syncUISize(ballState) {
  if (ballState.radius !== undefined && components.size && typeof components.size.setSize === 'function') {
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
  const ax = Math.abs(dirX)
  const ay = Math.abs(dirY)
  if (ax > 0.9 && ay < 0.2) return 'horizontal'
  if (ay > 0.9 && ax < 0.2) return 'vertical'
  if (ax > ay * 2) return 'horizontal'
  if (ay > ax * 2) return 'vertical'
  if (dirX > 0 && dirY > 0) return 'diagRL' // TL→BR
  if (dirX > 0 && dirY < 0) return 'diagRLL' // BL→TR
  return null
}
function _syncUIDirection(ballState) {
  if (ballState.dirX !== undefined && ballState.dirY !== undefined) {
    const now = performance.now()
    if (now < __ignoreServerDirectionUntilTs) {
      return
    }
    const mode = _getDirectionMode(ballState.dirX, ballState.dirY)
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
    if (ballState.soundEnabled !== undefined) {
      const soundEnabledCheckbox = document.getElementById('soundEnabledCheckbox')
      if (soundEnabledCheckbox) {
        soundEnabledCheckbox.checked = Boolean(ballState.soundEnabled)
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
    soundEnabledCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked
      setSoundEnabled(enabled)
      if (enabled) {
        soundTypeControl.style.opacity = '1'
        soundTypeControl.style.pointerEvents = 'auto'
      } else {
        soundTypeControl.style.opacity = '0.5'
        soundTypeControl.style.pointerEvents = 'none'
      }
      if (lastServerState) {
        lastServerState.soundEnabled = enabled
      }
      updateViewerAudioIndicators()
    })
    soundTypeSelect.addEventListener('change', (e) => {
      const soundType = e.target.value
      setSoundType(soundType)
      if (lastServerState) {
        lastServerState.soundType = soundType
      }
    })
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
  setControlsEnabled(true)
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
function safeSend(type, payload) {
  try {
    if (typeof wsClient?.send === 'function') {
      const result = wsClient.send(type, payload)
      if (result && typeof result.catch === 'function') {
        result.catch(err => {
          if (err.message === 'Session not found') {
            const msg = globalThis.i18n?.t('controller.sessionLost') || 'Session expired. Please reload the page.'
            showNotification(msg, 'error')
          }
        })
      }
    }
  } catch (e) {
    // Silently ignore errors in speed update
  }
}
function updateSpeed(speed) {
  try {
    safeSend(WS_MSG.controllerUpdate, { speed })
  } catch (err) {
    debugWarn('Error updating speed:', err)
  }
}
async function initializePreview() {
  showWaitingForViewer()
  const previewWrap = document.getElementById('previewWrap')
  if (previewWrap) {
    previewWrap.style.display = 'block'
  }
  const canvas = document.getElementById('preview')
  if (!canvas) {
    return
  }
  if (canvas.width === 0 || canvas.height === 0) {
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
    previewPhysicsEngine = new PhysicsEngine({
      sessionId: 'preview',
      isViewer: true,
      clientSimulation: true // Start with local simulation (failsafe)
    })
    try {
      globalThis.__previewPhysics = previewPhysicsEngine
    } catch (err) {
      debugWarn('Unable to export preview physics engine:', err)
    }
    previewPhysicsEngine.setPaused(true)
    globalThis.addEventListener('bb_bounce', () => bbCounters.onBounce())
    if (globalThis.BBConfig?.smoothing) {
      previewPhysicsEngine.setSmoothingOptions(globalThis.BBConfig.smoothing)
    }
    if (physicsInterval) clearInterval(physicsInterval)
    physicsInterval = setInterval(physicsLoop, PHYSICS_DT)
    requestAnimationFrame(renderPreviewLoop)
    globalThis.__previewRenderer = new BallRenderer(canvas, previewPhysicsEngine, {
      localPhysics: false // Превью следует за состоянием от viewer через SSE
    })
    globalThis.__previewCanvas = canvas
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    if (globalThis.__current.viewerScreenSize && globalThis.__current.viewerScreenSize.width > 0) {
      previewPhysicsEngine.setWorldSize(
        globalThis.__current.viewerScreenSize.width,
        globalThis.__current.viewerScreenSize.height
      )
      const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2
      const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2
      previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY)
      previewPhysicsEngine.setVelocity(0, 0)
    } else {
      previewPhysicsEngine.setWorldSize(canvasWidth, canvasHeight)
      previewPhysicsEngine.setPosition(canvasWidth / 2, canvasHeight / 2)
      previewPhysicsEngine.setVelocity(0, 0)
    }
  } catch (error) {
    // Silently ignore canvas size errors
  }
}
function showWaitingForViewer() {
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.textContent = globalThis.i18n?.t('controller.waitingForViewerConnection') || '⏳ Waiting for viewer connection'
    viewerInfo.style.display = 'block'
  }
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
  if (!isDiagonalMode()) {
    return
  }
  const directionVector = getDirectionVector(currentDirectionMode)
  if (!directionVector) {
    return
  }
  const { dirX, dirY } = directionVector
  directionState = { dx: dirX, dy: dirY }
  if (isPlaying) {
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
  } else {
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
  if (globalThis.__current?.viewerScreenSize?.width > 0) {
    const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2
    const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2
    previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY)
    previewPhysicsEngine.setVelocity(0, 0)
  }
  else if (isPreviewFullscreen && previewFsCanvas) {
    const centerX = previewFsCanvas.width / 2
    const centerY = previewFsCanvas.height / 2
    previewPhysicsEngine.setPosition(centerX, centerY)
    previewPhysicsEngine.setVelocity(0, 0)
  }
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
    const label = globalThis.i18n?.t('controller.viewerSize') || 'Viewer'
    viewerInfo.textContent = `${label}: ${viewerScreenSize.width}×${viewerScreenSize.height}`
    viewerInfo.style.display = 'block'
  }
}
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
      const width = globalThis.__current?.viewerScreenSize?.width || 800
      const height = globalThis.__current?.viewerScreenSize?.height || 600
      const diagonal = Math.hypot(width, height)
      return { dirX: width / diagonal, dirY: height / diagonal }
    }
    case 'diagRLL': {
      const width = globalThis.__current?.viewerScreenSize?.width || 800
      const height = globalThis.__current?.viewerScreenSize?.height || 600
      const diagonal = Math.hypot(width, height)
      return { dirX: width / diagonal, dirY: -height / diagonal }
    }
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
  safeSend(WS_MSG.controllerUpdate, {
    paused: true,
    returnToCenter: true
  })
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
    __ignoreServerDirectionUntilTs = performance.now() + 1500
    if (isPlaying) {
      _applyDirectionChangeWhenPlaying(dirX, dirY)
    } else {
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
  if (globalThis.__previewRenderer) {
    // Preview renderer color update would go here
  }
  if (globalThis.__current?.isInitializing) {
    if (lastServerState) {
        lastServerState.colorBall = color
    }
    return
  }
  if (!globalThis.__current?.viewerConnected) {
     if (lastServerState) {
        lastServerState.colorBall = color
    }
    return
  }
  safeSend(WS_MSG.controllerUpdate, { colorBall: color })
}
function setBallSize(size) {
  // Всегда обновляем локальное состояние и превью
  if (lastServerState) {
    lastServerState.radius = size
  }
  if (previewPhysicsEngine) {
    previewPhysicsEngine.ball.radius = size
  }
  if (globalThis.__current?.isInitializing) {
    return
  }
  safeSend(WS_MSG.controllerUpdate, { radius: size })
}
function setSoundEnabled(enabled) {
  if (!globalThis.__current?.viewerConnected) {
    return
  }
  safeSend(WS_MSG.controllerUpdate, { soundEnabled: Boolean(enabled) })
  if (lastServerState) {
    lastServerState.soundEnabled = Boolean(enabled)
  }
  updateViewerAudioIndicators()
}
function setSoundType(soundType) {
  if (!globalThis.__current?.viewerConnected) {
    return
  }
  safeSend(WS_MSG.controllerUpdate, { soundType: soundType })
}
function setBallSizeMultiplier(multiplier) {
  const baseSize = 20
  const newSize = baseSize * multiplier
  setBallSize(newSize)
}
function setBackgroundColor(color) {
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
  if (!globalThis.__current?.viewerConnected) {
    if (lastServerState) {
        lastServerState.colorBg = color
    }
    return
  }
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
      return { text: globalThis.i18n?.t('controller.horizontalFull') || '↔️ Horizontal', icon: '↔️' }
    case 'vertical':
      return { text: globalThis.i18n?.t('controller.verticalFull') || '↕️ Vertical', icon: '↕️' }
    case 'diagRL':
      return { text: globalThis.i18n?.t('controller.diagLTRB') || '↘️ Diagonal', icon: '↘️' }
    case 'diagRLL':
      return { text: globalThis.i18n?.t('controller.diagLBRT') || '↗️ Diagonal', icon: '↗️' }
    case 'random':
      return { text: globalThis.i18n?.t('controller.randomFull') || '🎲 Random', icon: '🎲' }
    default:
      return { text: globalThis.i18n?.t('controller.unknownDirection') || '❓ Unknown', icon: '❓' }
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
    const directionDisplay = document.getElementById('currentDirectionDisplay')
    let directionText = customText || 'Неизвестно'
    let directionIcon
    if (!customText) {
      const directionInfo = getDirectionInfo(currentDirectionMode)
      directionText = directionInfo.text
      directionIcon = directionInfo.icon
    }
    if (directionDisplay) {
      directionDisplay.textContent = directionIcon || '❓'
      directionDisplay.title = directionText
    }
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
  const button = document.getElementById('playPauseBtn')
  if (button) {
    if (isPlaying) {
      const stopText = globalThis.i18n?.t('controller.stop') || '⏸ Stop'
      button.textContent = stopText
      button.classList.add('playing')
      button.disabled = false  // Кнопка активна при воспроизведении
    } else {
      const startText = globalThis.i18n?.t('controller.start') || '▶️ Start'
      button.textContent = startText
      button.classList.remove('playing')
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
  if (!globalThis.__current?.viewerConnected) {
    if (shouldPlay) {
       showNotification(globalThis.i18n?.t('controller.clientNotConnected') || 'Warning: client not connected, animation may not work', 'warning')
    }
  }
  const payload = shouldPlay
    ? {
        paused: false,
        ...(getDirectionVector(currentDirectionMode) || { dirX: 1, dirY: 0 }),
        speed: Number(components.speed?.getSpeed() ?? 40)
      }
    : {
        paused: true,
        returnToCenter: true
      }
  safeSend(WS_MSG.controllerUpdate, payload)
  isPlaying = shouldPlay
  globalThis.__current.isPlaying = shouldPlay
  globalThis.isPlaying = shouldPlay
  globalThis.forcePauseUntilUserAction = false
  if (shouldPlay) {
    bbCounters.start()
  } else {
    bbCounters.stop(true)
  }
  if (previewPhysicsEngine) {
    previewPhysicsEngine.applyCommand(payload)
    if (!shouldPlay) {
      centerBallInViewer()
    }
  }
  __ignoreServerPausedUntilTs = performance.now() + 800
  _schedulePlayPauseAnimations()
  return true
}
/**
 * Переключает состояние воспроизведения/паузы сессии.
 * Отправляет соответствующие команды на сервер и обновляет UI.
 */
function togglePlayPause() {
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
  _updateAllPlayPauseButtons()
  setTimeout(() => _updateAllPlayPauseButtons(), 150)
  setTimeout(() => _updateAllPlayPauseButtons(), 300)
}
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
  const viewerStatusEl = document.getElementById('viewerStatus')
  if (viewerStatusEl) {
    if (globalThis.__current.viewerConnected) {
      viewerStatusEl.textContent = globalThis.i18n?.t('controller.viewerConnected') || 'Connected'
      viewerStatusEl.classList.add('connected')
      viewerStatusEl.classList.remove('disconnected')
      viewerStatusEl.style.fontWeight = '600'
      hideWaitingForViewer()
      if (globalThis.__current.viewerScreenSize?.width > 0) {
        updatePreviewSize(globalThis.__current.viewerScreenSize)
      }
      setControlsEnabled(true)
    } else {
      viewerStatusEl.textContent = globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
      viewerStatusEl.classList.add('disconnected')
      viewerStatusEl.classList.remove('connected')
      viewerStatusEl.style.fontWeight = '400'
      showWaitingForViewer()
      setControlsEnabled(false)
    }
  }
  updateViewerAudioIndicators()
  updateViewerLinkVisualState()
}
/**
 * Обновляет визуальное состояние ссылки для клиента в зависимости от подключения вьювера
 */
function updateViewerLinkVisualState() {
  const viewInput = document.getElementById('view')
  if (!viewInput) return
  if (globalThis.__current.viewerConnected) {
    viewInput.style.borderColor = '#94a3b8'
    viewInput.style.backgroundColor = '#ffffff'
    viewInput.style.color = '#1f2937'
    viewInput.placeholder = ''
  } else {
    viewInput.style.borderColor = '#ef4444'
    viewInput.style.backgroundColor = '#fef2f2'
    viewInput.style.color = '#ef4444'
    viewInput.placeholder = (globalThis.i18n?.t('controller.waitingViewer') || 'Waiting for viewer') + '...'
  }
}
/**
 * Обновляет индикаторы звука зрителя на основе состояния
 */
function updateViewerAudioIndicators() {
  const audioIndicator = document.getElementById('viewerAudioIndicator')
  const audioText = document.getElementById('viewerAudioText')
  if (!audioIndicator || !audioText) return
  const soundEnabled = lastServerState?.soundEnabled ?? false
  const viewerAudioActivated = globalThis.__current?.viewerAudioActivated ?? false
  const currentState = `${soundEnabled}-${viewerAudioActivated}`
  if (updateViewerAudioIndicators._lastState === currentState) return
  updateViewerAudioIndicators._lastState = currentState
  if (soundEnabled) {
    if (!viewerAudioActivated) {
      audioIndicator.classList.remove('hidden', 'ready')
      audioIndicator.classList.add('warning')
      audioText.textContent = globalThis.i18n?.t('controller.viewerSoundNotActivated') || 'Waiting: viewer must click "Enable sound"'
    } else {
      audioIndicator.classList.remove('hidden', 'warning')
      audioIndicator.classList.add('ready')
      audioText.textContent = globalThis.i18n?.t('controller.viewerHearingSound') || 'Viewer sound activated'
    }
  } else {
    audioIndicator.classList.add('hidden')
  }
}
function _initializeFullscreenRenderer() {
  try {
    if (!previewPhysicsEngine) {
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
  document.body.classList.add('fullscreen-active')
  _initializeFullscreenRenderer()
  resizePreviewFullscreen()
  setupFsPanelAutoHide()
  setupFsPanelDrag()
  setupFullscreenGestures()
  syncFsPlayPauseButton()
  wireFullscreenControls()
  fillFsSessionInfo()
  if (!globalThis.__current?.viewerConnected && previewPhysicsEngine) {
    centerBallInViewer()
  }
}
function closePreviewFullscreen() {
  const overlay = document.getElementById('previewOverlay')
  if (!overlay) return
  const currentUrl = globalThis.location.href
  const baseUrl = currentUrl.split('#')[0]
  history.replaceState(null, '', baseUrl)
  overlay.style.display = 'none'
  isPreviewFullscreen = false
  document.body.classList.remove('fullscreen-active')
}
function resizePreviewFullscreen() {
  if (!previewFsCanvas) return
  previewFsCanvas.width = globalThis.innerWidth
  previewFsCanvas.height = globalThis.innerHeight
  if (previewPhysicsEngine) {
    const vs = globalThis.__current?.viewerScreenSize
    if (vs && vs.width > 0 && vs.height > 0) {
      previewPhysicsEngine.setWorldSize(vs.width, vs.height)
    } else {
      previewPhysicsEngine.setWorldSize(globalThis.innerWidth, globalThis.innerHeight)
      if (!globalThis.__current?.viewerConnected) {
        centerBallInViewer()
      }
    }
  }
}
function setupFsPanelAutoHide() {
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
  overlay.addEventListener('touchend', handleTouchEnd, { passive: true })
}
function syncFsPlayPauseButton() {
  const btn = document.getElementById('fsPlayPauseBtn')
  if (!btn) return
  if (isPlaying) {
    btn.textContent = '⏸ Стоп'
  } else {
    btn.textContent = '▶️ Старт'
  }
}
function wireFullscreenControls() {
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
  try {
    const sid = globalThis.__current?.sessionId ?? '...'
    const fsSid = document.getElementById('fsCurSid')
    if (fsSid) fsSid.textContent = `SID: ${sid}`
    const fsLink = document.getElementById('fsViewLink')
    if (fsLink) fsLink.value = `${globalThis.location.origin}/s/${sid}`
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
    statusText.textContent = globalThis.i18n?.t('controller.viewerConnected') || 'Connected'
  } else {
    fsViewerStatus.classList.remove('connected')
    statusText.textContent = globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
  }
}
/**
 * Сбрасывает состояние сессии (счётчики, позицию мяча)
 */
function resetSession() {
  try {
    bbCounters.resetAll()
    if (isPlaying) {
      _setPlayPauseState(false)
    }
    safeSend(WS_MSG.controllerUpdate, {
      paused: true,
      returnToCenter: true
    })
    setDirection('horizontal')
    showNotification(globalThis.i18n?.t('controller.sessionReset') || 'Session reset', 'info')
  } catch (error) {
    console.error('Session reset error:', error)
    showNotification(globalThis.i18n?.t('controller.sessionResetError') || 'Error resetting session', 'error')
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
      if (type === 'error') {
        alert(`Ошибка: ${message}`)
      }
    }
  } catch (error) {
    console.error('Error showing notification:', error)
    alert(message)
  }
}

// Экспорт функций в глобальную область видимости для доступа из HTML onclick
globalThis.togglePlayPause = togglePlayPause
globalThis.setDirection = setDirection
globalThis.updateSpeed = updateSpeed
globalThis.setBallColor = setBallColor
globalThis.setBallSize = setBallSize
globalThis.setBackgroundColor = setBackgroundColor
globalThis.resetSession = resetSession
globalThis.setSoundEnabled = setSoundEnabled
globalThis.setSoundType = setSoundType
globalThis.setBallSizeMultiplier = setBallSizeMultiplier
} // Конец защиты от повторной загрузки
