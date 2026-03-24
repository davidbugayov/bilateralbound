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
require('./ui/shared-components')
require('./ui/notifications/notification-system')

const PhysicsEngine = require('@emdr/shared/physics-engine')
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
  const loading = document.getElementById('loading')
  if (loading) {
    loading.textContent = '❌ ' + message
    loading.style.color = '#ef4444'
  }
  globalThis.showErrorNotification?.(
    globalThis.i18n?.t('viewer.errorTitle') || 'Error',
    message
  )
}

function hideLoading() {
  const loading = document.getElementById('loading')
  if (loading) {
    loading.style.display = 'none'
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
    const response = await fetch(`/api/session/${sessionId}/viewer/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenSize: {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight
        }
      })
    })
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
    console.log('📊 [VIEWER] controllerConnected updated to:', data.controllerConnected)
  }
  if (!components.status) {
    return
  }
  const isControllerConnected = data.controllerConnected === true
  const isControllerDisconnected = data.controllerConnected === false
  if (isControllerConnected) {
    const msg = globalThis.i18n?.t('viewer.controllerConnected') || 'Controller connected'
    components.status.setStatus('success', msg)
  } else if (isControllerDisconnected) {
    const msg = globalThis.i18n?.t('viewer.waitingForController') || 'Waiting for controller...'
    components.status.setStatus('waiting', msg)
  }
}

function onStateUpdate(state) {
  if (state && state.language && state.language !== localStorage.getItem('emdr-language')) {
    onLanguageUpdate({ language: state.language })
  }
  if (physicsEngine && state) {
    updatePhysicsFromState(state)
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
  physicsEngine.applyCommand(state)
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
        wsClient.send('viewer_screen_size', {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight
        }).catch(() => {})
      }, 300)
    }
  })

  globalThis.toggleFullscreen = function () {
    const isFullscreen = !!document.fullscreenElement
    if (!isFullscreen) {
      document.documentElement.requestFullscreen().catch((err) => {
        debugWarn('Error attempting to enable fullscreen:', err)
      })
    } else if (document.exitFullscreen) {
      document.exitFullscreen()
    }
  }

  function updateFullscreenButton() {
    const btn = document.querySelector('.fullscreen-btn')
    if (!btn) return
    const isFs = !!document.fullscreenElement
    const key = isFs ? 'viewer.exitFullscreen' : 'viewer.fullscreen'
    const fallback = isFs ? '⛶ Выйти' : '⛶ Полноэкранный'
    btn.textContent = globalThis.i18n?.t ? globalThis.i18n.t(key) : fallback
    if (btn instanceof HTMLElement) {
      btn.dataset.i18n = key
    }
  }

  document.addEventListener('fullscreenchange', () => {
    updateFullscreenButton()
    resizeCanvas()
    if (wsClient) {
      wsClient.send('viewer_screen_size', {
        width: globalThis.innerWidth,
        height: globalThis.innerHeight
      }).catch(() => {})
    }
  })

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
        debugLog(`[VIEWER] Space pressed: toggling pause from ${currentPaused} to ${newPaused}`)
        wsClient.send('viewer_update', { paused: newPaused })
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
    console.log('🔊 Audio activation state reset. Reload page to see unmute overlay again.')
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  debugLog('🚀 DOMContentLoaded fired')
  debugLog('🔊 Audio activation state restored from localStorage:', audioActivated)
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
      showError('Session ID не найден в URL')
      return
    }
    debugLog('📱 Session ID получен:', sessionId)
    initializeComponents()
    await initializeViewer(sessionId)
  } catch (error) {
    debugError('❌ Критическая ошибка инициализации:', error)
    let errorMsg = error.message || error
    if (errorMsg?.includes('Session with this ID not found') || errorMsg?.includes('not found')) {
      errorMsg = 'Session with this ID not found. Please check the URL and try again.'
    } else if (errorMsg?.includes('Realtime connection')) {
      errorMsg = 'Failed to connect to session. Please reload the page and try again.'
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
        title: (globalThis.i18n?.isReady && globalThis.i18n.t('viewer.connecting')) || 'Connecting...',
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
      debugLog(`🔊 Попытка ${attempts}/50 найти AudioManager:`, typeof AudioManager)
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
    const shouldInitAudio = audioActivated === false && audioManager && audioManager.enabled
    if (!shouldInitAudio) return
    audioManager.init()
    audioActivated = true
    globalThis.audioActivated = true
    localStorage.setItem('bb_audioActivated', 'true')
    if (typeof logger !== 'undefined') {
      logger.audio('🖱️ Audio context initialized on user gesture (implicit click) - кнопка скрыта')
    }
    document.removeEventListener('click', initAudioContextOnFirstUserGesture)
    document.removeEventListener('touchstart', initAudioContextOnFirstUserGesture)
  }

  document.addEventListener('click', initAudioContextOnFirstUserGesture, { once: true })
  document.addEventListener('touchstart', initAudioContextOnFirstUserGesture, { once: true })

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
    wsClient.send(WS_MSG.viewerAudioActivated, { activated: true }).catch(() => {})
  }
}

function checkAudioOverlay() {
  const overlay = document.getElementById('unmuteOverlay')
  if (!overlay) {
    debugWarn('🔊 checkAudioOverlay: overlay element НЕ найден!')
    return
  }
  const shouldShowOverlay = shouldShowAudioOverlay()
  updateOverlayVisibility(overlay, shouldShowOverlay)
  updateAudioControlsVisibility()
}

function shouldShowAudioOverlay() {
  return audioManager && audioManager.enabled && !audioActivated
}

function updateOverlayVisibility(overlay, shouldShow) {
  if (shouldShow) {
    overlay.classList.remove('hidden')
    if (typeof logger !== 'undefined') {
      logger.audio('Показываем unmute overlay - звук включен на контроллере, но не активирован')
    }
  } else {
    overlay.classList.add('hidden')
    if (typeof logger !== 'undefined') {
      const reason = getAudioOverlayHiddenReason()
      logger.audio('Скрываем unmute overlay', { reason })
    }
  }
}

function getAudioOverlayHiddenReason() {
  const reasonKey = determineAudioOverlayReasonKey()
  const reasonFallbacks = {
    notInitialized: 'audioManager не инициализирован',
    disabled: 'звук отключен на контроллере',
    activated: 'уже активирован'
  }
  return globalThis.i18n?.t(`viewer.audioOverlay.${reasonKey}`) || reasonFallbacks[reasonKey]
}

function determineAudioOverlayReasonKey() {
  if (!audioManager) {
    return 'notInitialized'
  }
  if (!audioManager.enabled) {
    return 'disabled'
  }
  return 'activated'
}

function updateAudioControlsVisibility() {
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
    wsClient.send('bounce', {
      side: side,
      x: ball.x,
      y: ball.y,
      dirX: dirX || 0,
      dirY: dirY || 0,
      timestamp: Date.now()
    }).catch((err) => {
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
    globalThis.wsClient = wsClient
    debugLog('✅ WebSocketClient создан')
    setupWebSocketHandlers(wsClient, sessionId)
    try {
      await wsClient.connect()
    } catch (error) {
      debugWarn('⚠️ First connection attempt failed, will retry:', error.message)
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
      (globalThis.i18n?.t('viewer.initError') || 'Initialization error: ') + error.message
    )
  }
}

function setupWebSocketHandlers(wsClient, sessionId) {
  async function fetchAndApplyState() {
    try {
      const resp = await fetch(`/api/session/${sessionId}/state`)
      if (!resp.ok) return
      const state = await resp.json()
      onStateUpdate(state)
      updateStatus(state)
    } catch (e) {
      debugWarn('Не удалось получить состояние через REST', e)
    }
  }

  wsClient.on('open', (event) => {
    debugLog('✅ WS connection established.')
    const connMsg = globalThis.i18n?.t('viewer.connectionEstablished') || 'Connection established'
    components.status?.setStatus('success', connMsg)
    debugLog('🔄 Fetching state via REST (first connect or reconnect)')
    fetchAndApplyState()
    wsClient.send('viewer_connected', {
      timestamp: Date.now(),
      sessionId: sessionId,
      role: 'viewer',
      screenSize: {
        width: globalThis.innerWidth,
        height: globalThis.innerHeight
      }
    }).catch(() => {})
  })

  wsClient.on('close', () => {
    debugWarn('🔌 WS connection closed.')
    showError(globalThis.i18n?.t('viewer.connectionLost') || 'Connection lost. Reconnecting...')
  })

  wsClient.on('error', (error) => {
    handleWebSocketError(error)
  })

  wsClient.on('controller_status', (status) => {
    debugLog('📊 Статус контроллера:', status)
    updateStatus(status)
  })

  wsClient.on('controller_connected', (data) => {
    console.log('📊 [VIEWER] Controller connected event received:', JSON.stringify(data))
    debugLog('📊 Controller connected event:', data)
    const hasControllerConnected = typeof data.controllerConnected === 'boolean'
    const statusData = hasControllerConnected ? data : { controllerConnected: true }
    updateStatus(statusData)
  })

  wsClient.on('controller_disconnected', (data) => {
    console.log('📊 [VIEWER] Controller disconnected event received:', JSON.stringify(data))
    debugLog('📊 Controller disconnected event:', data)
    if (!globalThis.__current) globalThis.__current = {}
    globalThis.__current.controllerConnected = false

    // Pause the ball when controller disconnects
    if (physicsEngine) {
      physicsEngine.applyCommand({ paused: true, returnToCenter: true })
    }

    const msg = globalThis.i18n?.t('viewer.controllerDisconnected') || 'Controller disconnected'
    if (components.status) {
      components.status.setStatus('warning', msg)
    }
    globalThis.showWarningNotification?.('⚠️', msg)
  })

  wsClient.on('state_update', onStateUpdate)
  wsClient.on('initial_state', onStateUpdate)
  wsClient.on('viewer_status', updateStatus)
  wsClient.on('language_updated', onLanguageUpdate)

  // Handle network metrics for adaptive smoothing
  wsClient.on('net_metrics', ({ jitterMs }) => {
    if (!physicsEngine) return

    // Update physics engine with current jitter for adaptive smoothing
    physicsEngine.updateJitter(jitterMs)

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
    physicsEngine.setSmoothingOptions({
      damping: adaptiveDamping,
      stiffness: adaptiveStiffness,
      maxPredictSec: fixedPredictTime,
      snapDistance: adaptiveSnapDistance,
      exponentialSmoothing: base.exponentialSmoothing,
      stateBuffering: base.stateBuffering,
      bufferSize: base.bufferSize
    })
  })
}

function handleWebSocketError(error) {
  const isConnectionClosed = error?.type === 'connection_closed'
  const isFirstAttemptError = error?.isFirstAttempt === true
  const isControllerNeverConnected = !globalThis.__current?.controllerConnected
  const shouldSuppressError = isConnectionClosed && (isFirstAttemptError || isControllerNeverConnected)
  if (shouldSuppressError) {
    const reason = isFirstAttemptError ? 'first attempt' : 'controller not connected yet'
    debugLog(`ℹ️ Realtime: ${error?.type} (${reason})`)
    return
  }
  debugError('❌ WebSocket error:', error)
  if (error?.type === 'connection') {
    showError(globalThis.i18n?.t('viewer.connectionError') || 'Connection error')
  }
}
