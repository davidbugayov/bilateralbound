'use strict'
/**
 * PhysicsEngine - оптимизированный движок физики для BilateralBound
 * Управляет движением, отскоками и масштабированием шарика
 * Оптимизирован для производительности и переиспользуемости
 */
if (typeof PhysicsEngine === 'undefined') {
  class PhysicsEngine {
    constructor(options = {}) {
      this.options = {
        worldWidth: 800,
        worldHeight: 600,
        ballRadius: 20,
        minSpeed: 50,
        maxSpeed: 5000,
        smoothing: {
          // Hermite interpolation для плавной траектории между серверными апдейтами
          interpolationMethod: 'hermite', // 'hermite' | 'linear'
          // Adaptive jitter buffer для компенсации сетевых задержек
          jitterBufferMs: 50, // начальный размер буфера
          maxJitterBufferMs: 150, // максимальный размер при плохой сети
          minJitterBufferMs: 16, // минимальный при хорошей сети
          // Dead reckoning для предсказания между серверными апдейтами
          deadReckoningEnabled: true,
          maxExtrapolationMs: 100, // максимальное время предсказания вперёд
          // Коррекция позиции только при получении новых данных
          correctionThresholdPx: 5, // минимальное расхождение для коррекции (в пикселях)
          correctionSmoothingAlpha: 0.15, // агрессивность коррекции (0.1-0.3 оптимально)
          // Legacy параметры для обратной совместимости
          stiffness: 30,
          damping: 20,
          maxPredictSec: 0.02,
          snapDistance: 0.3
        },
        bounceCallback: null,
        ...options
      }
      if (typeof globalThis !== 'undefined' && globalThis.BBConfig?.smoothing) {
        this.options.smoothing = {
          ...this.options.smoothing,
          ...globalThis.BBConfig.smoothing
        }
      }
      this.isViewer = Boolean(options.isViewer ?? false)
      this._worldSizeSet = false // Флаг, что размеры мира установлены
      this.centerX = this.options.worldWidth / 2
      this.centerY = this.options.worldHeight / 2
      this.ball = {
        x: this.centerX,
        y: this.centerY,
        vx: 0,
        vy: 0,
        speed: 30,
        radius: this.options.ballRadius
      }
      this._prevPos = { x: this.ball.x, y: this.ball.y }
      this._currPos = { x: this.ball.x, y: this.ball.y }
      this._interpBall = {
        x: this.ball.x,
        y: this.ball.y,
        radius: this.ball.radius,
        colorBall: null
      }
      this.colors = {
        ball: '#60a5fa',
        bg: '#020617'
      }
      this.state = {
        paused: true, // Игра начинается на паузе
        lastDirection: { x: 0, y: 0 },
        targetVx: 0,
        targetVy: 0,
        targetX: this.centerX, // Устанавливаем начальную позицию в центре
        targetY: this.centerY,
        smoothVx: 0,
        smoothVy: 0,
        allowInterpWhenPaused: false,
        stopping: false, // deceleration phase active
        stoppingStartTs: 0, // performance.now() when stopping began
        stoppingDuration: 0.6 // seconds to decelerate to zero
      }
      // Jitter buffer для сглаживания сетевых задержек (только для viewer)
      this._jitterBuffer = []
      this._jitterBufferSize = this.options.smoothing.jitterBufferMs
      this._lastServerUpdateTs = 0
      this._serverUpdateIntervals = [] // история интервалов между серверными обновлениями
      // Dead reckoning state для предсказания между серверными апдейтами
      this._deadReckoning = {
        baseX: this.centerX,
        baseY: this.centerY,
        baseVx: 0,
        baseVy: 0,
        baseTimestamp: performance.now(),
        serverX: this.centerX,
        serverY: this.centerY,
        serverVx: 0,
        serverVy: 0,
        serverTimestamp: performance.now()
      }
      this.bounceCallback = this.options.bounceCallback
      this.sqrt = Math.sqrt
      this.min = Math.min
      this.max = Math.max
      this.applySmoothnessPreset(options.preset || 'default')
    }
    /**
     * Устанавливает рендерер для инвалидации кэша при изменении цвета
     * @param {Object} renderer - Экземпляр BallRenderer
     */
    setRenderer(renderer) {
      this.renderer = renderer
    }
    /**
     * Устанавливает опции сглаживания для движка.
     * @param {object} [opts={}] - Объект с опциями сглаживания.
     */
    setSmoothingOptions(opts = {}) {
      if (opts && typeof opts === 'object') {
        this.options.smoothing = { ...this.options.smoothing, ...opts }
      }
    }
    /**
     * Применяет пресет для плавности движения
     */
    applySmoothnessPreset(presetName) {
      const presets = {
        therapy: {
          smoothing: {
            stiffness: 20,
            damping: 12,
            maxPredictSec: 0.08,
            snapDistance: 0.8
          }
        },
        gaming: {
          smoothing: {
            stiffness: 30,
            damping: 18,
            maxPredictSec: 0.03,
            snapDistance: 1.5
          }
        },
        default: {
          smoothing: {
            stiffness: 25,
            damping: 15,
            maxPredictSec: 0.05,
            snapDistance: 1
          }
        }
      }
      const preset = presets[presetName] || presets.default
      if (preset.smoothing) {
        this.options.smoothing = {
          ...this.options.smoothing,
          ...preset.smoothing
        }
      }
    }
    /**
     * Устанавливает размеры мира с пересчетом центра
     */
    setWorldSize(width, height) {
      const oldCenterX = this.centerX
      const oldCenterY = this.centerY
      this.options.worldWidth = width
      this.options.worldHeight = height
      this.centerX = width / 2
      this.centerY = height / 2
      this._worldSizeSet = true // Устанавливаем флаг
      // When paused and world size changes, always snap ball to new center.
      // Covers: iOS 100vh vs innerHeight mismatch, viewer connect/reconnect where
      // the ball was left at canvas coords (not world coords) by centerBallInViewer().
      if (this.state?.paused) {
        this.ball.x = this.centerX
        this.ball.y = this.centerY
        this._prevPos.x = this.centerX
        this._prevPos.y = this.centerY
        this._currPos.x = this.centerX
        this._currPos.y = this.centerY
        this.state.targetX = this.centerX
        this.state.targetY = this.centerY
      }
      this.clampBallWithinBounds()
    }
    /**
     * Устанавливает позицию шарика
     */
    setPosition(x, y) {
      this.ball.x = x
      this.ball.y = y
      this.clampBallWithinBounds()
      this._prevPos.x = this.ball.x
      this._prevPos.y = this.ball.y
      this._currPos.x = this.ball.x
      this._currPos.y = this.ball.y
      if (this.isViewer) {
        this.state.targetX = this.ball.x
        this.state.targetY = this.ball.y
        this.state.smoothVx = 0
        this.state.smoothVy = 0
        this.state.lastVx = 0
        this.state.lastVy = 0
      }
    }
    /**
     * Устанавливает скорость шарика (в процентах)
     */
    setSpeed(percent) {
      this.ball.speed = this.max(0, this.min(100, percent))
    }
    /**
     * Устанавливает направление движения
     */
    setDirection(dirX, dirY) {
      this.state.lastDirection.x = dirX
      this.state.lastDirection.y = dirY
      if (!this.isViewer || this.options.clientSimulation) {
        const speedPercent = this.ball.speed / 100
        const pixelsPerSecond = speedPercent * this.options.maxSpeed
        this.ball.vx = dirX * pixelsPerSecond
        this.ball.vy = dirY * pixelsPerSecond
      }
    }
    /**
     * Устанавливает скорость движения (vx, vy)
     */
    setVelocity(vx, vy) {
      this.ball.vx = vx
      this.ball.vy = vy
      this.state.targetVx = vx
      this.state.targetVy = vy
      const speed = this.sqrt(vx * vx + vy * vy)
      if (speed > 0) {
        this.state.lastDirection.x = vx / speed
        this.state.lastDirection.y = vy / speed
      }
    }
    /**
     * Устанавливает состояние паузы
     */
    setPaused(paused) {
      this.state.paused = Boolean(paused)
      this.state.stopping = false
      if (this.state.paused) {
        if (this.isViewer) {
          // Stop in place — no snap to server position, no seek to center
          this.state.allowInterpWhenPaused = false
          this.state.lastVx = 0
          this.state.lastVy = 0
          this.state.smoothVx = 0
          this.state.smoothVy = 0
          this.clampBallWithinBounds()
        } else {
          this._resetBallToCenter()
        }
      } else {
        this.state.allowInterpWhenPaused = false
        if (this.options.clientSimulation) {
          this._restoreLocalVelocity()
        }
      }
    }
    /**
     * Начинает плавное замедление шарика перед остановкой.
     * Используется вместо немедленного setPaused(true).
     * @param {number} [duration=0.6] - Длительность замедления в секундах
     */
    startStopping(duration = 0.6) {
      if (this.state.paused) return
      this.state.stopping = true
      this.state.stoppingStartTs = performance.now()
      this.state.stoppingDuration = duration
    }
    /**
     * Восстанавливает скорость для локальной симуляции (clientSimulation)
     * Если направление нулевое, устанавливает дефолтное горизонтальное.
     * @private
     */
    _restoreLocalVelocity() {
      if (
        Math.abs(this.state.lastDirection.x || 0) < 1e-6 &&
        Math.abs(this.state.lastDirection.y || 0) < 1e-6
      ) {
        this.state.lastDirection.x = 1
        this.state.lastDirection.y = 0
      }
      const speedPercent = this.ball.speed / 100
      const pixelsPerSecond = speedPercent * this.options.maxSpeed
      this.ball.vx = this.state.lastDirection.x * pixelsPerSecond
      this.ball.vy = this.state.lastDirection.y * pixelsPerSecond
      this.state.lastVx = this.ball.vx
      this.state.lastVy = this.ball.vy
    }
    /**
     * Сбрасывает мяч в центр с нулевой скоростью
     * @private
     */
    _resetBallToCenter() {
      this.ball.x = this.centerX
      this.ball.y = this.centerY
      this.ball.vx = 0
      this.ball.vy = 0
      this.state.targetX = this.centerX
      this.state.targetY = this.centerY
      this.clampBallWithinBounds()
    }
    /**
     * Публичный метод для возврата в центр (используется сервером)
     */
    returnToCenter() {
      this._resetBallToCenter()
    }
    /**
     * Устанавливает цвет шарика
     */
    setBallColor(color) {
      if (typeof color === 'string' && color.length > 0) {
        this.colors.ball = color
        if (
          this.renderer &&
          typeof this.renderer.invalidateBallCache === 'function'
        ) {
          this.renderer.invalidateBallCache()
        }
      }
    }
    /**
     * Устанавливает цвет фона
     */
    setBgColor(color) {
      if (typeof color === 'string' && color.length > 0) {
        this.colors.bg = color
        if (
          this.renderer &&
          typeof this.renderer.invalidateBallCache === 'function'
        ) {
          this.renderer.invalidateBallCache()
        }
      }
    }
    setBallSize(radius) {
      if (typeof radius === 'number' && radius > 0 && radius <= 500) {
        this.ball.radius = radius
        this.clampBallWithinBounds()
      }
    }
    /**
     * ПРОДВИНУТАЯ интерполяция v5 с jitter buffer и dead reckoning
     * Основные улучшения:
     * 1. Jitter buffer для компенсации неравномерности сетевых задержек
     * 2. Dead reckoning (экстраполяция) для предсказания между серверными апдейтами
     * 3. Hermite interpolation для плавных траекторий
     * 4. Коррекция позиции только при получении новых данных (не каждый кадр)
     */
    updateViewerInterpolation(deltaTime) {
      if (!this._canInterpolate()) return
      const currentTime = performance.now()

      // Если есть данные в jitter buffer, используем их
      if (this._jitterBuffer.length > 0) {
        this._consumeJitterBuffer(currentTime, deltaTime)
      } else if (this.options.smoothing.deadReckoningEnabled) {
        // Иначе используем dead reckoning для предсказания
        this._applyDeadReckoning(currentTime, deltaTime)
      } else {
        // Fallback на старую систему (только для обратной совместимости)
        this._applyLegacyInterpolation(deltaTime, currentTime)
      }
    }
    _interpolatePositionWithSteps(stepX, stepY) {
      this._applyInterpolationSmoothing(stepX, stepY)
    }
    _applyInterpolationSmoothing(stepX, stepY) {
      const smoothingFactor = this.options?.smoothing?.smoothingFactor ?? 0.25
      const radius = this.ball.radius
      const w = this.options.worldWidth
      const h = this.options.worldHeight
      this._prevPos.x = this.ball.x
      this._prevPos.y = this.ball.y
      const newX = this.ball.x + stepX
      const newY = this.ball.y + stepY
      this.ball.x =
        this.ball.x * (1 - smoothingFactor) + newX * smoothingFactor
      this.ball.y =
        this.ball.y * (1 - smoothingFactor) + newY * smoothingFactor
      this.ball.x = this.min(w - radius, this.max(radius, this.ball.x))
      this.ball.y = this.min(h - radius, this.max(radius, this.ball.y))
      this._currPos.x = this.ball.x
      this._currPos.y = this.ball.y
    }
    _canInterpolate() {
      const isActiveMovement =
        this.state.allowInterpWhenPaused || this.state.paused === false
      return isActiveMovement && Boolean(this.state?.targetX)
    }
    _updateStateBuffer(currentTime) {
      if (!this._stateBuffer) {
        this._stateBuffer = []
        this._bufferSize = this.options.smoothing?.bufferSize || 15
      }
      this._stateBuffer.push({
        x: this.ball.x,
        y: this.ball.y,
        vx: this.state.lastVx || 0,
        vy: this.state.lastVy || 0,
        timestamp: currentTime
      })
      if (this._stateBuffer.length > this._bufferSize) {
        this._stateBuffer.shift()
      }
    }
    _applyExponentialSmoothing() {
      const alpha = this.options.smoothing?.velocitySmoothingAlpha || 0.08
      const vx = this.state.lastVx || 0
      const vy = this.state.lastVy || 0
      if (this._smoothedVelocity) {
        this._smoothedVelocity.x =
          this._smoothedVelocity.x * (1 - alpha) + vx * alpha
        this._smoothedVelocity.y =
          this._smoothedVelocity.y * (1 - alpha) + vy * alpha
      } else {
        this._smoothedVelocity = { x: vx, y: vy }
      }
    }
    _calculateAdaptiveClamping() {
      const radius = this.ball.radius
      const w = this.options.worldWidth
      const h = this.options.worldHeight
      const clampedTargetX = Math.min(
        w - radius,
        Math.max(radius, this.state.targetX)
      )
      const clampedTargetY = Math.min(
        h - radius,
        Math.max(radius, this.state.targetY)
      )
      return { clampedTargetX, clampedTargetY }
    }
    _applySpringPhysics(clampedTargetX, clampedTargetY, deltaTime) {
      const dx = clampedTargetX - this.ball.x
      const dy = clampedTargetY - this.ball.y
      const distance = Math.hypot(dx, dy)
      const baseStiffness = this.options?.smoothing?.stiffness ?? 25
      const speed = Math.hypot(
        this._smoothedVelocity.x,
        this._smoothedVelocity.y
      )
      const adaptiveStiffness =
        baseStiffness * (1 + Math.min(distance / 150, 3))
      const baseDamping = this.options?.smoothing?.damping ?? 15
      const adaptiveDamping = baseDamping * (1 + Math.min(speed / 800, 2))
      const ax = adaptiveStiffness * dx - adaptiveDamping * this.state.smoothVx
      const ay = adaptiveStiffness * dy - adaptiveDamping * this.state.smoothVy
      const maxAcceleration = 8000
      const clampedAx = Math.max(
        -maxAcceleration,
        Math.min(maxAcceleration, ax)
      )
      const clampedAy = Math.max(
        -maxAcceleration,
        Math.min(maxAcceleration, ay)
      )
      this.state.smoothVx += clampedAx * deltaTime
      this.state.smoothVy += clampedAy * deltaTime
    }
    _limitStepSize(clampedTargetX, clampedTargetY, deltaTime) {
      const dx = clampedTargetX - this.ball.x
      const dy = clampedTargetY - this.ball.y
      const distance = Math.hypot(dx, dy)
      let stepX = this.state.smoothVx * deltaTime
      let stepY = this.state.smoothVy * deltaTime
      const stepMagnitude = Math.hypot(stepX, stepY)
      const adaptiveMaxStep = Math.min(
        distance * 2.5,
        Math.abs(this._smoothedVelocity.x) * deltaTime * 4,
        Math.abs(this._smoothedVelocity.y) * deltaTime * 4,
        150
      )
      if (stepMagnitude > adaptiveMaxStep && adaptiveMaxStep > 0) {
        const scale = adaptiveMaxStep / stepMagnitude
        stepX *= scale
        stepY *= scale
        this.state.smoothVx *= scale
        this.state.smoothVy *= scale
      }
      return { stepX, stepY }
    }
    _autoSnapIfNeeded(clampedTargetX, clampedTargetY) {
      const dx = clampedTargetX - this.ball.x
      const dy = clampedTargetY - this.ball.y
      const distance = Math.hypot(dx, dy)
      const snapDistance = this.options.smoothing.snapDistance || 0.2
      const lowSpeedThreshold = 3
      if (
        distance < snapDistance &&
        Math.abs(this.state.smoothVx) < lowSpeedThreshold &&
        Math.abs(this.state.smoothVy) < lowSpeedThreshold
      ) {
        this.ball.x = clampedTargetX
        this.ball.y = clampedTargetY
        this._currPos.x = this.ball.x
        this._currPos.y = this.ball.y
        this.state.smoothVx = 0
        this.state.smoothVy = 0
        if (this.state.paused) {
          this.state.allowInterpWhenPaused = false
        }
      }
    }
    /**
     * Добавляет серверное обновление в jitter buffer
     * Вызывается из applyCommand при получении новых данных от сервера
     * @private
     */
    _addToJitterBuffer(serverState) {
      const now = performance.now()

      // Адаптация размера jitter buffer на основе вариации задержек
      if (this._lastServerUpdateTs > 0) {
        const interval = now - this._lastServerUpdateTs
        this._serverUpdateIntervals.push(interval)
        if (this._serverUpdateIntervals.length > 20) {
          this._serverUpdateIntervals.shift()
        }

        // Вычисляем jitter (стандартное отклонение интервалов)
        if (this._serverUpdateIntervals.length >= 5) {
          const avg = this._serverUpdateIntervals.reduce((a, b) => a + b, 0) / this._serverUpdateIntervals.length
          const variance = this._serverUpdateIntervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / this._serverUpdateIntervals.length
          const jitter = Math.sqrt(variance)

          // Адаптивно изменяем размер буфера: больше jitter = больше буфер
          const targetBufferSize = Math.max(
            this.options.smoothing.minJitterBufferMs,
            Math.min(this.options.smoothing.maxJitterBufferMs, jitter * 2)
          )
          // Плавное изменение размера буфера
          this._jitterBufferSize = this._jitterBufferSize * 0.9 + targetBufferSize * 0.1
        }
      }

      this._lastServerUpdateTs = now

      // Добавляем в буфер с timestamp для delayed playback
      this._jitterBuffer.push({
        x: serverState.x,
        y: serverState.y,
        vx: serverState.vx,
        vy: serverState.vy,
        timestamp: now,
        playbackTime: now + this._jitterBufferSize
      })

      // Ограничиваем размер буфера (храним максимум 3 состояния)
      if (this._jitterBuffer.length > 3) {
        this._jitterBuffer.shift()
      }
    }
    /**
     * Потребляет данные из jitter buffer с интерполяцией
     * @private
     */
    _consumeJitterBuffer(currentTime, deltaTime) {
      // Удаляем устаревшие состояния
      while (this._jitterBuffer.length > 0 && this._jitterBuffer[0].playbackTime < currentTime) {
        const state = this._jitterBuffer.shift()
        // Обновляем dead reckoning base при получении нового состояния
        this._deadReckoning.baseX = state.x
        this._deadReckoning.baseY = state.y
        this._deadReckoning.baseVx = state.vx || 0
        this._deadReckoning.baseVy = state.vy || 0
        this._deadReckoning.baseTimestamp = currentTime
        this._deadReckoning.serverX = state.x
        this._deadReckoning.serverY = state.y
        this._deadReckoning.serverVx = state.vx || 0
        this._deadReckoning.serverVy = state.vy || 0
        this._deadReckoning.serverTimestamp = state.timestamp
      }

      // Интерполируем между двумя состояниями в буфере, если они есть
      if (this._jitterBuffer.length >= 2) {
        const state0 = this._jitterBuffer[0]
        const state1 = this._jitterBuffer[1]

        // Нормализованное время между двумя состояниями
        const totalTime = state1.playbackTime - state0.playbackTime
        const elapsed = currentTime - state0.playbackTime
        const t = Math.max(0, Math.min(1, elapsed / totalTime))

        // Hermite interpolation для плавной траектории
        if (this.options.smoothing.interpolationMethod === 'hermite') {
          this._hermiteInterpolate(state0, state1, t)
        } else {
          // Linear interpolation (fallback)
          this._linearInterpolate(state0, state1, t)
        }
      } else if (this._jitterBuffer.length === 1) {
        // Только одно состояние — используем dead reckoning
        this._applyDeadReckoning(currentTime, deltaTime)
      } else {
        // Буфер пуст — используем dead reckoning
        this._applyDeadReckoning(currentTime, deltaTime)
      }
    }
    /**
     * Hermite interpolation для плавной траектории с учетом скоростей
     * Использует кубическую интерполяцию Hermite для учёта касательных (скоростей)
     * @private
     */
    _hermiteInterpolate(state0, state1, t) {
      // Hermite basis functions
      const h00 = (1 + 2 * t) * (1 - t) * (1 - t)
      const h10 = t * (1 - t) * (1 - t)
      const h01 = t * t * (3 - 2 * t)
      const h11 = t * t * (t - 1)

      // Масштабируем касательные (скорости) по времени между состояниями
      const dt = (state1.playbackTime - state0.playbackTime) / 1000 // в секундах
      const tx0 = (state0.vx || 0) * dt
      const ty0 = (state0.vy || 0) * dt
      const tx1 = (state1.vx || 0) * dt
      const ty1 = (state1.vy || 0) * dt

      // Hermite interpolation
      const newX = h00 * state0.x + h10 * tx0 + h01 * state1.x + h11 * tx1
      const newY = h00 * state0.y + h10 * ty0 + h01 * state1.y + h11 * ty1

      // Применяем с плавной коррекцией
      this._applySmoothCorrection(newX, newY)

      // Обновляем скорость для dead reckoning
      this._deadReckoning.baseVx = state0.vx || 0
      this._deadReckoning.baseVy = state0.vy || 0
    }
    /**
     * Линейная интерполяция между двумя состояниями
     * @private
     */
    _linearInterpolate(state0, state1, t) {
      const newX = state0.x + (state1.x - state0.x) * t
      const newY = state0.y + (state1.y - state0.y) * t
      this._applySmoothCorrection(newX, newY)

      // Обновляем скорость для dead reckoning (линейная интерполяция скоростей)
      this._deadReckoning.baseVx = (state0.vx || 0) + ((state1.vx || 0) - (state0.vx || 0)) * t
      this._deadReckoning.baseVy = (state0.vy || 0) + ((state1.vy || 0) - (state0.vy || 0)) * t
    }
    /**
     * Применяет плавную коррекцию позиции (только если расхождение выше порога)
     * @private
     */
    _applySmoothCorrection(targetX, targetY) {
      const dx = targetX - this.ball.x
      const dy = targetY - this.ball.y
      const distance = Math.hypot(dx, dy)

      // Коррекция только если расхождение выше порога (уменьшает jitter)
      if (distance > this.options.smoothing.correctionThresholdPx) {
        const alpha = this.options.smoothing.correctionSmoothingAlpha
        this._prevPos.x = this.ball.x
        this._prevPos.y = this.ball.y
        this.ball.x += dx * alpha
        this.ball.y += dy * alpha
        this._currPos.x = this.ball.x
        this._currPos.y = this.ball.y
        this.clampBallWithinBounds()
      }
    }
    /**
     * Dead reckoning: предсказание позиции на основе последней известной скорости
     * Используется между серверными обновлениями для плавного движения
     * @private
     */
    _applyDeadReckoning(currentTime, deltaTime) {
      const elapsedSinceServer = currentTime - this._deadReckoning.baseTimestamp
      const maxExtrapolation = this.options.smoothing.maxExtrapolationMs

      // Ограничиваем экстраполяцию максимальным временем
      if (elapsedSinceServer > maxExtrapolation) {
        // Слишком давно не было обновлений — используем старую систему
        this._applyLegacyInterpolation(deltaTime, currentTime)
        return
      }

      // Предсказываем позицию на основе последней известной скорости
      const elapsedSec = elapsedSinceServer / 1000
      const predictedX = this._deadReckoning.baseX + this._deadReckoning.baseVx * elapsedSec
      const predictedY = this._deadReckoning.baseY + this._deadReckoning.baseVy * elapsedSec

      // Применяем предсказанную позицию напрямую (без spring physics для устранения overshoot)
      this._prevPos.x = this.ball.x
      this._prevPos.y = this.ball.y
      this.ball.x = predictedX
      this.ball.y = predictedY
      this.ball.vx = this._deadReckoning.baseVx
      this.ball.vy = this._deadReckoning.baseVy
      this._currPos.x = this.ball.x
      this._currPos.y = this.ball.y
      this.clampBallWithinBounds()
    }
    /**
     * Fallback на старую систему интерполяции (для обратной совместимости)
     * @private
     */
    _applyLegacyInterpolation(deltaTime, currentTime) {
      this._updateStateBuffer(currentTime)
      this._applyExponentialSmoothing()
      const { clampedTargetX, clampedTargetY } = this._calculateAdaptiveClamping()
      this._applySpringPhysics(clampedTargetX, clampedTargetY, deltaTime)
      const { stepX, stepY } = this._limitStepSize(clampedTargetX, clampedTargetY, deltaTime)
      const oldX = this.ball.x
      const oldY = this.ball.y
      this._interpolatePositionWithSteps(stepX, stepY)
      if (deltaTime > 0.0001) {
        this.ball.vx = (this.ball.x - oldX) / deltaTime
        this.ball.vy = (this.ball.y - oldY) / deltaTime
      }
      this._autoSnapIfNeeded(clampedTargetX, clampedTargetY)
    }
    /**
     * Обновляет физику за указанное время
     */
    update(deltaTime) {
      if (this.isViewer) {
        this._updateViewerPhysics(deltaTime)
      } else {
        this._updateServerPhysics(deltaTime)
      }
      this.__lastPhysicsUpdateTs = performance?.now?.() ?? Date.now()
    }
    /**
     * Обновляет физику в режиме вьювера, управляя интерполяцией и симуляцией.
     * @param {number} deltaTime - Время, прошедшее с последнего кадра.
     * @private
     */
    _updateViewerPhysics(deltaTime) {
      const canUpdate = !this.state.paused || this.state.allowInterpWhenPaused
      if (canUpdate) {
        if (this.state.paused || !this.options.clientSimulation) {
          this.updateViewerInterpolation(deltaTime)
        } else {
          this.updateClientPhysics(deltaTime)
        }
      }
    }
    /**
     * Обновляет серверную физику
     * @private
     */
    _updateServerPhysics(deltaTime) {
      const originalUpdateServerPhysics = (deltaTime) => {
        if (this.state.paused) {
          return
        }
        if (this._worldSizeSet) {
          let speedFactor = 1.0
          if (this.state.stopping) {
            const elapsed =
              (performance.now() - this.state.stoppingStartTs) / 1000
            speedFactor = Math.max(
              0,
              1 - elapsed / this.state.stoppingDuration
            )
            if (speedFactor <= 0) {
              this.setPaused(true)
              return
            }
          }
          const speedPercent = this.ball.speed / 100
          const pixelsPerSecond =
            speedPercent * this.options.maxSpeed * speedFactor
          this.ball.vx = this.state.lastDirection.x * pixelsPerSecond
          this.ball.vy = this.state.lastDirection.y * pixelsPerSecond
          this._prevPos.x = this.ball.x
          this._prevPos.y = this.ball.y
          this.ball.x += this.ball.vx * deltaTime
          this.ball.y += this.ball.vy * deltaTime
          this.handleBoundaryCollisions()
          this._currPos.x = this.ball.x
          this._currPos.y = this.ball.y
        }
      }
      originalUpdateServerPhysics(deltaTime)
    }
    /**
     * Обновляет физику на стороне клиента (во вьювере).
     * @param {number} deltaTime - Время, прошедшее с последнего кадра.
     */
    updateClientPhysics(deltaTime) {
      if (this.state.paused) {
        return
      }
      if (!this._ensureWorldSizeSet()) {
        return
      }
      let speedFactor = 1.0
      if (this.state.stopping) {
        const elapsed = (performance.now() - this.state.stoppingStartTs) / 1000
        speedFactor = Math.max(0, 1 - elapsed / this.state.stoppingDuration)
        if (speedFactor <= 0) {
          this.setPaused(true)
          return
        }
      }
      const velocity = this._calculateClientVelocity()
      this._applyAxisLock(velocity)
      velocity.vx *= speedFactor
      velocity.vy *= speedFactor
      this._updateBallPosition(velocity, deltaTime)
      this.handleBoundaryCollisions()
      this._updateCurrentPosition()
    }
    _ensureWorldSizeSet() {
      if (this._worldSizeSet) {
        return true
      }
      if (this.options.worldWidth > 0 && this.options.worldHeight > 0) {
        this._worldSizeSet = true
        return true
      }
      return false
    }
    _calculateClientVelocity() {
      const pps = (this.ball.speed / 100) * this.options.maxSpeed
      const vx = (this.state.lastDirection.x || 0) * pps
      const vy = (this.state.lastDirection.y || 0) * pps
      return { vx, vy }
    }
    _applyAxisLock(velocity) {
      const dirX = this.state.lastDirection.x || 0
      const dirY = this.state.lastDirection.y || 0
      const pps = (this.ball.speed / 100) * this.options.maxSpeed
      const isVertical = Math.abs(dirX) < 1e-6 && Math.abs(dirY) > 0
      const isHorizontal = Math.abs(dirY) < 1e-6 && Math.abs(dirX) > 0
      if (isVertical) {
        velocity.vx = 0
        velocity.vy = dirY * pps // Используем dirY напрямую (может быть -1 или 1)
        this.state.smoothVx = 0
      } else if (isHorizontal) {
        velocity.vy = 0
        velocity.vx = dirX * pps // Используем dirX напрямую (может быть -1 или 1)
        this.state.smoothVy = 0
      } else if (Math.abs(dirX) > 0 || Math.abs(dirY) > 0) {
        velocity.vx = dirX * pps
        velocity.vy = dirY * pps
      }
      return velocity
    }
    _updateBallPosition(velocity, deltaTime) {
      this.ball.vx = velocity.vx
      this.ball.vy = velocity.vy
      this._prevPos.x = this.ball.x
      this._prevPos.y = this.ball.y
      this.ball.x += velocity.vx * deltaTime
      this.ball.y += velocity.vy * deltaTime
    }
    _updateCurrentPosition() {
      this._currPos.x = this.ball.x
      this._currPos.y = this.ball.y
    }
    /**
     * Обрабатывает коллизии с границами мира
     * Мяч должен отскакивать от края и продолжать движение в обратном направлении
     */
    handleBoundaryCollisions() {
      const ball = this.ball
      const radius = ball.radius
      const worldWidth = this.options.worldWidth
      const worldHeight = this.options.worldHeight
      let bounceSide = null
      const dirX = this.state.lastDirection.x || 0
      const dirY = this.state.lastDirection.y || 0
      if (ball.x <= radius) {
        ball.x = radius // Клампим позицию
        if (dirX < 0) {
          this.state.lastDirection.x = Math.abs(dirX)
          bounceSide = 'left'
        }
      } else if (ball.x >= worldWidth - radius) {
        ball.x = worldWidth - radius // Клампим позицию
        if (dirX > 0) {
          this.state.lastDirection.x = -Math.abs(dirX)
          bounceSide = 'right'
        }
      }
      if (ball.y <= radius) {
        ball.y = radius // Клампим позицию
        if (dirY < 0) {
          this.state.lastDirection.y = Math.abs(dirY)
          bounceSide = bounceSide || 'top'
        }
      } else if (ball.y >= worldHeight - radius) {
        ball.y = worldHeight - radius // Клампим позицию
        if (dirY > 0) {
          this.state.lastDirection.y = -Math.abs(dirY)
          bounceSide = bounceSide || 'bottom'
        }
      }
      if (bounceSide) {
        this.handleBounce(bounceSide)
      }
    }
    /**
     * Обрабатывает отскок от границы
     * @param {string} side - Сторона отскока: 'left', 'right', 'top', 'bottom'
     */
    handleBounce(side) {
      const speedPercent = this.ball.speed / 100
      const pixelsPerSecond = speedPercent * this.options.maxSpeed
      this.ball.vx = this.state.lastDirection.x * pixelsPerSecond
      this.ball.vy = this.state.lastDirection.y * pixelsPerSecond
      this.ensureMinimumSpeed()
      this.state.lastVx = this.ball.vx
      this.state.lastVy = this.ball.vy
      if (this.bounceCallback) {
        this.bounceCallback({
          side: side,
          x: this.ball.x,
          y: this.ball.y,
          vx: this.ball.vx,
          vy: this.ball.vy,
          dirX: this.state.lastDirection.x,
          dirY: this.state.lastDirection.y
        })
      }
      try {
        if (typeof globalThis !== 'undefined') {
          const ev = new CustomEvent('bb_bounce', {
            detail: {
              side: side,
              x: this.ball.x,
              y: this.ball.y
            }
          })
          globalThis.dispatchEvent(ev)
        }
      } catch {
        // Silently ignore event dispatch errors
      }
    }
    /**
     * Обеспечивает минимальную скорость после отскока
     */
    ensureMinimumSpeed() {
      const currentSpeed = this.sqrt(
        this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy
      )
      if (currentSpeed < this.options.minSpeed && currentSpeed > 0) {
        const scale = this.options.minSpeed / currentSpeed
        this.ball.vx *= scale
        this.ball.vy *= scale
      } else if (currentSpeed === 0) {
        const dirX = this.state.lastDirection.x || 0
        const dirY = this.state.lastDirection.y || 0
        const isVertical = Math.abs(dirX) < 1e-6 && Math.abs(dirY) > 0
        const isHorizontal = Math.abs(dirY) < 1e-6 && Math.abs(dirX) > 0
        if (isVertical) {
          this.ball.vx = 0
          this.ball.vy = Math.sign(dirY) * this.options.minSpeed
        } else if (isHorizontal) {
          this.ball.vx = Math.sign(dirX) * this.options.minSpeed
          this.ball.vy = 0
        } else {
          const fallbackDirX = this.ball.x < this.centerX ? 1 : -1
          const fallbackDirY = this.ball.y < this.centerY ? 1 : -1
          this.ball.vx = fallbackDirX * this.options.minSpeed
          this.ball.vy = fallbackDirY * this.options.minSpeed
        }
      }
    }
    /**
     * Ensures the ball and its target coordinates are within the world boundaries.
     * @returns {void}
     */
    clampBallWithinBounds() {
      const radius = this.ball.radius
      const w = this.options.worldWidth
      const h = this.options.worldHeight
      if (w <= 0 || h <= 0 || radius < 0) return
      const clampedX = this.max(radius, this.min(w - radius, this.ball.x))
      const clampedY = this.max(radius, this.min(h - radius, this.ball.y))
      if (clampedX !== this.ball.x) {
        this.ball.x = clampedX
        if (this.isViewer) this.state.smoothVx = 0
      }
      if (clampedY !== this.ball.y) {
        this.ball.y = clampedY
        if (this.isViewer) this.state.smoothVy = 0
      }
      if (this.state && typeof this.state.targetX === 'number') {
        this.state.targetX = this.max(
          radius,
          this.min(w - radius, this.state.targetX)
        )
      }
      if (this.state && typeof this.state.targetY === 'number') {
        this.state.targetY = this.max(
          radius,
          this.min(h - radius, this.state.targetY)
        )
      }
    }
    getInterpolatedBall(alpha) {
      const a = Math.max(0, Math.min(1, typeof alpha === 'number' ? alpha : 1))
      const px = this._prevPos.x
      const py = this._prevPos.y
      const cx = this._currPos.x
      const cy = this._currPos.y
      this._interpBall.x = px + (cx - px) * a
      this._interpBall.y = py + (cy - py) * a
      this._interpBall.radius = this.ball.radius
      this._interpBall.colorBall = this.ball.colorBall || null
      return this._interpBall
    }
    /**
     * Validates viewer-specific commands, ensuring coordinates and velocities are finite numbers.
     * @param {object} command - The command object to validate.
     * @returns {object} A new object with validated properties.
     * @private
     */
    _validateViewerCommand(command) {
      const validated = {}
      if (typeof command.x === 'number' && Number.isFinite(command.x))
        validated.x = command.x
      if (typeof command.y === 'number' && Number.isFinite(command.y))
        validated.y = command.y
      if (typeof command.vx === 'number' && Number.isFinite(command.vx))
        validated.vx = command.vx
      if (typeof command.vy === 'number' && Number.isFinite(command.vy))
        validated.vy = command.vy
      if (
        typeof command.dirX === 'number' &&
        Math.abs(command.dirX) <= 1.001 &&
        Number.isFinite(command.dirX)
      ) {
        validated.dirX = command.dirX
      }
      if (
        typeof command.dirY === 'number' &&
        Math.abs(command.dirY) <= 1.001 &&
        Number.isFinite(command.dirY)
      ) {
        validated.dirY = command.dirY
      }
      if (
        typeof command.speed === 'number' &&
        command.speed >= 0 &&
        command.speed <= 100 &&
        !Number.isNaN(command.speed)
      ) {
        validated.speed = command.speed
      }
      return validated
    }
    /**
     * Validates server-specific commands, ensuring direction vectors are finite numbers.
     * @param {object} command - The command object to validate.
     * @returns {object} A new object with validated properties.
     * @private
     */
    _validateServerCommand(command) {
      const validated = {}
      if (
        typeof command.dirX === 'number' &&
        Math.abs(command.dirX) <= 1.001 &&
        Number.isFinite(command.dirX)
      ) {
        validated.dirX = command.dirX
      }
      if (
        typeof command.dirY === 'number' &&
        Math.abs(command.dirY) <= 1.001 &&
        Number.isFinite(command.dirY)
      ) {
        validated.dirY = command.dirY
      }
      if (
        typeof command.speed === 'number' &&
        command.speed >= 0 &&
        command.speed <= 100 &&
        !Number.isNaN(command.speed)
      ) {
        validated.speed = command.speed
      }
      return validated
    }
    /**
     * @param {object} command - Команда для валидации.
     * @returns {object} - Валидированная команда.
     * @private
     */
    _validateCommonCommands(command) {
      const validated = {}
      if (typeof command.paused === 'boolean')
        validated.paused = command.paused
      if (typeof command.stopping === 'boolean')
        validated.stopping = command.stopping
      if (command.reset === true) validated.reset = true
      if (
        typeof command.radius === 'number' &&
        command.radius > 0 &&
        command.radius <= 1000 &&
        Number.isFinite(command.radius)
      ) {
        validated.radius = command.radius
      }
      if (
        typeof command.colorBall === 'string' &&
        /^#[0-9a-fA-F]{6}$/.test(command.colorBall)
      ) {
        validated.colorBall = command.colorBall
      }
      if (
        typeof command.colorBg === 'string' &&
        /^#[0-9a-fA-F]{6}$/.test(command.colorBg)
      ) {
        validated.colorBg = command.colorBg
      }
      return validated
    }
    /**
     * Валидирует входящую команду от сервера
     * @param {object} command - Входящая команда.
     * @returns {object} - Валидированная и очищенная команда.
     */
    _validateCommand(command) {
      const modeSpecificValidated =
        this._getModeSpecificValidatedCommand(command)
      const commonValidated = this._validateCommonCommands(command)
      return { ...modeSpecificValidated, ...commonValidated }
    }
    /**
     * Валидирует специфичные для режима команды
     * @param {object} command - Входящая команда.
     * @returns {object} - Валидированная команда.
     * @private
     */
    _getModeSpecificValidatedCommand(command) {
      return this.isViewer
        ? this._validateViewerCommand(command)
        : this._validateServerCommand(command)
    }
    /**
     * Применяет команду от сервера
     */
    applyCommand(command) {
      if (!command) return
      const validatedCommand = this._validateCommand(command)
      if (Object.keys(validatedCommand).length === 0) return
      command = validatedCommand
      this._handleCommonCommands(command)
      if (this.isViewer) {
        this._handleViewerCommand(command)
      } else {
        this._handleServerCommand(command)
      }
    }
    _handleViewerCommand(command) {
      this._handleViewerPositionUpdate(command)
      this._handleViewerVelocityUpdate(command)
      this._handleViewerSpeedUpdate(command)
      this._handleViewerDirectionUpdate(command)
    }
    _handleViewerPositionUpdate(command) {
      if (command.x !== undefined && command.y !== undefined) {
        const cx = Math.min(
          this.options.worldWidth - this.ball.radius,
          Math.max(this.ball.radius, command.x)
        )
        const cy = Math.min(
          this.options.worldHeight - this.ball.radius,
          Math.max(this.ball.radius, command.y)
        )
        this.state.targetX = cx
        this.state.targetY = cy

        // Добавляем в jitter buffer для плавной интерполяции
        if (this.isViewer && !this.state.paused) {
          this._addToJitterBuffer({
            x: cx,
            y: cy,
            vx: command.vx,
            vy: command.vy
          })
        }

        if (command.paused === true) {
          this._handleViewerPositionPause(cx, cy)
        } else if (command.paused === false) {
          if (command.vx !== undefined) {
            this.state.lastVx = command.vx
          }
          if (command.vy !== undefined) {
            this.state.lastVy = command.vy
          }
        }
      }
    }
    _handleViewerPositionPause(cx, cy) {
      // Don't snap ball to server position — ball already stopped in place via setPaused()
      // Just clear velocities; no center-seek animation needed
      this.state.allowInterpWhenPaused = false
      this.state.smoothVx = 0
      this.state.smoothVy = 0
      this.state.lastVx = 0
      this.state.lastVy = 0
    }
    _handleViewerVelocityUpdate(command) {
      if (this.options.clientSimulation) {
        return
      }
      let newVx = command.vx
      let newVy = command.vy
      if (newVx !== undefined) {
        const wallMargin = this.ball.radius + 10 // допуск в пикселях
        const worldW = this.options.worldWidth
        const nearLeftWall = this.ball.x <= wallMargin
        const nearRightWall = this.ball.x >= worldW - wallMargin
        const serverMovingLeft = newVx < 0
        const serverMovingRight = newVx > 0
        const localMovingLeft = this.ball.vx < 0
        const localMovingRight = this.ball.vx > 0
        if (nearLeftWall && serverMovingLeft && localMovingRight) {
          newVx = undefined
        } else if (nearRightWall && serverMovingRight && localMovingLeft) {
          newVx = undefined
        }
      }
      if (newVy !== undefined) {
        const wallMargin = this.ball.radius + 10
        const worldH = this.options.worldHeight
        const nearTopWall = this.ball.y <= wallMargin
        const nearBottomWall = this.ball.y >= worldH - wallMargin
        const serverMovingUp = newVy < 0
        const serverMovingDown = newVy > 0
        const localMovingUp = this.ball.vy < 0
        const localMovingDown = this.ball.vy > 0
        if (nearTopWall && serverMovingUp && localMovingDown) {
          newVy = undefined
        } else if (nearBottomWall && serverMovingDown && localMovingUp) {
          newVy = undefined
        }
      }
      if (newVx !== undefined) this.state.lastVx = newVx
      if (newVy !== undefined) this.state.lastVy = newVy
      const lvx = typeof this.state.lastVx === 'number' ? this.state.lastVx : 0
      const lvy = typeof this.state.lastVy === 'number' ? this.state.lastVy : 0
      const sp = Math.hypot(lvx, lvy)
      if (sp > 0) {
        this.state.lastDirection.x = lvx / sp
        this.state.lastDirection.y = lvy / sp
      }
    }
    _handleViewerSpeedUpdate(command) {
      if (command.speed !== undefined) {
        this.setSpeed(command.speed)
        if (this.state.paused === false) {
          this._updatePredictionBase()
        }
      }
    }
    _handleViewerDirectionUpdate(command) {
      if (command.dirX !== undefined || command.dirY !== undefined) {
        if (this.options.clientSimulation && !this.state.paused) {
          const atCenter =
            Math.abs(this.ball.x - this.centerX) < 10 &&
            Math.abs(this.ball.y - this.centerY) < 10
          if (!atCenter) {
            return
          }
        }
        let newDx =
          typeof command.dirX !== 'undefined'
            ? command.dirX
            : this.state.lastDirection.x
        let newDy =
          typeof command.dirY !== 'undefined'
            ? command.dirY
            : this.state.lastDirection.y
        if (Math.abs(newDx) < 1e-6 && Math.abs(newDy) < 1e-6) {
          if (
            Math.abs(this.state.lastDirection.x) > 1e-6 ||
            Math.abs(this.state.lastDirection.y) > 1e-6
          ) {
            newDx = this.state.lastDirection.x
            newDy = this.state.lastDirection.y
          } else {
            newDx = 1
            newDy = 0
          }
        }
        this.state.lastDirection.x = newDx
        this.state.lastDirection.y = newDy
        if (this.options.clientSimulation) {
          const speedPercent = this.ball.speed / 100
          const pixelsPerSecond = speedPercent * this.options.maxSpeed
          this.ball.vx = newDx * pixelsPerSecond
          this.ball.vy = newDy * pixelsPerSecond
        }
        if (this.state.paused === false) {
          this._updatePredictionBase()
        }
      }
    }
    _updatePredictionBase() {
      const pps = (this.ball.speed / 100) * this.options.maxSpeed
      const dx = this.state.lastDirection.x || 0
      const dy = this.state.lastDirection.y || 0
      if (dx !== 0 || dy !== 0) {
        this.state.lastVx = dx * pps
        this.state.lastVy = dy * pps
        if (this.options.clientSimulation) {
          this.ball.vx = dx * pps
          this.ball.vy = dy * pps
        }
      }
    }
    _handleServerCommand(command) {
      this._handleServerDirection(command)
      this._handleServerSpeed(command)
      this._handleServerUnpause(command)
    }
    _handleServerDirection(command) {
      if (command.dirX !== undefined || command.dirY !== undefined) {
        const newDx =
          typeof command.dirX !== 'undefined'
            ? command.dirX
            : this.state.lastDirection.x
        const newDy =
          typeof command.dirY !== 'undefined'
            ? command.dirY
            : this.state.lastDirection.y
        this.setDirection(newDx, newDy)
      }
    }
    _handleServerSpeed(command) {
      if (command.speed !== undefined) {
        this.setSpeed(command.speed)
      }
    }
    _handleServerUnpause(command) {
      const willBeUnpaused =
        command.paused === false || this.state.paused === false
      if (willBeUnpaused) {
        this._restoreServerVelocity()
      }
    }
    _restoreServerVelocity() {
      const speedPercent = this.ball.speed / 100
      const pixelsPerSecond = speedPercent * this.options.maxSpeed
      let dirX = this.state.lastDirection.x || 0
      let dirY = this.state.lastDirection.y || 0
      if (dirX === 0 && dirY === 0) {
        dirX = 1
        dirY = 0
        this.setDirection(dirX, dirY)
      }
      this.setVelocity(dirX * pixelsPerSecond, dirY * pixelsPerSecond)
    }
    _handleCommonCommands(command) {
      // If server signals deceleration phase, start local stopping (viewer/preview)
      if (command.stopping === true && this.isViewer && !this.state.paused && !this.state.stopping) {
        this.startStopping()
      }
      if (command.paused !== undefined) {
        const wasPaused = this.state.paused
        this.setPaused(command.paused)
        if (this.isViewer && wasPaused && command.paused === false) {
          if (command.dirX !== undefined || command.dirY !== undefined) {
            const newDx = command.dirX ?? this.state.lastDirection.x ?? 1
            const newDy = command.dirY ?? this.state.lastDirection.y ?? 0
            this.state.lastDirection.x = newDx
            this.state.lastDirection.y = newDy
          }
          if (
            Math.abs(this.state.lastDirection.x || 0) < 1e-6 &&
            Math.abs(this.state.lastDirection.y || 0) < 1e-6
          ) {
            this.setDirection(1, 0)
          }
          this._updatePredictionBase()
        }
      }
      if (command.reset) this.reset()
      if (command.radius !== undefined) this.setBallSize(command.radius)
      if (command.colorBall !== undefined) this.setBallColor(command.colorBall)
      if (command.colorBg !== undefined) this.setBgColor(command.colorBg)
    }
    /**
     * Получает текущее состояние физического движка
     * @returns {Object} Состояние мяча и движка
     */
    getState() {
      return {
        x: this.ball.x,
        y: this.ball.y,
        vx: this.ball.vx,
        vy: this.ball.vy,
        dirX: this.state.lastDirection.x,
        dirY: this.state.lastDirection.y,
        speed: this.ball.speed,
        radius: this.ball.radius,
        paused: this.state.paused,
        stopping: this.state.stopping,
        colorBall: this.colors.ball,
        colorBg: this.colors.bg
      }
    }
    /**
     * Сбрасывает состояние к начальному
     */
    reset() {
      this.ball.x = this.centerX
      this.ball.y = this.centerY
      this.ball.vx = 0
      this.ball.vy = 0
      this.ball.speed = 30
      this.ball.radius = this.options.ballRadius
      this.state.lastDirection.x = 0
      this.state.lastDirection.y = 0
      this.state.targetVx = 0
      this.state.targetVy = 0
      this.state.targetX = this.centerX
      this.state.targetY = this.centerY
    }
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PhysicsEngine = PhysicsEngine
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhysicsEngine
  }
}
