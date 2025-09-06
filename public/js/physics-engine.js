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
      positionLerpFactor: 0.05, // Плавная интерполяция позиции
      bounceCallback: null,
      friction: 1.0, // Убираем трение для постоянного движения
      bounceDamping: 1.0, // Убираем затухание для идеальных отскоков
      ...options
    }

    // Флаг для определения режима вьювера
    this.isViewer = false

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
      paused: true,
      lastDirection: { x: 0, y: 0 },
      targetVx: 0,
      targetVy: 0,
      targetX: undefined,
      targetY: undefined
    }

    this.bounceCallback = this.options.bounceCallback

    // Кэшируем Math функции для производительности
    this.sqrt = Math.sqrt
    this.min = Math.min
    this.max = Math.max
    this.abs = Math.abs
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
  }

  /**
     * Устанавливает позицию шарика
     */
  setPosition (x, y) {
    this.ball.x = x
    this.ball.y = y
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
     * Обновляет физику за указанное время
     */
  update (deltaTime) {
    if (this.state.paused) return

    // Используем плавную интерполяцию для предотвращения дергания
    if (this.isViewer) {
      // Для вьювера используем прямую скорость (как раньше)
      this.ball.x += this.ball.vx * deltaTime
      this.ball.y += this.ball.vy * deltaTime
    } else {
      // Для превью используем плавную интерполяцию
      const lerpFactor = this.options.lerpFactor || 0.1
      const positionLerpFactor = this.options.positionLerpFactor || 0.05
      
      // Плавно интерполируем к целевой скорости
      this.ball.vx += (this.state.targetVx - this.ball.vx) * lerpFactor
      this.ball.vy += (this.state.targetVy - this.ball.vy) * lerpFactor
      
      // Плавно интерполируем к целевой позиции (если установлена)
      if (this.state.targetX !== undefined && this.state.targetY !== undefined) {
        this.ball.x += (this.state.targetX - this.ball.x) * positionLerpFactor
        this.ball.y += (this.state.targetY - this.ball.y) * positionLerpFactor
      } else {
        // Обновляем позицию с интерполированной скоростью
        this.ball.x += this.ball.vx * deltaTime
        this.ball.y += this.ball.vy * deltaTime
      }
    }

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

    // Проверяем левую и правую границы с экстра-плавной коррекцией
    if (ball.x - radius <= 0) {
      ball.x = radius + 8 // Максимальный отступ для экстра-плавности
      ball.vx = Math.abs(ball.vx) * 0.99 // Отражаем вправо с почти нулевым затуханием
      bounced = true
    } else if (ball.x + radius >= worldWidth) {
      ball.x = worldWidth - radius - 8 // Максимальный отступ для экстра-плавности
      ball.vx = -Math.abs(ball.vx) * 0.99 // Отражаем влево с почти нулевым затуханием
      bounced = true
    }

    // Проверяем верхнюю и нижнюю границы с экстра-плавной коррекцией
    if (ball.y - radius <= 0) {
      ball.y = radius + 8 // Максимальный отступ для экстра-плавности
      ball.vy = Math.abs(ball.vy) * 0.99 // Отражаем вниз с почти нулевым затуханием
      bounced = true
    } else if (ball.y + radius >= worldHeight) {
      ball.y = worldHeight - radius - 8 // Максимальный отступ для экстра-плавности
      ball.vy = -Math.abs(ball.vy) * 0.99 // Отражаем вверх с почти нулевым затуханием
      bounced = true
    }

    // Предотвращаем застревание мяча при очень низкой скорости
    if (Math.abs(ball.vx) < 5 && Math.abs(ball.vy) < 5 && !this.state.paused) {
      // Добавляем минимальную скорость, если мяч почти остановился
      const minSpeed = 20
      if (Math.abs(ball.vx) > 0) {
        ball.vx = ball.vx > 0 ? minSpeed : -minSpeed
      }
      if (Math.abs(ball.vy) > 0) {
        ball.vy = ball.vy > 0 ? minSpeed : -minSpeed
      }
    }

    // Вызываем callback только один раз за кадр
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
     * Синхронизирует состояние с сервером (оптимизированная версия)
     */
  syncFromServer (serverState, viewerScreenSize = null) {
    if (!serverState) {
      console.log('⚠️ PhysicsEngine: No server state provided')
      return
    }

    console.log('🔄 PhysicsEngine: Syncing from server', {
      serverState: {
        x: serverState.x,
        y: serverState.y,
        vx: serverState.vx,
        vy: serverState.vy,
        speed: serverState.speed,
        paused: serverState.paused
      },
      viewerScreenSize,
      isViewer: !!viewerScreenSize
    })

    // Синхронизируем позицию с сервером для всех клиентов
    if (serverState.x !== undefined && serverState.y !== undefined) {
      if (viewerScreenSize) {
        // Для вьювера используем прямую позицию с сервера
        this.isViewer = true
        const oldPos = { x: this.ball.x, y: this.ball.y }
        this.ball.x = serverState.x
        this.ball.y = serverState.y
        console.log('🎯 PhysicsEngine: Viewer position sync', {
          oldPos,
          newPos: { x: this.ball.x, y: this.ball.y },
          serverPos: { x: serverState.x, y: serverState.y }
        })
      } else {
        // Для превью устанавливаем целевую позицию для плавной интерполяции
        const canvas = document.getElementById('preview')
        if (canvas && serverState.viewerScreenSize) {
          const scaleX = canvas.width / serverState.viewerScreenSize.width
          const scaleY = canvas.height / serverState.viewerScreenSize.height
          const oldTarget = { x: this.state.targetX, y: this.state.targetY }
          this.state.targetX = serverState.x * scaleX
          this.state.targetY = serverState.y * scaleY
          console.log('🎮 PhysicsEngine: Preview target position set', {
            oldTarget,
            newTarget: { x: this.state.targetX, y: this.state.targetY },
            serverPos: { x: serverState.x, y: serverState.y },
            scales: { x: scaleX, y: scaleY },
            canvasSize: { w: canvas.width, h: canvas.height },
            viewerSize: serverState.viewerScreenSize
          })
        } else {
          // Fallback - устанавливаем целевую позицию без масштабирования
          const oldTarget = { x: this.state.targetX, y: this.state.targetY }
          this.state.targetX = serverState.x
          this.state.targetY = serverState.y
          console.log('🎮 PhysicsEngine: Preview fallback target position set', {
            oldTarget,
            newTarget: { x: this.state.targetX, y: this.state.targetY },
            serverPos: { x: serverState.x, y: serverState.y }
          })
        }
      }
    }

    // Синхронизируем скорость
    if (serverState.vx !== undefined && serverState.vy !== undefined) {
      if (viewerScreenSize) {
        // Для вьювера используем прямую скорость с сервера
        const oldVel = { vx: this.ball.vx, vy: this.ball.vy }
        this.ball.vx = serverState.vx
        this.ball.vy = serverState.vy
        this.state.targetVx = serverState.vx
        this.state.targetVy = serverState.vy
        console.log('🎯 PhysicsEngine: Viewer velocity sync', {
          oldVel,
          newVel: { vx: this.ball.vx, vy: this.ball.vy },
          serverVel: { vx: serverState.vx, vy: serverState.vy }
        })
      } else {
        // Для превью масштабируем скорость под размер превью
        const canvas = document.getElementById('preview')
        if (canvas && serverState.viewerScreenSize) {
          const scaleX = canvas.width / serverState.viewerScreenSize.width
          const scaleY = canvas.height / serverState.viewerScreenSize.height
          const scaledVx = serverState.vx * scaleX
          const scaledVy = serverState.vy * scaleY

          // Используем плавную интерполяцию для превью
          const oldTarget = { vx: this.state.targetVx, vy: this.state.targetVy }
          this.state.targetVx = scaledVx
          this.state.targetVy = scaledVy
          console.log('🎮 PhysicsEngine: Preview velocity sync', {
            oldTarget,
            newTarget: { vx: this.state.targetVx, vy: this.state.targetVy },
            serverVel: { vx: serverState.vx, vy: serverState.vy },
            scales: { x: scaleX, y: scaleY }
          })
        } else {
          // Fallback без масштабирования
          const oldTarget = { vx: this.state.targetVx, vy: this.state.targetVy }
          this.state.targetVx = serverState.vx
          this.state.targetVy = serverState.vy
          console.log('🎮 PhysicsEngine: Preview fallback velocity sync', {
            oldTarget,
            newTarget: { vx: this.state.targetVx, vy: this.state.targetVy },
            serverVel: { vx: serverState.vx, vy: serverState.vy }
          })
        }
      }
    }

    // Синхронизация других параметров
    if (serverState.speed !== undefined) {
      this.ball.speed = serverState.speed
    }
    if (serverState.radius !== undefined) {
      if (viewerScreenSize) {
        // Для вьювера используем прямой радиус
        this.ball.radius = serverState.radius
      } else {
        // Для превью масштабируем радиус
        const canvas = document.getElementById('preview')
        if (canvas && serverState.viewerScreenSize) {
          const scale = Math.min(canvas.width / serverState.viewerScreenSize.width,
                                canvas.height / serverState.viewerScreenSize.height)
          this.ball.radius = Math.max(serverState.radius * scale * 0.5, 4)
        } else {
          this.ball.radius = Math.max(serverState.radius * 0.5, 4)
        }
      }
    }
    if (serverState.colorBall) {
      this.colors.ball = serverState.colorBall
    }
    if (serverState.colorBg) {
      this.colors.bg = serverState.colorBg
    }
    if (serverState.paused !== undefined) {
      this.state.paused = serverState.paused
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
    this.state.paused = true
    this.state.lastDirection.x = 0
    this.state.lastDirection.y = 0
    this.state.targetVx = 0
    this.state.targetVy = 0
    this.state.targetX = undefined
    this.state.targetY = undefined
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
