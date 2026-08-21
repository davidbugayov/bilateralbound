'use strict'
/**
 * Settings — ball color, size, sound, background, illustration, track band.
 * All setter functions that send WS updates + update local state.
 * @module application/controller/settings
 */

let _deps = {}

function init(deps) {
  _deps = deps
}

const ILLUS_TABS = {
  animals: ['🦁','🐻','🦊','🐱','🐧','🐼','🦄','🐢','🐝','🐯','🐘','🐮','🐰','🐵','🦅'],
  sport:   ['⚽','🏀','🎾','🏈','⚾','🎱','🏐','🥎','🏓','🎯','🏒','⛳'],
  emoji:   ['😀','😎','🤩','😍','🥳','😴','🤔','😱','🔥','⭐','💎','❤️','✨','🌈','🎵']
}

function updateSpeed(speed) {
  if (globalThis.__current?.isInitializing) return
  if (!globalThis.__current?.viewerConnected) {
    _deps.showViewerNotConnectedWarning?.()
    return
  }
  try {
    _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { speed })
    try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'speed', value: speed } })) } catch (e) { void e }
  } catch (err) {
    _deps.debugWarn?.('Error updating speed:', err)
  }
}

function setBallColor(color) {
  if (globalThis.__current?.isInitializing) {
    const ls = _deps.getLastServerState?.()
    if (ls) ls.colorBall = color
    return
  }
  if (!globalThis.__current?.viewerConnected) {
    const ls = _deps.getLastServerState?.()
    if (ls) ls.colorBall = color
    return
  }
  _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { colorBall: color })
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'ballColor', value: color } })) } catch (e) { void e }
}

function setBallSize(size) {
  const ls = _deps.getLastServerState?.()
  if (ls) ls.radius = size
  const engine = _deps.getPreviewPhysicsEngine?.()
  if (engine) engine.ball.radius = size
  if (globalThis.__current?.isInitializing) return
  _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { radius: size })
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'ballSize', value: size } })) } catch (e) { void e }
}

function setSoundEnabled(enabled) {
  if (globalThis.__current?.isInitializing) return
  if (!globalThis.__current?.viewerConnected) {
    _deps.showViewerNotConnectedWarning?.()
    return
  }
  _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { soundEnabled: Boolean(enabled) })
  const ls = _deps.getLastServerState?.()
  if (ls) ls.soundEnabled = Boolean(enabled)
  _deps.updateAudioIndicators?.()
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'soundEnabled', value: Boolean(enabled) } })) } catch (e) { void e }
}

function setSoundType(soundType) {
  if (globalThis.__current?.isInitializing) return
  if (!globalThis.__current?.viewerConnected) {
    _deps.showViewerNotConnectedWarning?.()
    return
  }
  _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { soundType: soundType })
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'soundType', value: soundType } })) } catch (e) { void e }
}

function setBallSizeMultiplier(multiplier) {
  setBallSize(20 * multiplier)
}

function setBackgroundColor(color) {
  if (globalThis.__previewRenderer) {
    globalThis.__previewRenderer.setBackgroundColor(color)
  }
  _deps.setPreviewBackgroundColor?.(color)
  if (globalThis.__current?.isInitializing) {
    const ls = _deps.getLastServerState?.()
    if (ls) ls.colorBg = color
    return
  }
  if (!globalThis.__current?.viewerConnected) {
    const ls = _deps.getLastServerState?.()
    if (ls) ls.colorBg = color
    return
  }
  _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { colorBg: color })
  try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'bgColor', value: color } })) } catch (e) { void e }
}

function setIllustration(emoji, btnEl) {
  const val = (typeof emoji === 'string' && emoji.length > 0) ? emoji : null
  document.querySelectorAll('.illus-emoji-btn').forEach(b => b.classList.remove('active'))
  if (btnEl) btnEl.classList.add('active')
  const preview = document.getElementById('illusSelectedPreview')
  if (preview) preview.textContent = val || ''
  const engine = _deps.getPreviewPhysicsEngine?.()
  if (engine) engine.ball.ballEmoji = val
  const ls = _deps.getLastServerState?.()
  if (ls) ls.ballEmoji = val
  if (globalThis.__current?.isInitializing) return
  _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { ballEmoji: val })
}

function applyCustomIllustration() {
  const input = document.getElementById('illusCustomInput')
  if (!input) return
  const val = input.value.trim()
  if (!val) return
  document.querySelectorAll('.illus-emoji-btn').forEach(b => b.classList.remove('active'))
  setIllustration(val, null)
}

function switchIllusTab(tab, tabEl) {
  document.querySelectorAll('.illus-tab').forEach(t => t.classList.remove('active'))
  if (tabEl) tabEl.classList.add('active')
  const grid = document.getElementById('illusGrid')
  if (!grid) return
  const currentEmoji = _deps.getLastServerState?.()?.ballEmoji || null
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
  const ls = _deps.getLastServerState?.()
  if (ls) ls.trackBand = band
  const engine = _deps.getPreviewPhysicsEngine?.()
  if (engine) engine.options.trackBand = band
  if (globalThis.__current?.isInitializing) return
  if (_deps.getIsPlaying?.()) {
    globalThis.__suppressPauseNotification = true
    _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { paused: true, returnToCenter: true })
    if (engine) {
      _deps.centerBallInViewer?.()
      engine.setPaused(true)
    }
    setTimeout(() => {
      _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { paused: false, trackBand: band })
      if (engine) engine.setPaused(false)
      setTimeout(() => { globalThis.__suppressPauseNotification = false }, 600)
    }, 400)
  } else {
    _deps.safeSend?.(globalThis.WS_MSG.controllerUpdate, { trackBand: band })
  }
}

module.exports = {
  init,
  ILLUS_TABS,
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
}
