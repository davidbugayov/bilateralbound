'use strict'
/**
 * PlayPause Controller — управление воспроизведением
 * @module application/controller/play-pause
 *
 * Self-contained: accesses previewPhysicsEngine via globalThis.__previewPhysics,
 * uses direction/counter domain modules directly. No DI needed — runs in same
 * webpack bundle as controller.js.
 */
/* global showViewerNotConnectedWarning, showNotification, showViewerSizeNotReadyWarning, safeSend, WS_MSG */

const {
  getDirectionVector,
  getCurrentDirectionMode
} = require('../../domain/direction')
const { bbCounters } = require('../../domain/counters')

let _isPlaying = false
let _ignoreServerPausedUntilTs = 0

function init() {
  _isPlaying = false
  _ignoreServerPausedUntilTs = 0
}

function getIsPlaying() {
  return _isPlaying
}

function setIsPlaying(v) {
  _isPlaying = v
  globalThis.__current.isPlaying = v
}

function updatePlayPauseButton() {
  const btn = document.getElementById('playPauseBtn')
  if (!btn) return
  // Use i18n for button text
  const startLabel = globalThis.i18n?.t('controller.start') || 'Start'
  const stopLabel = globalThis.i18n?.t('controller.stop') || 'Stop'
  btn.textContent = _isPlaying ? stopLabel : startLabel
  btn.classList.toggle('playing', _isPlaying)
  btn.disabled = false
}

function syncFsPlayPauseButton() {
  const fsBtn = document.getElementById('fsPlayPauseBtn')
  if (!fsBtn) return
  fsBtn.textContent = _isPlaying ? '⏸' : '▶️'
  fsBtn.classList.toggle('playing', _isPlaying)
}

function _updateAllButtons() {
  updatePlayPauseButton()
  syncFsPlayPauseButton()
}

function _scheduleAnimations() {
  _updateAllButtons()
  setTimeout(_updateAllButtons, 150)
  setTimeout(_updateAllButtons, 300)
}

function setPlayPauseState(shouldPlay) {
  const previewPhysicsEngine = globalThis.__previewPhysics

  // Не отправляем команды во время инициализации
  if (globalThis.__current?.isInitializing) {
    return
  }
  if (!globalThis.__current?.viewerConnected) {
    if (shouldPlay) {
      if (typeof showViewerNotConnectedWarning === 'function') {
        showViewerNotConnectedWarning()
      } else if (typeof showNotification === 'function') {
        showNotification(
          globalThis.i18n?.t('controller.clientNotConnected') ||
            'Viewer not connected',
          'warning'
        )
      }
    }
    return
  }
  // Guard: don't start if viewer screen size is unknown — physics needs world dimensions
  const vs = globalThis.__current?.viewerScreenSize
  if (shouldPlay && (!vs || vs.width <= 0 || vs.height <= 0)) {
    if (typeof showViewerSizeNotReadyWarning === 'function') {
      showViewerSizeNotReadyWarning()
    }
    return
  }

  const directionVector = getDirectionVector(getCurrentDirectionMode()) || {
    dirX: 1,
    dirY: 0
  }
  const payload = shouldPlay
    ? {
        paused: false,
        ...directionVector,
        speed: Number(globalThis.components?.speed?.getSpeed?.() ?? 40)
      }
    : { paused: true, returnToCenter: true }

  // safeSend via globalThis (set up by controller.js)
  if (typeof safeSend === 'function') {
    safeSend(WS_MSG.controllerUpdate, payload)
  }

  _isPlaying = shouldPlay
  globalThis.__current.isPlaying = shouldPlay
  globalThis.forcePauseUntilUserAction = false

  if (shouldPlay) {
    bbCounters.start()
    try {
      globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_started'))
    } catch (e) {
      void e
    }
  } else {
    bbCounters.stop(true)
    try {
      globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_stopped'))
      globalThis.dispatchEvent(
        new CustomEvent('bb_metrika_session_duration', {
          detail: { seconds: bbCounters.getElapsedSeconds?.() || 0 }
        })
      )
    } catch (e) {
      void e
    }
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

  _ignoreServerPausedUntilTs = performance.now() + 800
  globalThis.__ignoreServerPausedUntilTs = _ignoreServerPausedUntilTs
  _scheduleAnimations()
  return true
}

function togglePlayPause() {
  setPlayPauseState(!_isPlaying)
}

function shouldIgnoreServerPaused() {
  return performance.now() < _ignoreServerPausedUntilTs
}

if (typeof globalThis !== 'undefined') {
  globalThis.PlayPauseController = {
    init,
    setIsPlaying,
    updateButton: updatePlayPauseButton,
    syncFsButton: syncFsPlayPauseButton,
    toggle: togglePlayPause,
    setState: setPlayPauseState
  }
}

module.exports = {
  init,
  getIsPlaying,
  setIsPlaying,
  updatePlayPauseButton,
  syncFsPlayPauseButton,
  togglePlayPause,
  setPlayPauseState,
  shouldIgnoreServerPaused,
  _scheduleAnimations
}
