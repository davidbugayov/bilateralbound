/**
 * PreviewController - Управление превью канвасом
 * Отвечает за отрисовку превью мяча и физику
 */
class PreviewController {
  constructor(appState) {
    this.appState = appState;
    this.previewRenderer = null;
    this.previewScale = 1;
    this.previewPhysicsEngine = null;
    this.lastPreviewRenderTime = 0;
    this.hiddenThrottleMs = 100;
    
    this.init();
  }

  init() {
    // Инициализация превью канваса
    const previewCanvas = document.getElementById('preview');
    if (!previewCanvas) {
      return;
    }

    // Настройка масштабирования
    this.updatePreviewScale();
    
    // Создание физического движка для превью
    this.previewPhysicsEngine = new PhysicsEngine({
      width: previewCanvas.width,
      height: previewCanvas.height,
      ballRadius: 20
    });

    // Создание рендерера для превью
    this.previewRenderer = new BallRenderer(previewCanvas, this.previewPhysicsEngine, {
      showTrail: false,
      showGrid: false
    });

    // Обработчик изменения размера окна
    window.addEventListener('resize', () => this.updatePreviewScale());
  }

  updatePreviewScale() {
    const previewCanvas = document.getElementById('preview');
    if (!previewCanvas) return;

    const container = previewCanvas.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const scale = Math.min(
      containerRect.width / 400,
      containerRect.height / 300
    );
    
    this.previewScale = Math.max(0.5, Math.min(1.5, scale));
    
    previewCanvas.style.transform = `scale(${this.previewScale})`;
    previewCanvas.style.transformOrigin = 'center';
  }

  updatePreview(dt) {
    if (!this.previewPhysicsEngine || !this.previewRenderer) return;

    // Обновляем физику
    this.previewPhysicsEngine.update(dt);
    
    // Рендерим с учетом скрытой вкладки
    const now = Date.now();
    if (document.hidden) {
      if (now - this.lastPreviewRenderTime < this.hiddenThrottleMs) return;
    }
    
    this.previewRenderer.render();
    this.lastPreviewRenderTime = now;
  }

  setPreviewDirection(dx, dy) {
    if (!this.previewPhysicsEngine) return;
    
    this.previewPhysicsEngine.setDirection(dx, dy);
  }

  resetPreview() {
    if (!this.previewPhysicsEngine) return;
    
    this.previewPhysicsEngine.reset();
  }

  destroy() {
    if (this.previewRenderer) {
      this.previewRenderer.destroy();
      this.previewRenderer = null;
    }
    
    this.previewPhysicsEngine = null;
  }
}

export default PreviewController;
