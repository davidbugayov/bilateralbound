'use strict'
/**
 * SSE Event Handlers - обработчики событий SSE
 * @module application/controller/sse-handlers
 */
const WS_MSG = {
  viewerStatus: 'viewer_status',
  initialState: 'initial_state',
  stateUpdate: 'state_update',
  controllerUpdate: 'controller_update',
  controllerConnected: 'controller_connected',
  netMetrics: 'net_metrics',
  viewerAudioActivated: 'viewer_audio_activated',
  bounceSync: 'bounce_sync'
}
function createSSEHandlers(deps) {
  const {
    previewPhysicsEngine,
    getIsPlaying,
    setIsPlaying,
    updateConnectionStatus,
    updatePlayPauseButton,
    updateViewerStatusUI,
    applyServerStateToPreview,
    syncUIWithState,
    updateViewerAudioIndicators,
    updatePreviewSize,
    updateViewerInfo,
    updatePhysicsEngineWorldSize,
    calculatePreviewDimensions,
    setCanvasDimensions,
    centerBallInViewer,
    showWaitingForViewer,
    updateDirectionDisplay,
    updateDirectionButtons,
    updateFullscreenViewerStatus,
    showNotification,
    safeSend,
    logger
  } = deps
  let lastPlayingState = false
  let lastServerState = null
  return {
    onOpen(event, sessionId) {
      updateConnectionStatus(true)
      if (event?.isReconnection) {
        safeSend('request_state_sync', { timestamp: Date.now(), sessionId, role: 'controller' })
        if (lastPlayingState && globalThis.__current?.viewerConnected) {
          setTimeout(() => {
            if (previewPhysicsEngine) previewPhysicsEngine.setPaused(false)
            setIsPlaying(true)
            updatePlayPauseButton()
          }, 500)
        }
      }
      safeSend('controller_connected', { timestamp: Date.now(), sessionId, role: 'controller' })
    },
    onClose(event) {
      updateConnectionStatus(false)
      lastPlayingState = getIsPlaying()
      if (event.code === 1006) {
        if (previewPhysicsEngine) {
          previewPhysicsEngine.setPaused(true)
          const cx = previewPhysicsEngine.centerX || (globalThis.__previewCanvas?.width || 500) / 2
          const cy = previewPhysicsEngine.centerY || (globalThis.__previewCanvas?.height || 375) / 2
          previewPhysicsEngine.setPosition(cx, cy)
          previewPhysicsEngine.setVelocity(0, 0)
        }
        setIsPlaying(false)
        globalThis.__current.viewerConnected = false
        updatePlayPauseButton()
      }
      updateViewerStatusUI()
    },
    onError() {},
    onViewerStatus(data) {
      const wasConnected = globalThis.__current.viewerConnected
      globalThis.__current.viewerConnected = data.connected
      if (data.screenSize) globalThis.__current.viewerScreenSize = data.screenSize

      // Обновляем UI когда меняется статус подключения viewer
      if (wasConnected !== data.connected) {
        if (!data.connected) {
          // Viewer отключился - отключаем контролы
          globalThis.__current.viewerAudioActivated = false
          globalThis.__current.viewerScreenSize = null
          setIsPlaying(false)
          if (previewPhysicsEngine) previewPhysicsEngine.setPaused(true)
          lastServerState = null
          centerBallInViewer()
          showWaitingForViewer()
          updatePlayPauseButton()
        }
        updateViewerStatusUI()
      }
    },
    onInitialState(state) {
      lastServerState = state
      if (typeof state.viewerConnected === 'boolean') {
        globalThis.__current.viewerConnected = state.viewerConnected
      }
      if (state.viewerScreenSize?.width > 0) {
        globalThis.__current.viewerScreenSize = state.viewerScreenSize
        updatePreviewSize(state.viewerScreenSize)
        updateViewerInfo(state.viewerScreenSize)
      }
      applyServerStateToPreview(state)
      syncUIWithState(state)
      updateViewerAudioIndicators()
      updateViewerStatusUI()
    },
    onStateUpdate(state, isPreviewFullscreen) {
      lastServerState = state
      if (typeof state.viewerConnected === 'boolean') {
        const wasConnected = globalThis.__current.viewerConnected
        globalThis.__current.viewerConnected = state.viewerConnected
        if (wasConnected !== state.viewerConnected) updateViewerStatusUI()
        if (previewPhysicsEngine) {
          const serverSends = state.clientSimulationOnly === false
          previewPhysicsEngine.options.clientSimulation = !(serverSends && state.viewerConnected)
        }
      }
      if (state.viewerScreenSize?.width > 0) {
        const prev = globalThis.__current?.viewerScreenSize || { width: 0, height: 0 }
        const next = state.viewerScreenSize
        if (!prev || prev.width !== next.width || prev.height !== next.height) {
          globalThis.__current.viewerConnected = true
          globalThis.__current.viewerScreenSize = next
          updatePhysicsEngineWorldSize(next)
          const canvas = document.getElementById('preview')
          if (canvas) {
            const { previewWidth, previewHeight } = calculatePreviewDimensions(canvas, next)
            setCanvasDimensions(canvas, previewWidth, previewHeight)
          }
          updateViewerInfo(next)
          updateViewerStatusUI()
          if (isPreviewFullscreen) updateFullscreenViewerStatus()
        }
      }
      applyServerStateToPreview(state)
      updateViewerAudioIndicators()
    },
    onNetMetrics({ jitterMs }) {
      if (!previewPhysicsEngine) return
      const base = globalThis.BBConfig?.smoothing || {}
      previewPhysicsEngine.setSmoothingOptions({
        damping: Math.min(25, Math.max(15, (base.damping || 20) + jitterMs / 20)),
        stiffness: Math.min(35, Math.max(25, (base.stiffness || 30) - jitterMs / 30)),
        maxPredictSec: base.maxPredictSec || 0.02,
        snapDistance: Math.min(0.4, Math.max(0.2, (base.snapDistance || 0.3) + (jitterMs > 15 ? 0.05 : 0)))
      })
    },
    onViewerAudioActivated(data) {
      if (globalThis.__current) globalThis.__current.viewerAudioActivated = data.activated
      updateViewerAudioIndicators()
    },
    // Bounce sync - sync preview ball position with viewer on bounce
    onBounceSync(data) {
      if (!previewPhysicsEngine) return
      // Snap preview ball to viewer position on bounce
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        previewPhysicsEngine.ball.x = data.x
        previewPhysicsEngine.ball.y = data.y
        // Also sync direction
        if (typeof data.dirX === 'number' && typeof data.dirY === 'number') {
          previewPhysicsEngine.state.dirX = data.dirX
          previewPhysicsEngine.state.dirY = data.dirY
        }
      }
    },
    onMaxReconnect() {
      logger.error('Исчерпаны попытки переподключения')
      showNotification('Не удается подключиться к серверу', 'error')
    },
    getLastServerState() { return lastServerState },
    setLastServerState(s) { lastServerState = s }
  }
}
if (typeof globalThis !== 'undefined') {
  globalThis.SSEHandlers = { create: createSSEHandlers, WS_MSG }
}
