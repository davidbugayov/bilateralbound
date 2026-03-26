'use strict';
/**
 * UI Sync - синхронизация UI с состоянием сервера
 * @module application/controller/ui-sync
 */

let _components = {};
let _deps = {};
let __ignoreServerPausedUntilTs = 0;
let __ignoreServerDirectionUntilTs = 0;
function init(components, deps) {
  _components = components;
  _deps = deps;
}
function syncSpeed(ballState) {
  if (ballState.speed !== undefined) {
    _components.speed?.setSpeed(ballState.speed, true);
  }
}
function syncSize(ballState) {
  if (ballState.radius !== undefined && _components.size?.setSize) {
    const sizes = [20, 40, 80, 100];
    const closest = sizes.reduce(
      (p, c) =>
        Math.abs(c - ballState.radius) < Math.abs(p - ballState.radius) ? c : p,
      sizes[0],
    );
    _components.size.setSize(closest);
  }
}
function syncColors(ballState) {
  if (ballState.colorBall && _components.ballColor?.setColor) {
    _components.ballColor.setColor(ballState.colorBall);
  }
  if (ballState.colorBg && _components.bgColor?.setColor) {
    _components.bgColor.setColor(ballState.colorBg);
  }
}
function syncPause(ballState) {
  if (ballState.paused === undefined) return;
  if (performance.now() >= __ignoreServerPausedUntilTs) {
    _deps.setIsPlaying(!ballState.paused);
    _deps.updatePlayPauseButton();
    _deps.syncFsPlayPauseButton();
  }
}
function getDirectionMode(dirX, dirY) {
  const ax = Math.abs(dirX),
    ay = Math.abs(dirY);
  if (ax > 0.9 && ay < 0.2) return 'horizontal';
  if (ay > 0.9 && ax < 0.2) return 'vertical';
  if (ax > ay * 2) return 'horizontal';
  if (ay > ax * 2) return 'vertical';
  if (dirX > 0 && dirY > 0) return 'diagRL';
  if (dirX > 0 && dirY < 0) return 'diagRLL';
  return null;
}
function syncDirection(ballState) {
  if (ballState.dirX === undefined || ballState.dirY === undefined) return;
  if (performance.now() < __ignoreServerDirectionUntilTs) return;
  const mode = getDirectionMode(ballState.dirX, ballState.dirY);
  if (mode && mode !== _deps.getCurrentDirectionMode()) {
    _deps.setDirectionState({ dx: ballState.dirX, dy: ballState.dirY });
    _deps.setCurrentDirectionMode(mode);
    _deps.updateDirectionButtons();
    _deps.updateDirectionDisplay(ballState.dirX, ballState.dirY);
  }
}
function syncSound(ballState) {
  if (ballState.soundEnabled !== undefined) {
    const cb = document.getElementById('soundEnabledCheckbox');
    if (cb) {
      cb.checked = Boolean(ballState.soundEnabled);
      const tc = document.getElementById('soundTypeControl');
      if (tc) {
        tc.style.opacity = ballState.soundEnabled ? '1' : '0.5';
        tc.style.pointerEvents = ballState.soundEnabled ? 'auto' : 'none';
      }
    }
  }
  if (ballState.soundType) {
    const sel = document.getElementById('soundTypeSelect');
    if (sel) sel.value = ballState.soundType;
  }
}
function syncAll(ballState) {
  if (!ballState) return;
  _deps.updatePreviewSize(ballState.viewerScreenSize);
  globalThis.__current.viewerConnected = ballState.viewerConnected;
  globalThis.__current.viewerScreenSize = ballState.viewerScreenSize;
  _deps.updateViewerStatusUI();
  syncSpeed(ballState);
  syncSize(ballState);
  syncColors(ballState);
  syncPause(ballState);
  syncDirection(ballState);
  syncSound(ballState);
}
function setIgnorePausedUntil(ts) {
  __ignoreServerPausedUntilTs = ts;
}
function setIgnoreDirectionUntil(ts) {
  __ignoreServerDirectionUntilTs = ts;
}
globalThis.UISync = {
  init,
  syncAll,
  syncSpeed,
  syncSize,
  syncColors,
  syncPause,
  syncDirection,
  syncSound,
  getDirectionMode,
  setIgnorePausedUntil,
  setIgnoreDirectionUntil,
};

module.exports = {
  init,
  syncAll,
  syncSpeed,
  syncSize,
  syncColors,
  syncPause,
  syncDirection,
  syncSound,
  getDirectionMode,
  setIgnorePausedUntil,
  setIgnoreDirectionUntil,
};
