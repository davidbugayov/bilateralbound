/**
 * PhysicsEngine - оптимизированный движок физики для BilateralBound
 * Управляет движением, отскоками и масштабированием шарика
 * Оптимизирован для производительности и переиспользования
 */

class PhysicsEngine {
  constructor (options = {}) {
    // Кэшируем часто используемые значения
    this.options = {
      worldWidth: 800,
      worldHeight: 600,
      ballRadius: 20,
      minSpeed: 50,
      maxSpeed: 5000,
      smoothing: { // Оптимизированные параметры для плавного движения без рывков
        stiffness: 12, // k - Увеличено для более быстрого отклика
        damping: 10, // c - Оптимизировано для критического демпфирования без колебаний
        maxPredictSec: 0.2, // максимум предикции - Минимум для стабильности
        snapDistance: 0.5 // авто-снап к цели в пикселях для устранения микроколебаний
      },
      bounceCallback: null,
      ...options
    }

    // Применяем глобальную конфигурацию при наличии
    if (typeof window !== 'undefined' && window.BBConfig) {
      if (window.BBConfig.smoothing) {
        this.options.smoothing = { ...this.options.smoothing, ...window.BBConfig.smoothing }
      }
    }

    // Флаг для определения режима вьювера
    this.isViewer = Boolean(options.isViewer ?? false)
    this._worldSizeSet = false // Флаг, что размеры мира установлены

    // Предварительно вычисляем центр мира
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

    // Буферы для интерполяции рендера (предыдущая и текущая позиции)
    this._prevPos = { x: this.ball.x, y: this.ball.y }
    this._currPos = { x: this.ball.x, y: this.ball.y }
    // Кэшируемый объект для выдачи интерполированного состояния без аллокаций
    this._interpBall = { x: this.ball.x, y: this.ball.y, radius: this.ball.radius, colorBall: null }

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
      // Сглаживание (пружина) в viewer-режиме
      smoothVx: 0,
      smoothVy: 0,
      // Разрешить интерполяцию даже на паузе (для плавного возвращения в центр)
      allowInterpWhenPaused: false
    }

    this.bounceCallback = this.options.bounceCallback

    // Кэшируем Math функции для производительности
    this.sqrt = Math.sqrt
    this.min = Math.min
    this.max = Math.max

    // Применяем пресет для плавности движения
    this.applySmoothnessPreset(options.preset || 'default')
  }

  setSmoothingOptions (opts = {}) {
    if (!opts || typeof opts !== 'object') return
    this.options.smoothing = { ...this.options.smoothing, ...opts }
  }
  /**
   * Применяет пресет для плавности движения
   */
  applySmoothnessPreset (presetName) {
    const presets = {
      therapy: { // Для терапевтических сессий - максимальная плавность
        smoothing: {
          stiffness: 15,
          damping: 8,
          maxPredictSec: 1.0,
          snapDistance: 0.8
        }
      },
      gaming: { // Для динамичных сессий - более отзывчивое управление
        smoothing: {
          stiffness: 30,
          damping: 15,
          maxPredictSec: 0.5,
          snapDistance: 1.5
        }
      },
      default: { // Баланс между плавностью и отзывчивостью
        smoothing: {
          stiffness: 20,
          damping: 10,
          maxPredictSec: 0.8,
          snapDistance: 1
        }
      }
    }

    const preset = presets[presetName] || presets.default

    // Применяем настройки сглаживания
    if (preset.smoothing) {
      this.options.smoothing = { ...this.options.smoothing, ...preset.smoothing }
    }
  }

  // === ОСНОВНЫЕ МЕТОДЫ ===

  /**
     * Устанавливает размеры мира с пересчетом центра
     */
  setWorldSize (width, height) {
    this.options.worldWidth = width
    this.options.worldHeight = height
    this.centerX = width / 2
    this.centerY = height / 2
    this._worldSizeSet = true // Устанавливаем флаг
    // После изменения размеров мира гарантируем, что мяч и цель в пределах экрана
    this.clampBallWithinBounds()

  }

  /**
   * Устанавливает позицию шарика
   */
  setPosition (x, y) {
    this.ball.x = x
    this.ball.y = y
    // Гарантируем, что позиция не выходит за границы экрана
    this.clampBallWithinBounds()
    // Для режима "зрителя" (вьювер/превью) также обновляем цель интерполяции
    // и используем уже откорректированные координаты, чтобы избежать рывков
    if (this.isViewer) {
      this.state.targetX = this.ball.x
      this.state.targetY = this.ball.y
    }
  }

  /**
     * Устанавливает скорость шарика (в процентах)
     */
  setSpeed (percent) {
    this.ball.speed = this.max(0, this.min(100, percent))
  }

  /**
     * Устанавливает направление движения
     */
  setDirection (dirX, dirY) {
    this.state.lastDirection.x = dirX
    this.state.lastDirection.y = dirY
  }


  /**
     * Устанавливает скорость движения (vx, vy)
     */
  setVelocity (vx, vy) {
    this.ball.vx = vx
    this.ball.vy = vy
    this.state.targetVx = vx
    this.state.targetVy = vy

    // Обновляем направление на основе скорости
    const speed = this.sqrt(vx * vx + vy * vy)
    if (speed > 0) {
      this.state.lastDirection.x = vx / speed
      this.state.lastDirection.y = vy / speed
    }
  }

  /**
   * Устанавливает состояние паузы
   */
  setPaused (paused) {
    this.state.paused = Boolean(paused)

    if (this.state.paused) {
      // Плавное возвращение в центр при паузе
      if (this.isViewer) {
        // В клиентском режиме не телепортируем мяч, а плавно тянем к центру
        // Цель — центр, текущую позицию оставляем как есть
        this.state.targetX = this.centerX
        this.state.targetY = this.centerY
        // Разрешаем интерполяцию даже на паузе
        this.state.allowInterpWhenPaused = true
        // Сбрасываем предсказание и сглаживание, чтобы старт анимации был мягким
        this.state.lastVx = 0
        this.state.lastVy = 0
        this.state.smoothVx = 0
        this.state.smoothVy = 0
        this.lastServerUpdate = performance.now()
        // Убедимся что мяч в допустимых границах
        this.clampBallWithinBounds()
      } else {
        // На сервере мгновенно ставим в центр (авторитетное состояние)
        this.ball.x = this.centerX
        this.ball.y = this.centerY
        this.ball.vx = 0
        this.ball.vy = 0
        this.state.targetX = this.centerX
        this.state.targetY = this.centerY
        this.clampBallWithinBounds()
      }
    } else {
      // При снятии с паузы возвращаем обычное поведение
      this.state.allowInterpWhenPaused = false
    }
  }

  /**
   * Инициирует плавный возврат мяча в центр
   */
  returnToCenter () {
    console.log(`[PHYSICS] returnToCenter called, isViewer: ${this.isViewer}, center: (${this.centerX}, ${this.centerY})`)
    if (this.isViewer) {
      // Для режима вьювера устанавливаем целевую позицию в центр
      this.state.targetX = this.centerX
      this.state.targetY = this.centerY
      // Разрешаем интерполяцию для плавного движения
      this.state.allowInterpWhenPaused = true
      // Сбрасываем скорость для плавного возврата
      this.state.smoothVx = 0
      this.state.smoothVy = 0
      this.state.lastVx = 0
      this.state.lastVy = 0
      console.log(`[PHYSICS] Viewer mode: target set to (${this.state.targetX}, ${this.state.targetY})`)
      this.logger.logSession?.(this.options.sessionId || 'unknown', '[RETURN_TO_CENTER] Initiating smooth return to center')
    } else {
      // Для серверного режима просто устанавливаем позицию в центр
      this.ball.x = this.centerX
      this.ball.y = this.centerY
      this.ball.vx = 0
      this.ball.vy = 0
      this.state.targetX = this.centerX
      this.state.targetY = this.centerY
      this.clampBallWithinBounds()
      console.log(`[PHYSICS] Server mode: ball set to (${this.ball.x}, ${this.ball.y})`)
    }
  }

  /**
   * Устанавливает цвет шарика
   */
  setBallColor (color) {
    if (typeof color === 'string' && color.length > 0) {
      this.colors.ball = color
    }
  }

  /**
   * Устанавливает цвет фона
   */
  setBgColor (color) {
    if (typeof color === 'string' && color.length > 0) {
      this.colors.bg = color
    }
  }

  setBallSize (radius) {
    if (typeof radius === 'number' && radius > 0 && radius <= 500) {
      this.ball.radius = radius
      // При изменении размера мяча гарантируем, что он остаётся в пределах экрана
      this.clampBallWithinBounds()
    }
  }


  /**
   * ПРОДВИНУТАЯ интерполяция v4.0 с буферизацией состояний и экспоненциальным сглаживанием
   * Решение проблемы дергания на основе лучших практик игровой индустрии
   */
  updateViewerInterpolation (deltaTime) {
    if ((this.state.paused && !this.state.allowInterpWhenPaused) || this.state.targetX === undefined) return

    const currentTime = performance.now()
    const timeSinceLastUpdate = (currentTime - (this.lastServerUpdate || currentTime)) / 1000

    // === БУФЕРИЗАЦИЯ СОСТОЯНИЙ ДЛЯ СГЛАЖИВАНИЯ ===
    // Сохраняем историю состояний для интерполяции между обновлениями
    if (!this._stateBuffer) {
      this._stateBuffer = []
      this._bufferSize = this.options.smoothing.bufferSize || 15 // Размер буфера из конфига
    }

    // Добавляем текущее состояние в буфер
    this._stateBuffer.push({
      x: this.ball.x,
      y: this.ball.y,
      vx: this.state.lastVx || 0,
      vy: this.state.lastVy || 0,
      timestamp: currentTime
    })

    // Ограничиваем размер буфера
    if (this._stateBuffer.length > this._bufferSize) {
      this._stateBuffer.shift()
    }

    // === ЭКСПОНЕНЦИАЛЬНОЕ СГЛАЖИВАНИЕ ВСЕХ ПАРАМЕТРОВ ===
    const predictTime = Math.min(timeSinceLastUpdate, this.options.smoothing.maxPredictSec || 0.03)
    const alpha = this.options.smoothing.velocitySmoothingAlpha || 0.08 // Еще более агрессивное сглаживание
    const vx = this.state.lastVx || 0
    const vy = this.state.lastVy || 0

    // Агрессивное экспоненциальное сглаживание скорости для максимальной стабильности
    if (!this._smoothedVelocity) {
      this._smoothedVelocity = { x: vx, y: vy }
    } else {
      this._smoothedVelocity.x = this._smoothedVelocity.x * (1 - alpha) + vx * alpha
      this._smoothedVelocity.y = this._smoothedVelocity.y * (1 - alpha) + vy * alpha
    }

    // Предикция позиции с использованием сглаженной скорости
    const predictedTargetX = this.state.targetX + this._smoothedVelocity.x * predictTime
    const predictedTargetY = this.state.targetY + this._smoothedVelocity.y * predictTime

    // === АДАПТИВНЫЙ КЛАМПИНГ С ПРЕДИКЦИЕЙ ОТСКОКОВ ===
    const radius = this.ball.radius
    const w = this.options.worldWidth
    const h = this.options.worldHeight

    // Граничные условия с предикцией отскоков (улучшенная версия)
    let clampedTargetX = predictedTargetX
    let clampedTargetY = predictedTargetY

    // Предсказываем будущие отскоки для более точной интерполяции
    if (Math.abs(this._smoothedVelocity.x) > 0) {
      const timeToBounceX = this._calculateTimeToBounce(
        this.ball.x, this._smoothedVelocity.x, radius, w
      )
      if (timeToBounceX < predictTime) {
        clampedTargetX = predictedTargetX < w / 2 ? radius : w - radius
      } else {
        clampedTargetX = Math.min(w - radius, Math.max(radius, predictedTargetX))
      }
    }

    if (Math.abs(this._smoothedVelocity.y) > 0) {
      const timeToBounceY = this._calculateTimeToBounce(
        this.ball.y, this._smoothedVelocity.y, radius, h
      )
      if (timeToBounceY < predictTime) {
        clampedTargetY = predictedTargetY < h / 2 ? radius : h - radius
      } else {
        clampedTargetY = Math.min(h - radius, Math.max(radius, predictedTargetY))
      }
    }

    // === ПРОДВИНУТАЯ ПРУЖИНА С ЭКСПОНЕНЦИАЛЬНЫМ СГЛАЖИВАНИЕМ ===
    const dx = clampedTargetX - this.ball.x
    const dy = clampedTargetY - this.ball.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Адаптивная жесткость на основе расстояния и скорости
    const baseStiffness = this.options.smoothing.stiffness || 25
    const adaptiveStiffness = baseStiffness * (1 + Math.min(distance / 150, 3))

    // Адаптивное демпфирование на основе скорости
    const speed = Math.sqrt(this._smoothedVelocity.x ** 2 + this._smoothedVelocity.y ** 2)
    const baseDamping = this.options.smoothing.damping || 15
    const adaptiveDamping = baseDamping * (1 + Math.min(speed / 800, 2))

    // Ускорение пружины с улучшенной формулой
    const ax = adaptiveStiffness * dx - adaptiveDamping * this.state.smoothVx
    const ay = adaptiveStiffness * dy - adaptiveDamping * this.state.smoothVy

    // Интегрируем скорость с ограничением максимального ускорения
    const maxAcceleration = 8000 // Увеличено для лучшей отзывчивости
    const clampedAx = Math.max(-maxAcceleration, Math.min(maxAcceleration, ax))
    const clampedAy = Math.max(-maxAcceleration, Math.min(maxAcceleration, ay))

    this.state.smoothVx += clampedAx * deltaTime
    this.state.smoothVy += clampedAy * deltaTime

    // === УМНОЕ ОГРАНИЧЕНИЕ ШАГА С АДАПТИВНЫМ МАКСИМУМОМ ===
    let stepX = this.state.smoothVx * deltaTime
    let stepY = this.state.smoothVy * deltaTime
    const stepMagnitude = Math.sqrt(stepX * stepX + stepY * stepY)

    // Адаптивное ограничение шага на основе расстояния и скорости
    const adaptiveMaxStep = Math.min(
      distance * 2.5, // Увеличено для лучшей отзывчивости
      Math.abs(this._smoothedVelocity.x) * deltaTime * 4,
      Math.abs(this._smoothedVelocity.y) * deltaTime * 4,
      150 // Увеличен максимум
    )

    if (stepMagnitude > adaptiveMaxStep && adaptiveMaxStep > 0) {
      const scale = adaptiveMaxStep / stepMagnitude
      stepX *= scale
      stepY *= scale
      this.state.smoothVx *= scale
      this.state.smoothVy *= scale
    }

    // === МАКСИМАЛЬНО ПЛАВНАЯ ИНТЕРПОЛЯЦИЯ ПОЗИЦИИ ===
    const smoothingFactor = this.options.smoothing.smoothingFactor || 0.25

    // Сохраняем предыдущую позицию для интерполяции
    this._prevPos.x = this.ball.x
    this._prevPos.y = this.ball.y

    // Новая позиция с экспоненциальным сглаживанием
    const newX = this.ball.x + stepX
    const newY = this.ball.y + stepY

    // Агрессивное экспоненциальное сглаживание позиции для максимальной плавности
    this.ball.x = this.ball.x * (1 - smoothingFactor) + newX * smoothingFactor
    this.ball.y = this.ball.y * (1 - smoothingFactor) + newY * smoothingFactor

    // Улучшенный клампинг визуальной позиции
    this.ball.x = Math.min(w - radius, Math.max(radius, this.ball.x))
    this.ball.y = Math.min(h - radius, Math.max(radius, this.ball.y))

    this._currPos.x = this.ball.x
    this._currPos.y = this.ball.y

    // === УМНЫЙ АВТО-СНАП С ГИСТЕРЕЗИСОМ ===
    const snapDistance = this.options.smoothing.snapDistance || 0.2
    const lowSpeedThreshold = 3 // Уменьшено для более раннего снапа

    if (distance < snapDistance &&
        Math.abs(this.state.smoothVx) < lowSpeedThreshold &&
        Math.abs(this.state.smoothVy) < lowSpeedThreshold) {
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
   * Обновляет физику за указанное время
   */
  update (deltaTime) {
    // В режиме вьювера теперь используется полноценная клиентская физика
    if (this.isViewer) {
      if (this.state.paused && !this.state.allowInterpWhenPaused) {
        // На паузе без анимации делать нечего
      } else if (this.state.paused && this.state.allowInterpWhenPaused) {
        // Плавный возврат к цели (центр) на паузе
        this.updateViewerInterpolation(deltaTime)
      } else {
        // Активное движение — интегрируем позицию непрерывно
        this.updateClientPhysics(deltaTime)
      }
      // Отмечаем момент последнего обновления физики/интерполяции для синхронизации рендера
      this.__lastPhysicsUpdateTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      return
    }

    // Для сервера используем полную физику с отскоками
    this.updateServerPhysics(deltaTime)
    // Отмечаем момент последнего обновления физики
    this.__lastPhysicsUpdateTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  }

  /**
   * Обновляет серверную физику с полной обработкой отскоков
   */
  updateServerPhysics (deltaTime) {
    if (this.state.paused) return

    // ================== НАДЁЖНАЯ ПРОВЕРКА V2 ==================
    // Не обновляем физику, пока размеры мира не будут явно установлены
    if (!this._worldSizeSet) {
      return
    }

    // Пересчитываем скорость напрямую из направления и процента скорости
    const speedPercent = this.ball.speed / 100
    const pixelsPerSecond = speedPercent * this.options.maxSpeed
    this.ball.vx = this.state.lastDirection.x * pixelsPerSecond
    this.ball.vy = this.state.lastDirection.y * pixelsPerSecond

    // Сохраняем предыдущую позицию для интерполяции
    this._prevPos.x = this.ball.x
    this._prevPos.y = this.ball.y

    // Обновляем позицию
    this.ball.x += this.ball.vx * deltaTime
    this.ball.y += this.ball.vy * deltaTime

    // Обрабатываем коллизии с границами
    this.handleBoundaryCollisions()

    // Запоминаем текущую позицию как «текущую» для интерполяции
    this._currPos.x = this.ball.x
    this._currPos.y = this.ball.y
  }

  /**
   * Непрерывная клиентская физика для режима вьювера (client-authoritative)
   */
  updateClientPhysics (deltaTime) {
    if (this.state.paused) return
    if (!this._worldSizeSet && this.options.worldWidth > 0 && this.options.worldHeight > 0) {
      // Авто-активация флага, если размеры заданы напрямую в конструкторе
      this._worldSizeSet = true
    }
    if (!this._worldSizeSet) return

    // Выбираем источники скоростей
    let vx = (typeof this.state.lastVx === 'number') ? this.state.lastVx : 0
    let vy = (typeof this.state.lastVy === 'number') ? this.state.lastVy : 0

    const speedPercent = this.ball.speed / 100
    const pps = speedPercent * this.options.maxSpeed

    if (vx === 0 && vy === 0) {
      // Восстанавливаем из направления и текущей скорости
      vx = (this.state.lastDirection.x || 0) * pps
      vy = (this.state.lastDirection.y || 0) * pps
    }

    // Жёсткий AXIS-LOCK: если направление строго вертикальное/горизонтальное — исключаем дрейф
    const dirX = this.state.lastDirection.x || 0
    const dirY = this.state.lastDirection.y || 0
    const isVertical = Math.abs(dirX) < 1e-6 && Math.abs(dirY) > 0
    const isHorizontal = Math.abs(dirY) < 1e-6 && Math.abs(dirX) > 0

    if (isVertical) {
      vx = 0
      vy = Math.sign(dirY || 1) * pps
      // Дополнительно гасим накопленные сглаженные по X
      this.state.smoothVx = 0
    } else if (isHorizontal) {
      vy = 0
      vx = Math.sign(dirX || 1) * pps
      // Дополнительно гасим накопленные сглаженные по Y
      this.state.smoothVy = 0
    }

    // Применяем к шару
    this.ball.vx = vx
    this.ball.vy = vy

    // Сохраняем предыдущую позицию для интерполяции
    this._prevPos.x = this.ball.x
    this._prevPos.y = this.ball.y

    // Интеграция позиции
    this.ball.x += vx * deltaTime
    this.ball.y += vy * deltaTime

    // Обрабатываем коллизии и корректируем скорости через существующую логику
    this.handleBoundaryCollisions()

    // Текущая позиция
    this._currPos.x = this.ball.x
    this._currPos.y = this.ball.y
  }

  /**
     * Обрабатывает коллизии с границами мира
     */
  handleBoundaryCollisions () {
    const ball = this.ball
    const radius = ball.radius
    const worldWidth = this.options.worldWidth
    const worldHeight = this.options.worldHeight

    let bounced = false

    // Проверяем левую и правую границы
    if (ball.x - radius < 0) {
      ball.x = radius // Клампим позицию
      // Сохраняем осевой замок: не вводим горизонталь, если она была 0
      const dx = this.state.lastDirection.x || 0
      this.state.lastDirection.x = (Math.abs(dx) < 1e-6) ? 0 : Math.abs(dx)
      bounced = true
    } else if (ball.x + radius > worldWidth) {
      ball.x = worldWidth - radius // Клампим позицию
      const dx = this.state.lastDirection.x || 0
      this.state.lastDirection.x = (Math.abs(dx) < 1e-6) ? 0 : -Math.abs(dx)
      bounced = true
    }

    // Проверяем верхнюю и нижнюю границы
    if (ball.y - radius < 0) {
      ball.y = radius // Клампим позицию
      const dy = this.state.lastDirection.y || 0
      this.state.lastDirection.y = (Math.abs(dy) < 1e-6) ? 0 : Math.abs(dy)
      bounced = true
    } else if (ball.y + radius > worldHeight) {
      ball.y = worldHeight - radius // Клампим позицию
      const dy = this.state.lastDirection.y || 0
      this.state.lastDirection.y = (Math.abs(dy) < 1e-6) ? 0 : -Math.abs(dy)
      bounced = true
    }

    // Вызываем callback при отскоке
    if (bounced) {
      this.handleBounce()
    }
  }

  /**
     * Обрабатывает отскок от границы
     */
  handleBounce () {
    // Мгновенно переназначаем скорость по новому направлению, сохраняя величину
    const speedPercent = this.ball.speed / 100
    const pixelsPerSecond = speedPercent * this.options.maxSpeed
    this.ball.vx = this.state.lastDirection.x * pixelsPerSecond
    this.ball.vy = this.state.lastDirection.y * pixelsPerSecond

    // Обеспечиваем минимальную скорость после отскока (на случай близких к нулю значений)
    this.ensureMinimumSpeed()

    // ВАЖНО: Обновляем lastVx/lastVy, чтобы клиентская физика не залипала на границе
    this.state.lastVx = this.ball.vx
    this.state.lastVy = this.ball.vy

    // Вызываем callback если установлен
    if (this.bounceCallback) {
      this.bounceCallback({
        x: this.ball.x,
        y: this.ball.y,
        vx: this.ball.vx,
        vy: this.ball.vy
      })
    }

    // Дополнительно инициируем DOM-событие для счётчика пасов на стороне контроллера
    try {
      if (typeof window !== 'undefined') {
        const ev = new CustomEvent('bb_bounce', { detail: { x: this.ball.x, y: this.ball.y } })
        window.dispatchEvent(ev)
      }
    } catch {
      // ignore
    }
  }

  /**
     * Обеспечивает минимальную скорость после отскока
     */
  ensureMinimumSpeed () {
    const currentSpeed = this.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy)

    if (currentSpeed < this.options.minSpeed && currentSpeed > 0) {
      const scale = this.options.minSpeed / currentSpeed
      this.ball.vx *= scale
      this.ball.vy *= scale
    } else if (currentSpeed === 0) {
      // Устанавливаем минимальную скорость в направлении от центра
      const dirX = this.ball.x < this.centerX ? 1 : -1
      const dirY = this.ball.y < this.centerY ? 1 : -1

      this.ball.vx = dirX * this.options.minSpeed
      this.ball.vy = dirY * this.options.minSpeed
    }
  }

  // Гарантирует, что мяч и целевые координаты находятся в пределах экрана
  clampBallWithinBounds () {
    const radius = this.ball.radius
    const w = this.options.worldWidth
    const h = this.options.worldHeight
    if (!(w > 0 && h > 0 && radius >= 0)) return

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
      this.state.targetX = this.max(radius, this.min(w - radius, this.state.targetX))
    }
    if (this.state && typeof this.state.targetY === 'number') {
      this.state.targetY = this.max(radius, this.min(h - radius, this.state.targetY))
    }
  }

  // Возвращает интерполированное состояние мяча для рендера
  getInterpolatedBall (alpha) {
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
     * Применяет команду от сервера
     */
  applyCommand (command) {
    if (!command) return

    // === ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ ===
    const validatedCommand = {}

    // Валидация для вьювера (клиентского режима)
    if (this.isViewer) {
      if (typeof command.x === 'number' && !isNaN(command.x)) validatedCommand.x = command.x
      if (typeof command.y === 'number' && !isNaN(command.y)) validatedCommand.y = command.y
      if (typeof command.vx === 'number' && !isNaN(command.vx)) validatedCommand.vx = command.vx
      if (typeof command.vy === 'number' && !isNaN(command.vy)) validatedCommand.vy = command.vy
      // При клиентской физике тоже принимаем изменение скорости, чтобы локальная модель не оставалась со старой величиной
      if (typeof command.speed === 'number' && command.speed >= 0 && command.speed <= 100 && !isNaN(command.speed)) {
        validatedCommand.speed = command.speed
      }
    } else {
      // Валидация для серверного режима
      if (typeof command.dirX === 'number' && Math.abs(command.dirX) <= 1 && !isNaN(command.dirX)) {
        validatedCommand.dirX = command.dirX
      }
      if (typeof command.dirY === 'number' && Math.abs(command.dirY) <= 1 && !isNaN(command.dirY)) {
        validatedCommand.dirY = command.dirY
      }
      if (typeof command.speed === 'number' && command.speed >= 0 && command.speed <= 100 && !isNaN(command.speed)) {
        validatedCommand.speed = command.speed
      }
    }

    // Общие валидации для всех режимов
    if (typeof command.paused === 'boolean') {
      validatedCommand.paused = command.paused
    }
    if (command.reset === true) {
      validatedCommand.reset = true
    }
    if (typeof command.radius === 'number' && command.radius > 0 && command.radius <= 1000 && !isNaN(command.radius)) {
      validatedCommand.radius = command.radius
    }
    if (typeof command.colorBall === 'string' && /^#[0-9a-fA-F]{6}$/.test(command.colorBall)) {
      validatedCommand.colorBall = command.colorBall
    }
    if (typeof command.colorBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(command.colorBg)) {
      validatedCommand.colorBg = command.colorBg
    }

    // Если нет валидных полей, выходим
    if (Object.keys(validatedCommand).length === 0) {
      return
    }

    // Используем только валидированные данные
    command = validatedCommand
    // ====================================

    // Вьювер и превью контроллера используют предиктивную синхронизацию
    if (this.isViewer) {
    // Плавное обновление целевой позиции БЕЗ резких скачков
    if (command.x !== undefined && command.y !== undefined) {
      // Визуальная точность с безопасным клампингом в пределах экрана
      const r = this.ball.radius
      const w = this.options.worldWidth
      const h = this.options.worldHeight
      const cx = Math.min(w - r, Math.max(r, command.x))
      const cy = Math.min(h - r, Math.max(r, command.y))

      // Всегда обновляем только целевую позицию (dead-reckoning anchor)
      this.state.targetX = cx
      this.state.targetY = cy

      const isPause = command.paused === true
      if (isPause) {
        // На паузе позволяем мягко прийти к цели
        this.state.allowInterpWhenPaused = true
        this.state.smoothVx = 0
        this.state.smoothVy = 0
        this.state.lastVx = 0
        this.state.lastVy = 0

        // И только на паузе действительно выставляем текущую позицию из сервера
        this.ball.x = cx
        this.ball.y = cy
        this._prevPos.x = this.ball.x
        this._prevPos.y = this.ball.y
        this._currPos.x = this.ball.x
        this._currPos.y = this.ball.y
      } else {
        // В активном движении ИГНОРИРУЕМ принудительную установку позиции,
        // иначе любые серверные x/y (которые теперь не обновляются постоянно)
        // будут вызывать рывки и ломать client-authoritative движение.
        // Коррекция позиции происходит только через сглаживание и снап при малых расхождениях.
      }
    }

    // Сохраняем скорость и время обновления для предикции
    if (command.vx !== undefined) this.state.lastVx = command.vx
    if (command.vy !== undefined) this.state.lastVy = command.vy

    // Обновляем направление из пришедшей скорости, чтобы поддержать AXIS-LOCK
    const lvx = (typeof this.state.lastVx === 'number') ? this.state.lastVx : 0
    const lvy = (typeof this.state.lastVy === 'number') ? this.state.lastVy : 0
    const sp = Math.hypot(lvx, lvy)
    if (sp > 0) {
      this.state.lastDirection.x = lvx / sp
      this.state.lastDirection.y = lvy / sp
    }

    // Применяем изменение скорости на клиенте, чтобы величина движения соответствовала серверной настройке
    if (command.speed !== undefined) {
      this.setSpeed(command.speed)
      // Немедленно актуализируем базу для предикции/интеграции, если не на паузе
      if (!this.state.paused) {
        const pps = (this.ball.speed / 100) * this.options.maxSpeed
        const dx = this.state.lastDirection.x || 0
        const dy = this.state.lastDirection.y || 0
        if (dx !== 0 || dy !== 0) {
          this.state.lastVx = dx * pps
          this.state.lastVy = dy * pps
        }
      }
    }

    this.lastServerUpdate = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  } else {
      // Этот блок теперь выполняется только на сервере
      if (command.dirX !== undefined || command.dirY !== undefined) {
        const newDx = (command.dirX !== undefined) ? command.dirX : this.state.lastDirection.x
        const newDy = (command.dirY !== undefined) ? command.dirY : this.state.lastDirection.y
        this.setDirection(newDx, newDy)
      }
      if (command.speed !== undefined) {
        this.setSpeed(command.speed)
      }
      // Если команда снимает с паузы, применяем скорость немедленно
      const willBeUnpaused = (command.paused === false) || !this.state.paused
      if (willBeUnpaused) {
        // Немедленно применяем изменение скорости/направления к текущей скорости,
        // чтобы мяч реагировал без необходимости Стоп/Старт
        const speedPercent = this.ball.speed / 100
        const pixelsPerSecond = speedPercent * this.options.maxSpeed
        // Берём направление из lastDirection; если оно обнулилось, восстанавливаем из текущей скорости
        let dirX = this.state.lastDirection.x || 0
        let dirY = this.state.lastDirection.y || 0
        if (dirX === 0 && dirY === 0) {
          const sp = Math.hypot(this.ball.vx || 0, this.ball.vy || 0)
          if (sp > 0) {
            dirX = (this.ball.vx || 0) / sp
            dirY = (this.ball.vy || 0) / sp
            this.setDirection(dirX, dirY)
          }
        }
        this.setVelocity(dirX * pixelsPerSecond, dirY * pixelsPerSecond)
      }
    }

    // Общие команды для клиента и сервера
    if (command.paused !== undefined) {
      this.setPaused(command.paused)
    }

    if (command.reset) {
      this.reset()
    }

    if (command.radius !== undefined) {
      this.setBallSize(command.radius)
    }

    if (command.colorBall !== undefined) {
      this.setBallColor(command.colorBall)
    }

    if (command.colorBg !== undefined) {
      this.setBgColor(command.colorBg)
    }
  }

  // === ГЕТТЕРЫ ===

  getState () {
    return {
      x: this.ball.x,
      y: this.ball.y,
      vx: this.ball.vx,
      vy: this.ball.vy,
      speed: this.ball.speed,
      radius: this.ball.radius,
      colorBall: this.colors.ball,
      colorBg: this.colors.bg,
      paused: this.state.paused
    }
  }

  // === ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ ДЛЯ ПЕРЕИСПОЛЬЗОВАНИЯ ===

  /**
   * Вычисляет время до отскока от границы
   */
  _calculateTimeToBounce (position, velocity, radius, worldSize) {
    if (Math.abs(velocity) < 1e-6) return Infinity

    const distanceToLeft = position - radius
    const distanceToRight = worldSize - radius - position

    if (velocity > 0) {
      return distanceToRight / velocity
    } else {
      return distanceToLeft / Math.abs(velocity)
    }
  }

  /**
     * Сбрасывает состояние к начальному
     */
  reset () {
    this.ball.x = this.centerX
    this.ball.y = this.centerY
    this.ball.vx = 0
    this.ball.vy = 0
    this.ball.speed = 30
    this.ball.radius = this.options.ballRadius
    // Не устанавливаем паузу при сбросе - игра должна быть активной
    // this.state.paused = true
    this.state.lastDirection.x = 0
    this.state.lastDirection.y = 0
    this.state.targetVx = 0
    this.state.targetVy = 0
    this.state.targetX = this.centerX
    this.state.targetY = this.centerY
  }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.PhysicsEngine = PhysicsEngine
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PhysicsEngine
}
