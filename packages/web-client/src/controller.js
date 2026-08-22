/* jshint esversion: 11, browser: true, node: true, -W119 */
/* global globalThis, WS_MSG, AudioManager, BallRenderer, getSessionIdFromUrl, RealtimeClient, debugWarn, debugError */
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
const _ViewerStatus = require('./application/controller/viewer-status')
const _PlayPause = require('./application/controller/play-pause')
const _UIControls = require('./application/controller/ui-controls')
const _UISync = require('./application/controller/ui-sync')
const _Fullscreen = require('./application/controller/fullscreen')
const _Notifications = require('./application/controller/notifications')
const _BrainspottingDrag = require('./application/controller/brainspotting-drag')
const _Settings = require('./application/controller/settings')
const _DirectionUI = require('./application/controller/direction-ui')
const { applyAdaptiveSmoothing } = require('@emdr/shared/smoothing-utils')
const {
  getDirectionVector,
  isDiagonalMode,
  getCurrentDirectionMode,
  setCurrentDirectionMode,
  setDirectionState,
  recalculateDiagonalDirection
} = require('./domain/direction')
const {
  bbCounters,
  detectAndCountBounceFromServer
} = require('./domain/counters')
globalThis.PhysicsEngine = PhysicsEngine

// Wire viewer-status module (deps are function declarations → hoisted)
_ViewerStatus.init({
  hideWaitingForViewer,
  updatePreviewSize,
  setControlsEnabled,
  showWaitingForViewer,
  updateViewerInfo,
  getLastServerState: () => lastServerState
})

// Wire play-pause module — deps connected at runtime when called
_PlayPause.init()

// Wire notifications module
const {
  showCriticalError,
  showNotification,
  showViewerNotConnectedWarning,
  showViewerSizeNotReadyWarning,
  requireViewerConnection,
  initViewerConnectionWarnings,
  toggleDebugOverlay
} = _Notifications

// Wire direction-ui module (must be before _UISync which references its exports)
_DirectionUI.init({
  getCurrentDirectionMode
})
const { updateDirectionButtons, updateDirectionDisplay } = _DirectionUI

// Destructure brainspotting-drag exports before _UISync.init references disableBrainspottingDrag
const { enable: enableBrainspottingDrag, disable: disableBrainspottingDrag } =
  _BrainspottingDrag

// Wire ui-sync module
_UISync.init(globalThis.components, {
  getLastServerState: () => lastServerState,
  getPreviewPhysicsEngine: () => previewPhysicsEngine,
  getIgnorePausedUntilTs: () => globalThis.__ignoreServerPausedUntilTs ?? 0,
  getIgnoreDirectionUntilTs: () => __ignoreServerDirectionUntilTs,
  getCurrentDirectionMode,
  setDirectionState,
  setCurrentDirectionMode,
  setIsPlaying: (v) => {
    isPlaying = v
    _PlayPause.setIsPlaying(v)
  },
  syncFsPlayPauseButton: _PlayPause.syncFsPlayPauseButton,
  updatePlayPauseButton: _PlayPause.updatePlayPauseButton,
  updateDirectionButtons,
  updateDirectionDisplay,
  updateViewerStatusUI: _ViewerStatus.updateStatusUI,
  updateViewerLinkVisualState: _ViewerStatus.updateLinkVisualState,
  updateViewerAudioIndicators: _ViewerStatus.updateAudioIndicators,
  disableBrainspottingDrag
})

/**
 * Controller - Логика управления сессией BilateralBound v2.2
 * Модульная архитектура с улучшенной обработкой ошибок
 * @version 2.2
 * @module Controller
 */
/* exported setDirection, resetCenter, updateSpeed, setBallColor, setBallSize, setBackgroundColor, togglePlayPause, resetSession, setSoundEnabled, setSoundType, showViewerSizeNotReadyWarning */
/* global debugWarn, debugError, RealtimeClient */

// Wire settings module
_Settings.init({
  safeSend: (type, payload) => safeSend(type, payload),
  getLastServerState: () => lastServerState,
  getPreviewPhysicsEngine: () => previewPhysicsEngine,
  getIsPlaying: () => isPlaying,
  showViewerNotConnectedWarning,
  updateAudioIndicators: () => _ViewerStatus.updateAudioIndicators(),
  setPreviewBackgroundColor: (color) =>
    _Fullscreen.setPreviewBackgroundColor(color),
  centerBallInViewer: () => centerBallInViewer(),
  debugWarn
})
const {
  updateSpeed,
  setBallColor,
  setBallSize,
  setSoundEnabled,
  setSoundType,
  setBallSizeMultiplier,
  setBackgroundColor,
  setIllustration,
  applyCustomIllustration,
  switchIllusTab,
  setTrackBand
} = _Settings

// Wire brainspotting drag module
_BrainspottingDrag.init({
  getPreviewPhysicsEngine: () => previewPhysicsEngine,
  safeSend: (type, payload) => safeSend(type, payload)
})

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
let __ignoreServerDirectionUntilTs = 0 // Кратковременная блокировка переопределения направления сервером
let previewPhysicsEngine = null // Локальный движок физики для превью
let hiddenThrottleMs = 100 // при скрытой вкладке обновляем ~10 FPS
if (globalThis.BBConfig?.rendering?.hiddenThrottleMs != null) {
  hiddenThrottleMs = globalThis.BBConfig.rendering.hiddenThrottleMs
}
let physicsInterval = null // Глобальный интервал физики для возможности остановки извне
let _previewRafLast = 0 // Timestamp последнего rAF кадра для dt физики
let previewFsCanvas = null
let isPreviewFullscreen = false
let _syncMonitorTimer = null
let _waitingTimerInterval = null // Timer counting time since session creation while waiting for viewer

function startSyncMonitor() {
  stopSyncMonitor()
  _syncMonitorTimer = setInterval(() => {
    if (!previewPhysicsEngine || !wsClient?.isConnected) return
    if (
      previewPhysicsEngine.state?.paused ||
      previewPhysicsEngine.state?.stopping
    )
      return
    const diag = previewPhysicsEngine.getSyncDiagnostics
      ? previewPhysicsEngine.getSyncDiagnostics()
      : null
    if (!diag) return
    if (diag.driftPx > 120 || diag.jitterMs > 35) {
      debugWarn(
        `[SYNC_MONITOR][controller] drift=${diag.driftPx}px jitter=${diag.jitterMs}ms spring=${diag.springActive}`
      )
      // Track sync drift in Metrika
      try {
        globalThis.dispatchEvent(
          new CustomEvent('bb_metrika_sync_drift', {
            detail: {
              driftPx: diag.driftPx,
              jitterMs: diag.jitterMs,
              role: 'controller'
            }
          })
        )
      } catch (_) {
        /* noop */
      }
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
  initHintSystem()
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
 * Hides the Brainspotting direction button on production hosts until the
 * feature is ready. BSP stays available on dev (dev.emdrbilateral.online)
 * and localhost.
 */
function _hideBrainspottingOnProduction() {
  try {
    const host = window.location.hostname || ''
    const isProdHost = /(^|\.)emdrbilateral\.(online|ru)$/.test(host)
    if (!isProdHost) return
    const btn = document.querySelector('.dir-brainspotting-btn')
    if (btn) btn.style.display = 'none'
  } catch (err) {
    debugWarn('Unable to hide brainspotting on production:', err)
  }
}

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
    _hideBrainspottingOnProduction()
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
  _Fullscreen.initFullscreen(previewFsCanvas, {
    getPreviewPhysicsEngine: () => previewPhysicsEngine,
    centerBallInViewer,
    setDirection,
    togglePlayPause,
    updateSpeed,
    setBallSize,
    setBallSizeMultiplier,
    setBallColor,
    setBackgroundColor,
    getIsPlaying: () => _PlayPause.getIsPlaying(),
    getComponents: () => components,
    calculatePreviewDimensions,
    setCanvasDimensions,
    syncFsPlayPauseButton: _PlayPause.syncFsPlayPauseButton,
    buildViewerUrl
  })
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
  const label =
    i18n?.isReady &&
    i18n.t('controller.sessionCreated') !== 'controller.sessionCreated'
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
      globalThis
        .csrfFetch(`/api/session/${sessionId}/language`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: currentLang })
        })
        .catch(() => {})
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
          if (performance.now() < (globalThis.__ignoreServerPausedUntilTs ?? 0))
            return
          // Verify server is actually playing before restoring local state
          try {
            const resp = await globalThis.csrfFetch(
              `/api/session/${sessionId}/state`
            )
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
          _PlayPause.updatePlayPauseButton()
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
      _PlayPause.updatePlayPauseButton()
    }
    _ViewerStatus.updateStatusUI()
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
      // Track session ready (both viewer+controller connected)
      if (!wasConnected) {
        try {
          globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_ready'))
        } catch (_) {
          /* noop */
        }
      }
      _ViewerStatus.updateStatusUI()
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
      _PlayPause.updatePlayPauseButton()
      _ViewerStatus.updateStatusUI()
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
    _ViewerStatus.updateAudioIndicators() // Обновляем индикаторы звука
    _ViewerStatus.updateStatusUI() // Update status UI with connection info

    // Update session timestamp display after initial state is received
    updateSessionTimestampDisplay()
  })
  wsClient.on(WS_MSG.stateUpdate, (state) => {
    lastServerState = state // Кэшируем состояние
    if (typeof state.viewerConnected === 'boolean') {
      const wasConnected = globalThis.__current.viewerConnected
      globalThis.__current.viewerConnected = state.viewerConnected
      if (wasConnected !== state.viewerConnected) {
        _ViewerStatus.updateStatusUI()
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
        _ViewerStatus.updateStatusUI()
        if (isPreviewFullscreen) {
          _ViewerStatus.updateFullscreenStatus()
        }
      }
    }
    applyServerStateToPreview(state)
    _ViewerStatus.updateAudioIndicators() // Обновляем индикаторы звука при каждом обновлении состояния
    _UISync.syncPause(state)
    _UISync.syncInfinity(state)
    _UISync.syncDirection(state)
  })
  wsClient.on(WS_MSG.netMetrics, ({ jitterMs }) => {
    applyAdaptiveSmoothing(previewPhysicsEngine, jitterMs)
  })
  wsClient.on(WS_MSG.viewerAudioActivated, (data) => {
    if (globalThis.__current) {
      globalThis.__current.viewerAudioActivated = data.activated
    }
    _ViewerStatus.updateAudioIndicators()
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
    _PlayPause.updatePlayPauseButton()
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
    const isMoving =
      !previewPhysicsEngine.state.paused &&
      !previewPhysicsEngine.state.stopping
    if (
      isMoving &&
      typeof state.x === 'number' &&
      typeof state.y === 'number'
    ) {
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
        const driftThreshold =
          previewPhysicsEngine.options.smoothing?.driftThresholdPx || 100
        const isNearWall = previewPhysicsEngine._isNearWall()

        // VECTOR GUARDING: If client and server disagree on direction near a wall,
        // the client MUST remain authoritative.
        const directionMismatchX = serverVx * previewPhysicsEngine.ball.vx < 0
        const directionMismatchY = serverVy * previewPhysicsEngine.ball.vy < 0
        const isMismatched = directionMismatchX || directionMismatchY

        if (
          isNearWall ||
          isMismatched ||
          (velocitiesMatch && posDrift < driftThreshold)
        ) {
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
    performance.now() >= (globalThis.__ignoreServerPausedUntilTs ?? 0)
  ) {
    previewPhysicsEngine.setPaused(state.paused)
    // Reset first-update flag on pause so next play starts with hard-snap
    if (state.paused) {
      previewPhysicsEngine._hasReceivedFirstMovingUpdate = false
    }
  }
  if (
    typeof pausedState === 'boolean' &&
    performance.now() >= (globalThis.__ignoreServerPausedUntilTs ?? 0)
  ) {
    // Sync isPlaying with server state (only when user hasn't recently toggled)
    const newIsPlaying = !state.paused
    if (isPlaying !== newIsPlaying) {
      isPlaying = newIsPlaying
      _PlayPause.updatePlayPauseButton()
      // Show notification when viewer toggles play/pause (no title, just message)
      // Suppress during direction change pause/resume cycle
      if (!globalThis.__suppressPauseNotification) {
        const _t = (k, fallback) => globalThis.i18n?.t(k) || fallback
        if (state.paused) {
          globalThis.notificationSystem?.info(
            '',
            _t('controller.viewerStopped', 'Viewer stopped')
          )
        } else {
          globalThis.notificationSystem?.info(
            '',
            _t('controller.viewerStarted', 'Viewer started')
          )
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
// (brainspotting drag functions extracted to application/controller/brainspotting-drag.js)

function syncUIWithState(ballState) {
  try {
    _UISync.syncAll(ballState)
  } catch (err) {
    debugWarn('Error in syncUIWithState:', err)
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
  _UIControls.initializeComponents({
    onSpeedChange: updateSpeed,
    onBallColorChange: setBallColor,
    onBgColorChange: setBackgroundColor,
    onSizeChange: setBallSize,
    onSoundEnabledChange: setSoundEnabled,
    onSoundTypeChange: setSoundType,
    getLastServerState: () => lastServerState,
    updateAudioIndicators: _ViewerStatus.updateAudioIndicators,
    updateDirectionDisplay
  })
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
// (settings functions extracted to application/controller/settings.js)

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
        localPhysics: true, // Use accumulator-based alpha for smoother interpolation
        preserveWorldSize: true // Preview canvas ≠ viewer world; prevent canvas resize from overwriting world size
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
    viewerInfo.classList.remove('hidden')
  }
  // Start elapsed timer — counts seconds since session creation
  startWaitingTimer()
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
  stopWaitingTimer()
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.classList.add('hidden')
  }
}
/**
 * Start elapsed timer showing how long controller has been waiting for viewer.
 */
function startWaitingTimer() {
  stopWaitingTimer()
  const startTs = globalThis.__current?.sessionCreatedAt || Date.now()
  if (!globalThis.__current) globalThis.__current = {}
  globalThis.__current.sessionCreatedAt = startTs

  function tick() {
    const elapsed = Math.floor((Date.now() - startTs) / 1000)
    const min = Math.floor(elapsed / 60)
    const sec = elapsed % 60
    const timeStr = min + ':' + (sec < 10 ? '0' : '') + sec
    const base =
      globalThis.i18n?.t('controller.waitingForViewerConnection') ||
      'Waiting for viewer connection'
    const viewerInfo = document.getElementById('viewerInfo')
    if (viewerInfo) {
      viewerInfo.textContent = base + ' — ' + timeStr
    }
  }
  tick()
  _waitingTimerInterval = setInterval(tick, 1000)
}
function stopWaitingTimer() {
  if (_waitingTimerInterval) {
    clearInterval(_waitingTimerInterval)
    _waitingTimerInterval = null
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
      infinity: false,
      brainspotting: false
    })
    if (previewPhysicsEngine) {
      previewPhysicsEngine.setDirection(dirX, dirY)
      previewPhysicsEngine.setPaused(false)
    }
    // Allow pause notifications again after the resume broadcast is received
    setTimeout(() => {
      globalThis.__suppressPauseNotification = false
    }, 600)
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
    infinity: false,
    brainspotting: false
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
    // Exit infinity or brainspotting mode when switching to a different direction
    const exitingSpecialMode =
      (lastServerState?.infinity && directionMode !== 'infinity') ||
      (lastServerState?.brainspotting && directionMode !== 'brainspotting')
    if (exitingSpecialMode) {
      if (previewPhysicsEngine) {
        previewPhysicsEngine.ball.infinity = false
        previewPhysicsEngine._infinityT = 0
        previewPhysicsEngine.ball.brainspotting = false
      }
      if (lastServerState) {
        lastServerState.infinity = false
        lastServerState.brainspotting = false
      }
      disableBrainspottingDrag()
    }

    if (directionMode === 'infinity') {
      setCurrentDirectionMode('infinity')
      __ignoreServerDirectionUntilTs = performance.now() + 1500
      if (previewPhysicsEngine) {
        previewPhysicsEngine.ball.infinity = true
        previewPhysicsEngine._infinityT = 0
      }
      // Track infinity mode usage
      try {
        globalThis.dispatchEvent(
          new CustomEvent('bb_metrika_feature_used', {
            detail: { feature: 'infinity', action: 'enable' }
          })
        )
      } catch (_) {
        /* noop */
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

    if (directionMode === 'brainspotting') {
      setCurrentDirectionMode('brainspotting')
      __ignoreServerDirectionUntilTs = performance.now() + 1500
      if (previewPhysicsEngine) {
        previewPhysicsEngine.ball.brainspotting = true
        previewPhysicsEngine.ball.infinity = false
      }
      try {
        globalThis.dispatchEvent(
          new CustomEvent('bb_metrika_feature_used', {
            detail: { feature: 'brainspotting', action: 'enable' }
          })
        )
      } catch (_) {
        /* noop */
      }
      if (lastServerState) {
        lastServerState.brainspotting = true
        lastServerState.infinity = false
      }
      updateDirectionButtons()
      updateDirectionDisplay(0, 0)
      safeSend(WS_MSG.controllerUpdate, {
        brainspotting: true,
        infinity: false,
        paused: false
      })
      // Enable mouse/touch drag on preview canvas for manual ball positioning
      enableBrainspottingDrag()
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
    try {
      globalThis.dispatchEvent(
        new CustomEvent('bb_metrika_settings_changed', {
          detail: { setting: 'direction', value: directionMode }
        })
      )
    } catch (e) {
      void e
    }
  } catch (error) {
    console.error('Ошибка установки направления:', error)
  }
}
// (settings functions extracted to application/controller/settings.js)
// (direction UI functions extracted to application/controller/direction-ui.js)

function _setPlayPauseState(shouldPlay) {
  const result = _PlayPause.setPlayPauseState(shouldPlay)
  isPlaying = _PlayPause.getIsPlaying()
  globalThis.isPlaying = isPlaying
  return result
}

function togglePlayPause() {
  _setPlayPauseState(!_PlayPause.getIsPlaying())
}

function _normalizeCoordinate(coord, fallback) {
  return typeof coord === 'number' && Number.isFinite(coord) ? coord : fallback
}
/**
 * Масштабирует состояние мяча из координат вьювера в координаты превью.
 * @param {object} state - Состояние мяча для масштабирования.
 * @returns {object} - Масштабированное состояние.
 */
function getScaledState(state) {
  const targetCanvas =
    isPreviewFullscreen && previewFsCanvas
      ? previewFsCanvas
      : globalThis.__previewCanvas

  const canScale =
    globalThis.__current.viewerScreenSize && targetCanvas && state
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
function openPreviewFullscreen() {
  _Fullscreen.openPreviewFullscreen()
  isPreviewFullscreen = _Fullscreen.isFullscreenActive()
}
function closePreviewFullscreen() {
  _Fullscreen.closePreviewFullscreen()
  isPreviewFullscreen = _Fullscreen.isFullscreenActive()
}
function resizePreviewFullscreen() {
  _Fullscreen.resizePreviewFullscreen()
}
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
 * Единая система подсказок контроллера: tip про ссылки + hotkeys.
 * Использует общий компонент HintBanner (public/js/ui/hint-banner.js).
 */
function initHintSystem() {
  if (typeof globalThis.HintBanner !== 'function') return
  // i18n подгружает переводы асинхронно (fetch /locales/<lang>/common.json).
  // Пока не готов — t() возвращает ключ вместо текста, ждём события i18nReady.
  if (!globalThis.i18n?.isReady) {
    globalThis.addEventListener('i18nReady', initHintSystem, { once: true })
    return
  }
  const t = (key, fallback) => globalThis.i18n?.t(key) || fallback

  // 1. 💡 Сохраните эти ссылки (links.tip)
  const tipContainer = document.getElementById('linkTipContainer')
  if (tipContainer) {
    new globalThis.HintBanner({
      container: tipContainer,
      type: 'info',
      message: t(
        'links.tip',
        '<strong>Save these links!</strong> They are permanent and will always work.'
      ),
      dismissKey: 'bb_hint_links_tip_dismissed',
      closeLabel: t('hint.close', 'Close hint')
    }).show()
  }

  // 2. ⌨️ Горячие клавиши
  const hkContainer = document.getElementById('hotkeysHintContainer')
  if (hkContainer) {
    const hotkeysHtml =
      '<kbd>Space</kbd> ' +
      t('controller.hotkeySpaceAction', '— Start/Stop') +
      ' &nbsp;·&nbsp; <kbd>F</kbd> ' +
      t('controller.hotkeyFAction', '— Fullscreen') +
      ' &nbsp;·&nbsp; <kbd>↑↓←→</kbd> ' +
      t('controller.hotkeyArrowsAction', '— Direction')
    new globalThis.HintBanner({
      container: hkContainer,
      type: 'info',
      icon: '⌨️',
      title: t('controller.hotkeysTitle', 'Hotkeys'),
      message: hotkeysHtml,
      dismissKey: 'bb_hotkeys_hint_dismissed',
      closeLabel: t('hint.close', 'Close hint')
    }).show()
  }
}
// (notification & warning functions extracted to application/controller/notifications.js)

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
globalThis.showViewerSizeNotReadyWarning = showViewerSizeNotReadyWarning
globalThis.showNotification = showNotification
globalThis.safeSend = safeSend
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
