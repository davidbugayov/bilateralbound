'use strict'
/**
 * PreviewController - контроллер для управления превью экрана контроллера
 * Отвечает за синхронизацию размеров превью с размерами экрана вьювера
 * и управление отображением мяча в превью
 */
export default class PreviewController {
  /**
   * Создает экземпляр контроллера превью
   * @param {PhysicsEngine} physicsEngine - движок физики для превью
   * @param {BallRenderer} renderer - рендерер для отрисовки
   */
  constructor(physicsEngine, renderer) {
    this.physicsEngine = physicsEngine
    this.renderer = renderer
  }
  /**
   * Обновляет размер превью в соответствии с размерами экрана вьювера
   * @param {Object} viewerScreenSize - объект с размерами экрана вьювера
   * @param {number} viewerScreenSize.width - ширина экрана вьювера
   * @param {number} viewerScreenSize.height - высота экрана вьювера
   */
  updatePreviewSize(viewerScreenSize) {
    if (this.renderer && this.physicsEngine) {
      // Обновляем размер мира в движке физики
      this.physicsEngine.setWorldSize(viewerScreenSize.width, viewerScreenSize.height)
      // Обновляем размер canvas в рендерере
      const canvas = this.renderer.canvas
      if (canvas) {
        const container = canvas.parentElement
        const containerRect = container.getBoundingClientRect()
        const maxWidth = Math.min(containerRect.width - 40, 500)
        const maxHeight = Math.min(400, maxWidth * 0.75)
        const viewerRatio = viewerScreenSize.width / viewerScreenSize.height
        let previewWidth = maxWidth
        let previewHeight = previewWidth / viewerRatio
        if (previewHeight > maxHeight) {
          previewHeight = maxHeight
          previewWidth = previewHeight * viewerRatio
        }

        canvas.width = previewWidth
        canvas.height = previewHeight
        canvas.style.width = canvas.width + 'px'
        canvas.style.height = canvas.height + 'px'
      }
    }
  }
  /**
   * Центрирует мяч в превью
   * Используется при инициализации или сбросе позиции
   */
  centerBall() {
    if (this.physicsEngine) {
      const centerX = this.physicsEngine.options.worldWidth / 2
      const centerY = this.physicsEngine.options.worldHeight / 2
      this.physicsEngine.setPosition(centerX, centerY)
    }
  }
}
