/**
 * Централизованная валидация данных для BilateralBound
 * Упрощает и унифицирует валидацию по всему приложению
 */

class ValidationUtils {
  /**
   * Валидирует обновления состояния мяча
   */
  static validateBallStateUpdates(updates) {
    if (!updates || typeof updates !== 'object') {
      return {}
    }

    const validated = {}

    // Валидация скорости
    if (
      typeof updates.speed === 'number' &&
      updates.speed >= 0 &&
      updates.speed <= 100 &&
      !isNaN(updates.speed)
    ) {
      validated.speed = updates.speed
    }

    // Валидация радиуса
    if (
      typeof updates.radius === 'number' &&
      updates.radius > 0 &&
      updates.radius <= 1000 &&
      !isNaN(updates.radius)
    ) {
      validated.radius = updates.radius
    }

    // Валидация паузы
    if (typeof updates.paused === 'boolean') {
      validated.paused = updates.paused
    }

    // Валидация направления
    if (typeof updates.dirX === 'number' && Math.abs(updates.dirX) <= 1 && !isNaN(updates.dirX)) {
      validated.dirX = updates.dirX
    }
    if (typeof updates.dirY === 'number' && Math.abs(updates.dirY) <= 1 && !isNaN(updates.dirY)) {
      validated.dirY = updates.dirY
    }

    // Валидация цветов
    if (typeof updates.colorBall === 'string' && /^#[0-9a-fA-F]{6}$/.test(updates.colorBall)) {
      validated.colorBall = updates.colorBall
    }
    if (typeof updates.colorBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(updates.colorBg)) {
      validated.colorBg = updates.colorBg
    }

    // Валидация команд
    if (updates.reset === true) validated.reset = true
    if (updates.resume === true) validated.paused = false
    if (updates.pause === true) validated.paused = true

    return validated
  }

  /**
   * Валидирует WebSocket команды
   */
  static validateWebSocketCommand(command) {
    if (!command || typeof command !== 'object') {
      return {}
    }

    const validated = {}

    // Валидация для вьювера (клиентского режима)
    if (command.role === 'viewer') {
      if (typeof command.x === 'number' && !isNaN(command.x)) validated.x = command.x
      if (typeof command.y === 'number' && !isNaN(command.y)) validated.y = command.y
      if (typeof command.vx === 'number' && !isNaN(command.vx)) validated.vx = command.vx
      if (typeof command.vy === 'number' && !isNaN(command.vy)) validated.vy = command.vy
    } else {
      // Валидация для серверного режима
      if (typeof command.dirX === 'number' && Math.abs(command.dirX) <= 1 && !isNaN(command.dirX)) {
        validated.dirX = command.dirX
      }
      if (typeof command.dirY === 'number' && Math.abs(command.dirY) <= 1 && !isNaN(command.dirY)) {
        validated.dirY = command.dirY
      }
      if (
        typeof command.speed === 'number' &&
        command.speed >= 0 &&
        command.speed <= 100 &&
        !isNaN(command.speed)
      ) {
        validated.speed = command.speed
      }
    }

    // Общие валидации для всех режимов
    if (typeof command.paused === 'boolean') {
      validated.paused = command.paused
    }
    if (command.reset === true) {
      validated.reset = true
    }
    if (
      typeof command.radius === 'number' &&
      command.radius > 0 &&
      command.radius <= 1000 &&
      !isNaN(command.radius)
    ) {
      validated.radius = command.radius
    }
    if (typeof command.colorBall === 'string' && /^#[0-9a-fA-F]{6}$/.test(command.colorBall)) {
      validated.colorBall = command.colorBall
    }
    if (typeof command.colorBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(command.colorBg)) {
      validated.colorBg = command.colorBg
    }

    return validated
  }

  /**
   * Валидирует размеры экрана
   */
  static validateScreenSize(screenSize) {
    if (!screenSize || typeof screenSize !== 'object') {
      return null
    }

    const width = parseInt(screenSize.width)
    const height = parseInt(screenSize.height)

    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
      return null
    }

    return { width, height }
  }
}

module.exports = ValidationUtils
