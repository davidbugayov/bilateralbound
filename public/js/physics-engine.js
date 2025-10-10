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
    this.abs = Math.abs

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
     * Запускает движение в указанном направлении
     */
  startMovement (dirX, dirY, speedPercent = null) {
    if (speedPercent !== null) {
      this.setSpeed(speedPercent)
    }

    this.setDirection(dirX, dirY)
    this.state.paused = false
    this.calculateTargetVelocity()
  }

  /**
     * Останавливает движение
     */
  stopMovement () {
    this.state.paused = true
    this.ball.vx = 0
    this.ball.vy = 0
    this.state.targetVx = 0
    this.state.targetVy = 0
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
     * Рассчитывает целевую скорость на основе направления и процента
     */
  calculateTargetVelocity () {
    const speedPercent = this.ball.speed / 100
    const pixelsPerSecond = speedPercent * this.options.maxSpeed

    this.state.targetVx = this.state.lastDirection.x * pixelsPerSecond
    this.state.targetVy = this.state.lastDirection.y * pixelsPerSecond
  }

  /**
     * УЛУЧШЕННАЯ интерполяция v2.0 с адаптивной пружиной и ограничением шага
     * Максимально устойчива к сетевому джиттеру и лагам
     */
  updateViewerInterpolation (deltaTime) {
    if ((this.state.paused && !this.state.allowInterpWhenPaused) || this.state.targetX === undefined) return;

    const currentTime = performance.now();
    const timeSinceLastUpdate = (currentTime - (this.lastServerUpdate || currentTime)) / 1000;

    // --- 1. Предсказание целевой позиции ---
    const predictTime = Math.min(timeSinceLastUpdate, this.options.smoothing.maxPredictSec || 0.2);
    const vx = this.state.lastVx || 0;
    const vy = this.state.lastVy || 0;
    const predictedTargetX = this.state.targetX + vx * predictTime;
    const predictedTargetY = this.state.targetY + vy * predictTime;
    const radius = this.ball.radius;
    const w = this.options.worldWidth;
    const h = this.options.worldHeight;
    const clampedTargetX = Math.min(w - radius, Math.max(radius, predictedTargetX));
    const clampedTargetY = Math.min(h - radius, Math.max(radius, predictedTargetY));

    // --- 2. Адаптивная пружина ---
    const dx = clampedTargetX - this.ball.x;
    const dy = clampedTargetY - this.ball.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Адаптивная жесткость: выше на больших расстояниях, ниже при приближении
    const baseStiffness = this.options.smoothing.stiffness || 12;
    const stiffness = baseStiffness + (distance / 100); // Увеличиваем жесткость пропорционально расстоянию
    const damping = this.options.smoothing.damping || 10;

    // Ускорение пружины: a = k * (target - pos) - c * velocity
    const ax = stiffness * dx - damping * this.state.smoothVx;
    const ay = stiffness * dy - damping * this.state.smoothVy;

    // Интегрируем скорость
    this.state.smoothVx += ax * deltaTime;
    this.state.smoothVy += ay * deltaTime;

    // --- 3. Ограничение шага (Step Capping) для предотвращения телепортации ---
    let stepX = this.state.smoothVx * deltaTime;
    let stepY = this.state.smoothVy * deltaTime;
    const stepMagnitude = Math.sqrt(stepX * stepX + stepY * stepY);
    
    // Максимальный шаг = расстояние до цели * 1.5 (чтобы догонять, но не перелетать)
    const maxStep = distance * 1.5; 

    if (stepMagnitude > maxStep && maxStep > 0) {
      const scale = maxStep / stepMagnitude;
      stepX *= scale;
      stepY *= scale;
      // Корректируем и скорость, чтобы избежать накопления энергии
      this.state.smoothVx *= scale;
      this.state.smoothVy *= scale;
    }

    // Интегрируем позицию
    this.ball.x += stepX;
    this.ball.y += stepY;
    // Гарантируем, что визуальная позиция не выходит за экран
    this.clampBallWithinBounds();

    // --- 4. Авто-снап к цели для устранения микроколебаний ---
    const snapDistance = this.options.smoothing.snapDistance || 0.5;
    if (distance < snapDistance && Math.abs(this.state.smoothVx) < 10 && Math.abs(this.state.smoothVy) < 10) {
      this.ball.x = clampedTargetX;
      this.ball.y = clampedTargetY;
      this.state.smoothVx = 0;
      this.state.smoothVy = 0;
      // Если мы были на паузе и дошли до цели — больше не требуется интерполяция на паузе
      if (this.state.paused) this.state.allowInterpWhenPaused = false;
    }
  }

  /**
   * Обновляет физику за указанное время
   */
  update (deltaTime) {
    // В режиме вьювера (клиент) всегда используется интерполяция
    if (this.isViewer) {
      this.updateViewerInterpolation(deltaTime)
      return
    }

    // Для сервера используем полную физику с отскоками
    this.updateServerPhysics(deltaTime)
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

    // Обновляем позицию
    this.ball.x += this.ball.vx * deltaTime
    this.ball.y += this.ball.vy * deltaTime

    // Обрабатываем коллизии с границами
    this.handleBoundaryCollisions()
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
      this.state.lastDirection.x = Math.abs(this.state.lastDirection.x || 1)
      bounced = true
    } else if (ball.x + radius > worldWidth) {
      ball.x = worldWidth - radius // Клампим позицию
      this.state.lastDirection.x = -Math.abs(this.state.lastDirection.x || 1)
      bounced = true
    }

    // Проверяем верхнюю и нижнюю границы
    if (ball.y - radius < 0) {
      ball.y = radius // Клампим позицию
      this.state.lastDirection.y = Math.abs(this.state.lastDirection.y || 1)
      bounced = true
    } else if (ball.y + radius > worldHeight) {
      ball.y = worldHeight - radius // Клампим позицию
      this.state.lastDirection.y = -Math.abs(this.state.lastDirection.y || 1)
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
    } catch (_) {}
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
        this.state.targetX = cx
        this.state.targetY = cy
        const isPause = command.paused === true
        if (!isPause) {
          this.ball.x = cx
          this.ball.y = cy
        } else {
          // Разрешаем интерполяцию на паузе для плавного движения к цели
          this.state.allowInterpWhenPaused = true
          this.state.smoothVx = 0
          this.state.smoothVy = 0
          this.state.lastVx = 0
          this.state.lastVy = 0
        }
      }

      // Сохраняем скорость и время обновления для предикции
      if (command.vx !== undefined) this.state.lastVx = command.vx
      if (command.vy !== undefined) this.state.lastVy = command.vy
      this.lastServerUpdate = performance.now()
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
      if (!this.state.paused) {
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
