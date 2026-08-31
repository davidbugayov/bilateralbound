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
let _fsListenersAdded = false
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
  getComponents: () => ({}),
  calculatePreviewDimensions: () => ({
    previewWidth: 500,
    previewHeight: 250
  }),
  setCanvasDimensions: () => {},
  syncFsPlayPauseButton: () => {},
  buildViewerUrl: (sid) => `${globalThis.location.origin}/s/${sid}`
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
      _previewFsRenderer = new BallRenderer(
        _previewFsCanvas,
        previewPhysicsEngine,
        {
          localPhysics: false,
          preserveWorldSize: true // Fullscreen canvas ≠ viewer world; prevent canvas resize from overwriting world size
        }
      )
      _previewFsRenderer.start()
    }
  } catch (err) {
    if (typeof debugError === 'function')
      debugError('Error initializing fullscreen preview:', err)
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
  history.pushState(
    { fullscreen: true, returnUrl: currentUrl },
    '',
    fullscreenUrl
  )
  overlay.style.display = 'block'
  _isPreviewFullscreen = true
  document.body.classList.add('fullscreen-active')
  // Track fullscreen usage
  try {
    globalThis.dispatchEvent(
      new CustomEvent('bb_metrika_feature_used', {
        detail: { feature: 'fullscreen', action: 'open' }
      })
    )
  } catch (e) {
    void e
  }
  _initializeFullscreenRenderer()
  resizePreviewFullscreen()
  setupFsPanelAutoHide()
  setupFsPanelDrag()
  setupFullscreenGestures()
  _fsListenersAdded = true
  if (typeof _callbacks.syncFsPlayPauseButton === 'function') {
    _callbacks.syncFsPlayPauseButton()
  } else {
    syncFsPlayPauseButton()
  }
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
  // Restore preview to correct size after fullscreen
  const canvas = document.getElementById('preview')
  const vs = globalThis.__current?.viewerScreenSize
  const previewPhysicsEngine = _callbacks.getPreviewPhysicsEngine()
  if (canvas) {
    if (vs && vs.width > 0 && vs.height > 0) {
      const { previewWidth, previewHeight } =
        _callbacks.calculatePreviewDimensions(canvas, vs)
      _callbacks.setCanvasDimensions(canvas, previewWidth, previewHeight)
      if (previewPhysicsEngine) {
        previewPhysicsEngine.setWorldSize(vs.width, vs.height)
      }
    } else {
      canvas.width = 500
      canvas.height = 250
      canvas.style.width = '500px'
      canvas.style.height = '250px'
      if (previewPhysicsEngine) {
        previewPhysicsEngine.setWorldSize(500, 250)
      }
    }
    if (previewPhysicsEngine) {
      const cx = previewPhysicsEngine.options.worldWidth / 2
      const cy = previewPhysicsEngine.options.worldHeight / 2
      previewPhysicsEngine.setPosition(cx, cy)
      previewPhysicsEngine.setVelocity(0, 0)
      previewPhysicsEngine.setPaused(true)
    }
  }
}
/**
 * Изменить размер fullscreen canvas
 */
function resizePreviewFullscreen() {
  if (!_previewFsCanvas) return
  _previewFsCanvas.width = globalThis.innerWidth
  _previewFsCanvas.height = globalThis.innerHeight
  // Override CSS 100vw/100vh with explicit px values so BallRenderer.renderLoop()
  // sees clientWidth === canvas.width and doesn't call resize() which would
  // overwrite the viewer world size with canvas dimensions, shifting the ball
  _previewFsCanvas.style.width = globalThis.innerWidth + 'px'
  _previewFsCanvas.style.height = globalThis.innerHeight + 'px'
  const previewPhysicsEngine = _callbacks.getPreviewPhysicsEngine()
  if (previewPhysicsEngine) {
    const vs = globalThis.__current?.viewerScreenSize
    if (vs && vs.width > 0 && vs.height > 0) {
      previewPhysicsEngine.setWorldSize(vs.width, vs.height)
    } else {
      previewPhysicsEngine.setWorldSize(
        globalThis.innerWidth,
        globalThis.innerHeight
      )
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
  if (_fsListenersAdded) return
  const panel = document.getElementById('previewFsPanel')
  const overlay = document.getElementById('previewOverlay')
  if (!panel || !overlay) return
  const show = () => {
    panel.style.opacity = '1'
  }
  const hide = () => {
    panel.style.opacity = '0'
  }
  const scheduleHide = () => {
    clearTimeout(_fsPanelHideTimer)
    _fsPanelHideTimer = setTimeout(hide, 2000)
  }
  overlay.addEventListener('mousemove', () => {
    show()
    scheduleHide()
  })
  overlay.addEventListener('click', () => {
    show()
    scheduleHide()
  })
  show()
  scheduleHide()
}
/**
 * Перетаскивание панели
 */
function setupFsPanelDrag() {
  if (_fsListenersAdded) return
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
  const onUp = () => {
    _fsPanelDrag.active = false
  }
  panel.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY))
  overlay.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY))
  globalThis.addEventListener('mouseup', onUp)
  panel.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0]
      onDown(t.clientX, t.clientY)
    },
    { passive: true }
  )
  overlay.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0]
      onMove(t.clientX, t.clientY)
    },
    { passive: true }
  )
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
  if (_fsListenersAdded) return
  const overlay = document.getElementById('previewOverlay')
  if (!overlay) return
  let startX = 0
  let startY = 0
  let swiping = false
  const threshold = 40
  const handleTouchStart = (e) => {
    const t = e.touches[0]
    startX = t.clientX
    startY = t.clientY
    swiping = true
  }
  const handleTouchEnd = (e) => {
    if (swiping) {
      swiping = false
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      _handleFullscreenSwipe(dx, dy, threshold)
    }
  }
  overlay.addEventListener('touchstart', handleTouchStart, { passive: true })
  overlay.addEventListener('touchend', handleTouchEnd, { passive: true })
}
/**
 * Синхронизация кнопки Play/Pause (fallback без DI)
 */
function syncFsPlayPauseButton() {
  const btn = document.getElementById('fsPlayPauseBtn')
  if (!btn) return
  const stopLabel = (() => {
    const v = globalThis.i18n?.t('controller.stop')
    return v && v !== 'controller.stop' ? v : 'Stop'
  })()
  const startLabel = (() => {
    const v = globalThis.i18n?.t('controller.start')
    return v && v !== 'controller.start' ? v : 'Start'
  })()
  btn.textContent = _callbacks.getIsPlaying()
    ? '⏸ ' + stopLabel
    : '▶️ ' + startLabel
}
/**
 * Подключение контролов
 */
function wireFullscreenControls() {
  const speed = document.getElementById('fsSpeed')
  if (speed) {
    const components = _callbacks.getComponents()
    if (components.speed?.getSpeed) {
      speed.value = components.speed.getSpeed()
    } else {
      speed.value = 40
    }
    speed.oninput = (e) => {
      const target = e?.target
      if (target?.value !== undefined) {
        _callbacks.updateSpeed(Number(target.value))
      }
    }
  }
  const sizes = ['fsSize1', 'fsSize2', 'fsSize3', 'fsSize4']
  sizes.forEach((id, i) => {
    const btn = document.getElementById(id)
    if (btn) btn.onclick = () => _callbacks.setBallSizeMultiplier(i + 1)
  })
  const dirs = {
    fsDirH: 'horizontal',
    fsDirV: 'vertical',
    fsDirDL: 'diagRLL',
    fsDirDR: 'diagRL',
    fsDirRandom: 'random'
  }
  Object.entries(dirs).forEach(([id, mode]) => {
    const btn = document.getElementById(id)
    if (btn) btn.onclick = () => _callbacks.setDirection(mode)
  })
  const ballColors = [
    '#60a5fa',
    '#ef4444',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#f97316',
    '#06b6d4',
    '#84cc16',
    '#fb7185',
    '#ffffff',
    '#a855f7',
    '#14b8a6'
  ]
  for (let i = 1; i <= 12; i++) {
    const btn = document.getElementById(`fsBallCol${i}`)
    if (btn) {
      const color = btn.dataset.color || ballColors[i - 1]
      btn.style.backgroundColor = color
      btn.onclick = () => _callbacks.setBallColor(color)
    }
  }
  const bgColors = [
    '#020617',
    '#000000',
    '#111827',
    '#0a2540',
    '#052e16',
    '#1a102a',
    '#fef3c7',
    '#dbeafe',
    '#fce7f3',
    '#f3f4f6',
    '#e5e7eb',
    '#d1d5db'
  ]
  for (let i = 1; i <= 12; i++) {
    const btn = document.getElementById(`fsBg${i}`)
    if (btn) {
      const color = btn.dataset.color || bgColors[i - 1]
      btn.style.backgroundColor = color
      btn.onclick = () => _callbacks.setBackgroundColor(color)
    }
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
    if (fsLink) {
      fsLink.value = _callbacks.buildViewerUrl(sid)
    }
    updateFullscreenViewerStatus()
  } catch (err) {
    if (typeof debugWarn === 'function')
      debugWarn('Error in fillFsSessionInfo:', err)
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
    statusText.textContent =
      globalThis.i18n?.t('controller.viewerConnected') || 'Connected'
  } else {
    fsViewerStatus.classList.remove('connected')
    statusText.textContent =
      globalThis.i18n?.t('controller.waitingViewer') || 'Waiting...'
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
/**
 * Обновить цвет фона fullscreen рендерера на лету
 */
function setPreviewBackgroundColor(color) {
  if (_previewFsRenderer) {
    _previewFsRenderer.setBackgroundColor(color)
  }
}
globalThis.Fullscreen = {
  init: initFullscreen,
  open: openPreviewFullscreen,
  close: closePreviewFullscreen,
  resize: resizePreviewFullscreen,
  setPreviewBackgroundColor,
  syncPlayPauseButton: syncFsPlayPauseButton,
  updateViewerStatus: updateFullscreenViewerStatus,
  isActive: isFullscreenActive,
  getCanvas: getFullscreenCanvas
}

module.exports = {
  initFullscreen,
  openPreviewFullscreen,
  closePreviewFullscreen,
  resizePreviewFullscreen,
  setPreviewBackgroundColor,
  syncFsPlayPauseButton,
  updateFullscreenViewerStatus,
  isFullscreenActive,
  getFullscreenCanvas
}
