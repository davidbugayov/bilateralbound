'use strict';
/**
 * PreviewManager - Управление превью контроллера
 * @module application/controller/preview-manager
 */
/* global PhysicsEngine, BallRenderer, debugWarn */
let _previewPhysicsEngine = null;
let _callbacks = {
  onBounce: () => {},
  getLastServerState: () => null,
  isFullscreenActive: () => false,
  getFullscreenCanvas: () => null,
};
/**
 * Инициализация превью
 */
async function initializePreview(callbacks) {
  if (callbacks) {
    _callbacks = { ..._callbacks, ...callbacks };
  }
  showWaitingForViewer();
  const previewWrap = document.getElementById('previewWrap');
  if (previewWrap) {
    previewWrap.style.display = 'block';
  }
  const canvas = document.getElementById('preview');
  if (!canvas) return;
  if (canvas.width === 0 || canvas.height === 0) {
    const container = canvas.parentElement;
    const containerRect = container.getBoundingClientRect();
    const initialWidth = Math.min(containerRect.width - 40, 500);
    const initialHeight = Math.min(400, initialWidth * 0.75);
    canvas.width = initialWidth;
    canvas.height = initialHeight;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
  }
  try {
    _previewPhysicsEngine = new PhysicsEngine({
      sessionId: 'preview',
      isViewer: true,
      clientSimulation: true,
    });
    globalThis.__previewPhysics = _previewPhysicsEngine;
    _previewPhysicsEngine.setPaused(true);
    globalThis.addEventListener('bb_bounce', () => _callbacks.onBounce());
    if (globalThis.BBConfig?.smoothing) {
      _previewPhysicsEngine.setSmoothingOptions(globalThis.BBConfig.smoothing);
    }
    globalThis.__previewRenderer = new BallRenderer(
      canvas,
      _previewPhysicsEngine,
      {
        localPhysics: true, // Physics ticked inside BallRenderer's fixed-step rAF loop
      },
    );
    globalThis.__previewRenderer.start();
    globalThis.__previewCanvas = canvas;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    if (globalThis.__current?.viewerScreenSize?.width > 0) {
      _previewPhysicsEngine.setWorldSize(
        globalThis.__current.viewerScreenSize.width,
        globalThis.__current.viewerScreenSize.height,
      );
      const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2;
      const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2;
      _previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY);
      _previewPhysicsEngine.setVelocity(0, 0);
    } else {
      _previewPhysicsEngine.setWorldSize(canvasWidth, canvasHeight);
      _previewPhysicsEngine.setPosition(canvasWidth / 2, canvasHeight / 2);
      _previewPhysicsEngine.setVelocity(0, 0);
    }
  } catch (error) {
    if (typeof debugWarn === 'function')
      debugWarn('Error initializing preview:', error);
  }
}
/**
 * Show waiting message
 */
function showWaitingForViewer() {
  const viewerInfo = document.getElementById('viewerInfo');
  if (viewerInfo) {
    viewerInfo.textContent =
      globalThis.i18n?.t('controller.waitingForViewerConnection') ||
      '⏳ Waiting for viewer connection';
    viewerInfo.style.display = 'block';
  }
  if (_previewPhysicsEngine) {
    const canvas = document.getElementById('preview');
    if (canvas) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      _previewPhysicsEngine.setPosition(centerX, centerY);
      _previewPhysicsEngine.setVelocity(0, 0);
      _previewPhysicsEngine.setPaused(true);
    }
  }
}
/**
 * Hide waiting message
 */
function hideWaitingForViewer() {
  const viewerInfo = document.getElementById('viewerInfo');
  if (viewerInfo) {
    viewerInfo.style.display = 'none';
  }
}
/**
 * Update preview size
 */
function updatePreviewSize(viewerScreenSize) {
  if (canUpdatePreview(viewerScreenSize)) {
    const canvas = document.getElementById('preview');
    if (!canvas) return;
    const { previewWidth, previewHeight } = calculatePreviewDimensions(
      canvas,
      viewerScreenSize,
    );
    setCanvasDimensions(canvas, previewWidth, previewHeight);
    updatePhysicsEngineWorldSize(viewerScreenSize);
    applyServerStateOrCenter();
    updateViewerInfo(viewerScreenSize);
  } else {
    showWaitingForViewer();
    centerBallInViewer();
  }
}
function canUpdatePreview(viewerScreenSize) {
  return Boolean(
    viewerScreenSize && globalThis.__previewRenderer && _previewPhysicsEngine,
  );
}
function calculatePreviewDimensions(canvas, viewerScreenSize) {
  const container = canvas.parentElement;
  const containerRect = container.getBoundingClientRect();
  const maxWidth = Math.min(containerRect.width - 40, 500);
  const maxHeight = Math.min(400, maxWidth * 0.75);
  const viewerRatio = viewerScreenSize.width / viewerScreenSize.height;
  let previewWidth = maxWidth;
  let previewHeight = previewWidth / viewerRatio;
  if (previewHeight > maxHeight) {
    previewHeight = maxHeight;
    previewWidth = previewHeight * viewerRatio;
  }
  return { previewWidth, previewHeight };
}
function setCanvasDimensions(canvas, previewWidth, previewHeight) {
  canvas.width = previewWidth;
  canvas.height = previewHeight;
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
}
function updatePhysicsEngineWorldSize(viewerScreenSize) {
  if (
    _previewPhysicsEngine &&
    viewerScreenSize?.width &&
    viewerScreenSize?.height
  ) {
    _previewPhysicsEngine.setWorldSize(
      viewerScreenSize.width,
      viewerScreenSize.height,
    );
  }
}
function applyServerStateOrCenter() {
  const lastState = _callbacks.getLastServerState();
  if (lastState && _previewPhysicsEngine) {
    _previewPhysicsEngine.applyCommand(lastState);
  } else {
    centerBallInViewer();
  }
}
/**
 * Center ball in viewer
 */
function centerBallInViewer() {
  if (!_previewPhysicsEngine) return;
  if (globalThis.__current?.viewerScreenSize?.width > 0) {
    const viewerCenterX = globalThis.__current.viewerScreenSize.width / 2;
    const viewerCenterY = globalThis.__current.viewerScreenSize.height / 2;
    _previewPhysicsEngine.setPosition(viewerCenterX, viewerCenterY);
    _previewPhysicsEngine.setVelocity(0, 0);
  } else if (
    _callbacks.isFullscreenActive() &&
    _callbacks.getFullscreenCanvas()
  ) {
    const fsCanvas = _callbacks.getFullscreenCanvas();
    _previewPhysicsEngine.setPosition(fsCanvas.width / 2, fsCanvas.height / 2);
    _previewPhysicsEngine.setVelocity(0, 0);
  } else if (globalThis.__previewCanvas) {
    _previewPhysicsEngine.setPosition(
      globalThis.__previewCanvas.width / 2,
      globalThis.__previewCanvas.height / 2,
    );
    _previewPhysicsEngine.setVelocity(0, 0);
  }
}
/**
 * Update viewer info
 */
function updateViewerInfo(viewerScreenSize) {
  const viewerInfo = document.getElementById('viewerInfo');
  if (viewerInfo) {
    const label = globalThis.i18n?.t('controller.viewerSize') || 'Viewer';
    viewerInfo.textContent = `${label}: ${viewerScreenSize.width}×${viewerScreenSize.height}`;
    viewerInfo.style.display = 'block';
  }
}
/**
 * Get physics engine
 */
function getPreviewPhysicsEngine() {
  return _previewPhysicsEngine;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PreviewManager = {
    init: initializePreview,
    getPhysicsEngine: getPreviewPhysicsEngine,
    updateSize: updatePreviewSize,
    centerBall: centerBallInViewer,
    showWaiting: showWaitingForViewer,
    hideWaiting: hideWaitingForViewer,
    updateViewerInfo,
  };
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
};
