'use strict'
/**
 * PlayPause Controller — управление воспроизведением
 * @module application/controller/play-pause
 *
 * Self-contained: accesses previewPhysicsEngine via globalThis.__previewPhysics,
 * uses direction/counter domain modules directly. No DI needed — runs in same
 * webpack bundle as controller.js.
 */

const { getDirectionVector, getCurrentDirectionMode } = require('../../domain/direction')
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

  if (
    !globalThis.__current?.isInitializing &&
    !globalThis.__current?.viewerConnected &&
    shouldPlay
  ) {
    if (typeof showViewerNotConnectedWarning === 'function') {
      showViewerNotConnectedWarning()
    } else if (typeof showNotification === 'function') {
      showNotification(
        globalThis.i18n?.t('controller.clientNotConnected') || 'Viewer not connected',
        'warning'
      )
    }
  }

  const directionVector = getDirectionVector(getCurrentDirectionMode()) || { dirX: 1, dirY: 0 }
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
    try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_started')) } catch (e) { void e }
  } else {
    bbCounters.stop(true)
    try {
      globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_stopped'))
      globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_duration', { detail: { seconds: bbCounters.getElapsedSeconds?.() || 0 } }))
    } catch (e) { void e }
  }

  if (previewPhysicsEngine) {
    if (shouldPlay) {
      previewPhysicsEngine._hasReceivedFirstMovingUpdate = false
      centerBallInViewer()
    }
    previewPhysicsEngine.applyCommand(payload)
    if (!shouldPlay) {
      centerBallInViewer()
    }
  }

  _ignoreServerPausedUntilTs = performance.now() + 800
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
