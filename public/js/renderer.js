/**
 * BallRenderer - оптимизированный модуль рендеринга для BilateralBound
 * Отвечает за отрисовку шарика и фона
 * Оптимизирован для производительности и переиспользуемости
 */

class BallRenderer {
  constructor (canvas, physicsEngine) {
    // Проверяем входные параметры
    if (!canvas) {
      throw new Error('Canvas element is required for BallRenderer')
    }
    if (!physicsEngine) {
      throw new Error('PhysicsEngine is required for BallRenderer')
    }

    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.physics = physicsEngine

    // Проверяем, что canvas имеет правильный контекст
    if (!this.ctx) {
      throw new Error('Unable to get 2D context from canvas')
    }

    this.animationFrameId = null
    this.lastTime = 0
    this.targetFrameTime = 1000 / 60 // 60 FPS

    this.onFrameCallback = null

    // Кэшируем часто используемые значения
    this.pi2 = Math.PI * 2
    this.fillRect = this.ctx.fillRect.bind(this.ctx)
    this.beginPath = this.ctx.beginPath.bind(this.ctx)
    this.arc = this.ctx.arc.bind(this.ctx)
    this.fill = this.ctx.fill.bind(this.ctx)

    // Предварительно создаем объекты для переиспользования
    this.ball = this.physics.ball
    this.colors = this.physics.colors
  }

  /**
     * Запускает рендеринг
     */
  start () {
    if (this.animationFrameId) {
      this.stop()
    }
    this.lastTime = 0
    // Привязываем контекст для предотвращения потери this
    this.renderLoop = this.renderLoop.bind(this)
    this.renderLoop(performance.now())
  }

  /**
     * Останавливает рендеринг
     */
  stop () {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  /**
     * Устанавливает callback для каждого кадра
     */
  setFrameCallback (callback) {
    this.onFrameCallback = callback
  }

  /**
     * Основной цикл рендеринга (оптимизированный)
     */
  renderLoop (currentTime) {
    // Усиленная проверка на валидность всех компонентов
    if (!this.canvas || !this.ctx || !this.physics) {
      console.warn('BallRenderer: Missing required components, stopping render loop')
      this.stop()
      return
    }

    // Проверяем что canvas все еще существует и имеет правильный контекст
    if (!this.canvas.parentNode || this.ctx.canvas !== this.canvas) {
      console.warn('BallRenderer: Canvas context corrupted, stopping render loop')
      this.stop()
      return
    }

    // Используем метод валидации canvas
    if (!this.validateCanvas()) {
      console.warn('BallRenderer: Canvas validation failed, stopping render loop')
      this.stop()
      return
    }

    const deltaTime = currentTime - this.lastTime

    // Обновляем физику только при достаточном deltaTime
    if (deltaTime >= this.targetFrameTime) {
      try {
        // Вызываем callback перед обновлением физики
        if (this.onFrameCallback) {
          this.onFrameCallback(deltaTime)
        }

        // Обновляем физику
        this.physics.update(deltaTime / 1000)

        // Рендерим сцену
        this.render()

        this.lastTime = currentTime
      } catch (error) {
        console.error('BallRenderer: Error during render loop:', error)
        this.stop()
        return
      }
    }

    this.animationFrameId = requestAnimationFrame((timestamp) => this.renderLoop(timestamp))
  };

  /**
     * Рендерит сцену (оптимизированная версия)
     */
  render () {
    // Финальная проверка перед рендерингом
    if (!this.canvas || !this.ctx || !this.physics) {
      console.warn('BallRenderer: Cannot render - missing required components')
      return
    }

    try {
      // Очищаем canvas
      this.ctx.fillStyle = this.colors.bg
      this.fillRect(0, 0, this.canvas.width, this.canvas.height)

      // Рисуем шарик
      this.renderBall()
    } catch (error) {
      console.error('BallRenderer: Error during rendering:', error)
      // Не останавливаем рендер луп, просто пропускаем кадр
    }
  }

  /**
     * Рисует шарик (оптимизированная версия)
     */
  renderBall () {
    // Проверяем валидность данных шарика
    if (!this.ball || typeof this.ball.x !== 'number' || typeof this.ball.y !== 'number') {
      console.warn('BallRenderer: Invalid ball data, skipping render')
      return
    }

    const ball = this.ball

    // Проверяем разумные значения
    if (ball.radius <= 0 || ball.radius > 1000) {
      console.warn('BallRenderer: Invalid ball radius:', ball.radius)
      return
    }

    try {
      this.beginPath()
      this.arc(ball.x, ball.y, ball.radius, 0, this.pi2)
      this.ctx.fillStyle = this.colors.ball
      this.fill()
    } catch (error) {
      console.error('BallRenderer: Error rendering ball:', error)
    }
  }

  /**
     * Изменяет размеры canvas
     */
  resize (width, height) {
    if (!this.canvas) {
      console.warn('BallRenderer: Cannot resize - canvas is not available')
      return
    }

    try {
      this.canvas.width = width
      this.canvas.height = height

      // Обновляем размеры мира физики
      if (this.physics) {
        this.physics.setWorldSize(width, height)
      }
    } catch (error) {
      console.error('BallRenderer: Error resizing canvas:', error)
    }
  }

  /**
   * Проверяет и восстанавливает canvas при необходимости
   */
  validateCanvas () {
    if (!this.canvas) {
      console.error('BallRenderer: Canvas is null or undefined')
      return false
    }

    if (!this.canvas.parentNode) {
      console.warn('BallRenderer: Canvas is not in DOM')
      return false
    }

    if (!this.ctx) {
      console.warn('BallRenderer: Canvas context is lost, attempting to restore')
      try {
        this.ctx = this.canvas.getContext('2d')
        if (this.ctx) {
          // Переинициализируем кэшированные методы
          this.fillRect = this.ctx.fillRect.bind(this.ctx)
          this.beginPath = this.ctx.beginPath.bind(this.ctx)
          this.arc = this.ctx.arc.bind(this.ctx)
          this.fill = this.ctx.fill.bind(this.ctx)
          console.log('BallRenderer: Canvas context restored successfully')
          return true
        }
      } catch (error) {
        console.error('BallRenderer: Failed to restore canvas context:', error)
      }
      return false
    }

    return true
  }

  // === ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ ДЛЯ ПЕРЕИСПОЛЬЗОВАНИЯ ===

  /**
     * Клонирует рендерер для нового canvas
     */
  clone (newCanvas) {
    return new BallRenderer(newCanvas, this.physics)
  }

  /**
     * Устанавливает новый движок физики
     */
  setPhysicsEngine (physicsEngine) {
    if (!physicsEngine) {
      console.error('BallRenderer: Invalid physics engine provided')
      return
    }

    if (!physicsEngine.ball || !physicsEngine.colors) {
      console.error('BallRenderer: Physics engine missing required properties (ball, colors)')
      return
    }

    this.physics = physicsEngine
    this.ball = this.physics.ball
    this.colors = this.physics.colors

    console.log('BallRenderer: Physics engine updated successfully')
  }

  /**
     * Рендерит сцену без обновления физики (для статичного рендеринга)
     */
  renderStatic () {
    this.render()
  }

  /**
     * Устанавливает FPS для рендеринга
     */
  setFPS (fps) {
    this.targetFrameTime = 1000 / fps
  }

  /**
     * Получает текущий FPS
     */
  getFPS () {
    return 1000 / this.targetFrameTime
  }

  /**
     * Рендерит с дополнительными эффектами
     */
  renderWithEffects (effects = {}) {
    // Основной рендеринг
    this.render()

    // Применяем дополнительные эффекты
    if (effects.shadow) {
      this.renderShadow()
    }
    if (effects.glow) {
      this.renderGlow()
    }
    if (effects.trail) {
      this.renderTrail()
    }
  }

  /**
     * Рендерит тень шарика
     */
  renderShadow () {
    const ball = this.ball

    this.ctx.save()
    this.ctx.globalAlpha = 0.3
    this.ctx.fillStyle = '#000000'
    this.beginPath()
    this.arc(ball.x + 2, ball.y + 2, ball.radius, 0, this.pi2)
    this.fill()
    this.ctx.restore()
  }

  /**
     * Рендерит свечение шарика
     */
  renderGlow () {
    const ball = this.ball

    this.ctx.save()
    this.ctx.shadowColor = this.colors.ball
    this.ctx.shadowBlur = 20
    this.ctx.fillStyle = this.colors.ball
    this.beginPath()
    this.arc(ball.x, ball.y, ball.radius, 0, this.pi2)
    this.fill()
    this.ctx.restore()
  }

  /**
     * Рендерит след шарика
     */
  renderTrail () {
    // Простая реализация следа
    this.ctx.save()
    this.ctx.globalAlpha = 0.1
    this.ctx.fillStyle = this.colors.ball
    this.beginPath()
    this.arc(this.ball.x, this.ball.y, this.ball.radius * 1.5, 0, this.pi2)
    this.fill()
    this.ctx.restore()
  }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.BallRenderer = BallRenderer
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BallRenderer
}
