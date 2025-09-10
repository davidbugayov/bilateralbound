/**
 * PhysicsEngine - оптимизированный движок физики для BilateralBound
 * Управляет движением, отскоками и масштабированием шарика
 * Оптимизирован для производительности и переиспользуемости
 */

class PhysicsEngine {
  constructor (options = {}) {
    // Кэшируем часто используемые значения
    this.options = {
      worldWidth: 800,
      worldHeight: 600,
      ballRadius: 20,
      minSpeed: 50,
      maxSpeed: 1280,
      lerpFactor: 0.1, // Плавная интерполяция скорости
      positionLerpFactor: 0.02, // Плавная интерполяция позиции для превью
      minLerpFactor: 0.01,      // Минимальный коэффициент интерполяции
      maxLerpFactor: 0.25,      // Максимальный коэффициент интерполяции
      smoothing: {              // Параметры пружинного сглаживания (viewer)
        stiffness: 30,          // k
        damping: 10,            // c
        maxPredictSec: 0.25,    // максимум предикции
        snapDistance: 2         // авто-снап к цели в пикселях
      },
      bounceCallback: null,
      friction: 1.0, // Убираем трение для постоянного движения
      bounceDamping: 1.0, // Убираем затухание для идеальных отскоков
      ...options
    }

    // Применяем глобальную конфигурацию при наличии
    if (typeof window !== 'undefined' && window.BBConfig) {
      if (window.BBConfig.smoothing) {
        this.options.smoothing = { ...this.options.smoothing, ...window.BBConfig.smoothing }
      }
    }

    // Флаг для определения режима вьювера
    this.isViewer = false
    this._worldSizeSet = false // Флаг, что размеры мира установлены

    // Предварительно вычисляем центр мира
    this.centerX = this.options.worldWidth / 2
    this.centerY = this.options.worldHeight / 2

    this.ball = {
      x: this.centerX,
      y: this.centerY,
      vx: 0,
      vy: 0,
      speed: 40,
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
      smoothVy: 0
    }

    this.bounceCallback = this.options.bounceCallback

    // Кэшируем Math функции для производительности
    this.sqrt = Math.sqrt
    this.min = Math.min
    this.max = Math.max
    this.abs = Math.abs
  }

  setOptions (opts = {}) {
    if (!opts || typeof opts !== 'object') return
    // Только известные поля
    const allowed = ['worldWidth','worldHeight','ballRadius','minSpeed','maxSpeed','lerpFactor','positionLerpFactor']
    for (const k of allowed) {
      if (opts[k] !== undefined) this.options[k] = opts[k]
    }
  }

  setSmoothingOptions (opts = {}) {
    if (!opts || typeof opts !== 'object') return
    this.options.smoothing = { ...this.options.smoothing, ...opts }
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
  }

  /**
     * Устанавливает позицию шарика
     */
  setPosition (x, y) {
    this.ball.x = x
    this.ball.y = y
    // Для режима "зрителя" (вьювер/превью) также обновляем цель интерполяции,
    // чтобы мяч не "уезжал" к старой цели после установки новой позиции.
    if (this.isViewer) {
      this.state.targetX = x
      this.state.targetY = y
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
    // Для клиентского режима: при паузе фиксируем цель и сбрасываем предсказание,
    // чтобы избежать рывка/дотягивания в момент остановки
    if (this.isViewer && this.state.paused) {
      this.state.targetX = this.ball.x
      this.state.targetY = this.ball.y
      this.state.lastVx = 0
      this.state.lastVy = 0
      this.state.smoothVx = 0
      this.state.smoothVy = 0
      this.lastServerUpdate = performance.now()
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
     * Продвинутая интерполяция для режима вьювера с предикцией движения
     */
  updateViewerInterpolation (deltaTime) {
    // При паузе ничего не интерполируем, оставляем текущую позицию
    if (this.state.paused) return
    if (this.state.targetX === undefined || this.state.targetY === undefined) {
      return
    }

    const currentTime = performance.now()
    const timeSinceLastUpdate = currentTime - (this.lastServerUpdate || currentTime)

    // Если прошло больше 100ms с момента последнего обновления сервера,
    // используем предиктивную экстраполяцию
    if (timeSinceLastUpdate > 100 && this.state.lastVx !== undefined && this.state.lastVy !== undefined) {
      // Предиктивная экстраполяция: продолжаем движение по последней известной траектории
      const predictTime = Math.min(timeSinceLastUpdate / 1000, this.options.smoothing.maxPredictSec || 0.25)
      const predictedX = this.state.targetX + this.state.lastVx * predictTime
      const predictedY = this.state.targetY + this.state.lastVy * predictTime
      this._springTo(predictedX, predictedY, deltaTime)
    } else {
      // Плавное «пружинное» стремление к цели
      this._springTo(this.state.targetX, this.state.targetY, deltaTime)
    }

    // Корректируем позицию если она сильно отклонилась (защита от рассинхронизации)
    const distance = this.sqrt((this.ball.x - this.state.targetX) ** 2 + (this.ball.y - this.state.targetY) ** 2)
    if (distance > 50) { // Если отклонение больше 50px, резко корректируем
      const correctionFactor = 0.3
      this.ball.x += (this.state.targetX - this.ball.x) * correctionFactor
      this.ball.y += (this.state.targetY - this.ball.y) * correctionFactor
    }
  }

  // Критически демпфированная пружина для мягкого следования к цели
  _springTo(targetX, targetY, deltaTime) {
    const k = (this.options.smoothing && this.options.smoothing.stiffness) || 30
    const c = (this.options.smoothing && this.options.smoothing.damping) || 10

    // Ускорение по «пружине»: a = k*(target - x) - c*v
    const ax = k * (targetX - this.ball.x) - c * this.state.smoothVx
    const ay = k * (targetY - this.ball.y) - c * this.state.smoothVy

    // Интегрируем скорость и позицию
    this.state.smoothVx += ax * deltaTime
    this.state.smoothVy += ay * deltaTime

    // Ограничение максимального шага во избежание скачков
    const maxStep = (Math.hypot(this.state.lastVx || 0, this.state.lastVy || 0) || 600) * deltaTime * 1.2
    let dx = this.state.smoothVx * deltaTime
    let dy = this.state.smoothVy * deltaTime
    const stepLen = Math.hypot(dx, dy)
    if (stepLen > maxStep && stepLen > 0) {
      const s = maxStep / stepLen
      dx *= s
      dy *= s
    }

    this.ball.x += dx
    this.ball.y += dy

    // Авто-снап близко к цели, чтобы исключить «залипание» недолетом
    const snap = (this.options.smoothing && this.options.smoothing.snapDistance) || 2
    if (Math.abs(this.ball.x - targetX) < snap) this.ball.x = targetX
    if (Math.abs(this.ball.y - targetY) < snap) this.ball.y = targetY
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
    this.updateServerPhysics(deltaTime);
  }

  /**
   * Обновляет серверную физику с полной обработкой отскоков
   */
  updateServerPhysics(deltaTime) {
    if (this.state.paused) return

    // ================== НАДЁЖНАЯ ПРОВЕРКА V2 ==================
    // Не обновляем физику, пока размеры мира не будут явно установлены
    if (!this._worldSizeSet) {
      return;
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
   * Обновляет локальную физику для превью
   */
  updateLocalPhysics(deltaTime) {
    if (this.state.paused) return

    // ================== НАДЁЖНАЯ ПРОВЕРКА V2 ==================
    // Не обновляем физику, пока размеры мира не будут явно установлены
    if (!this._worldSizeSet) {
        return;
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
    // Обеспечиваем минимальную скорость после отскока
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

  /**
     * Вычисляет масштаб для превью (кэшированная версия)
     */
  calculateScale (viewerScreenSize) {
    if (!viewerScreenSize) return 1
    const scaleX = this.options.worldWidth / viewerScreenSize.width
    const scaleY = this.options.worldHeight / viewerScreenSize.height
    return this.min(scaleX, scaleY)
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

    // Вьювер и превью контроллера напрямую устанавливают позицию для интерполяции
    if (this.isViewer) {
      if (command.x !== undefined) this.state.targetX = command.x
      if (command.y !== undefined) this.state.targetY = command.y

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
        this.calculateTargetVelocity()
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

  // Новый метод для принудительной установки состояния (для синхронизации с сервером)
  setState(newState) {
    if (!newState) return;
    // Применяем только те поля, которые пришли от сервера, чтобы не затереть локальные вычисления
    Object.keys(this.ball).forEach(key => {
      if (newState[key] !== undefined) {
        this.ball[key] = newState[key];
      }
    });
  }

  getCurrentSpeed () {
    return this.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy)
  }

  isMoving () {
    return !this.state.paused && (this.ball.vx !== 0 || this.ball.vy !== 0)
  }

  getDirection () {
    return { x: this.state.lastDirection.x, y: this.state.lastDirection.y }
  }

  // === ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ ДЛЯ ПЕРЕИСПОЛЬЗОВАНИЯ ===

  /**
     * Клонирует состояние для создания нового экземпляра
     */
  clone () {
    return new PhysicsEngine({
      ...this.options,
      bounceCallback: this.bounceCallback
    })
  }

  /**
     * Сбрасывает состояние к начальному
     */
  reset () {
    this.ball.x = this.centerX
    this.ball.y = this.centerY
    this.ball.vx = 0
    this.ball.vy = 0
    this.ball.speed = 40
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

  /**
     * Устанавливает несколько параметров одновременно
     */
  setMultipleParams (params) {
    if (params.worldSize) {
      this.setWorldSize(params.worldSize.width, params.worldSize.height)
    }
    if (params.position) {
      this.setPosition(params.position.x, params.position.y)
    }
    if (params.speed !== undefined) {
      this.setSpeed(params.speed)
    }
    if (params.direction) {
      this.setDirection(params.direction.x, params.direction.y)
    }
    if (params.radius !== undefined) {
      this.ball.radius = params.radius
    }
    if (params.colors) {
      if (params.colors.ball) this.colors.ball = params.colors.ball
      if (params.colors.bg) this.colors.bg = params.colors.bg
    }
  }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.PhysicsEngine = PhysicsEngine
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PhysicsEngine
}
