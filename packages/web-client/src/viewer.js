/* jshint esversion: 11, browser: true, node: true */
/* global globalThis, localStorage, console, document, performance, BallRenderer, WebSocketClient, WS_MSG, AudioManager, sharedComponents, getSessionIdFromUrl, logger, debugError, debugLog, debugWarn, RealtimeClient */
'use strict'
// Initialize global state first
if (!globalThis.__current) globalThis.__current = {}

// Require dependencies (side effects populate globalThis)
require('./core/debug-logger')
require('./config')
require('./common')
require('./i18n/constants')
require('./i18n/i18n')
require('./i18n/language-selector')
require('./audio/audio-manager')
require('./rendering/renderer')
require('./network/websocket-client')
require('./network/realtime-client')
require('./network/csrf')
require('./ui/shared-components')

const PhysicsEngine = require('@emdr/shared/physics-engine')
const { applyAdaptiveSmoothing } = require('@emdr/shared/smoothing-utils')
globalThis.PhysicsEngine = PhysicsEngine

// ============================================================================
// Viewer Application Logic (moved from viewer.html inline <script>)
// ============================================================================

/**
 * @typedef {Object} StatusIndicatorComponent
 * @property {function(string, string): void} setStatus
 */

function showError(message) {
  console.error('❌ Viewer Error:', message)
  // Track viewer errors in Metrika
  try {
    globalThis.dispatchEvent(
      new CustomEvent('bb_metrika_viewer_error', {
        detail: { message: String(message).substring(0, 200) }
      })
    )
  } catch (_) {
    /* noop */
  }
  const loading = document.getElementById('loading')
  if (loading) {
    loading.textContent = '❌ ' + message
    loading.style.color = '#ef4444'
  }
  // Используем ту же систему что и контроллер
  if (globalThis.errorStateManager?.show) {
    globalThis.errorStateManager.show('critical-error', {
      title: globalThis.i18n?.t('viewer.errorTitle') || 'Connection Error',
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
      title: globalThis.i18n?.t('viewer.errorTitle') || 'Connection Error',
      message,
      actionText: globalThis.i18n?.t('viewer.reload') || 'Reload page',
      onAction: () => globalThis.location.reload()
    })
  } else {
    alert(
      `${globalThis.i18n?.t('viewer.errorTitle') || 'Connection Error'}\n\n${message}`
    )
  }
}

function hideLoading() {
  const loading = document.getElementById('loading')
  if (loading) {
    loading.style.display = 'none'
  }
}

// Centered banner over canvas for transient connection states
let _bannerEl = null
let _syncMonitorTimer = null

function startSyncMonitor() {
  stopSyncMonitor()
  _syncMonitorTimer = setInterval(() => {
    if (!physicsEngine || !wsClient?.isConnected) return
    if (physicsEngine.state?.paused || physicsEngine.state?.stopping) return
    const diag = physicsEngine.getSyncDiagnostics
      ? physicsEngine.getSyncDiagnostics()
      : null
    if (!diag) return
    if (diag.driftPx > 120 || diag.jitterMs > 35) {
      debugWarn(
        `[SYNC_MONITOR][viewer] drift=${diag.driftPx}px jitter=${diag.jitterMs}ms spring=${diag.springActive}`
      )
      // Track sync drift in Metrika for monitoring
      try {
        globalThis.dispatchEvent(
          new CustomEvent('bb_metrika_sync_drift', {
            detail: {
              driftPx: diag.driftPx,
              jitterMs: diag.jitterMs,
              role: 'viewer'
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

function _clearBanner() {
  if (_bannerEl) {
    while (_bannerEl.firstChild) _bannerEl.firstChild.remove()
  }
}

function showConnectionBanner(message, icon = '⚠️') {
  if (!_bannerEl) {
    const style = document.createElement('style')
    style.textContent = `
      #viewerConnectionBanner {
        position: fixed;
        inset: 0;
        z-index: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      #viewerConnectionBanner .vcb-card {
        background: rgba(2, 6, 23, 0.88);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(239, 68, 68, 0.35);
        border-radius: 16px;
        padding: 28px 40px;
        text-align: center;
        box-shadow: 0 0 40px rgba(239, 68, 68, 0.15), 0 8px 32px rgba(0,0,0,0.5);
        animation: vcbFadeIn 0.3s ease;
        max-width: 360px;
      }
      @keyframes vcbFadeIn {
        from { opacity: 0; transform: scale(0.92) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      #viewerConnectionBanner .vcb-icon {
        font-size: 2.5rem;
        margin-bottom: 12px;
        display: block;
      }
      #viewerConnectionBanner .vcb-text {
        font-size: 1.1rem;
        font-weight: 600;
        color: #f1f5f9;
        line-height: 1.4;
        letter-spacing: 0.01em;
      }
    `
    document.head.appendChild(style)
    _bannerEl = document.createElement('div')
    _bannerEl.id = 'viewerConnectionBanner'
    document.body.appendChild(_bannerEl)
  }
  _clearBanner()
  const card = document.createElement('div')
  card.className = 'vcb-card'
  const iconEl = document.createElement('span')
  iconEl.className = 'vcb-icon'
  iconEl.textContent = icon
  const textEl = document.createElement('span')
  textEl.className = 'vcb-text'
  textEl.textContent = message
  card.appendChild(iconEl)
  card.appendChild(textEl)
  _bannerEl.appendChild(card)
  _bannerEl.style.display = 'flex'
}

function hideConnectionBanner() {
  if (_bannerEl) {
    _bannerEl.style.display = 'none'
    _clearBanner()
  }
}

function resizeCanvas() {
  const canvas = document.getElementById('viewerCanvas')
  if (canvas) {
    canvas.width = globalThis.innerWidth
    canvas.height = globalThis.innerHeight
    canvas.style.width = canvas.width + 'px'
    canvas.style.height = canvas.height + 'px'
    if (physicsEngine) {
      physicsEngine.setWorldSize(globalThis.innerWidth, globalThis.innerHeight)
    }
  }
}

async function connectToSession(sessionId) {
  try {
    const response = await globalThis.csrfFetch(
      `/api/session/${sessionId}/viewer/connect`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenSize: {
            width: globalThis.innerWidth,
            height: globalThis.innerHeight
          }
        })
      }
    )
    if (response.ok) {
      debugLog('✅ Viewer connected to session')
    } else {
      debugWarn('⚠️ Failed to connect viewer to session')
    }
  } catch (error) {
    debugWarn('⚠️ Error connecting to session:', error)
  }
}

function updateStatus(data) {
  if (!globalThis.__current) {
    globalThis.__current = {}
  }
  if (typeof data.controllerConnected === 'boolean') {
    globalThis.__current.controllerConnected = data.controllerConnected
    console.log(
      '📊 [VIEWER] controllerConnected updated to:',
      data.controllerConnected
    )
  }
  if (!components.status) {
    return
  }
  const isControllerConnected = data.controllerConnected === true
  const isControllerDisconnected = data.controllerConnected === false
  if (isControllerConnected) {
    const msg =
      globalThis.i18n?.t('viewer.controllerConnected') ||
      'Controller connected'
    components.status.setStatus('success', msg)
  } else if (isControllerDisconnected) {
    const msg =
      globalThis.i18n?.t('viewer.waitingForController') ||
      'Waiting for controller...'
    components.status.setStatus('waiting', msg)
  }
}

function onStateUpdate(state) {
  if (
    state &&
    state.language &&
    state.language !== localStorage.getItem('emdr-language')
  ) {
    onLanguageUpdate({ language: state.language })
  }
  if (physicsEngine && state) {
    // When the server reports paused: true, strip x/y coordinates.
    // The server ball is already at center (server-mode returnToCenter
    // snaps instantly), but the viewer must animate smoothly from its
    // current position — not teleport. Receiving x/y=center from the
    // server would cause an abrupt jump that can trigger adverse
    // reactions in EMDR clients.
    if (state.paused === true) {
      const stateCopy = { ...state }
      delete stateCopy.x
      delete stateCopy.y
      delete stateCopy.vx
      delete stateCopy.vy
      updatePhysicsFromState(stateCopy)
    } else {
      updatePhysicsFromState(state)
    }
  }
  if (state && audioManager) {
    updateAudioFromState(state)
  }
  if (state && typeof state.controllerConnected === 'boolean') {
    updateStatus(state)
  }
}

function updatePhysicsFromState(state) {
  debugLog('📥 [VIEWER] Received state update:', state)

  // Capture viewer's current ball position BEFORE applying server state.
  // When server sends returnToCenter + paused, the server position is already
  // at center — we need to animate from the viewer's current position, not snap.
  const viewerBallX = physicsEngine.ball.x
  const viewerBallY = physicsEngine.ball.y
  const dxBefore = physicsEngine.centerX - viewerBallX
  const dyBefore = physicsEngine.centerY - viewerBallY
  const distBefore = Math.hypot(dxBefore, dyBefore)
  const isReturningToCenter =
    state.paused === true &&
    distBefore > physicsEngine.options.centerSnapThreshold

  // CLIENT-SIDE AUTHORITY: Parameter-based sync filter.
  // If the ball is moving and the server velocity matches local velocity closely,
  // AND the positional drift is below the correction threshold,
  // strip x/y from the state command so applyCommand only processes parameters
  // (speed, direction, paused) — not coordinates.
  // This prevents server position updates from interrupting smooth local physics
  // when the simulation is already in sync "by parameters".
  const stateToApply = { ...state }
  const isMoving = !physicsEngine.state.paused && !physicsEngine.state.stopping

  // Brainspotting mode: always accept x/y from controller (manual positioning).
  // The sync filter below strips coordinates to prevent jitter, but in
  // brainspotting mode the controller IS the authority for position.
  // The ball chases the received point smoothly instead of teleporting so
  // the client sees the same gentle motion as the therapist's cursor.
  if (
    physicsEngine.ball.brainspotting &&
    typeof stateToApply.x === 'number' &&
    typeof stateToApply.y === 'number'
  ) {
    physicsEngine.setBrainspottingTarget(stateToApply.x, stateToApply.y)
    // Still apply other params (color, radius, etc) but strip x/y to avoid double-apply
    delete stateToApply.x
    delete stateToApply.y
  }

  if (
    isMoving &&
    stateToApply.paused !== true && // always honour pause/unpause fully
    stateToApply.paused !== false &&
    typeof stateToApply.x === 'number' &&
    typeof stateToApply.y === 'number'
  ) {
    const serverVx = stateToApply.vx
    const serverVy = stateToApply.vy
    if (typeof serverVx === 'number' && typeof serverVy === 'number') {
      const velDx = Math.abs(serverVx - physicsEngine.ball.vx)
      const velDy = Math.abs(serverVy - physicsEngine.ball.vy)
      const velocitiesMatch = velDx < 10 && velDy < 10
      const posDrift = Math.hypot(
        stateToApply.x - physicsEngine.ball.x,
        stateToApply.y - physicsEngine.ball.y
      )
      const driftThreshold =
        physicsEngine.options.smoothing?.driftThresholdPx || 100
      const isNearWall = physicsEngine._isNearWall()

      // VECTOR GUARDING: If client and server disagree on direction near a wall,
      // the client MUST remain authoritative.
      const directionMismatchX = serverVx * physicsEngine.ball.vx < 0
      const directionMismatchY = serverVy * physicsEngine.ball.vy < 0
      const isMismatched = directionMismatchX || directionMismatchY

      if (
        isNearWall ||
        isMismatched ||
        (velocitiesMatch && posDrift < driftThreshold)
      ) {
        // Drop coordinate fields if:
        // 1. Near wall (immunity zone)
        // 2. Trajectories mismatch (one has bounced, other hasn't)
        // 3. Already in sync
        const reason = isMismatched
          ? 'vec mismatch'
          : isNearWall
            ? 'near wall'
            : 'drift=' + posDrift.toFixed(1) + 'px'
        debugLog('📥 [VIEWER] Skipping x/y: ' + reason)

        delete stateToApply.x
        delete stateToApply.y

        // Also ignore direction from server if we are mismatched or near wall
        if (isNearWall || isMismatched) {
          delete stateToApply.lastDirection
          delete stateToApply.dirX
          delete stateToApply.dirY
          delete stateToApply.vx
          delete stateToApply.vy
        }
      }
    }
  }

  physicsEngine.applyCommand(stateToApply)

  // If server sent returnToCenter + paused, force seekingCenter animation
  // from the viewer's pre-update position (not the snapped server position).
  if (isReturningToCenter && !physicsEngine.state.seekingCenter) {
    physicsEngine.state.seekingCenter = true
    physicsEngine._seekCenterStart = {
      x: viewerBallX,
      y: viewerBallY,
      ts: performance.now()
    }
    debugLog('🎯 [VIEWER] Forced seekCenter animation from viewer position', {
      fromX: viewerBallX.toFixed(1),
      fromY: viewerBallY.toFixed(1),
      distBefore: distBefore.toFixed(1)
    })
  }

  const isPaused = physicsEngine.state.paused
  const isNotSeeking = !physicsEngine.state.seekingCenter
  const isNotStopping = !physicsEngine.state.stopping
  if (isPaused && isNotSeeking && isNotStopping) {
    const dx = physicsEngine.centerX - physicsEngine.ball.x
    const dy = physicsEngine.centerY - physicsEngine.ball.y
    const distanceFromCenter = Math.hypot(dx, dy)
    if (distanceFromCenter > 2) {
      physicsEngine.state.seekingCenter = true
      physicsEngine._seekCenterStart = {
        x: physicsEngine.ball.x,
        y: physicsEngine.ball.y,
        ts: performance.now()
      }
    }
  }
  debugLog('📥 [VIEWER] Engine state after update:', {
    paused: physicsEngine.state.paused,
    seekingCenter: physicsEngine.state.seekingCenter
  })
}

function updateAudioFromState(state) {
  if (typeof state.soundEnabled === 'boolean') {
    debugLog('🔊 [VIEWER] soundEnabled from state:', state.soundEnabled)
    audioManager.setEnabled(state.soundEnabled)
    checkAudioOverlay()
  }
  if (state.soundType) {
    debugLog('🔊 [VIEWER] soundType from state:', state.soundType)
    audioManager.setSoundType(state.soundType)
  }
}

function onLanguageUpdate(data) {
  const language = data?.language
  if (!language) {
    debugWarn('❌ Invalid language update data:', data)
    return
  }
  debugLog('🌍 Language update received:', language)
  if (globalThis.i18n && typeof globalThis.i18n.setLanguage === 'function') {
    try {
      globalThis.i18n.setLanguage(language)
      debugLog('✅ Language applied:', language)
    } catch (err) {
      debugWarn('❌ Failed to apply language:', err.message)
    }
  } else {
    debugWarn('⚠️ i18n not available for language update')
  }
}

function setupEventListeners() {
  globalThis.addEventListener('resize', () => {
    resizeCanvas()
    if (wsClient) {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        wsClient
          .send('viewer_screen_size', {
            width: globalThis.innerWidth,
            height: globalThis.innerHeight
          })
          .catch(() => {})
      }, 300)
    }
  })

  globalThis.toggleFullscreen = function () {
    const fsEl =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      document.mozFullScreenElement
    if (!fsEl) {
      const el = document.documentElement
      const request =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.msRequestFullscreen ||
        el.mozRequestFullScreen
      if (request) {
        request.call(el).catch((err) => {
          debugWarn('Error attempting to enable fullscreen:', err)
        })
      }
    } else {
      const exit =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.msExitFullscreen ||
        document.mozCancelFullScreen
      if (exit) {
        exit.call(document).catch((err) => {
          debugWarn('Error attempting to exit fullscreen:', err)
        })
      }
    }
  }

  function updateFullscreenButton() {
    const btn = document.querySelector('.fullscreen-btn')
    if (!btn) return
    const isFs = !!document.fullscreenElement
    const key = isFs ? 'viewer.exitFullscreen' : 'viewer.fullscreen'
    const fallback = isFs ? '⛶ Exit' : '⛶ Fullscreen'
    btn.textContent = globalThis.i18n?.t ? globalThis.i18n.t(key) : fallback
    if (btn instanceof HTMLElement) {
      btn.dataset.i18n = key
    }
  }

  function onFullscreenChange() {
    updateFullscreenButton()
    resizeCanvas()
    if (wsClient) {
      wsClient
        .send('viewer_screen_size', {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight
        })
        .catch(() => {})
    }
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
  document.addEventListener('mozfullscreenchange', onFullscreenChange)

  globalThis.addEventListener('i18nReady', () => {
    if (globalThis.i18n?.applyTranslations) {
      globalThis.i18n.applyTranslations()
    }
    if (components.status?.currentStatus === 'idle') {
      const msg = globalThis.i18n?.t('viewer.connecting') || 'Connecting...'
      components.status.setStatus('idle', msg)
    }
  })

  globalThis.addEventListener('i18nLanguageChanged', () => {
    if (globalThis.i18n?.applyTranslations) {
      globalThis.i18n.applyTranslations()
    }
    updateFullscreenButton()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      if (wsClient && physicsEngine) {
        const currentPaused = physicsEngine.state?.paused ?? true
        const newPaused = !currentPaused
        debugLog(
          `[VIEWER] Space pressed: toggling pause from ${currentPaused} to ${newPaused}`
        )
        wsClient.send('viewer_update', { paused: newPaused })
      }
    }
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (typeof globalThis.toggleFullscreen === 'function') {
        globalThis.toggleFullscreen()
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (typeof globalThis.toggleFullscreen === 'function') {
        globalThis.toggleFullscreen()
      }
    }
  })
}

// Global variables
let wsClient
let physicsEngine
let ballRenderer
let audioManager = null
let audioActivated = false
let pendingSoundEnabled = false
const components = {}
let resizeTimeout = null

// Debounce for controller_disconnected — don't show banner for transient disconnects
let _controllerDisconnectTimer = null
const CONTROLLER_DISCONNECT_DEBOUNCE_MS = 5000 // 5s grace to avoid false alarms on flaky networks

if (typeof globalThis !== 'undefined') {
  globalThis.audioManager = audioManager
  globalThis.audioActivated = audioActivated
  globalThis.resetAudioActivation = function () {
    localStorage.removeItem('bb_audioActivated')
    audioActivated = false
    globalThis.audioActivated = false
    if (audioManager) {
      checkAudioOverlay()
    }
    console.log(
      '🔊 Audio activation state reset. Reload page to see unmute overlay again.'
    )
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  debugLog('🚀 DOMContentLoaded fired')
  debugLog(
    '🔊 Audio activation state restored from localStorage:',
    audioActivated
  )
  debugLog('🚀 Доступные глобальные объекты:', {
    AudioManager: typeof AudioManager,
    PhysicsEngine: typeof PhysicsEngine,
    BallRenderer: typeof BallRenderer,
    WebSocketClient: typeof WebSocketClient,
    RealtimeClient: typeof RealtimeClient,
    sharedComponents: typeof sharedComponents
  })
  try {
    const sessionId = getSessionIdFromUrl()
    if (!sessionId) {
      const t = (k, f) => {
        const v = globalThis.i18n?.t(k)
        return v && v !== k ? v : f
      }
      showError(t('viewer.sessionIdNotFound', 'Session ID not found in URL'))
      return
    }
    debugLog('📱 Session ID получен:', sessionId)
    initializeComponents()
    await initializeViewer(sessionId)
  } catch (error) {
    debugError('❌ Критическая ошибка инициализации:', error)
    let errorMsg = error.message || error
    if (
      errorMsg?.includes('Session with this ID not found') ||
      errorMsg?.includes('not found')
    ) {
      // Протухшая ссылка — показываем баннер с CTA «Создать новую сессию»
      const t = (key, fallback) => globalThis.i18n?.t(key) || fallback
      if (typeof globalThis.HintBanner === 'function') {
        const container =
          document.getElementById('errorStatesContainer') || document.body
        new globalThis.HintBanner({
          container: container,
          type: 'error',
          title: t('hint.sessionNotFound', 'Session not found'),
          message: t(
            'hint.sessionNotFoundMsg',
            'This link is outdated or was deleted. Create a new session to continue.'
          ),
          ctaLabel: t('hint.createNewSession', 'Create new session'),
          onCta: () => {
            globalThis.location.href = '/'
          },
          closeLabel: t('hint.close', 'Close hint'),
          ariaLive: 'assertive'
        }).show()
        const loading = document.getElementById('loading')
        if (loading) loading.style.display = 'none'
        return
      }
      errorMsg = t(
        'hint.sessionNotFoundMsg',
        'This link is outdated or was deleted. Create a new session to continue.'
      )
    } else if (errorMsg?.includes('Realtime connection')) {
      errorMsg =
        'Failed to connect to session. Please reload the page and try again.'
    }
    showError(errorMsg)
  }
})

function initializeComponents() {
  debugLog('📦 initializeComponents вызван')
  if (typeof sharedComponents !== 'undefined') {
    components.status = sharedComponents.createStatusIndicator(
      document.getElementById('statusContainer'),
      {
        title:
          (globalThis.i18n?.isReady &&
            globalThis.i18n.t('viewer.connecting')) ||
          'Connecting...',
        showIcon: true,
        autoHide: false
      }
    )
  }
  debugLog('📦 Status indicator создан')
  debugLog('🔊 Проверка AudioManager:', typeof AudioManager)
  const audioManagerLoaded = typeof AudioManager === 'function'
  if (audioManagerLoaded) {
    debugLog('🔊 AudioManager доступен, инициализируем сразу')
    initAudioManager()
  } else {
    debugLog('🔊 AudioManager еще не загружен, ждем...')
    let attempts = 0
    const checkAudioManager = setInterval(() => {
      attempts++
      debugLog(
        `🔊 Попытка ${attempts}/50 найти AudioManager:`,
        typeof AudioManager
      )
      const isAudioManagerReady = typeof AudioManager === 'function'
      if (isAudioManagerReady) {
        clearInterval(checkAudioManager)
        debugLog('🔊 AudioManager загружен, инициализируем')
        initAudioManager()
      }
    }, 100)
    setTimeout(() => {
      clearInterval(checkAudioManager)
      const audioManagerFailed = typeof AudioManager !== 'function'
      if (audioManagerFailed) {
        debugError('❌ AudioManager не загрузился за 5 секунд!')
      }
    }, 5000)
  }
}

function initAudioManager() {
  const audioManagerAvailable = typeof AudioManager !== 'undefined'
  if (!audioManagerAvailable) {
    debugWarn('AudioManager not loaded yet')
    return
  }
  audioManager = new AudioManager()
  globalThis.audioManager = audioManager
  if (typeof logger !== 'undefined') {
    logger.audio('AudioManager создан, enabled:', audioManager.enabled)
  }
  setupAudioActivationHandlers()
  globalThis.checkAudioOverlay = checkAudioOverlay
  const hasPendingSound = pendingSoundEnabled !== false
  if (hasPendingSound) {
    debugLog('🔊 Применяем отложенный soundEnabled:', pendingSoundEnabled)
    audioManager.setEnabled(pendingSoundEnabled)
    pendingSoundEnabled = false
  }
  checkAudioOverlay()
}

function setupAudioActivationHandlers() {
  const initAudioContextOnFirstUserGesture = () => {
    const shouldInitAudio =
      audioActivated === false && audioManager && audioManager.enabled
    if (!shouldInitAudio) return
    audioManager.init()
    audioActivated = true
    globalThis.audioActivated = true
    localStorage.setItem('bb_audioActivated', 'true')
    if (typeof logger !== 'undefined') {
      logger.audio(
        '🖱️ Audio context initialized on user gesture (implicit click) - кнопка скрыта'
      )
    }
    document.removeEventListener('click', initAudioContextOnFirstUserGesture)
    document.removeEventListener(
      'touchstart',
      initAudioContextOnFirstUserGesture
    )
  }

  document.addEventListener('click', initAudioContextOnFirstUserGesture, {
    once: true
  })
  document.addEventListener('touchstart', initAudioContextOnFirstUserGesture, {
    once: true
  })

  const unmuteBtn = document.getElementById('unmuteBtn')
  const unMuteBtnExists = unmuteBtn !== null
  if (!unMuteBtnExists) {
    debugWarn('🔊 Unmute button НЕ найдена!')
    return
  }
  if (typeof logger !== 'undefined') {
    logger.audio('Unmute button найдена, добавляем обработчики')
  }
  unmuteBtn.addEventListener('click', () => {
    activateAudio(initAudioContextOnFirstUserGesture)
  })
  unmuteBtn.addEventListener('touchstart', (e) => {
    e.preventDefault()
    activateAudio(initAudioContextOnFirstUserGesture)
  })

  const viewerVolumeSlider = document.getElementById('viewerVolumeSlider')
  if (viewerVolumeSlider) {
    const handleVolumeChange = (event) => {
      const input = event.target
      if (input instanceof HTMLInputElement) {
        const value = input.value
        if (audioManager && value) {
          audioManager.setVolume(value / 100)
        }
      }
    }
    viewerVolumeSlider.addEventListener('input', handleVolumeChange)
  }
}

function activateAudio(initHandler) {
  debugLog('🔘 [activateAudio] Функция вызвана')
  if (!audioManager) {
    debugWarn('❌ [activateAudio] audioManager не инициализирован!')
    return
  }
  audioManager.init()
  audioActivated = true
  globalThis.audioActivated = true
  localStorage.setItem('bb_audioActivated', 'true')
  debugLog('✅ [activateAudio] audioActivated установлен на true')
  checkAudioOverlay()
  if (initHandler) {
    document.removeEventListener('click', initHandler)
    document.removeEventListener('touchstart', initHandler)
  }
  if (typeof logger !== 'undefined') {
    logger.audio('✅ Audio activated by user gesture - кнопка нажата!')
  }
  sendAudioActivationNotification()
}

function sendAudioActivationNotification() {
  const sessionId = getSessionIdFromUrl()
  if (sessionId && wsClient) {
    debugLog('📤 [activateAudio] Отправляем viewerAudioActivated на сервер')
    wsClient
      .send(WS_MSG.viewerAudioActivated, { activated: true })
      .catch(() => {})
  }
}

function checkAudioOverlay() {
  const overlay = document.getElementById('unmuteOverlay')
  if (!overlay) {
    debugWarn('🔊 checkAudioOverlay: overlay element НЕ найден!')
    return
  }

  const shouldShow = audioManager && audioManager.enabled && !audioActivated
  overlay.classList.toggle('hidden', !shouldShow)

  if (typeof logger !== 'undefined') {
    if (shouldShow) {
      logger.audio(
        'Показываем unmute overlay - звук включен, но не активирован'
      )
    } else {
      const reason = !audioManager
        ? 'audioManager не инициализирован'
        : !audioManager.enabled
          ? 'звук отключен на контроллере'
          : 'уже активирован'
      logger.audio('Скрываем unmute overlay', { reason })
    }
  }

  const audioControls = document.getElementById('viewerAudioControls')
  if (audioControls) {
    const isAudioActive = audioManager && audioActivated
    audioControls.classList.toggle('hidden', !isAudioActive)
    audioControls.style.display = isAudioActive ? 'flex' : 'none'
  }
}

function onBounce(side, dirX, dirY) {
  if (audioManager && audioManager.enabled && audioActivated) {
    audioManager.playTick()
  }
  if (wsClient && physicsEngine) {
    const ball = physicsEngine.ball
    wsClient
      .send('bounce', {
        side: side,
        x: ball.x,
        y: ball.y,
        dirX: dirX || 0,
        dirY: dirY || 0,
        timestamp: Date.now()
      })
      .catch((err) => {
        debugWarn('Failed to send bounce:', err)
      })
  }
}

async function initializeViewer(sessionId) {
  try {
    debugLog('📱 Инициализация viewer для сессии:', sessionId)
    hideLoading()
    if (!globalThis.__current) {
      globalThis.__current = {}
    }
    globalThis.__current.sessionId = sessionId
    const canvas = document.getElementById('viewerCanvas')
    if (!canvas) {
      console.error('Canvas не найден')
      return
    }
    resizeCanvas()
    const bounceCallback = (bounceData) => {
      onBounce(bounceData.side, bounceData.dirX, bounceData.dirY)
    }
    physicsEngine = new PhysicsEngine({
      worldWidth: globalThis.innerWidth,
      worldHeight: globalThis.innerHeight,
      isViewer: true,
      clientSimulation: true,
      bounceCallback: bounceCallback
    })
    globalThis.physicsEngine = physicsEngine
    physicsEngine.setWorldSize(globalThis.innerWidth, globalThis.innerHeight)
    physicsEngine.setPaused(true)
    ballRenderer = new BallRenderer(canvas, physicsEngine, {
      localPhysics: true
    })
    physicsEngine.setRenderer(ballRenderer)
    await connectToSession(sessionId)
    wsClient = new RealtimeClient(sessionId, 'viewer')
    // eslint-disable-next-line require-atomic-updates
    globalThis.wsClient = wsClient
    debugLog('✅ WebSocketClient создан')
    setupWebSocketHandlers(wsClient, sessionId)
    try {
      await wsClient.connect()
    } catch (error) {
      debugWarn(
        '⚠️ First connection attempt failed, will retry:',
        error.message
      )
    }
    if (ballRenderer) {
      ballRenderer.start()
    }
    setupEventListeners()
    setTimeout(() => {
      const hotkeysHint = document.getElementById('hotkeysHint')
      if (hotkeysHint) {
        hotkeysHint.classList.add('hidden')
      }
    }, 10000)
    debugLog('✅ Viewer успешно инициализирован')
  } catch (error) {
    debugError('❌ Ошибка инициализации viewer:', error)
    showError(
      (globalThis.i18n?.t('viewer.initError') || 'Initialization error: ') +
        error.message
    )
  }
}

function setupWebSocketHandlers(wsClient, sessionId) {
  async function fetchAndApplyState() {
    try {
      const resp = await globalThis.csrfFetch(
        `/api/session/${sessionId}/state`
      )
      if (!resp.ok) return
      const state = await resp.json()
      onStateUpdate(state)
      updateStatus(state)
    } catch (e) {
      debugWarn('Не удалось получить состояние через REST', e)
    }
  }

  wsClient.on('open', () => {
    debugLog('✅ WS connection established.')
    startSyncMonitor()
    hideConnectionBanner()
    const connMsg =
      globalThis.i18n?.t('viewer.connectionEstablished') ||
      'Connection established'
    components.status?.setStatus('success', connMsg)
    debugLog('🔄 Fetching state via REST (first connect or reconnect)')
    fetchAndApplyState().catch(() => {})
    wsClient
      .send('viewer_connected', {
        timestamp: Date.now(),
        sessionId: sessionId,
        role: 'viewer',
        screenSize: {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight
        }
      })
      .catch(() => {})
    // Track viewer connection in Metrika with screen info
    try {
      globalThis.dispatchEvent(
        new CustomEvent('bb_metrika_viewer_connected', {
          detail: {
            screenWidth: globalThis.innerWidth,
            screenHeight: globalThis.innerHeight
          }
        })
      )
    } catch (e) {
      void e
    }
  })

  wsClient.on('close', (event) => {
    debugWarn('🔌 WS connection closed.', event)
    stopSyncMonitor()
    // Протухшая/удалённая сессия — сервер закрывает соединение с кодом 1011 'Session not found'.
    // Показываем баннер с CTA «Создать новую сессию» и прекращаем попытки переподключения.
    if (
      event &&
      event.code === 1011 &&
      String(event.reason || '')
        .toLowerCase()
        .includes('not found')
    ) {
      const t = (key, fallback) => globalThis.i18n?.t(key) || fallback
      try {
        wsClient.close()
      } catch (e) {
        void e
      }
      const loading = document.getElementById('loading')
      if (loading) loading.style.display = 'none'
      if (typeof globalThis.HintBanner === 'function') {
        const container =
          document.getElementById('errorStatesContainer') || document.body
        new globalThis.HintBanner({
          container: container,
          type: 'error',
          title: t('hint.sessionNotFound', 'Session not found'),
          message: t(
            'hint.sessionNotFoundMsg',
            'This link is outdated or was deleted. Create a new session to continue.'
          ),
          ctaLabel: t('hint.createNewSession', 'Create new session'),
          onCta: () => {
            globalThis.location.href = '/'
          },
          closeLabel: t('hint.close', 'Close hint'),
          ariaLive: 'assertive'
        }).show()
        return
      }
    }
    // Keep local physics running during transient disconnects.
    // Hard pause+center here causes visible stutter; on reconnect we reconcile smoothly.
    const lostMsg =
      globalThis.i18n?.t('viewer.connectionLost') ||
      'Connection lost. Reconnecting…'
    showConnectionBanner(lostMsg, '🔄')
    // Track viewer disconnection in Metrika
    try {
      globalThis.dispatchEvent(
        new CustomEvent('bb_metrika_viewer_disconnected')
      )
    } catch (e) {
      void e
    }
  })

  wsClient.on('error', (error) => {
    // Track WS errors in Metrika
    try {
      globalThis.dispatchEvent(
        new CustomEvent('bb_metrika_ws_error', {
          detail: {
            message: String(error?.message || error?.error || error).substring(
              0,
              200
            )
          }
        })
      )
    } catch (_) {
      /* noop */
    }
    handleWebSocketError(error)
  })

  wsClient.on('maxReconnectAttemptsReached', () => {
    const msg =
      globalThis.i18n?.t('viewer.connectionFailed') ||
      'Cannot connect to the server. Please check your internet connection and reload the page.'
    showError(msg)
  })

  wsClient.on('controller_status', (status) => {
    debugLog('📊 Статус контроллера:', status)
    updateStatus(status)
  })

  wsClient.on('controller_connected', (data) => {
    console.log(
      '📊 [VIEWER] Controller connected event received:',
      JSON.stringify(data)
    )
    debugLog('📊 Controller connected event:', data)
    // Clear any pending disconnect banner timer
    if (_controllerDisconnectTimer) {
      clearTimeout(_controllerDisconnectTimer)
      _controllerDisconnectTimer = null
    }
    hideConnectionBanner()
    const hasControllerConnected =
      typeof data.controllerConnected === 'boolean'
    const statusData = hasControllerConnected
      ? data
      : { controllerConnected: true }
    updateStatus(statusData)
  })

  wsClient.on('viewer_connected', (data) => {
    debugLog('📊 [VIEWER] viewer_connected event received:', data)
  })

  wsClient.on('controller_disconnected', (data) => {
    console.log(
      '📊 [VIEWER] Controller disconnected event received:',
      JSON.stringify(data)
    )
    debugLog('📊 Controller disconnected event:', data)
    if (!globalThis.__current) globalThis.__current = {}
    globalThis.__current.controllerConnected = false

    const msg =
      globalThis.i18n?.t('viewer.controllerDisconnected') ||
      'Controller disconnected'
    // Only update status indicator immediately (non-intrusive)
    if (components.status) {
      components.status.setStatus('warning', msg)
    }
    // Debounce the banner: only show after 45s of continuous disconnection.
    // This prevents alarming the user during transient mobile/bg-tab reconnects
    // which happen naturally during long (1.5h) sessions.
    if (_controllerDisconnectTimer) clearTimeout(_controllerDisconnectTimer)
    _controllerDisconnectTimer = setTimeout(() => {
      // Double-check: only show if still disconnected after debounce period
      if (!globalThis.__current?.controllerConnected) {
        showConnectionBanner(msg, '🔌')
      }
    }, CONTROLLER_DISCONNECT_DEBOUNCE_MS)
  })

  wsClient.on('state_update', (state) => {
    // Hide disconnected modal if we are receiving updates
    hideConnectionBanner()
    onStateUpdate(state)
  })
  wsClient.on('initial_state', onStateUpdate)
  wsClient.on('viewer_status', updateStatus)
  wsClient.on('language_updated', onLanguageUpdate)

  // Handle network metrics for adaptive smoothing
  wsClient.on('net_metrics', ({ jitterMs }) => {
    applyAdaptiveSmoothing(physicsEngine, jitterMs)
  })

  // Bounce ack - sync direction only; no position relay.
  // Viewer runs pure local physics; no drift correction anchor needed.
  wsClient.on('bounce_ack', (data) => {
    if (!physicsEngine) return
    const serverDirX = data.serverDirX
    const serverDirY = data.serverDirY
    if (typeof serverDirX === 'number' && typeof serverDirY === 'number') {
      physicsEngine.state.lastDirection.x = serverDirX
      physicsEngine.state.lastDirection.y = serverDirY
      const pps =
        (physicsEngine.ball.speed / 100) * physicsEngine.options.maxSpeed
      physicsEngine.ball.vx = serverDirX * pps
      physicsEngine.ball.vy = serverDirY * pps
    }
  })
}

function handleWebSocketError(error) {
  const isConnectionClosed = error?.type === 'connection_closed'
  const isFirstAttemptError = error?.isFirstAttempt === true
  const isControllerNeverConnected = !globalThis.__current?.controllerConnected
  const shouldSuppressError =
    isConnectionClosed && (isFirstAttemptError || isControllerNeverConnected)
  if (shouldSuppressError) {
    const reason = isFirstAttemptError
      ? 'first attempt'
      : 'controller not connected yet'
    debugLog(`ℹ️ Realtime: ${error?.type} (${reason})`)
    return
  }
  debugError('❌ WebSocket error:', error)
  if (error?.type === 'connection') {
    showError(
      globalThis.i18n?.t('viewer.connectionError') || 'Connection error'
    )
  }
}

// simulateReconnectError реализован в controller.js для тестирования
