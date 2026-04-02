'use strict'
/**
 * PreviewManager — единый модуль управления превью контроллера
 * @module application/controller/preview-manager
 */
/* jshint esversion: 11, browser: true, node: true */
/* global PhysicsEngine, BallRenderer, debugWarn, globalThis, BBConfig, __current, i18n */

// ============================================================================
// Приватное состояние
// ============================================================================
let _physicsEngine = null
let _renderer = null
let _canvas = null
const _callbacks = {
  onBounce: () => {},
  getLastServerState: () => null,
  isFullscreenActive: () => false,
  getFullscreenCanvas: () => null
}

// ============================================================================
// Внутренние утилиты
// ============================================================================

/**
 * Получить canvas элемента с валидацией
 * @returns {HTMLCanvasElement|null}
 */
function getCanvas() {
  return document.getElementById('preview')
}

/**
 * Получить контейнер canvas
 * @param {HTMLCanvasElement} canvas
 * @returns {Element}
 */
function getContainer(canvas) {
  return canvas.parentElement
}

/**
 * Гарантировать минимальные размеры canvas
 * @param {number} w
 * @param {number} h
 * @returns {{w: number, h: number}}
 */
function ensureMinSize(w, h) {
  return { w: Math.max(w, 100), h: Math.max(h, 75) }
}

/**
 * Проверить что элементы DOM доступны
 * @returns {boolean}
 */
function hasRequiredElements() {
  return Boolean(getCanvas())
}

// ============================================================================
// Публичные функции
// ============================================================================

/**
 * Инициализация превью (standalone mode)
 * @param {Object} callbacks - Объект с callback-функциями
 * @returns {Promise<boolean>}
 */
async function initializePreview(callbacks) {
  if (callbacks) {
    Object.assign(_callbacks, callbacks)
  }
  return _initStandalone()
}

/**
 * Полная инициализация превью (standalone)
 * @returns {Promise<boolean>}
 */
async function _initStandalone() {
  if (!hasRequiredElements()) {
    if (typeof debugWarn === 'function') {
      debugWarn('PreviewManager: required DOM elements not found')
    }
    return false
  }

  showWaitingForViewer()

  const previewWrap = document.getElementById('previewWrap')
  if (previewWrap) {
    previewWrap.style.display = 'block'
  }

  const canvas = getCanvas()
  if (!canvas) return false

  // Инициализация размеров canvas при нулевых значениях
  if (canvas.width === 0 || canvas.height === 0) {
    const container = getContainer(canvas)
    const containerRect = container.getBoundingClientRect()
    const initialWidth = Math.min(containerRect.width - 40, 500)
    const initialHeight = Math.min(400, initialWidth * 0.75)
    const { w, h } = ensureMinSize(initialWidth, initialHeight)
    canvas.width = w
    canvas.height = h
    canvas.style.width = canvas.width + 'px'
    canvas.style.height = canvas.height + 'px'
  }

  try {
    // Создание physics engine
    _physicsEngine = new PhysicsEngine({
      sessionId: 'preview',
      isViewer: true,
      clientSimulation: true
    })
    _physicsEngine.setPaused(true)

    // Настройка smoothing
    if (globalThis.BBConfig?.smoothing) {
      _physicsEngine.setSmoothingOptions(globalThis.BBConfig.smoothing)
    }

    // Создание renderer
    _canvas = canvas
    _renderer = new BallRenderer(canvas, _physicsEngine, {
      localPhysics: true
    })
    _renderer.start()

    // Обработка bounce событий
    globalThis.addEventListener('bb_bounce', () => _callbacks.onBounce())

    // Начальная позиция мяча
    _initBallPosition()

    return true
  } catch (error) {
    if (typeof debugWarn === 'function') {
      debugWarn('PreviewManager: initialization error', error)
    }
    _physicsEngine = null
    _renderer = null
    return false
  }
}

/**
 * Установить начальную позицию мяча
 * @private
 */
function _initBallPosition() {
  const viewerSize = globalThis.__current?.viewerScreenSize
  if (viewerSize?.width > 0 && viewerSize?.height > 0) {
    _physicsEngine.setWorldSize(viewerSize.width, viewerSize.height)
    _physicsEngine.setPosition(viewerSize.width / 2, viewerSize.height / 2)
  } else {
    const { w, h } = ensureMinSize(_canvas.width, _canvas.height)
    _physicsEngine.setWorldSize(w, h)
    _physicsEngine.setPosition(w / 2, h / 2)
  }
  _physicsEngine.setVelocity(0, 0)
}

/**
 * Показать сообщение ожидания viewer
 */
function showWaitingForViewer() {
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.textContent =
      globalThis.i18n?.t('controller.waitingForViewerConnection') ||
      '⏳ Waiting for viewer connection'
    viewerInfo.style.display = 'block'
  }
  _centerAndPauseBall()
}

/**
 * Скрыть сообщение ожидания viewer
 */
function hideWaitingForViewer() {
  const viewerInfo = document.getElementById('viewerInfo')
  if (viewerInfo) {
    viewerInfo.style.display = 'none'
  }
}

/**
 * Центрировать и приостановить мяч
 * @private
 */
function _centerAndPauseBall() {
  if (!_physicsEngine) return
  _physicsEngine.setVelocity(0, 0)
  _physicsEngine.setPaused(true)
}

/**
 * Обновить размер превью
 * @param {Object} viewerScreenSize - Размеры экрана viewer
 */
function updatePreviewSize(viewerScreenSize) {
  if (canUpdatePreview(viewerScreenSize)) {
    const canvas = getCanvas()
    if (!canvas) return

    const { width, height } = calculatePreviewDimensions(
      canvas,
      viewerScreenSize
    )
    setCanvasDimensions(canvas, width, height)
    updatePhysicsEngineWorldSize(viewerScreenSize)
    applyServerStateOrCenter()
    updateViewerInfo(viewerScreenSize)
  } else {
    showWaitingForViewer()
    centerBallInViewer()
  }
}

/**
 * Проверить возможность обновления превью
 * @param {Object} viewerScreenSize
 * @returns {boolean}
 */
function canUpdatePreview(viewerScreenSize) {
  return Boolean(viewerScreenSize && _renderer && _physicsEngine)
}

/**
 * Вычислить размеры превью на основе viewer
 * @param {HTMLCanvasElement} canvas
 * @param {Object} viewerScreenSize
 * @returns {{width: number, height: number}}
 */
function calculatePreviewDimensions(canvas, viewerScreenSize) {
  const container = getContainer(canvas)
  const containerRect = container.getBoundingClientRect()
  const maxWidth = Math.min(containerRect.width - 40, 500)
  const maxHeight = Math.min(400, maxWidth * 0.75)
  const viewerRatio = viewerScreenSize.width / viewerScreenSize.height

  let width = maxWidth
  let height = width / viewerRatio

  if (height > maxHeight) {
    height = maxHeight
    width = height * viewerRatio
  }

  return { width, height }
}

/**
 * Установить размеры canvas
 * @param {HTMLCanvasElement} canvas
 * @param {number} width
 * @param {number} height
 */
function setCanvasDimensions(canvas, width, height) {
  canvas.width = width
  canvas.height = height
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
}

/**
 * Обновить размер мира physics engine
 * @param {Object} viewerScreenSize
 */
function updatePhysicsEngineWorldSize(viewerScreenSize) {
  if (_physicsEngine?.worldWidth && viewerScreenSize?.width > 0 && viewerScreenSize?.height > 0) {
    _physicsEngine.setWorldSize(viewerScreenSize.width, viewerScreenSize.height)
  }
}

/**
 * Применить состояние сервера или центрировать мяч
 */
function applyServerStateOrCenter() {
  const lastState = _callbacks.getLastServerState()
  if (lastState && _physicsEngine) {
    _physicsEngine.applyCommand(lastState)
  } else {
    centerBallInViewer()
  }
}

/**
 * Центрировать мяч в viewer
 */
function centerBallInViewer() {
  if (!_physicsEngine) return

  const viewerSize = globalThis.__current?.viewerScreenSize
  if (viewerSize?.width > 0 && viewerSize?.height > 0) {
    _physicsEngine.setPosition(viewerSize.width / 2, viewerSize.height / 2)
    _physicsEngine.setVelocity(0, 0)
    return
  }

  // Полноэкранный режим
  if (_callbacks.isFullscreenActive()) {
    const fsCanvas = _callbacks.getFullscreenCanvas()
    if (fsCanvas) {
      _physicsEngine.setPosition(fsCanvas.width / 2, fsCanvas.height / 2)
      _physicsEngine.setVelocity(0, 0)
      return
    }
  }

  // Canvas превью
  const canvas = _canvas || getCanvas()
  if (canvas) {
    const { w, h } = ensureMinSize(canvas.width, canvas.height)
    _physicsEngine.setPosition(w / 2, h / 2)
    _physicsEngine.setVelocity(0, 0)
  }
}

/**
 * Обновить информацию о viewer
 * @param {Object} viewerScreenSize
 */
function updateViewerInfo(viewerScreenSize) {
  const viewerInfo = document.getElementById('viewerInfo')
  if (!viewerInfo || !viewerScreenSize) return

  const label = globalThis.i18n?.t('controller.viewerSize') || 'Viewer'
  viewerInfo.textContent = `${label}: ${viewerScreenSize.width}×${viewerScreenSize.height}`
  viewerInfo.style.display = 'block'
}

/**
 * Получить physics engine
 * @returns {Object|null}
 */
function getPreviewPhysicsEngine() {
  return _physicsEngine
}

// ============================================================================
// Экспорт API
// ============================================================================

if (typeof globalThis !== 'undefined') {
  globalThis.PreviewManager = {
    init: initializePreview,
    getPhysicsEngine: getPreviewPhysicsEngine,
    updateSize: updatePreviewSize,
    centerBall: centerBallInViewer,
    showWaiting: showWaitingForViewer,
    hideWaiting: hideWaitingForViewer,
    updateViewerInfo
  }
}

module.exports = {
  initializePreview,
  getPreviewPhysicsEngine,
  updatePreviewSize,
  centerBallInViewer,
  showWaitingForViewer,
  hideWaitingForViewer,
  updateViewerInfo,
  calculatePreviewDimensions,
  setCanvasDimensions,
  updatePhysicsEngineWorldSize,
  canUpdatePreview,
  applyServerStateOrCenter
}
