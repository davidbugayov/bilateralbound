'use strict'
/**
 * Fullscreen - Управление полноэкранным режимом превью
 * @module application/controller/fullscreen
 */
/* global BallRenderer, debugError, debugWarn */
let _isPreviewFullscreen = false
let _previewFsCanvas = null
let _previewFsRenderer = null
let _fsPanelHideTimer = null
const _fsPanelDrag = { active: false, offsetX: 0, offsetY: 0 }
let _callbacks = {
  getPreviewPhysicsEngine: () => null,
  centerBallInViewer: () => {},
  setDirection: () => {},
  togglePlayPause: () => {},
  updateSpeed: () => {},
  setBallSize: () => {},
  setBallSizeMultiplier: () => {},
  setBallColor: () => {},
  setBackgroundColor: () => {},
  getIsPlaying: () => false,
  getComponents: () => ({})
}
/**
 * Инициализация модуля
 */
function initFullscreen(canvas, callbacks) {
  _previewFsCanvas = canvas
  if (callbacks) {
    _callbacks = { ..._callbacks, ...callbacks }
  }
}
/**
 * Инициализация fullscreen рендерера
 */
function _initializeFullscreenRenderer() {
  try {
    const previewPhysicsEngine = _callbacks.getPreviewPhysicsEngine()
    if (!previewPhysicsEngine) return
    if (_previewFsRenderer) {
      _previewFsRenderer.setPhysicsEngine(previewPhysicsEngine)
    } else {
      _previewFsRenderer = new BallRenderer(_previewFsCanvas, previewPhysicsEngine, {
        localPhysics: false
      })
      _previewFsRenderer.start()
    }
  } catch (err) {
    if (typeof debugError === 'function') debugError('Error initializing fullscreen preview:', err)
  }
}
/**
 * Открыть полноэкранный режим
 */
function openPreviewFullscreen() {
  const overlay = document.getElementById('previewOverlay')
  if (!overlay || !_previewFsCanvas) return
  const currentUrl = globalThis.location.href
  const fullscreenUrl = currentUrl.split('#')[0] + '#fullscreen-preview'
  history.pushState({ fullscreen: true, returnUrl: currentUrl }, '', fullscreenUrl)
  overlay.style.display = 'block'
  _isPreviewFullscreen = true
  document.body.classList.add('fullscreen-active')
  _initializeFullscreenRenderer()
  resizePreviewFullscreen()
  setupFsPanelAutoHide()
  setupFsPanelDrag()
  setupFullscreenGestures()
  syncFsPlayPauseButton()
  wireFullscreenControls()
  fillFsSessionInfo()
  if (!globalThis.__current?.viewerConnected) {
    _callbacks.centerBallInViewer()
  }
}
/**
 * Закрыть полноэкранный режим
 */
function closePreviewFullscreen() {
  const overlay = document.getElementById('previewOverlay')
  if (!overlay) return
  const currentUrl = globalThis.location.href
  const baseUrl = currentUrl.split('#')[0]
  history.replaceState(null, '', baseUrl)
  overlay.style.display = 'none'
  _isPreviewFullscreen = false
  document.body.classList.remove('fullscreen-active')
}
/**
 * Изменить размер fullscreen canvas
 */
function resizePreviewFullscreen() {
  if (!_previewFsCanvas) return
  _previewFsCanvas.width = globalThis.innerWidth
  _previewFsCanvas.height = globalThis.innerHeight
  const previewPhysicsEngine = _callbacks.getPreviewPhysicsEngine()
  if (previewPhysicsEngine) {
    const vs = globalThis.__current?.viewerScreenSize
    if (vs && vs.width > 0 && vs.height > 0) {
      previewPhysicsEngine.setWorldSize(vs.width, vs.height)
    } else {
      previewPhysicsEngine.setWorldSize(globalThis.innerWidth, globalThis.innerHeight)
      if (!globalThis.__current?.viewerConnected) {
        _callbacks.centerBallInViewer()
      }
    }
  }
}
/**
 * Автоскрытие панели
 */
function setupFsPanelAutoHide() {
  const panel = document.getElementById('previewFsPanel')
  const overlay = document.getElementById('previewOverlay')
  if (!panel || !overlay) return
  const show = () => { panel.style.opacity = '1' }
  const hide = () => { panel.style.opacity = '0' }
  const scheduleHide = () => {
    clearTimeout(_fsPanelHideTimer)
    _fsPanelHideTimer = setTimeout(hide, 2000)
  }
  overlay.addEventListener('mousemove', () => { show(); scheduleHide() })
  overlay.addEventListener('click', () => { show(); scheduleHide() })
  show()
  scheduleHide()
}
/**
 * Перетаскивание панели
 */
function setupFsPanelDrag() {
  const panel = document.getElementById('previewFsPanel')
  const overlay = document.getElementById('previewOverlay')
  if (!panel || !overlay) return
  const onDown = (x, y) => {
    const rect = panel.getBoundingClientRect()
    _fsPanelDrag.active = true
    _fsPanelDrag.offsetX = x - rect.left
    _fsPanelDrag.offsetY = y - rect.top
  }
  const onMove = (x, y) => {
    if (_fsPanelDrag.active) {
      panel.style.left = `${x - _fsPanelDrag.offsetX}px`
      panel.style.top = `${y - _fsPanelDrag.offsetY}px`
      panel.style.transform = 'translateX(0)'
    }
  }
  const onUp = () => { _fsPanelDrag.active = false }
  panel.addEventListener('mousedown', e => onDown(e.clientX, e.clientY))
  overlay.addEventListener('mousemove', e => onMove(e.clientX, e.clientY))
  globalThis.addEventListener('mouseup', onUp)
  panel.addEventListener('touchstart', e => {
    const t = e.touches[0]
    onDown(t.clientX, t.clientY)
  }, { passive: true })
  overlay.addEventListener('touchmove', e => {
    const t = e.touches[0]
    onMove(t.clientX, t.clientY)
  }, { passive: true })
  globalThis.addEventListener('touchend', onUp, { passive: true })
}
/**
 * Обработка свайпов
 */
function _handleFullscreenSwipe(dx, dy, threshold) {
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
    _callbacks.setDirection(dx > 0 ? 'horizontal' : 'vertical')
  } else if (Math.abs(dy) > threshold) {
    const isSwipedUp = dy < 0
    const isSwipedDown = dy > 0
    const isPlaying = _callbacks.getIsPlaying()
    if ((isSwipedUp && !isPlaying) || (isSwipedDown && isPlaying)) {
      _callbacks.togglePlayPause()
    }
  }
}
/**
 * Настройка жестов
 */
function setupFullscreenGestures() {
  const overlay = document.getElementById('previewOverlay')
  if (!overlay) return
  let startX = 0, startY = 0, swiping = false
  const threshold = 40
  overlay.addEventListener('touchstart', e => {
    const t = e.touches[0]
    startX = t.clientX
    startY = t.clientY
    swiping = true
  }, { passive: true })
  overlay.addEventListener('touchend', e => {
    if (swiping) {
      swiping = false
      const t = e.changedTouches[0]
      _handleFullscreenSwipe(t.clientX - startX, t.clientY - startY, threshold)
    }
  }, { passive: true })
}
/**
 * Синхронизация кнопки Play/Pause
 */
function syncFsPlayPauseButton() {
  const btn = document.getElementById('fsPlayPauseBtn')
  if (!btn) return
  btn.textContent = _callbacks.getIsPlaying() ? '⏸ Стоп' : '▶️ Старт'
}
/**
 * Подключение контролов
 */
function wireFullscreenControls() {
  const speed = document.getElementById('fsSpeed')
  if (speed) {
    const components = _callbacks.getComponents()
    speed.value = components.speed?.getSpeed?.() ?? 40
    speed.oninput = e => _callbacks.updateSpeed(Number(e.target.value))
  }
  const sizes = ['fsSize1', 'fsSize2', 'fsSize3', 'fsSize4']
  sizes.forEach((id, i) => {
    const btn = document.getElementById(id)
    if (btn) btn.onclick = () => _callbacks.setBallSizeMultiplier(i + 1)
  })
  const dirs = {
    'fsDirH': 'horizontal', 'fsDirV': 'vertical',
    'fsDirDL': 'diagRLL', 'fsDirDR': 'diagRL', 'fsDirRandom': 'random'
  }
  Object.entries(dirs).forEach(([id, mode]) => {
    const btn = document.getElementById(id)
    if (btn) btn.onclick = () => _callbacks.setDirection(mode)
  })
  const ballColors = ['#60a5fa','#ef4444','#10b981','#f59e0b','#8b5cf6','#f97316','#06b6d4','#84cc16','#fb7185','#ffffff','#a855f7','#14b8a6']
  for (let i = 1; i <= 12; i++) {
    const btn = document.getElementById(`fsBallCol${i}`)
    if (btn) btn.onclick = () => _callbacks.setBallColor(ballColors[i - 1])
  }
  const bgColors = ['#020617','#000000','#111827','#0a2540','#052e16','#1a102a','#fef3c7','#dbeafe','#fce7f3','#f3f4f6','#e5e7eb','#d1d5db']
  for (let i = 1; i <= 12; i++) {
    const btn = document.getElementById(`fsBg${i}`)
    if (btn) btn.onclick = () => _callbacks.setBackgroundColor(bgColors[i - 1])
  }
}
/**
 * Заполнить информацию о сессии
 */
function fillFsSessionInfo() {
  try {
    const sid = globalThis.__current?.sessionId ?? '...'
    const fsSid = document.getElementById('fsCurSid')
    if (fsSid) fsSid.textContent = `SID: ${sid}`
    const fsLink = document.getElementById('fsViewLink')
    if (fsLink) fsLink.value = `${globalThis.location.origin}/s/${sid}`
    updateFullscreenViewerStatus()
  } catch (err) {
    if (typeof debugWarn === 'function') debugWarn('Error in fillFsSessionInfo:', err)
  }
}
/**
 * Обновить статус вьювера
 */
function updateFullscreenViewerStatus() {
  const fsViewerStatus = document.getElementById('fsViewerStatus')
  if (!fsViewerStatus) return
  const statusText = fsViewerStatus.querySelector('.fs-status-text')
  if (!statusText) return
  if (globalThis.__current?.viewerConnected) {
    fsViewerStatus.classList.add('connected')
    statusText.textContent = 'Подключен'
  } else {
    fsViewerStatus.classList.remove('connected')
    statusText.textContent = 'Ожидание...'
  }
}
/**
 * Проверить активен ли fullscreen
 */
function isFullscreenActive() {
  return _isPreviewFullscreen
}
/**
 * Получить canvas
 */
function getFullscreenCanvas() {
  return _previewFsCanvas
}
if (typeof globalThis !== 'undefined') {
  globalThis.Fullscreen = {
    init: initFullscreen,
    open: openPreviewFullscreen,
    close: closePreviewFullscreen,
    resize: resizePreviewFullscreen,
    syncPlayPauseButton: syncFsPlayPauseButton,
    updateViewerStatus: updateFullscreenViewerStatus,
    isActive: isFullscreenActive,
    getCanvas: getFullscreenCanvas
  }
}
