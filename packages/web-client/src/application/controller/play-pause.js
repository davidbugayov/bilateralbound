/* jshint node: true, esversion: 11, strict: true */
'use strict'
/**
 * PlayPause Controller - управление воспроизведением
 * @module application/controller/play-pause
 */
let _isPlaying = false
let _ignoreServerPausedUntilTs = 0
let _deps = {}

function init(deps) {
  _deps = deps
  _isPlaying = false
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
  btn.textContent = _isPlaying ? '⏸ Стоп' : '▶️ Старт'
  btn.classList.toggle('playing', _isPlaying)
  btn.disabled = false
}

function syncFsPlayPauseButton() {
  const fsBtn = document.getElementById('fsPlayPauseBtn')
  if (!fsBtn) return
  fsBtn.textContent = _isPlaying ? '⏸' : '▶️'
  fsBtn.classList.toggle('playing', _isPlaying)
}

function updateAllButtons() {
  updatePlayPauseButton()
  syncFsPlayPauseButton()
}

function scheduleAnimations() {
  updateAllButtons()
  setTimeout(updateAllButtons, 150)
  setTimeout(updateAllButtons, 300)
}

function setPlayPauseState(shouldPlay) {
  const {
    previewPhysicsEngine,
    safeSend,
    centerBall,
    getDirectionVector,
    currentDirectionMode,
    components,
    bbCounters,
    showNotification,
    WS_MSG
  } = _deps

  // Не показываем предупреждение во время инициализации
  if (
    !globalThis.__current?.isInitializing &&
    !globalThis.__current?.viewerConnected &&
    shouldPlay
  ) {
    if (globalThis.showViewerNotConnectedWarning) {
      globalThis.showViewerNotConnectedWarning()
    } else {
      showNotification(
        globalThis.i18n?.t('controller.clientNotConnected') ||
          'Viewer not connected',
        'warning'
      )
    }
  }

  const payload = shouldPlay
    ? {
        paused: false,
        ...(getDirectionVector(currentDirectionMode()) || { dirX: 1, dirY: 0 }),
        speed: Number(components.speed?.getSpeed?.() ?? 40)
      }
    : { paused: true, returnToCenter: true }

  safeSend(WS_MSG.controllerUpdate, payload)
  _isPlaying = shouldPlay
  globalThis.__current.isPlaying = shouldPlay
  globalThis.forcePauseUntilUserAction = false

  if (shouldPlay) {
    bbCounters.start()
  } else {
    bbCounters.stop(true)
  }

  if (previewPhysicsEngine) {
    if (shouldPlay) {
      // Reset first-update flag so first state_update hard-snaps position
      previewPhysicsEngine._hasReceivedFirstMovingUpdate = false
      // Start from center (same as viewer) for clean sync
      centerBall()
    }
    previewPhysicsEngine.applyCommand(payload)
    if (!shouldPlay) {
      centerBall()
    }
  }

  _ignoreServerPausedUntilTs = performance.now() + 800
  scheduleAnimations()
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
  togglePlayPause,
  setPlayPauseState,
  shouldIgnoreServerPaused
}
