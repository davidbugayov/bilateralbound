'use strict'
/**
 * UI Sync - синхронизация UI с состоянием сервера
 * @module application/controller/ui-sync
 */

const {
  getDirectionMode: domainGetDirectionMode
} = require('../../domain/direction')

let _components = {}
let _deps = {}
let __ignoreServerPausedUntilTs = 0
let __ignoreServerDirectionUntilTs = 0
function init(components, deps) {
  _components = components
  _deps = deps
}
function _ignorePaused() {
  if (typeof _deps.getIgnorePausedUntilTs === 'function') {
    return _deps.getIgnorePausedUntilTs()
  }
  return __ignoreServerPausedUntilTs
}
function _ignoreDirection() {
  if (typeof _deps.getIgnoreDirectionUntilTs === 'function') {
    return _deps.getIgnoreDirectionUntilTs()
  }
  return __ignoreServerDirectionUntilTs
}
function syncSpeed(ballState) {
  if (ballState.speed !== undefined) {
    _components.speed?.setSpeed(ballState.speed, true)
  }
}
function syncSize(ballState) {
  if (ballState.radius !== undefined && _components.size?.setSize) {
    const sizes = [20, 40, 80, 100]
    const closest = sizes.reduce(
      (p, c) =>
        Math.abs(c - ballState.radius) < Math.abs(p - ballState.radius) ? c : p,
      sizes[0]
    )
    _components.size.setSize(closest)
  }
}
function syncColors(ballState) {
  if (ballState.colorBall && _components.ballColor?.setColor) {
    _components.ballColor.setColor(ballState.colorBall)
  }
  if (ballState.colorBg && _components.bgColor?.setColor) {
    _components.bgColor.setColor(ballState.colorBg)
  }
}
function syncPause(ballState) {
  if (ballState.paused === undefined) return
  if (performance.now() >= _ignorePaused()) {
    _deps.setIsPlaying(!ballState.paused)
    _deps.updatePlayPauseButton()
    _deps.syncFsPlayPauseButton()
  }
}
function syncDirection(ballState) {
  if (ballState.dirX === undefined || ballState.dirY === undefined) return
  if (performance.now() < _ignoreDirection()) return
  if (_deps.getCurrentDirectionMode() === 'infinity') return
  if (_deps.getCurrentDirectionMode() === 'brainspotting') return
  const mode = domainGetDirectionMode(ballState.dirX, ballState.dirY)
  if (mode && mode !== _deps.getCurrentDirectionMode()) {
    _deps.setDirectionState(ballState.dirX, ballState.dirY)
    _deps.setCurrentDirectionMode(mode)
    _deps.updateDirectionButtons()
    _deps.updateDirectionDisplay(ballState.dirX, ballState.dirY)
  }
}
function syncInfinity(ballState) {
  if (ballState.infinity === undefined) return
  if (performance.now() < _ignoreDirection()) return
  const engine = _deps.getPreviewPhysicsEngine?.()
  if (engine) engine.ball.infinity = ballState.infinity
  const lastState = _deps.getLastServerState?.()
  if (lastState) lastState.infinity = ballState.infinity
  if (ballState.infinity) {
    _deps.setCurrentDirectionMode('infinity')
    _deps.updateDirectionButtons()
    _deps.updateDirectionDisplay(0, 0)
  }
}
function syncBrainspotting(ballState) {
  if (ballState.brainspotting === undefined) return
  if (performance.now() < _ignoreDirection()) return
  const engine = _deps.getPreviewPhysicsEngine?.()
  if (engine) engine.ball.brainspotting = ballState.brainspotting
  const lastState = _deps.getLastServerState?.()
  if (lastState) lastState.brainspotting = ballState.brainspotting
  if (ballState.brainspotting) {
    _deps.setCurrentDirectionMode('brainspotting')
    _deps.updateDirectionButtons()
    _deps.updateDirectionDisplay(0, 0)
  }
}
function syncIllustration(ballState) {
  if (ballState.ballEmoji === undefined) return
  const engine = _deps.getPreviewPhysicsEngine?.()
  if (engine) engine.ball.ballEmoji = ballState.ballEmoji
  const lastState = _deps.getLastServerState?.()
  if (lastState) lastState.ballEmoji = ballState.ballEmoji
  const preview = document.getElementById('illusSelectedPreview')
  if (preview) preview.textContent = ballState.ballEmoji || ''
  document.querySelectorAll('.illus-emoji-btn').forEach((b) => {
    b.classList.toggle(
      'active',
      b.textContent === ballState.ballEmoji ||
        (!ballState.ballEmoji && b.classList.contains('illus-clear'))
    )
  })
}
function syncTrackBand(ballState) {
  if (!ballState.trackBand) return
  const engine = _deps.getPreviewPhysicsEngine?.()
  if (engine) engine.options.trackBand = ballState.trackBand
  const lastState = _deps.getLastServerState?.()
  if (lastState) lastState.trackBand = ballState.trackBand
  document.querySelectorAll('.pos-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.band === ballState.trackBand)
  })
}
function syncSound(ballState) {
  if (ballState.soundEnabled !== undefined) {
    const cb = document.getElementById('soundEnabledCheckbox')
    if (cb) {
      cb.checked = Boolean(ballState.soundEnabled)
      const tc = document.getElementById('soundTypeControl')
      if (tc) {
        if (ballState.soundEnabled) {
          tc.classList.add('enabled')
        } else {
          tc.classList.remove('enabled')
        }
      }
    }
  }
  if (ballState.soundType) {
    const sel = document.getElementById('soundTypeSelect')
    if (sel) sel.value = ballState.soundType
  }
}
function syncAll(ballState) {
  if (!ballState) return
  _deps.updatePreviewSize(ballState.viewerScreenSize)
  globalThis.__current.viewerConnected = ballState.viewerConnected
  globalThis.__current.viewerScreenSize = ballState.viewerScreenSize
  _deps.updateViewerStatusUI()
  syncSpeed(ballState)
  syncSize(ballState)
  syncColors(ballState)
  syncPause(ballState)
  syncDirection(ballState)
  syncInfinity(ballState)
  syncBrainspotting(ballState)
  syncIllustration(ballState)
  syncTrackBand(ballState)
  syncSound(ballState)
}
function setIgnorePausedUntil(ts) {
  __ignoreServerPausedUntilTs = ts
}
function setIgnoreDirectionUntil(ts) {
  __ignoreServerDirectionUntilTs = ts
}
globalThis.UISync = {
  init,
  syncAll,
  syncSpeed,
  syncSize,
  syncColors,
  syncPause,
  syncDirection,
  syncInfinity,
  syncBrainspotting,
  syncIllustration,
  syncTrackBand,
  syncSound,
  setIgnorePausedUntil,
  setIgnoreDirectionUntil
}

module.exports = {
  init,
  syncAll,
  syncSpeed,
  syncSize,
  syncColors,
  syncPause,
  syncDirection,
  syncInfinity,
  syncBrainspotting,
  syncIllustration,
  syncTrackBand,
  syncSound,
  setIgnorePausedUntil,
  setIgnoreDirectionUntil
}
