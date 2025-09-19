/**
 * BallRenderer - оптимизированный модуль рендеринга для BilateralBound
 * Отвечает за отрисовку шарика и фона
 * Оптимизирован для производительности и переиспользуемости
 */

class BallRenderer {
  constructor (canvas, physicsEngine, options = {}) {
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
    this.targetFrameTime = 1000 / 60 // 60 FPS для стабильности
    this.frameCount = 0
    this.fps = 60
    this.actualFps = 60
    this.frameTimeHistory = [] // История времен кадров для расчета реального FPS
    this.adaptiveFrameRate = true // Адаптивная частота кадров
    this.maxFrameTime = 50 // Максимальное время кадра в ms

    this.onFrameCallback = null
    this.options = {
      localPhysics: false, // Флаг для локальной физики (для вьювера)
      dirtyRegions: false, // Частичная перерисовка по регионам
      ...options
    }

    // Применяем глобальную конфигурацию рендеринга
    if (typeof window !== 'undefined' && window.BBConfig && window.BBConfig.rendering) {
      if (window.BBConfig.rendering.adaptiveFrameRate !== undefined) {
        this.adaptiveFrameRate = window.BBConfig.rendering.adaptiveFrameRate
      }
      if (window.BBConfig.rendering.maxFrameTime) {
        this.maxFrameTime = window.BBConfig.rendering.maxFrameTime
      }
    }

    // Устанавливаем режим движка в зависимости от опции
    this.physics.isViewer = !this.options.localPhysics

    // Кэшируем часто используемые значения
    this.pi2 = Math.PI * 2
    this.fillRect = this.ctx.fillRect.bind(this.ctx)
    this.beginPath = this.ctx.beginPath.bind(this.ctx)
    this.arc = this.ctx.arc.bind(this.ctx)
    this.fill = this.ctx.fill.bind(this.ctx)

    // Предварительно создаем объекты для переиспользования
    this.ball = this.physics.ball
    this.colors = this.physics.colors

    // Кэш для градиента и формы круга
    this._cached = {
      radius: null,
      color: null,
      gradient: null,
      path: null
    }
  }

  /**
     * Запускает рендеринг
     */
  start () {
    if (this.animationFrameId) {
      this.stop()
    }
    // Инициализируем lastTime текущим временем для избежания огромного deltaTime
    this.lastTime = performance.now()
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
      this.stop()
      return
    }

    // Проверяем что canvas все еще существует и имеет правильный контекст
    if (!this.canvas.parentNode || this.ctx.canvas !== this.canvas) {
      this.stop()
      return
    }

    // Используем метод валидации canvas
    if (!this.validateCanvas()) {
      this.stop()
      return
    }

    // Если браузер уже изменил CSS‑размеры canvas (clientWidth/Height),
    // мгновенно синхронизируем внутренние размеры и пропускаем кадр,
    // чтобы избежать неравномерного масштабирования (сплющивания).
    const clientW = this.canvas.clientWidth
    const clientH = this.canvas.clientHeight
    if ((clientW && clientW !== this.canvas.width) || (clientH && clientH !== this.canvas.height)) {
      this.resize(clientW || this.canvas.width, clientH || this.canvas.height)
      this.lastTime = currentTime
      this.animationFrameId = requestAnimationFrame(this.renderLoop)
      return
    }

    const deltaTime = currentTime - this.lastTime

    // Адаптивная регулировка FPS
    if (this.adaptiveFrameRate) {
      this.frameTimeHistory.push(deltaTime)
      if (this.frameTimeHistory.length > 20) {
        this.frameTimeHistory.shift()
      }
      const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length
      this.actualFps = 1000 / avgFrameTime

      // Если производительность падает, снижаем целевой FPS
      if (avgFrameTime > this.targetFrameTime * 1.2 && this.targetFrameTime < 1000 / 30) {
        this.targetFrameTime *= 1.05 // Плавно снижаем до ~30 FPS
      } else if (avgFrameTime < this.targetFrameTime * 0.8) {
        this.targetFrameTime /= 1.05 // Плавно повышаем до 60 FPS
      }
      this.targetFrameTime = Math.max(1000 / 65, Math.min(1000 / 25, this.targetFrameTime))
    }

    if (deltaTime < this.targetFrameTime) {
      this.animationFrameId = requestAnimationFrame(this.renderLoop)
      return
    }

    // Ограничиваем deltaTime для предотвращения огромных прыжков
    const clampedDeltaTime = Math.min(deltaTime, this.maxFrameTime)

    // Обновляем счетчик кадров для FPS
    this.frameCount++

    // Всегда обновляем физику с плавным deltaTime
    try {
      // Вызываем callback перед обновлением физики
      if (this.onFrameCallback) {
        this.onFrameCallback(clampedDeltaTime)
      }

      // Обновляем физику всегда, движок сам решит, что делать
      this.physics.update(clampedDeltaTime / 1000)

      // Рендерим сцену
      this.render()

      this.lastTime = currentTime
    } catch (error) {
      this.stop()
      return
    }

    this.animationFrameId = requestAnimationFrame(this.renderLoop)
  };

  /**
     * Рендерит сцену (оптимизированная версия)
     */
  render () {
    // Финальная проверка перед рендерингом
    if (!this.canvas || !this.ctx || !this.physics) {
      return
    }

    try {
      if (!this.options.dirtyRegions) {
        // Полная перерисовка
        this.ctx.fillStyle = this.colors.bg
        this.fillRect(0, 0, this.canvas.width, this.canvas.height)
        this.renderBall()
      } else {
        // Простейшая dirty-стратегия: очищаем только окрестность предыдущего и текущего положения
        const padding = 4
        const prev = this._prevBall || { x: -1, y: -1, radius: 0 }
        const curr = this.physics.ball
        // Очистка предыдущего региона
        if (prev.x >= 0) {
          const w = prev.radius * 2 + padding * 2
          const h = prev.radius * 2 + padding * 2
          this.ctx.fillStyle = this.colors.bg
          this.fillRect(prev.x - prev.radius - padding, prev.y - prev.radius - padding, w, h)
        }
        // Очистка текущего региона и отрисовка мяча
        const w2 = curr.radius * 2 + padding * 2
        const h2 = curr.radius * 2 + padding * 2
        this.ctx.fillStyle = this.colors.bg
        this.fillRect(curr.x - curr.radius - padding, curr.y - curr.radius - padding, w2, h2)
        this.renderBall(curr)
        this._prevBall = { x: curr.x, y: curr.y, radius: curr.radius }
      }
    } catch (error) {
      // Не останавливаем рендер луп, просто пропускаем кадр
    }
  }

  /**
     * Рисует шарик (оптимизированная версия)
     */
  renderBall (ballState) {
    const ball = ballState || this.ball

    // Проверяем валидность данных шарика
    if (!ball || typeof ball.x !== 'number' || typeof ball.y !== 'number') {
      return
    }

    // Проверяем разумные значения
    if (ball.radius <= 0 || ball.radius > 1000) {
      return
    }

    try {
      // Кэшируем градиент и геометрию круга по (radius,color)
      const col = ball.colorBall || this.colors.ball
      if (this._cached.radius !== ball.radius || this._cached.color !== col) {
        this._cached.radius = ball.radius
        this._cached.color = col
        // Градиент не должен зависеть от абсолютной позиции шара,
        // чтобы исключить визуальные артефакты при ресайзе.
        const g = this.ctx.createRadialGradient(
          -ball.radius * 0.3, -ball.radius * 0.3, 0,
          0, 0, ball.radius
        )
        g.addColorStop(0, col)
        g.addColorStop(1, this.adjustBrightness(col, -20))
        this._cached.gradient = g

        const p = new Path2D()
        p.arc(0, 0, Math.max(ball.radius, 2), 0, this.pi2)
        this._cached.path = p
      }

      this.beginPath()
      // Рисуем мяч с градиентом и переиспользуемой формой
      this.ctx.save()

      // Включаем сглаживание для более плавного рендеринга
      this.ctx.imageSmoothingEnabled = true
      this.ctx.imageSmoothingQuality = 'high'

      this.ctx.translate(ball.x, ball.y)
      this.ctx.fillStyle = this._cached.gradient

      // Добавляем мягкую тень для объема
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
      this.ctx.shadowBlur = 4
      this.ctx.shadowOffsetX = 2
      this.ctx.shadowOffsetY = 2
      this.ctx.fill(this._cached.path)
      this.ctx.restore()

      // Сбрасываем тень для следующих элементов
      this.ctx.shadowColor = 'transparent'
      this.ctx.shadowBlur = 0
      this.ctx.shadowOffsetX = 0
      this.ctx.shadowOffsetY = 0
    } catch (error) {
    }
  }

  /**
   * Изменяет яркость цвета
   */
  adjustBrightness (color, amount) {
    const hex = color.replace('#', '')
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount))
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount))
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount))
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  /**
     * Изменяет размеры canvas
     */
  resize (width, height) {
    if (!this.canvas) {
      return
    }

    try {
      this.canvas.width = width
      this.canvas.height = height
      // Синхронизируем CSS размеры с реальными, чтобы избежать растягивания пикселей
      this.canvas.style.width = width + 'px'
      this.canvas.style.height = height + 'px'

      // Обновляем размеры мира физики
      if (this.physics) {
        this.physics.setWorldSize(width, height)
      }

      // Инвалидируем кэш градиента/пути при смене размеров,
      // чтобы форма и шейдинг корректно пересчитались под новый масштаб
      this._cached.radius = null
      this._cached.color = null
      this._cached.gradient = null
      this._cached.path = null
    } catch (error) {
    }
  }

  /**
   * Проверяет и восстанавливает canvas при необходимости
   */
  validateCanvas () {
    if (!this.canvas) {
      return false
    }

    if (!this.canvas.parentNode) {
      return false
    }

    if (!this.ctx) {
      try {
        this.ctx = this.canvas.getContext('2d')
        if (this.ctx) {
          // Переинициализируем кэшированные методы
          this.fillRect = this.ctx.fillRect.bind(this.ctx)
          this.beginPath = this.ctx.beginPath.bind(this.ctx)
          this.arc = this.ctx.arc.bind(this.ctx)
          this.fill = this.ctx.fill.bind(this.ctx)
          // Тихо восстанавливаем контекст канваса
          return true
        }
      } catch (error) {
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
      return
    }

    if (!physicsEngine.ball || !physicsEngine.colors) {
      return
    }

    this.physics = physicsEngine
    this.ball = this.physics.ball
    this.colors = this.physics.colors

    // Тихо обновляем рендерер
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
   * Рендерит один кадр с переданным состоянием.
   * Удобно для внешнего цикла рендеринга.
   * @param {object} state - Состояние для рендеринга.
   */
  drawFrame (state) {
    if (!this.validateCanvas() || !state) {
      return
    }

    try {
      // Очищаем canvas
      this.ctx.fillStyle = state.colorBg || this.colors.bg
      this.fillRect(0, 0, this.canvas.width, this.canvas.height)

      // Рисуем шарик
      this.renderBall(state)
    } catch (error) {
    }
  }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.BallRenderer = BallRenderer
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BallRenderer
}
