/* jshint -W033, -W104, -W119, -W116, -W126, -W014, -W117 */
/* global globalThis, Path2D, module, debugError */
'use strict'
/**
 * BallRenderer - оптимизированный модуль рендеринга для BilateralBound
 * Отвечает за отрисовку шарика и фона
 * Оптимизирован для производительности и поддержки переиспользования
 */
if (typeof BallRenderer === 'undefined') {
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
      this.accumulatorMs = 0
      this.maxSubsteps = 3
      this.onFrameCallback = null
      this.options = {
        localPhysics: false, // Флаг для локальной физики (для вьювера)
        dirtyRegions: false, // Частичная перерисовка по регионам
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
      this.accumulatorMs += clampedDeltaTime
      if (this.onFrameCallback) {
        this.onFrameCallback(clampedDeltaTime / 1000)
      }
      if (this.options.localPhysics) {
        let substeps = 0
        while (
          this.accumulatorMs >= this.fixedStepMs &&
          substeps < this.maxSubsteps
        ) {
          this.physics.update(this.fixedStepMs / 1000)
          this.accumulatorMs -= this.fixedStepMs
          substeps++
        }
      }
    }
    _renderFrame(currentTime) {
      let alpha = 1
      if (this.fixedStepMs > 0) {
        if (this.options.localPhysics) {
          alpha = Math.max(
            0,
            Math.min(1, this.accumulatorMs / this.fixedStepMs)
          )
        } else {
          const now = currentTime
          const lastTs = this.physics?.__lastPhysicsUpdateTs ?? now
          alpha = Math.max(0, Math.min(1, (now - lastTs) / this.fixedStepMs))
        }
      }
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
    }
    /**
     * Renders the scene using a dirty regions strategy to minimize repaint areas.
     * @param {number} alpha - The interpolation factor.
     * @private
     */
    _renderDirty(alpha) {
      const padding = 4
      const prev = this._prevBall || { x: -1, y: -1, radius: 0 }
      const curr = this.physics.getInterpolatedBall
        ? this.physics.getInterpolatedBall(alpha)
        : this.physics.ball
      if (prev.x >= 0) {
        const w = prev.radius * 2 + padding * 2
        const h = prev.radius * 2 + padding * 2
        this.ctx.fillStyle = this.colors.bg
        this.fillRect(
          prev.x - prev.radius - padding,
          prev.y - prev.radius - padding,
          w,
          h
        )
      }
      const w2 = curr.radius * 2 + padding * 2
      const h2 = curr.radius * 2 + padding * 2
      this.ctx.fillStyle = this.colors.bg
      this.fillRect(
        curr.x - curr.radius - padding,
        curr.y - curr.radius - padding,
        w2,
        h2
      )
      this.renderBall(curr)
      this._prevBall = { x: curr.x, y: curr.y, radius: curr.radius }
    }
    /**
     * Renders the scene, choosing the optimal strategy (full or dirty regions).
     * @param {number} [alpha=1] - The interpolation factor for smooth animation.
     */
    render(alpha = 1) {
      if (!this.canvas || !this.ctx || !this.physics) {
        return
      }
      const worldW = this.physics.options.worldWidth
      const worldH = this.physics.options.worldHeight
      // Scale canvas context when canvas size differs from physics world (e.g. controller preview)
      // This makes ball appear at correct relative position on both preview and viewer
      const needsScale =
        worldW > 0 &&
        worldH > 0 &&
        (this.canvas.width !== worldW || this.canvas.height !== worldH)
      try {
        if (needsScale) {
          this.ctx.save()
          this.ctx.scale(
            this.canvas.width / worldW,
            this.canvas.height / worldH
          )
        }
        if (this.options.dirtyRegions) {
          this._renderDirty(alpha)
        } else {
          this._renderFull(alpha)
        }
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
          if (
            this._cached.radius !== ball.radius ||
            this._cached.color !== col
          ) {
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
      this._cached.radius = null;
      this._cached.color = null;
      this._cached.gradient = null;
      this._cached.path = null;
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
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BallRenderer
  }
}
