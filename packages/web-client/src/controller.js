/* jshint esversion: 11, browser: true, node: true, -W119 */
/* global globalThis, WS_MSG, sharedComponents, throttle, AudioManager, BallRenderer, getSessionIdFromUrl, RealtimeClient, debugWarn, debugError */
'use strict'
// Require dependencies (side effects populate globalThis)
require('./core/debug-logger')
require('./config')
require('./common')
require('./domain/session-state')
require('./domain/direction')
require('./domain/counters')
require('./audio/audio-manager')
require('./i18n/constants')
require('./i18n/i18n')
require('./i18n/language-selector')
require('./rendering/renderer')
require('./ui/shared-components')
require('./network/websocket-client')
require('./network/realtime-client')
require('./network/csrf')
require('./ui/controller-settings')

const PhysicsEngine = require('@emdr/shared/physics-engine')
const _PreviewManager = require('./application/controller/preview-manager')
const { applyAdaptiveSmoothing } = require('@emdr/shared/smoothing-utils')
const {
  getDirectionVector,
  isDiagonalMode,
  getCurrentDirectionMode,
  setCurrentDirectionMode,
  setDirectionState,
  recalculateDiagonalDirection,
  getDirectionMode
} = require('./domain/direction')
const {
  bbCounters,
  detectAndCountBounceFromServer
} = require('./domain/counters')
globalThis.PhysicsEngine = PhysicsEngine

/**
 * Controller - Логика управления сессией BilateralBound v2.2
 * Модульная архитектура с улучшенной обработкой ошибок
 * @version 2.2
 * @module Controller
 */
/* exported setDirection, resetCenter, updateSpeed, setBallColor, setBallSize, setBackgroundColor, togglePlayPause, resetSession, setSoundEnabled, setSoundType */
/* global debugWarn, debugError, RealtimeClient */
// Защита от повторной загрузки

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
let isPlaying = false
let wsClient
let isInitialized = false // Флаг для предотвращения повторной инициализации
let __ignoreServerPausedUntilTs = 0 // Кратковременная блокировка переопределения isPlaying сервером
let __ignoreServerDirectionUntilTs = 0 // Кратковременная блокировка переопределения направления сервером
let previewPhysicsEngine = null // Локальный движок физики для превью
let hiddenThrottleMs = 100 // при скрытой вкладке обновляем ~10 FPS
if (globalThis.BBConfig?.rendering?.hiddenThrottleMs != null) {
  hiddenThrottleMs = globalThis.BBConfig.rendering.hiddenThrottleMs
}
let physicsInterval = null // Глобальный интервал физики для возможности остановки извне
let _previewRafLast = 0 // Timestamp последнего rAF кадра для dt физики
let previewFsCanvas = null
let previewFsRenderer = null
let isPreviewFullscreen = false
let _syncMonitorTimer = null
let fsPanelHideTimer = null
const fsPanelDrag = { active: false, offsetX: 0, offsetY: 0 }

function startSyncMonitor() {
  stopSyncMonitor()
  _syncMonitorTimer = setInterval(() => {
    if (!previewPhysicsEngine || !wsClient?.isConnected) return
    if (previewPhysicsEngine.state?.paused || previewPhysicsEngine.state?.stopping)
      return
    const diag = previewPhysicsEngine.getSyncDiagnostics
      ? previewPhysicsEngine.getSyncDiagnostics()
      : null
    if (!diag) return
    if (diag.driftPx > 120 || diag.jitterMs > 35) {
      debugWarn(
        `[SYNC_MONITOR][controller] drift=${diag.driftPx}px jitter=${diag.jitterMs}ms spring=${diag.springActive}`
      )
    }
  }, 2000)
}

function stopSyncMonitor() {
  if (_syncMonitorTimer) {
    clearInterval(_syncMonitorTimer)
    _syncMonitorTimer = null
  }
}
document.addEventListener('DOMContentLoaded', () => {
  initializeController().catch(debugError)
  bbCounters.initDom()
  bbCounters.onAutoStop = () => _setPlayPauseState(false)
  const autoStopPassesInput = document.getElementById('autoStopPassesInput')
  const autoStopSecondsInput = document.getElementById('autoStopSecondsInput')
  if (autoStopPassesInput) {
    autoStopPassesInput.addEventListener('input', () => {
      bbCounters.autoStopPasses = Math.max(
        0,
        Number.parseInt(autoStopPassesInput.value, 10) || 0
      )
    })
  }
  if (autoStopSecondsInput) {
    autoStopSecondsInput.addEventListener('input', () => {
      bbCounters.autoStopSeconds = Math.max(
        0,
        Number.parseInt(autoStopSecondsInput.value, 10) || 0
      )
    })
  }
  globalThis.addEventListener('resize', () => {
    const size = globalThis.__current?.viewerScreenSize
    if (size?.width > 0 && size?.height > 0) {
      updatePreviewSize(size)
    }
  })
  // Update viewer links when theme changes
  globalThis.addEventListener('bb_theme_changed', () => {
    const sid = globalThis.__current?.sessionId
    if (sid) {
      updateViewerLink(sid)
      const fsLink = document.getElementById('fsViewLink')
      if (fsLink) fsLink.value = buildViewerUrl(sid)
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
      showCriticalError(
        globalThis.i18n?.t('controller.errorTitle') || 'Error',
        'ID сессии не найден в URL'
      )
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
    // Note: isInitializing will be reset to false in websocket 'open' handler
  } catch (error) {
    if (globalThis.__current) globalThis.__current.isInitializing = false
    debugError('Error initializing controller:', error)
    let errorMsg = error?.message || error
    if (
      errorMsg?.includes('Session with this ID not found') ||
      errorMsg?.includes('not found')
    ) {
      errorMsg =
        globalThis.i18n?.t('restore.notFound') ||
        'Session with this ID not found. Please check the URL and try again.'
    } else if (errorMsg?.includes('Realtime connection')) {
      errorMsg =
        globalThis.i18n?.t('controller.connectionError') ||
        'Failed to connect to session. Please reload the page and try again.'
    }
    showCriticalError(
      globalThis.i18n?.t('controller.errorTitle') || 'Error',
      errorMsg
    )
  }
}
async function registerControllerOnServer(sessionId, logger) {
  try {
    const connectResponse = await globalThis.csrfFetch(
      `/api/session/${sessionId}/controller/connect`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }
    )
    if (connectResponse.ok) {
      // Connection established
    } else {
      // Connection failed
    }
  } catch {
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
  if (key === ' ' || e?.code === 'Space') {
    e.preventDefault()
    e.stopPropagation()
    togglePlayPause()
  } else if (key === 'escape' && isPreviewFullscreen) {
    e.preventDefault()
    e.stopPropagation()
    closePreviewFullscreen()
  } else if (key === 'f' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    e.stopPropagation()
    if (isPreviewFullscreen) {
      closePreviewFullscreen()
    } else {
      openPreviewFullscreen()
    }
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
  const sessionTimestampEl = document.getElementById('sessionTimestamp')
  if (sessionTimestampEl) {
    // Use English "Created:" label initially, will be updated with i18n when ready
    const label = 'Created: '
    sessionTimestampEl.textContent = `${label}${new Date().toLocaleString()}`
  }
  const viewerSessionIdEl = document.getElementById('viewerSessionId')
  if (viewerSessionIdEl) {
    viewerSessionIdEl.textContent = sessionId
  }
  const viewerStatusEl = document.getElementById('viewerStatus')
  if (viewerStatusEl) {
    viewerStatusEl.textContent =
      globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
    viewerStatusEl.classList.add('disconnected')
  }
  updateViewerLink(sessionId)
}
function buildViewerUrl(sessionId) {
  return `${globalThis.location.origin}/s/${sessionId}`
}
function updateViewerLink(sessionId) {
  const viewLinkInput = document.getElementById('view')
  if (viewLinkInput) {
    viewLinkInput.value = buildViewerUrl(sessionId)
  }
}

/**
 * Updates the session timestamp display using i18n-aware label
 */
function updateSessionTimestampDisplay() {
  const timestampEl = document.getElementById('sessionTimestamp')
  if (!timestampEl) return
  const i18n = globalThis.i18n
  const label = i18n?.isReady && i18n.t('controller.sessionCreated') !== 'controller.sessionCreated'
    ? i18n.t('controller.sessionCreated')
    : 'Created: '
  timestampEl.textContent = `${label}${new Date().toLocaleString()}`
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
    startSyncMonitor()
    // isInitializing stays true until initial_state arrives (prevents warning on page open).
    // On reconnection reset immediately — initial_state won't arrive again.
    if (event?.isReconnection && globalThis.__current) {
      globalThis.__current.isInitializing = false
    } else {
      // Safety: if initial_state never arrives, unblock after 5s
      setTimeout(() => {
        if (globalThis.__current?.isInitializing) {
          globalThis.__current.isInitializing = false
        }
      }, 5000)
    }
    updateConnectionStatus(true)
    // Sync current language to session so viewer gets the same locale
    const currentLang = localStorage.getItem('emdr-language')
    if (currentLang && sessionId) {
      globalThis.csrfFetch(`/api/session/${sessionId}/language`, {
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
            const resp = await globalThis.csrfFetch(`/api/session/${sessionId}/state`)
            if (!resp.ok) return
            const state = await resp.json()
            if (state.paused === true) return // Server is paused, don't restore
          } catch {
            return // If fetch failed, don't restore
          }
          if (previewPhysicsEngine) {
            previewPhysicsEngine.setPaused(false)
          }
          isPlaying = true
          // eslint-disable-next-line require-atomic-updates
          globalThis.__current.isPlaying = true
          // eslint-disable-next-line require-atomic-updates
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
  wsClient.on('close', (event) => {
    stopSyncMonitor()
    updateConnectionStatus(false)
    lastPlayingState = isPlaying
    if (event.code === 1006) {
      if (previewPhysicsEngine) {
        previewPhysicsEngine.setPaused(true)
        const centerX =
          previewPhysicsEngine.centerX ||
          (globalThis.__previewCanvas?.width || 500) / 2
        const centerY =
          previewPhysicsEngine.centerY ||
          (globalThis.__previewCanvas?.height || 375) / 2
        previewPhysicsEngine.setPosition(centerX, centerY)
        previewPhysicsEngine.setVelocity(0, 0)
      }
      isPlaying = false
      globalThis.__current.viewerConnected = false
      updatePlayPauseButton()
    }
    updateViewerStatusUI()
  })
  wsClient.on('error', () => {})
  wsClient.on(WS_MSG.viewerStatus, (data) => {
    const wasConnected = globalThis.__current.viewerConnected
    const isConnected =
      data.connected === true || data.viewerConnected === true
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
      setDirectionState(1, 0)
      setCurrentDirectionMode('horizontal')
      updateDirectionDisplay(1, 0)
      updateDirectionButtons()
      if (bbCounters && typeof bbCounters.resetAll === 'function') {
        bbCounters.resetAll()
      }
      lastServerState = null
      const viewerStatusEl = document.getElementById('viewerStatus')
      if (viewerStatusEl) {
        viewerStatusEl.textContent =
          globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
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
  wsClient.on(WS_MSG.initialState, (state) => {
    // Page is fully ready — allow warnings from now on
    if (globalThis.__current) globalThis.__current.isInitializing = false
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

    // Update session timestamp display after initial state is received
    updateSessionTimestampDisplay()
  })
  wsClient.on(WS_MSG.stateUpdate, (state) => {
    lastServerState = state // Кэшируем состояние
    if (typeof state.viewerConnected === 'boolean') {
      const wasConnected = globalThis.__current.viewerConnected
      globalThis.__current.viewerConnected = state.viewerConnected
      if (wasConnected !== state.viewerConnected) {
        updateViewerStatusUI()
      }
      // FIXED: Always keep preview in clientSimulation mode for consistent physics.
      // The viewer also runs in clientSimulation: true — both sides use the same physics
      // engine with the same speed/direction params. Drift correction keeps them in sync.
      // Previously, we toggled clientSimulation which caused mode-switching artifacts
      // (preview would jump from local physics to "follow server" without interpolation).
    }
    if (state.viewerScreenSize?.width > 0) {
      const prevSize = globalThis.__current?.viewerScreenSize || {
        width: 0,
        height: 0
      }
      const nextSize = state.viewerScreenSize
      const sizeChanged =
        !prevSize ||
        prevSize.width !== nextSize.width ||
        prevSize.height !== nextSize.height
      globalThis.__current.viewerConnected = true
      globalThis.__current.viewerScreenSize = nextSize
      if (sizeChanged) {
        updatePhysicsEngineWorldSize(nextSize)
        const canvas = document.getElementById('preview')
        if (canvas) {
          const { previewWidth, previewHeight } = calculatePreviewDimensions(
            canvas,
            nextSize
          )
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
    applyAdaptiveSmoothing(previewPhysicsEngine, jitterMs)
  })
  wsClient.on(WS_MSG.viewerAudioActivated, (data) => {
    if (globalThis.__current) {
      globalThis.__current.viewerAudioActivated = data.activated
    }
    updateViewerAudioIndicators()
  })
  // Bounce sync - sync direction only; no position relay.
  // Both controller preview and viewer run local physics with identical params,
  // so they bounce at the same wall independently. Direction sync corrects any
  // minor divergence without triggering spring-damper corrections.
  wsClient.on(WS_MSG.bounceSync, (data) => {
    if (!previewPhysicsEngine) return
    if (previewPhysicsEngine.state?.seekingCenter) return
    if (typeof data.dirX === 'number' && typeof data.dirY === 'number') {
      previewPhysicsEngine.state.lastDirection.x = data.dirX
      previewPhysicsEngine.state.lastDirection.y = data.dirY
      const pps =
        (previewPhysicsEngine.ball.speed / 100) *
        previewPhysicsEngine.options.maxSpeed
      previewPhysicsEngine.ball.vx = data.dirX * pps
      previewPhysicsEngine.ball.vy = data.dirY * pps
    }
    if (data.side) {
      previewPhysicsEngine._lastBounceSide = data.side
    }
  })
  wsClient.on('maxReconnectAttemptsReached', () => {
    logger.error('Max reconnect attempts reached')
    showCriticalError(
      globalThis.i18n?.t('controller.connectionFailed') || 'Connection Failed',
      globalThis.i18n?.t('controller.connectionFailed') ||
        'Cannot connect to server. Please check your internet connection and reload the page.'
    )
  })
  wsClient.on('session_lost', () => {
    logger.error('Session lost (evicted by server)')
    showCriticalError(
      globalThis.i18n?.t('controller.sessionLost') || 'Session Expired',
      globalThis.i18n?.t('controller.sessionLostMsg') ||
        'Your session has expired or was removed from the server. Please reload the page.'
    )
  })
}
/**
 * Применяет состояние от viewer/сервера к превью контроллера
 * АРХИТЕКТУРА: Превью в viewer режиме (isViewer: true) следует за состоянием от viewer через WebSocket
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
    if (
      currentW !== state.viewerScreenSize.width ||
      currentH !== state.viewerScreenSize.height
    ) {
      previewPhysicsEngine.setWorldSize(
        state.viewerScreenSize.width,
        state.viewerScreenSize.height
      )
    }
  }
  // First server update after play pressed — snap to server position and unpause.
  // Safe: if user pressed stop, _pendingPlaySync is already cleared in _setPlayPauseState.
  if (previewPhysicsEngine._pendingPlaySync && state.paused === false) {
    previewPhysicsEngine._pendingPlaySync = false
    previewPhysicsEngine._hasReceivedFirstMovingUpdate = true
    if (typeof state.x === 'number' && typeof state.y === 'number') {
      previewPhysicsEngine.ball.x = state.x
      previewPhysicsEngine.ball.y = state.y
      previewPhysicsEngine._prevPos.x = state.x
      previewPhysicsEngine._prevPos.y = state.y
      previewPhysicsEngine._currPos.x = state.x
      previewPhysicsEngine._currPos.y = state.y
    }
    if (state.dirX !== undefined)
      previewPhysicsEngine.state.lastDirection.x = state.dirX
    if (state.dirY !== undefined)
      previewPhysicsEngine.state.lastDirection.y = state.dirY
    if (state.speed !== undefined) previewPhysicsEngine.setSpeed(state.speed)
    previewPhysicsEngine.setPaused(false)
    if (state.colorBall) previewPhysicsEngine.setBallColor(state.colorBall)
    if (state.colorBg) previewPhysicsEngine.setBgColor(state.colorBg)
    isPlaying = true
    updatePlayPauseButton()
    bbCounters.start()
    return
  }
  if (previewPhysicsEngine.options.clientSimulation) {
    const localCommand = {
      dirX: state.dirX,
      dirY: state.dirY,
      speed: state.speed,
      colorBall: state.colorBall,
      colorBg: state.colorBg,
      radius: state.radius
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
    // CLIENT-SIDE AUTHORITY: Parameter-based sync filter (identical to viewer.js).
    // Near walls (immunity zone) or when already in sync by velocity, we ignore x/y.
    const isMoving = !previewPhysicsEngine.state.paused && !previewPhysicsEngine.state.stopping
    if (isMoving && typeof state.x === 'number' && typeof state.y === 'number') {
      const serverVx = state.vx
      const serverVy = state.vy
      if (typeof serverVx === 'number' && typeof serverVy === 'number') {
        const velDx = Math.abs(serverVx - previewPhysicsEngine.ball.vx)
        const velDy = Math.abs(serverVy - previewPhysicsEngine.ball.vy)
        const velocitiesMatch = velDx < 10 && velDy < 10
        const posDrift = Math.hypot(
          state.x - previewPhysicsEngine.ball.x,
          state.y - previewPhysicsEngine.ball.y
        )
        const driftThreshold = previewPhysicsEngine.options.smoothing?.driftThresholdPx || 100
        const isNearWall = previewPhysicsEngine._isNearWall()

        // VECTOR GUARDING: If client and server disagree on direction near a wall,
        // the client MUST remain authoritative.
        const directionMismatchX = (serverVx * previewPhysicsEngine.ball.vx) < 0
        const directionMismatchY = (serverVy * previewPhysicsEngine.ball.vy) < 0
        const isMismatched = directionMismatchX || directionMismatchY

        if (isNearWall || isMismatched || (velocitiesMatch && posDrift < driftThreshold)) {
          // Drop coordinate fields to prevent jitter
          delete localCommand.x
          delete localCommand.y

          // Also ignore direction from server if we are mismatched or near wall
          if (isNearWall || isMismatched) {
             delete localCommand.lastDirection
             delete localCommand.dirX
             delete localCommand.dirY
             delete localCommand.vx
             delete localCommand.vy
          }
        }
      }
    }

    previewPhysicsEngine.applyCommand(localCommand)
    // Store server position for drift correction (same mechanism as viewer)
    if (
      typeof state.x === 'number' &&
      typeof state.y === 'number' &&
      !previewPhysicsEngine.state.paused
    ) {
      // First update after play: hard-snap to server position to start in sync
      if (!previewPhysicsEngine._hasReceivedFirstMovingUpdate) {
        previewPhysicsEngine._hasReceivedFirstMovingUpdate = true
        previewPhysicsEngine.ball.x = state.x
        previewPhysicsEngine.ball.y = state.y
        previewPhysicsEngine._prevPos.x = state.x
        previewPhysicsEngine._prevPos.y = state.y
        previewPhysicsEngine._currPos.x = state.x
        previewPhysicsEngine._currPos.y = state.y
      } else {
        // Store server position for drift correction — include vx/vy so the
        // velocity guard in _checkDriftCorrection works correctly
        previewPhysicsEngine._lastServerPos = {
          x: state.x,
          y: state.y,
          vx: state.vx,
          vy: state.vy,
          ts: performance.now(),
          serverTime: state.serverTimestamp || Date.now()
        }
      }
    }
  } else {
    previewPhysicsEngine.applyCommand(state)
  }
  const pausedState = previewPhysicsEngine.options.clientSimulation
    ? previewPhysicsEngine.state.paused
    : state.paused
  // Apply paused state from server only when it changes AND user hasn't recently toggled play/pause.
  // Without the timestamp guard, server's delayed response overrides user's stop action (double-space bug).
  if (
    typeof state.paused === 'boolean' &&
    previewPhysicsEngine.state.paused !== state.paused &&
    performance.now() >= __ignoreServerPausedUntilTs
  ) {
    previewPhysicsEngine.setPaused(state.paused)
    // Reset first-update flag on pause so next play starts with hard-snap
    if (state.paused) {
      previewPhysicsEngine._hasReceivedFirstMovingUpdate = false
    }
  }
  if (
    typeof pausedState === 'boolean' &&
    performance.now() >= __ignoreServerPausedUntilTs
  ) {
    // Sync isPlaying with server state (only when user hasn't recently toggled)
    const newIsPlaying = !state.paused
    if (isPlaying !== newIsPlaying) {
      isPlaying = newIsPlaying
      updatePlayPauseButton()
      // Show notification when viewer toggles play/pause (no title, just message)
      // Suppress during direction change pause/resume cycle
      if (!globalThis.__suppressPauseNotification) {
        const _t = (k, fallback) => globalThis.i18n?.t(k) || fallback
        if (state.paused) {
          globalThis.notificationSystem?.info('', _t('controller.viewerStopped', 'Viewer stopped'))
        } else {
          globalThis.notificationSystem?.info('', _t('controller.viewerStarted', 'Viewer started'))
        }
      }
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
 * Улучшенный рендер-цикл с линейной интерполяцией (accumulator-based alpha).
 * Physics engine runs at 60Hz tick rate; renderer interpolates between
 * _prevPos and _currPos using the accumulator fraction for smooth motion.
 */
function renderPreviewLoop(timestamp) {
  bbCounters.tick(timestamp)
  if (!previewPhysicsEngine || !globalThis.__previewRenderer) {
    requestAnimationFrame(renderPreviewLoop)
    return
  }
  // Drive physics from rAF using real elapsed time — eliminates jitter caused by
  // running physics on a separate setInterval. When fullscreen is active,
  // BallRenderer.start() drives physics; skip here to avoid double-stepping.
  if (!isPreviewFullscreen) {
    if (_previewRafLast > 0) {
      const dt = Math.min(timestamp - _previewRafLast, 50) / 1000
      previewPhysicsEngine.update(dt)
    }
    _previewRafLast = timestamp
  } else {
    // Reset so there's no dt spike when exiting fullscreen
    _previewRafLast = 0
  }
  const alpha = previewPhysicsEngine.getInterpolationAlpha
    ? previewPhysicsEngine.getInterpolationAlpha()
    : 1
  const interpolatedState = previewPhysicsEngine.getInterpolatedBall(alpha)
  const stateToRender = getScaledState(interpolatedState)
  globalThis.__previewRenderer?.drawFrame(stateToRender)
  if (document.hidden) {
    setTimeout(
      () => requestAnimationFrame(renderPreviewLoop),
      hiddenThrottleMs
    )
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
      ? globalThis.i18n?.t('controller.connected') || 'Connected'
      : globalThis.i18n?.t('controller.disconnected') || 'Disconnected'
  }
}
/**
 * Создание логгера для модуля
 */
function createLogger(moduleName) {
  return {
    info: () => {},
    success: () => {},
    warning: () => {},
    error: (message, data) => {
      if (data?.type === 'connection_closed' || message.includes('соединение'))
        return
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
    components.speed?.setSpeed(ballState.speed, true)
  }
}
function _syncUISize(ballState) {
  if (
    ballState.radius !== undefined &&
    components.size &&
    typeof components.size.setSize === 'function'
  ) {
    const sizes = [20, 40, 80, 100]
    const closestSize = sizes.reduce(
      (prev, curr) =>
        Math.abs(curr - ballState.radius) < Math.abs(prev - ballState.radius)
          ? curr
          : prev,
      sizes[0] // initial value
    )
    components.size.setSize(closestSize)
  }
}
function _syncUIColors(ballState) {
  if (
    ballState.colorBall &&
    components.ballColor &&
    typeof components.ballColor.setColor === 'function'
  ) {
    components.ballColor.setColor(ballState.colorBall)
  }
  if (
    ballState.colorBg &&
    components.bgColor &&
    typeof components.bgColor.setColor === 'function'
  ) {
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
function _syncUIDirection(ballState) {
  if (ballState.dirX !== undefined && ballState.dirY !== undefined) {
    const now = performance.now()
    if (now < __ignoreServerDirectionUntilTs) {
      return
    }
    if (getCurrentDirectionMode() === 'infinity') return
    const mode = getDirectionMode(ballState.dirX, ballState.dirY)
    const currentMode = getCurrentDirectionMode()
    if (mode && mode !== currentMode) {
      setDirectionState(ballState.dirX, ballState.dirY)
      setCurrentDirectionMode(mode)
      updateDirectionButtons()
      updateDirectionDisplay(ballState.dirX, ballState.dirY)
    }
  }
}
function _syncUIInfinity(ballState) {
  if (ballState.infinity === undefined) return
  const now = performance.now()
  if (now < __ignoreServerDirectionUntilTs) return
  if (previewPhysicsEngine) previewPhysicsEngine.ball.infinity = ballState.infinity
  if (lastServerState) lastServerState.infinity = ballState.infinity
  if (ballState.infinity) {
    setCurrentDirectionMode('infinity')
    updateDirectionButtons()
    updateDirectionDisplay(0, 0)
  }
}
function _syncUIIllustration(ballState) {
  if (ballState.ballEmoji === undefined) return
  if (previewPhysicsEngine) previewPhysicsEngine.ball.ballEmoji = ballState.ballEmoji
  if (lastServerState) lastServerState.ballEmoji = ballState.ballEmoji
  const preview = document.getElementById('illusSelectedPreview')
  if (preview) preview.textContent = ballState.ballEmoji || ''
  document.querySelectorAll('.illus-emoji-btn').forEach(b => {
    b.classList.toggle('active',
      b.textContent === ballState.ballEmoji || (!ballState.ballEmoji && b.classList.contains('illus-clear'))
    )
  })
}
function _syncUITrackBand(ballState) {
  if (!ballState.trackBand) return
  if (previewPhysicsEngine) previewPhysicsEngine.options.trackBand = ballState.trackBand
  if (lastServerState) lastServerState.trackBand = ballState.trackBand
  document.querySelectorAll('.pos-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.band === ballState.trackBand)
  })
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
    _syncUIInfinity(ballState)
    _syncUIIllustration(ballState)
    _syncUITrackBand(ballState)
    if (ballState.soundEnabled !== undefined) {
      const soundEnabledCheckbox = document.getElementById(
        'soundEnabledCheckbox'
      )
      if (soundEnabledCheckbox) {
        soundEnabledCheckbox.checked = Boolean(ballState.soundEnabled)
        const soundTypeControl = document.getElementById('soundTypeControl')
        if (soundTypeControl) {
          if (ballState.soundEnabled) {
            soundTypeControl.classList.add('enabled')
          } else {
            soundTypeControl.classList.remove('enabled')
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
    onSpeedChange: throttle((speed) => {
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
    onColorChange: (color) => {
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
    onColorChange: (color) => {
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
    defaultValue: 40,
    title: '',
    onSizeChange: (size) => {
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
        soundTypeControl.classList.add('enabled')
      } else {
        soundTypeControl.classList.remove('enabled')
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
          soundTypeControl.classList.add('enabled')
        } else {
          soundTypeControl.classList.remove('enabled')
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
let _controllerAudioManager = null
function _initializeControllerAudio() {
  const monitorCheckbox = document.getElementById('controllerMonitorCheckbox')
  const volumeSlider = document.getElementById('controllerVolumeSlider')
  const volumeValue = document.getElementById('controllerVolumeValue')
  const volumeControl = document.getElementById('controllerVolumeControl')
  if (!monitorCheckbox) return

  monitorCheckbox.addEventListener('change', (e) => {
    const enabled = e.target.checked
    if (enabled) {
      if (!_controllerAudioManager && typeof AudioManager !== 'undefined') {
        _controllerAudioManager = new AudioManager()
        _controllerAudioManager.init(true)
        _controllerAudioManager.setVolume((volumeSlider?.value ?? 50) / 100)
        _controllerAudioManager.setSoundType(
          lastServerState?.soundType || 'soft'
        )
      } else if (_controllerAudioManager) {
        _controllerAudioManager.init()
      }
      if (_controllerAudioManager) _controllerAudioManager.setEnabled(true)
      if (volumeControl) {
        volumeControl.style.opacity = '1'
        volumeControl.style.pointerEvents = 'auto'
      }
    } else {
      if (_controllerAudioManager) _controllerAudioManager.setEnabled(false)
      if (volumeControl) {
        volumeControl.style.opacity = '0.5'
        volumeControl.style.pointerEvents = 'none'
      }
    }
  })

  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
      if (volumeValue) volumeValue.textContent = `${volumeSlider.value}%`
      if (_controllerAudioManager)
        _controllerAudioManager.setVolume(volumeSlider.value / 100)
    })
  }

  // Play sound on bounce when monitoring is active
  globalThis.addEventListener('bb_bounce', () => {
    if (!_controllerAudioManager?.enabled) return
    const soundType = lastServerState?.soundType || 'soft'
    if (_controllerAudioManager.soundType !== soundType) {
      _controllerAudioManager.setSoundType(soundType)
    }
    _controllerAudioManager.playTick()
  })
}
function initializeComponents() {
  _initializeSpeedControl()
  _initializeBallColorControl()
  _initializeBgColorControl()
  _initializeSizeControl()
  _initializeSoundControls()
  _initializeControllerAudio()
  // Lock controls until viewer connects (updateViewerStatusUI will unlock when ready)
  setControlsEnabled(false)
  updateDirectionDisplay(1, 0)
}
function setControlsEnabled(enabled) {
  const main = document.querySelector('main.wrap')
  if (main) main.classList.toggle('controls-locked', !enabled)
}
function safeSend(type, payload) {
  try {
    if (typeof wsClient?.send === 'function') {
      const result = wsClient.send(type, payload)
      if (result && typeof result.catch === 'function') {
        result.catch((err) => {
          if (err.message === 'Session not found') {
            const msg =
              globalThis.i18n?.t('controller.sessionLost') ||
              'Session expired. Please reload the page.'
            showNotification(msg, 'error')
          }
        })
      }
    }
  } catch {
    // Silently ignore errors in speed update
  }
}
function updateSpeed(speed) {
  if (globalThis.__current?.isInitializing) {
    return
  }
  if (!globalThis.__current?.viewerConnected) {
    showViewerNotConnectedWarning()
    return
  }
  try {
    safeSend(WS_MSG.controllerUpdate, { speed })
    try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'speed', value: speed } })) } catch (_) { /* noop */ }
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
  // Default drawing buffer: 500x250 (2:1) — explicit style to prevent CSS stretching.
  // When viewer connects, buffer is resized to match viewer's actual dimensions.
  canvas.width = 500
  canvas.height = 250
  canvas.style.width = '500px'
  canvas.style.height = '250px'
  try {
    previewPhysicsEngine = new PhysicsEngine({
      sessionId: 'preview',
      isViewer: true, // Preview follows viewer physics (local simulation + drift correction)
      clientSimulation: true // Use client-side physics like viewer for smooth motion
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
    physicsInterval = null // Physics now driven by renderPreviewLoop rAF
    _previewRafLast = 0
    requestAnimationFrame(renderPreviewLoop)
    globalThis.__previewRenderer = new BallRenderer(
      canvas,
      previewPhysicsEngine,
      {
        localPhysics: true // Use accumulator-based alpha for smoother interpolation
      }
    )
    globalThis.__previewCanvas = canvas
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    if (
      globalThis.__current.viewerScreenSize &&
      globalThis.__current.viewerScreenSize.width > 0
    ) {
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
  } catch {
    // Silently ignore canvas size errors
  }
}
function showWaitingForViewer() {
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.textContent =
      globalThis.i18n?.t('controller.waitingForViewerConnection') ||
      '⏳ Waiting for viewer connection'
    viewerInfo.classList.remove('hidden')
  }
  // Compact preview while waiting for viewer — 500x250 with smaller ball
  const canvas = document.getElementById('preview')
  if (canvas) {
    canvas.width = 500
    canvas.height = 250
    canvas.style.width = '500px'
    canvas.style.height = '250px'
    if (previewPhysicsEngine) {
      previewPhysicsEngine.setWorldSize(500, 250)
      previewPhysicsEngine.setPosition(250, 125)
      previewPhysicsEngine.setVelocity(0, 0)
      previewPhysicsEngine.setPaused(true)
      if (previewPhysicsEngine.ball) {
        previewPhysicsEngine.ball.radius = 12
      }
    }
  }
}
function hideWaitingForViewer() {
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.classList.add('hidden')
  }
}
/**
 * Пересчитывает и применяет диагональное направление при изменении размера экрана
 * Центрирует мяч и возобновляет движение с новым направлением от центра
 */
function recalculateDiagonalDirectionIfNeeded() {
  if (!isDiagonalMode()) {
    return
  }
  const directionVector = recalculateDiagonalDirection()
  if (!directionVector) {
    return
  }
  const { dirX, dirY } = directionVector
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
    const { previewWidth, previewHeight } = calculatePreviewDimensions(
      canvas,
      viewerScreenSize
    )
    setCanvasDimensions(canvas, previewWidth, previewHeight)
    updatePhysicsEngineWorldSize(viewerScreenSize)
    recalculateDiagonalDirectionIfNeeded()
    updateViewerInfo(viewerScreenSize)
  } else {
    showWaitingForViewer()
    centerBallInViewer()
  }
}
function canUpdatePreview(viewerScreenSize) {
  const isReady =
    viewerScreenSize && globalThis.__previewRenderer && previewPhysicsEngine
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
    previewPhysicsEngine.setWorldSize(
      viewerScreenSize.width,
      viewerScreenSize.height
    )
  }
}
function centerBallInViewer() {
  if (!previewPhysicsEngine) return
  if (globalThis.__current?.viewerScreenSize?.width > 0) {
    const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2
    const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2
    previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY)
    previewPhysicsEngine.setVelocity(0, 0)
  } else if (isPreviewFullscreen && previewFsCanvas) {
    const centerX = previewFsCanvas.width / 2
    const centerY = previewFsCanvas.height / 2
    previewPhysicsEngine.setPosition(centerX, centerY)
    previewPhysicsEngine.setVelocity(0, 0)
  } else if (globalThis.__previewCanvas) {
    // Ensure canvas has valid dimensions before centering
    const canvas = globalThis.__previewCanvas
    const width = canvas.width || 500
    const height = canvas.height || 375
    previewPhysicsEngine.setPosition(width / 2, height / 2)
    previewPhysicsEngine.setVelocity(0, 0)
  }
}
function updateViewerInfo(viewerScreenSize) {
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    const label = globalThis.i18n?.t('controller.viewerSize') || 'Viewer'
    viewerInfo.textContent = `${label}: ${viewerScreenSize.width}×${viewerScreenSize.height}`
    viewerInfo.classList.remove('hidden')
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
  // Suppress "Viewer stopped/started" notifications during direction change pause cycle
  globalThis.__suppressPauseNotification = true
  safeSend(WS_MSG.controllerUpdate, {
    paused: true,
    returnToCenter: true
  })
  if (previewPhysicsEngine) {
    // Center first, then pause — setPosition cancels seekingCenter so
    // the manual centering won't be overridden by the animation
    centerBallInViewer()
    previewPhysicsEngine.setPaused(true)
  }
  // 400ms: enough for server to process + broadcast + viewer to receive & center
  setTimeout(() => {
    safeSend(WS_MSG.controllerUpdate, {
      paused: false,
      dirX,
      dirY,
      infinity: false
    })
    if (previewPhysicsEngine) {
      previewPhysicsEngine.setDirection(dirX, dirY)
      previewPhysicsEngine.setPaused(false)
    }
    // Allow pause notifications again after the resume broadcast is received
    setTimeout(() => { globalThis.__suppressPauseNotification = false }, 600)
  }, 400)
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
    dirY,
    infinity: false
  })
}
/**
 * Устанавливает направление движения шарика.
 * @param {string} directionMode - Режим направления для установки.
 */
function setDirection(directionMode) {
  if (!directionMode) return
  // Во время инициализации просто обновляем локальное состояние
  if (globalThis.__current?.isInitializing) {
    return
  }
  try {
    // Exit infinity mode when switching to any non-infinity direction
    if (lastServerState?.infinity && directionMode !== 'infinity') {
      if (previewPhysicsEngine) {
        previewPhysicsEngine.ball.infinity = false
        previewPhysicsEngine._infinityT = 0
      }
      if (lastServerState) lastServerState.infinity = false
    }

    if (directionMode === 'infinity') {
      setCurrentDirectionMode('infinity')
      __ignoreServerDirectionUntilTs = performance.now() + 1500
      if (previewPhysicsEngine) {
        previewPhysicsEngine.ball.infinity = true
        previewPhysicsEngine._infinityT = 0
      }
      if (lastServerState) {
        lastServerState.infinity = true
        lastServerState.dirX = 0
        lastServerState.dirY = 0
      }
      updateDirectionButtons()
      updateDirectionDisplay(0, 0)
      safeSend(WS_MSG.controllerUpdate, { infinity: true, dirX: 0, dirY: 0 })
      return
    }

    const directionVector = getDirectionVector(directionMode)
    if (!directionVector) return
    const { dirX, dirY } = directionVector
    setDirectionState(dirX, dirY)
    setCurrentDirectionMode(directionMode)
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
    try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'direction', value: directionMode } })) } catch (_) { /* noop */ }
  } catch (error) {
    console.error('Ошибка установки направления:', error)
  }
}
function setIllustration(emoji, btnEl) {
  const val = (typeof emoji === 'string' && emoji.length > 0) ? emoji : null
  document.querySelectorAll('.illus-emoji-btn').forEach(b => b.classList.remove('active'))
  if (btnEl) btnEl.classList.add('active')
  const preview = document.getElementById('illusSelectedPreview')
  if (preview) preview.textContent = val || ''
  if (previewPhysicsEngine) previewPhysicsEngine.ball.ballEmoji = val
  if (lastServerState) lastServerState.ballEmoji = val
  if (globalThis.__current?.isInitializing) return
  safeSend(WS_MSG.controllerUpdate, { ballEmoji: val })
}

function applyCustomIllustration() {
  const input = document.getElementById('illusCustomInput')
  if (!input) return
  const val = input.value.trim()
  if (!val) return
  document.querySelectorAll('.illus-emoji-btn').forEach(b => b.classList.remove('active'))
  setIllustration(val, null)
}

const ILLUS_TABS = {
  animals: ['🦁','🐻','🦊','🐱','🐧','🐼','🦄','🐢','🐝','🐯','🐘','🐮','🐰','🐵','🦅'],
  sport:   ['⚽','🏀','🎾','🏈','⚾','🎱','🏐','🥎','🏓','🎯','🏒','⛳'],
  emoji:   ['😀','😎','🤩','😍','🥳','😴','🤔','😱','🔥','⭐','💎','❤️','✨','🌈','🎵']
}

function switchIllusTab(tab, tabEl) {
  document.querySelectorAll('.illus-tab').forEach(t => t.classList.remove('active'))
  if (tabEl) tabEl.classList.add('active')
  const grid = document.getElementById('illusGrid')
  if (!grid) return
  const currentEmoji = lastServerState?.ballEmoji || null
  grid.innerHTML = `<button class="illus-emoji-btn illus-clear${!currentEmoji ? ' active' : ''}" title="None" onclick="setIllustration(null,this)">✕</button>`
  for (const e of (ILLUS_TABS[tab] || [])) {
    const btn = document.createElement('button')
    btn.className = 'illus-emoji-btn' + (currentEmoji === e ? ' active' : '')
    btn.textContent = e
    btn.onclick = function() { setIllustration(e, this) }
    grid.appendChild(btn)
  }
}

function setTrackBand(band) {
  document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'))
  const btn = document.querySelector(`.pos-btn[data-band="${band}"]`)
  if (btn) btn.classList.add('active')
  if (lastServerState) lastServerState.trackBand = band
  if (previewPhysicsEngine) previewPhysicsEngine.options.trackBand = band
  if (globalThis.__current?.isInitializing) return
  if (isPlaying) {
    // Pause-center-resume cycle so ball snaps to new band center on unpause
    globalThis.__suppressPauseNotification = true
    safeSend(WS_MSG.controllerUpdate, { paused: true, returnToCenter: true })
    if (previewPhysicsEngine) {
      centerBallInViewer()
      previewPhysicsEngine.setPaused(true)
    }
    setTimeout(() => {
      safeSend(WS_MSG.controllerUpdate, { paused: false, trackBand: band })
      if (previewPhysicsEngine) previewPhysicsEngine.setPaused(false)
      setTimeout(() => { globalThis.__suppressPauseNotification = false }, 600)
    }, 400)
  } else {
    safeSend(WS_MSG.controllerUpdate, { trackBand: band })
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
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'ballColor', value: color } })) } catch (_) { /* noop */ }
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
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'ballSize', value: size } })) } catch (_) { /* noop */ }
}
function setSoundEnabled(enabled) {
  if (globalThis.__current?.isInitializing) {
    return
  }
  if (!globalThis.__current?.viewerConnected) {
    showViewerNotConnectedWarning()
    return
  }
  safeSend(WS_MSG.controllerUpdate, { soundEnabled: Boolean(enabled) })
  if (lastServerState) {
    lastServerState.soundEnabled = Boolean(enabled)
  }
  updateViewerAudioIndicators()
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'soundEnabled', value: Boolean(enabled) } })) } catch (_) { /* noop */ }
}
function setSoundType(soundType) {
  if (globalThis.__current?.isInitializing) {
    return
  }
  if (!globalThis.__current?.viewerConnected) {
    showViewerNotConnectedWarning()
    return
  }
  safeSend(WS_MSG.controllerUpdate, { soundType: soundType })
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'soundType', value: soundType } })) } catch (_) { /* noop */ }
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
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'bgColor', value: color } })) } catch (_) { /* noop */ }
}
function updateDirectionButtons() {
  const currentMode = getCurrentDirectionMode()
  const directionButtons = document.querySelectorAll('[data-mode]')
  for (const button of directionButtons) {
    button.classList.toggle('active', button.dataset.mode === currentMode)
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
      button.classList.toggle('active', mode === currentMode)
    }
  }
}
/**
 * Получает иконку и текст для текущего режима направления
 */
function getDirectionInfo(mode) {
  switch (mode) {
    case 'horizontal':
      return {
        text:
          globalThis.i18n?.t('controller.horizontalFull') || '↔️ Horizontal',
        icon: '↔️'
      }
    case 'vertical':
      return {
        text: globalThis.i18n?.t('controller.verticalFull') || '↕️ Vertical',
        icon: '↕️'
      }
    case 'diagRL':
      return {
        text: globalThis.i18n?.t('controller.diagLTRB') || '↘️ Diagonal',
        icon: '↘️'
      }
    case 'diagRLL':
      return {
        text: globalThis.i18n?.t('controller.diagLBRT') || '↗️ Diagonal',
        icon: '↗️'
      }
    case 'random':
      return {
        text: globalThis.i18n?.t('controller.randomFull') || '🎲 Random',
        icon: '🎲'
      }
    case 'infinity':
      return {
        text: globalThis.i18n?.t('controller.infinityFull') || '∞ Infinity',
        icon: '∞'
      }
    default:
      return {
        text: globalThis.i18n?.t('controller.unknownDirection') || '❓ Unknown',
        icon: '❓'
      }
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
      const currentMode = getCurrentDirectionMode()
      const directionInfo = getDirectionInfo(currentMode)
      directionText = directionInfo.text
      directionIcon = directionInfo.icon
    }
    if (directionDisplay) {
      directionDisplay.textContent = directionIcon || '❓'
      directionDisplay.title = directionText
    }
    const fsDirectionDisplay = document.getElementById('fsCurrentDirection')
    if (fsDirectionDisplay) {
      fsDirectionDisplay.textContent = directionDisplay?.textContent || directionIcon || '❓'
    }
  } catch (error) {
    console.error('Ошибка обновления отображения направления:', error)
  }
}
function updatePlayPauseButton() {
  const button = document.getElementById('playPauseBtn')
  if (button) {
    if (isPlaying) {
      button.textContent = globalThis.i18n?.t('controller.stop') || '⏸ Stop'
      button.classList.add('playing')
      button.disabled = false // Кнопка активна при воспроизведении
    } else {
      button.textContent = globalThis.i18n?.t('controller.start') || '▶️ Start'
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
  // Не отправляем команды во время инициализации
  if (globalThis.__current?.isInitializing) {
    return
  }
  if (!globalThis.__current?.viewerConnected) {
    if (shouldPlay) showViewerNotConnectedWarning()
    return
  }
  const currentMode = getCurrentDirectionMode()
  const payload = shouldPlay
    ? {
        paused: false,
        ...(getDirectionVector(currentMode) || { dirX: 1, dirY: 0 }),
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
    if (shouldPlay) {
      // Don't unpause preview yet — wait for first server state_update to sync position.
      // This prevents jitter caused by preview moving ahead of server during network latency.
      const dirOnly = { ...payload }
      delete dirOnly.paused
      previewPhysicsEngine.applyCommand(dirOnly)
      previewPhysicsEngine._pendingPlaySync = true
      previewPhysicsEngine._hasReceivedFirstMovingUpdate = false
     } else {
       previewPhysicsEngine._pendingPlaySync = false
       // applyCommand with returnToCenter: true will trigger smooth seek-center animation.
       // Don't call centerBallInViewer() — it uses setPosition() which kills the animation.
       previewPhysicsEngine.applyCommand(payload)
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
  const targetCanvas = isPreviewFullscreen && previewFsCanvas ? previewFsCanvas : globalThis.__previewCanvas

  const canScale =
    globalThis.__current.viewerScreenSize &&
    targetCanvas &&
    state
  if (canScale) {
    const viewerSize = globalThis.__current.viewerScreenSize
    const previewSize = {
      width: targetCanvas.width,
      height: targetCanvas.height
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
  const previewWrap = document.getElementById('previewWrap')
  if (viewerStatusEl) {
    if (globalThis.__current.viewerConnected) {
      viewerStatusEl.textContent =
        globalThis.i18n?.t('controller.viewerConnected') || 'Connected'
      viewerStatusEl.classList.add('connected')
      viewerStatusEl.classList.remove('disconnected')
      viewerStatusEl.style.fontWeight = '600'
      hideWaitingForViewer()
      // Show screen size if available, otherwise keep waiting message
      if (globalThis.__current.viewerScreenSize?.width > 0) {
        updateViewerInfo(globalThis.__current.viewerScreenSize)
      }
      if (globalThis.__current.viewerScreenSize?.width > 0) {
        updatePreviewSize(globalThis.__current.viewerScreenSize)
      }
      setControlsEnabled(true)
      if (previewWrap) previewWrap.classList.add('viewer-connected')
    } else {
      viewerStatusEl.textContent =
        globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
      viewerStatusEl.classList.add('disconnected')
      viewerStatusEl.classList.remove('connected')
      viewerStatusEl.style.fontWeight = '400'
      showWaitingForViewer()
      setControlsEnabled(false)
      if (previewWrap) previewWrap.classList.remove('viewer-connected')
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
    viewInput.placeholder =
      (globalThis.i18n?.t('controller.waitingViewer') || 'Waiting for viewer') +
      '...'
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
  const viewerAudioActivated =
    globalThis.__current?.viewerAudioActivated ?? false
  const currentState = `${soundEnabled}-${viewerAudioActivated}`
  if (updateViewerAudioIndicators._lastState === currentState) return
  updateViewerAudioIndicators._lastState = currentState
  if (soundEnabled) {
    if (!viewerAudioActivated) {
      audioIndicator.classList.remove('hidden', 'ready')
      audioIndicator.classList.add('warning')
      audioText.textContent =
        globalThis.i18n?.t('controller.viewerSoundNotActivated') ||
        'Waiting: viewer must click "Enable sound"'
    } else {
      audioIndicator.classList.remove('hidden', 'warning')
      audioIndicator.classList.add('ready')
      audioText.textContent =
        globalThis.i18n?.t('controller.viewerHearingSound') ||
        'Viewer sound activated'
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
      previewFsRenderer = new BallRenderer(
        previewFsCanvas,
        previewPhysicsEngine,
        {
          localPhysics: false
        }
      )
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
  history.pushState(
    { fullscreen: true, returnUrl: currentUrl },
    '',
    fullscreenUrl
  )
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
  // Restore preview to correct size after fullscreen
  const canvas = document.getElementById('preview')
  const vs = globalThis.__current?.viewerScreenSize
  if (canvas) {
    if (vs && vs.width > 0 && vs.height > 0) {
      const { previewWidth, previewHeight } = calculatePreviewDimensions(canvas, vs)
      setCanvasDimensions(canvas, previewWidth, previewHeight)
      if (previewPhysicsEngine) {
        previewPhysicsEngine.setWorldSize(vs.width, vs.height)
      }
    } else {
      canvas.width = 500
      canvas.height = 250
      canvas.style.width = '500px'
      canvas.style.height = '250px'
      if (previewPhysicsEngine) {
        previewPhysicsEngine.setWorldSize(500, 250)
      }
    }
    if (previewPhysicsEngine) {
      const cx = previewPhysicsEngine.options.worldWidth / 2
      const cy = previewPhysicsEngine.options.worldHeight / 2
      previewPhysicsEngine.setPosition(cx, cy)
      previewPhysicsEngine.setVelocity(0, 0)
      previewPhysicsEngine.setPaused(true)
    }
  }
}
function resizePreviewFullscreen() {
  if (!previewFsCanvas) return
  previewFsCanvas.width = globalThis.innerWidth
  previewFsCanvas.height = globalThis.innerHeight
  // Override CSS 100vw/100vh with explicit px values so BallRenderer.renderLoop()
  // sees clientWidth === canvas.width and doesn't call resize() which would
  // overwrite the viewer world size with canvas dimensions, shifting the ball
  previewFsCanvas.style.width = globalThis.innerWidth + 'px'
  previewFsCanvas.style.height = globalThis.innerHeight + 'px'
  if (previewPhysicsEngine) {
    const vs = globalThis.__current?.viewerScreenSize
    if (vs && vs.width > 0 && vs.height > 0) {
      previewPhysicsEngine.setWorldSize(vs.width, vs.height)
    } else {
      previewPhysicsEngine.setWorldSize(
        globalThis.innerWidth,
        globalThis.innerHeight
      )
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
  panel.addEventListener('mousedown', (e) => {
    onDown(e.clientX, e.clientY)
  })
  overlay.addEventListener('mousemove', (e) => {
    onMove(e.clientX, e.clientY)
  })
  globalThis.addEventListener('mouseup', onUp)
  panel.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0]
      onDown(t.clientX, t.clientY)
    },
    { passive: true }
  )
  overlay.addEventListener(
    'touchmove',
    (e) => {
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
  const handleTouchStart = (e) => {
    const t = e.touches[0]
    startX = t.clientX
    startY = t.clientY
    swiping = true
  }
  const handleTouchEnd = (e) => {
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
    speed.oninput = (e) => {
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
    if (btn) {
      // Устанавливаем background-color из data-color атрибута
      const color = btn.dataset.color || ballColors[i - 1]
      btn.style.backgroundColor = color
      btn.onclick = () => setBallColor(color)
    }
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
    if (btn) {
      // Устанавливаем background-color из data-color атрибута
      const color = btn.dataset.color || bgColors[i - 1]
      btn.style.backgroundColor = color
      btn.onclick = () => setBackgroundColor(color)
    }
  }
}
function fillFsSessionInfo() {
  try {
    const sid = globalThis.__current?.sessionId ?? '...'
    const fsSid = document.getElementById('fsCurSid')
    if (fsSid) fsSid.textContent = `SID: ${sid}`
    const fsLink = document.getElementById('fsViewLink')
    if (fsLink) fsLink.value = buildViewerUrl(sid)
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
    statusText.textContent =
      globalThis.i18n?.t('controller.viewerConnected') || 'Connected'
  } else {
    fsViewerStatus.classList.remove('connected')
    statusText.textContent =
      globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
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
    showNotification(
      globalThis.i18n?.t('controller.sessionReset') || 'Session reset',
      'info'
    )
  } catch (error) {
    console.error('Session reset error:', error)
    showNotification(
      globalThis.i18n?.t('controller.sessionResetError') ||
        'Error resetting session',
      'error'
    )
  }
}
/**
 * Отображает уведомление пользователю
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип уведомления ('info', 'success', 'warning', 'error')
 */
function showCriticalError(title, message) {
  if (globalThis.errorStateManager?.show) {
    globalThis.errorStateManager.show('critical-error', {
      title: title,
      message: message,
      actions: [
        {
          label: globalThis.i18n?.t('viewer.reload') || 'Reload page',
          callback: () => globalThis.location.reload()
        }
      ]
    })
  } else if (globalThis.emdrErrorOverlay) {
    globalThis.emdrErrorOverlay.show({
      title,
      message,
      actionText: globalThis.i18n?.t('viewer.reload') || 'Reload page',
      onAction: () => globalThis.location.reload()
    })
  } else {
    alert(`${title}\n\n${message}`)
  }
}
function showNotification(message, type = 'info') {
  try {
    // Используем errorStateManager для отображения уведомлений
    if (globalThis.errorStateManager?.show) {
      const t = globalThis.i18n?.t.bind(globalThis.i18n)
      const titles = {
        info: t?.('controller.info') || 'Info',
        success: t?.('controller.success') || 'Success',
        warning: t?.('controller.warning') || 'Warning',
        error: t?.('controller.errored') || 'Error'
      }
      globalThis.errorStateManager.show(`notification-${type}`, {
        title: titles[type] || 'Info',
        message: message,
        duration: type === 'error' ? 0 : 4000 // Ошибки не исчезают автоматически
      })
    } else if (globalThis.showSuccessToast && type === 'success') {
      globalThis.showSuccessToast(message)
    } else {
      // Fallback: показываем через alert для ошибок
      if (type === 'error') {
        alert(`Ошибка: ${message}`)
      }
    }
  } catch (error) {
    console.error('Error showing notification:', error)
    if (type === 'error') {
      alert(message)
    }
  }
}
/**
 * Отображает предупреждение о неподключенном вьювере
 * Унифицированный обработчик для всех контролов
 */
function showViewerNotConnectedWarning() {
  // Не показываем варнинг во время инициализации
  if (globalThis.__current?.isInitializing) {
    return
  }

  const _t = (key, fallback) => {
    const v = globalThis.i18n?.t(key)
    return v && v !== key ? v : fallback
  }
  const title = _t(
    'controller.viewerNotConnectedWarning',
    'Viewer not connected'
  )
  const message = _t(
    'controller.viewerNotConnectedMessage',
    'Share the viewer link with your client so they can join the session.'
  )

  // Используем errorStateManager для отображения предупреждения
  if (globalThis.errorStateManager?.show) {
    globalThis.errorStateManager.show('viewer-not-connected', {
      title: title,
      message: message,
      duration: 8000 // Увеличиваем время отображения до 8 секунд
    })
  } else {
    // Fallback: показываем через alert если errorStateManager недоступен
    showNotification(`${title}: ${message}`, 'warning')
  }
}
/**
 * Проверяет подключение вьювера перед выполнением действия
 * @param {Function} action - Действие для выполнения, если вьювер подключен
 * @param {boolean} showWarning - Показывать ли предупреждение при отсутствии подключения
 * @returns {boolean} - true если вьювер подключен, false иначе
 */
function requireViewerConnection(action, showWarning = true) {
  if (!globalThis.__current?.viewerConnected) {
    if (showWarning) {
      showViewerNotConnectedWarning()
    }
    return false
  }
  if (typeof action === 'function') {
    action()
  }
  return true
}

/**
 * Single delegated handler on <main> — covers all controls including dynamically added ones.
 * Idempotent: subsequent calls are no-ops (delegated handler is already active).
 */
function initViewerConnectionWarnings() {
  const main = document.querySelector('main.wrap')
  if (!main || main._viewerGuardAdded) return
  main._viewerGuardAdded = true
  // Block clicks on controls that require viewer connection
  main.addEventListener(
    'click',
    (event) => {
      if (globalThis.__current?.viewerConnected) return
      if (globalThis.__current?.isInitializing) return
      const t = event.target
      const inControl = t.closest(
        '.controls-card, .session-actions-row, #presetControls, .presets-details, #previewFsPanel'
      )
      if (!inControl) return
      const isExempt = t.closest(
        '.link-group, #autoStopRow, .session-stats-row, .drag-handle, #toggleDebugBtn, .fs-close-btn, .fs-panel-header'
      )
      if (isExempt) return
      event.stopImmediatePropagation()
      event.preventDefault()
      showViewerNotConnectedWarning()
    },
    true
  )
}

/**
 * Переключает отображение отладочной информации на preview
 */
function toggleDebugOverlay() {
  if (globalThis.BBDebug && typeof globalThis.BBDebug.toggle === 'function') {
    globalThis.BBDebug.toggle()
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
globalThis.showViewerNotConnectedWarning = showViewerNotConnectedWarning
globalThis.requireViewerConnection = requireViewerConnection
globalThis.reinitializeViewerConnectionWarnings = initViewerConnectionWarnings
globalThis.toggleDebugOverlay = toggleDebugOverlay
globalThis.setIllustration = setIllustration
globalThis.applyCustomIllustration = applyCustomIllustration
globalThis.switchIllusTab = switchIllusTab
globalThis.setTrackBand = setTrackBand

// Инициализация обработчиков предупреждений после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initViewerConnectionWarnings)
} else {
  initViewerConnectionWarnings()
}

module.exports = { initializeController }
