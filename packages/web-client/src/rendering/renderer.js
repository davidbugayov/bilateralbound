/* global globalThis, Path2D, debugError */
/**
 * BallRenderer - оптимизированный модуль рендеринга для BilateralBound
 * Отвечает за отрисовку шарика и фона
 * Оптимизирован для производительности и поддержки переиспользования
 */
class BallRenderer {
  constructor(canvas, physicsEngine, options = {}) {
    if (!canvas) {
      throw new Error('Canvas element is required for BallRenderer')
    }
    if (!physicsEngine) {
      throw new Error('PhysicsEngine is required for BallRenderer')
    }
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.physics = physicsEngine
    if (!this.ctx) {
      throw new Error('Unable to get 2D context from canvas')
    }
    this.animationFrameId = null
    this.lastTime = 0
    this.frameCount = 0
    this.frameTimeHistory = [] // История времен кадров для расчета реального FPS
    this.adaptiveFrameRate = true // Адаптивная частота кадров
    this.maxFrameTime = 50 // Максимальное время кадра в ms
    this.fixedStepMs = 1000 / 60
    this.fixedStepMs = 1000 / 60
    this.onFrameCallback = null
    this.options = {
      localPhysics: false, // Флаг для локальной физики (для вьювера)
      ...options
    }
    this.adaptiveFrameRate =
      globalThis.BBConfig?.rendering?.adaptiveFrameRate ??
      this.adaptiveFrameRate
    this.maxFrameTime =
      globalThis.BBConfig?.rendering?.maxFrameTime ?? this.maxFrameTime
    this.pi2 = Math.PI * 2
    this.fillRect = this.ctx.fillRect.bind(this.ctx)
    this.beginPath = this.ctx.beginPath.bind(this.ctx)
    this.fill = this.ctx.fill.bind(this.ctx)
    this.ball = this.physics.ball
    this.colors = this.physics.colors
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
  start() {
    if (this.animationFrameId) {
      this.stop()
    }
    this.lastTime = performance.now()
    this.renderLoop = this.renderLoop.bind(this)
    this.renderLoop(performance.now())
  }
  /**
   * Останавливает рендеринг
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }
  _calculateDeltaTime(currentTime) {
    const deltaTime = currentTime - this.lastTime
    if (this.adaptiveFrameRate) {
      this.frameTimeHistory.push(deltaTime)
      if (this.frameTimeHistory.length > 20) this.frameTimeHistory.shift()
    }
    return Math.min(deltaTime, this.maxFrameTime)
  }
  _updatePhysics(clampedDeltaTime) {
    if (this.onFrameCallback) {
      this.onFrameCallback(clampedDeltaTime / 1000)
    }
    // Let the physics engine handle the time accumulation and fixed steps
    this.physics.update(clampedDeltaTime / 1000)
  }
  _renderFrame(currentTime) {
    // Get the exact interpolation alpha from the physics engine's internal accumulator
    const alpha = this.physics.getInterpolationAlpha ? this.physics.getInterpolationAlpha() : 1
    this.render(alpha)
  }
  renderLoop(currentTime) {
    if (this.validateCanvas()) {
      const clientW = this.canvas.clientWidth
      const clientH = this.canvas.clientHeight
      if (
        (clientW && clientW !== this.canvas.width) ||
        (clientH && clientH !== this.canvas.height)
      ) {
        this.resize(
          clientW || this.canvas.width,
          clientH || this.canvas.height
        )
        this.lastTime = currentTime
        this.animationFrameId = requestAnimationFrame(this.renderLoop)
        return
      }
      const clampedDeltaTime = this._calculateDeltaTime(currentTime)
      this.frameCount++
      try {
        this._updatePhysics(clampedDeltaTime)
        this._renderFrame(currentTime)
        this.lastTime = currentTime
      } catch (err) {
        if (typeof globalThis?.logger?.error === 'function') {
          globalThis.logger.error('Render loop error:', err)
        }
        this.stop()
        return
      }
      this.animationFrameId = requestAnimationFrame(this.renderLoop)
    } else {
      this.stop()
    }
  }
  /**
   * Renders the scene using a full repaint strategy.
   * @param {number} alpha - The interpolation factor.
   * @private
   */
  _renderFull(alpha) {
    // Use world dimensions for fill so background covers full canvas even when scaled
    const w = this.physics.options.worldWidth || this.canvas.width
    const h = this.physics.options.worldHeight || this.canvas.height
    this.ctx.fillStyle = this.colors.bg
    this.fillRect(0, 0, w, h)
    const ballState = this.physics.getInterpolatedBall
      ? this.physics.getInterpolatedBall(alpha)
      : this.physics.ball
    this.renderBall(ballState)
    // Render debug overlay if enabled
    if (this.options.showDebug) {
      this._renderDebugOverlay()
    }
  }

  /**
   * Renders a debug overlay with jitter/smoothing diagnostics.
   * Shows FPS, frame time, damping/stiffness from physics engine.
   * @private
   */
  _renderDebugOverlay() {
    const ctx = this.ctx
    const padding = 8
    const lineH = 16
    const lines = this._buildDebugLines()
    const boxW = this._estimateDebugBoxWidth(lines)
    const boxH = lines.length * lineH + padding * 2

    // Position: top-right corner in world coords
    const worldW = this.physics.options.worldWidth || this.canvas.width
    const _worldH = this.physics.options.worldHeight || this.canvas.height // reserved for future use
    const x = worldW - boxW - padding
    const y = padding

    ctx.save()
    ctx.font = '12px monospace'
    ctx.textBaseline = 'top'

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
    ctx.fillRect(x, y, boxW, boxH)

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, boxW, boxH)

    // Text
    const jitterClass = this._getJitterLevel()
    ctx.fillStyle =
      jitterClass === 'bad'
        ? '#ff6b6b'
        : jitterClass === 'warn'
          ? '#ffd93d'
          : '#6bff6b'
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle =
        i === 0
          ? jitterClass === 'bad'
            ? '#ff6b6b'
            : jitterClass === 'warn'
              ? '#ffd93d'
              : '#6bff6b'
          : '#ffffff'
      ctx.fillText(lines[i], x + padding, y + padding + i * lineH)
    }
    ctx.restore()
  }

  /**
   * Builds debug lines for the overlay.
   * Returns array of strings.
   * @returns {string[]}
   */
  _buildDebugLines() {
    const lines = []
    const fps = this._getRealFps()
    const frameMs = this._getLastFrameTime()
    const smoothing = this.physics.options.smoothing || {}

    lines.push(`${fps.toFixed(0)} FPS | ${frameMs.toFixed(1)}ms`)

    if (smoothing.damping !== undefined || smoothing.stiffness !== undefined) {
      const damping = smoothing.damping != null ? smoothing.damping : '-'
      const stiffness = smoothing.stiffness != null ? smoothing.stiffness : '-'
      lines.push(`damp:${damping} stiff:${stiffness}`)
    }

    if (smoothing.driftThresholdPx != null) {
      lines.push(`drift: >${smoothing.driftThresholdPx}px`)
    }

    // Show jitter level
    const jitter = this._getEstimatedJitterMs()
    lines.push(`jitter: ~${jitter.toFixed(0)}ms (${this._getJitterLevel()})`)

    return lines
  }

  /**
   * Estimates the box width for debug overlay based on text.
   * @param {string[]} lines
   * @returns {number}
   * @private
   */
  _estimateDebugBoxWidth(lines) {
    // Approximate: ~7px per character in 12px monospace
    let maxChars = 0
    for (const line of lines) {
      if (line.length > maxChars) maxChars = line.length
    }
    return maxChars * 7.5 + 16
  }

  /**
   * Calculates a rolling average frames per second.
   * @returns {number} Average FPS over recent frames.
   */
  _getRealFps() {
    if (!this.frameTimeHistory || this.frameTimeHistory.length === 0) return 60
    const total = this.frameTimeHistory.reduce((sum, v) => sum + v, 0)
    return 1000 / (total / this.frameTimeHistory.length)
  }

  /**
   * Returns the last frame time in ms.
   * @returns {number}
   */
  _getLastFrameTime() {
    if (!this.frameTimeHistory || this.frameTimeHistory.length === 0) return 16
    return this.frameTimeHistory[this.frameTimeHistory.length - 1]
  }

  /**
   * Heuristic estimate of network jitter from frame time variance.
   * Uses standard deviation of recent frame times.
   * @returns {number} Estimated jitter in ms.
   */
  _getEstimatedJitterMs() {
    if (!this.frameTimeHistory || this.frameTimeHistory.length < 4) return 0
    const recent = this.frameTimeHistory.slice(-8)
    const mean = recent.reduce((s, v) => s + v, 0) / recent.length
    const variance =
      recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length
    return Math.sqrt(variance)
  }

  /**
   * Classifies jitter level: 'good', 'warn', or 'bad'.
   * @returns {string}
   */
  _getJitterLevel() {
    const jitter = this._getEstimatedJitterMs()
    if (jitter > 15) return 'bad'
    if (jitter > 8) return 'warn'
    return 'good'
  }
  /**
   * Renders the scene.
   * @param {number} [alpha=1] - The interpolation factor for smooth animation.
   */
  render(alpha = 1) {
    if (!this.canvas || !this.ctx || !this.physics) {
      return
    }
    const worldW = this.physics.options.worldWidth
    const worldH = this.physics.options.worldHeight
    const needsScale =
      worldW > 0 &&
      worldH > 0 &&
      (this.canvas.width !== worldW || this.canvas.height !== worldH)
    try {
      if (needsScale) {
        this.ctx.save()
        this.ctx.scale(this.canvas.width / worldW, this.canvas.height / worldH)
      }
      this._renderFull(alpha)
      if (needsScale) {
        this.ctx.restore()
      }
    } catch (err) {
      if (needsScale) {
        this.ctx.restore()
      }
      if (typeof debugError === 'function') {
        debugError('Error during render:', err)
      }
    }
  }
  /**
   * Рисует шарик (оптимизированная версия)
   */
  renderBall(ballState) {
    const ball = ballState || this.ball
    if (ball && typeof ball.x === 'number' && typeof ball.y === 'number') {
      if (ball.radius <= 0 || ball.radius > 1000) {
        return
      }
      try {
        const col = ball.colorBall || this.colors.ball
        if (this._cached.radius !== ball.radius || this._cached.color !== col) {
          this._cached.radius = ball.radius
          this._cached.color = col
          const g = this.ctx.createRadialGradient(
            -ball.radius * 0.3,
            -ball.radius * 0.3,
            0,
            0,
            0,
            ball.radius
          )
          g.addColorStop(0, col)
          g.addColorStop(1, this.adjustBrightness(col, -20))
          this._cached.gradient = g
          const p = new Path2D()
          p.arc(0, 0, Math.max(ball.radius, 2), 0, this.pi2)
          this._cached.path = p
        }
        this.beginPath()
        this.ctx.save()
        this.ctx.imageSmoothingEnabled = true
        this.ctx.imageSmoothingQuality = 'high'
        this.ctx.translate(ball.x, ball.y)
        this.ctx.fillStyle = this._cached.gradient
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
        this.ctx.shadowBlur = 4
        this.ctx.shadowOffsetX = 2
        this.ctx.shadowOffsetY = 2
        this.ctx.fill(this._cached.path)
        this.ctx.restore()
        this.ctx.shadowColor = 'transparent'
        this.ctx.shadowBlur = 0
        this.ctx.shadowOffsetX = 0
        this.ctx.shadowOffsetY = 0
      } catch (err) {
        if (typeof globalThis?.logger?.warn === 'function') {
          globalThis.logger.warn('Error rendering ball:', err)
        }
      }
    }
  }
  /**
   * Изменяет яркость цвета
   */
  adjustBrightness(color, amount) {
    const hex = color.replace('#', '')
    const r = Math.max(
      0,
      Math.min(255, Number.parseInt(hex.slice(0, 2), 16) + amount)
    )
    const g = Math.max(
      0,
      Math.min(255, Number.parseInt(hex.slice(2, 4), 16) + amount)
    )
    const b = Math.max(
      0,
      Math.min(255, Number.parseInt(hex.slice(4, 6), 16) + amount)
    )
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }
  /**
   * Инвалидирует кэш шарика (градиент и геометрию)
   * Вызывается при изменении цвета или размера
   */
  invalidateBallCache() {
    this._cached.radius = null
    this._cached.color = null
    this._cached.gradient = null
    this._cached.path = null
  }
  /**
   * Изменяет размеры canvas
   */
  resize(width, height) {
    if (!this.canvas) {
      return
    }
    try {
      this.canvas.width = width
      this.canvas.height = height
      this.canvas.style.width = width + 'px'
      this.canvas.style.height = height + 'px'
      if (this.physics) {
        this.physics.setWorldSize(width, height)
      }
      this._cached.radius = null
      this._cached.color = null
      this._cached.gradient = null
      this._cached.path = null
    } catch (err) {
      if (typeof globalThis?.logger?.error === 'function') {
        globalThis.logger.error('Canvas resize error:', err)
      }
    }
  }
  /**
   * Проверяет и восстанавливает canvas при необходимости
   */
  validateCanvas() {
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
          this.fillRect = this.ctx.fillRect.bind(this.ctx)
          this.beginPath = this.ctx.beginPath.bind(this.ctx)
          this.fill = this.ctx.fill.bind(this.ctx)
          return true
        }
      } catch (err) {
        if (typeof globalThis?.logger?.warn === 'function') {
          globalThis.logger.warn('Failed to recover canvas context:', err)
        }
      }
      return false
    }
    return true
  }
  /**
   * Устанавливает новый движок физики
   */
  setPhysicsEngine(physicsEngine) {
    if (!physicsEngine) {
      return
    }
    if (!physicsEngine.ball || !physicsEngine.colors) {
      return
    }
    this.physics = physicsEngine
    this.ball = this.physics.ball
    this.colors = this.physics.colors
  }
  /**
   * Рендерит один кадр с переданным состоянием.
   * Удобно для внешнего цикла рендеринга.
   * @param {object} state - Состояние для рендеринга.
   */
  drawFrame(state) {
    if (!this.validateCanvas() || !state) {
      return
    }
    try {
      this.ctx.fillStyle = state.colorBg || this.colors.bg
      this.fillRect(0, 0, this.canvas.width, this.canvas.height)
      this.renderBall(state)
    } catch (err) {
      if (typeof globalThis?.logger?.warn === 'function') {
        globalThis.logger.warn('Error drawing frame:', err)
      }
    }
  }
  /**
   * Устанавливает цвет фона
   */
  setBackgroundColor(color) {
    if (this.colors) {
      this.colors.bg = color
    }
    this._cached.radius = null
    this._cached.color = null
  }
}
if (typeof globalThis !== 'undefined') {
  globalThis.BallRenderer = BallRenderer
}

module.exports = BallRenderer
