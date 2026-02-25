'use strict'
/**
 * Viewer Status - управление статусом подключения вьювера
 * @module application/controller/viewer-status
 */
// Защита от повторной загрузки
if (typeof globalThis.ViewerStatus !== 'undefined') {
  // Модуль уже загружен
} else {
  (function() {
let _deps = {}
let _lastAudioState = null
function init(deps) {
  _deps = deps
}
function updateStatusUI() {
  const el = document.getElementById('viewerStatus')
  if (el) {
    if (globalThis.__current.viewerConnected) {
      el.textContent = globalThis.i18n?.t('controller.viewerConnected') || 'Connected'
      el.classList.add('connected')
      el.classList.remove('disconnected')
      el.style.fontWeight = '600'
      _deps.hideWaitingForViewer()
      if (globalThis.__current.viewerScreenSize?.width > 0) {
        _deps.updatePreviewSize(globalThis.__current.viewerScreenSize)
      }
      _deps.setControlsEnabled(true)
    } else {
      el.textContent = globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
      el.classList.add('disconnected')
      el.classList.remove('connected')
      el.style.fontWeight = '400'
      _deps.showWaitingForViewer()
      _deps.setControlsEnabled(false)
    }
  }
  updateAudioIndicators()
  updateLinkVisualState()
}
function updateLinkVisualState() {
  const input = document.getElementById('view')
  if (!input) return
  if (globalThis.__current.viewerConnected) {
    input.style.borderColor = '#94a3b8'
    input.style.backgroundColor = '#ffffff'
    input.style.color = '#1f2937'
    input.placeholder = ''
  } else {
    input.style.borderColor = '#ef4444'
    input.style.backgroundColor = '#fef2f2'
    input.style.color = '#ef4444'
    input.placeholder = 'Ожидание подключения вьювера...'
  }
}
function updateAudioIndicators() {
  const indicator = document.getElementById('viewerAudioIndicator')
  const text = document.getElementById('viewerAudioText')
  const playing = document.getElementById('viewerSoundPlayingIndicator')
  if (!indicator || !text || !playing) return
  const soundEnabled = _deps.getLastServerState()?.soundEnabled ?? false
  const isPlaying = globalThis.__current?.isPlaying ?? false
  const audioActivated = globalThis.__current?.viewerAudioActivated ?? false
  const state = `${soundEnabled}-${audioActivated}-${isPlaying}`
  if (_lastAudioState === state) return
  _lastAudioState = state
  if (soundEnabled) {
    if (!audioActivated) {
      indicator.classList.remove('hidden', 'ready')
      indicator.classList.add('warning')
      text.textContent = globalThis.i18n?.t('controller.viewerSoundNotActivated') || "Waiting: viewer must click \"Enable sound\""
      playing.classList.add('hidden')
      playing.classList.remove('active')
    } else {
      indicator.classList.remove('hidden', 'warning')
      indicator.classList.add('ready')
      text.textContent = globalThis.i18n?.t('controller.viewerHearingSound') || 'Viewer sound activated'
      if (isPlaying) {
        playing.classList.remove('hidden')
        playing.classList.add('active')
      } else {
        playing.classList.add('hidden')
        playing.classList.remove('active')
      }
    }
  } else {
    indicator.classList.add('hidden')
    playing.classList.add('hidden')
  }
}
function updateFullscreenStatus() {
  const el = document.getElementById('fsViewerStatus')
  if (!el) return
  if (globalThis.__current.viewerConnected) {
    const text = globalThis.i18n?.t('controller.viewerConnected') || 'Viewer connected'
    el.textContent = `🟢 ${text}`
    el.classList.add('connected')
    el.classList.remove('disconnected')
  } else {
    const text = globalThis.i18n?.t('controller.waitingViewer') || 'Waiting for viewer'
    el.textContent = `🔴 ${text}`
    el.classList.add('disconnected')
    el.classList.remove('connected')
  }
}
globalThis.ViewerStatus = {
  init,
  updateStatusUI,
  updateLinkVisualState,
  updateAudioIndicators,
  updateFullscreenStatus
}
  })() // Конец IIFE
} // Конец защиты от повторной загрузки
