'use strict'
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

    this._validateSpeed(updates, validated)
    this._validateRadius(updates, validated)
    this._validatePause(updates, validated)
    this._validateDirection(updates, validated)
    this._validateColors(updates, validated)
    this._validateSound(updates, validated)
    this._validateCommands(updates, validated)

    return validated
  }

  /**
   * Валидирует значение скорости
   * @private
   */
  static _validateSpeed(updates, validated) {
    if (updates.speed !== undefined) // console.log('[ValidationUtils] _validateSpeed input:', updates.speed)
    if (this._isValidSpeed(updates.speed)) {
      validated.speed = updates.speed
    }
  }

  /**
   * Валидирует значение радиуса
   * @private
   */
  static _validateRadius(updates, validated) {
    if (this._isValidRadius(updates.radius)) {
      validated.radius = updates.radius
    }
  }

  /**
   * Валидирует паузу
   * @private
   */
  static _validatePause(updates, validated) {
    if (updates.paused !== undefined) // console.log('[ValidationUtils] _validatePause input:', updates.paused)
    if (typeof updates.paused === 'boolean') {
      validated.paused = updates.paused
    }
  }

  /**
   * Валидирует направление
   * @private
   */
  static _validateDirection(updates, validated) {
    if (updates.dirX !== undefined || updates.dirY !== undefined) // console.log('[ValidationUtils] _validateDirection input:', updates.dirX, updates.dirY)

    if (this._isValidDirectionValue(updates.dirX)) {
      validated.dirX = updates.dirX
    }
    if (this._isValidDirectionValue(updates.dirY)) {
      validated.dirY = updates.dirY
    }
  }

  /**
   * Валидирует цвета
   * @private
   */
  static _validateColors(updates, validated) {
    // console.log('[ValidationUtils] _validateColors input:', JSON.stringify({ colorBall: updates.colorBall, colorBg: updates.colorBg }))

    if (this._isValidColor(updates.colorBall)) {
      validated.colorBall = updates.colorBall
      // console.log('[ValidationUtils] colorBall is valid:', updates.colorBall)
    } else if (updates.colorBall !== undefined) {
      // console.log('[ValidationUtils] colorBall is INVALID:', updates.colorBall, typeof updates.colorBall)
    }

    if (this._isValidColor(updates.colorBg)) {
      validated.colorBg = updates.colorBg
      // console.log('[ValidationUtils] colorBg is valid:', updates.colorBg)
    } else if (updates.colorBg !== undefined) {
      // console.log('[ValidationUtils] colorBg is INVALID:', updates.colorBg, typeof updates.colorBg)
    }
  }

  /**
   * Валидирует звуковые настройки
   * @private
   */
  static _validateSound(updates, validated) {
    if (typeof updates.soundEnabled === 'boolean') {
      validated.soundEnabled = updates.soundEnabled
    }
    if (updates.soundType && ['soft', 'tick', 'tone', 'click', 'bounce', 'beep'].includes(updates.soundType)) {
      validated.soundType = updates.soundType
    }
  }

  /**
   * Валидирует команды
   * @private
   */
  static _validateCommands(updates, validated) {
    if (updates.reset === true) {
      validated.reset = true
    }
    if (updates.resume === true) {
      validated.paused = false
    }
    if (updates.pause === true) {
      validated.paused = true
    }
    if (updates.returnToCenter === true) {
      validated.returnToCenter = true
    }
  }

  /**
   * Валидирует WebSocket команды
   */
  static validateWebSocketCommand(command) {
    if (!command || typeof command !== 'object') {
      return {}
    }

    const validated = {}

    if (command.role === 'viewer') {
      this._validateViewerCommand(command, validated)
    } else {
      this._validateControllerCommand(command, validated)
    }

    // Общие валидации для всех режимов
    this._validateCommonCommandFields(command, validated)

    return validated
  }

  /**
   * Валидирует команды для режима viewer
   * @private
   */
  static _validateViewerCommand(command, validated) {
    if (typeof command.x === 'number' && !Number.isNaN(command.x)) {
      validated.x = command.x
    }
    if (typeof command.y === 'number' && !Number.isNaN(command.y)) {
      validated.y = command.y
    }
    if (typeof command.vx === 'number' && !Number.isNaN(command.vx)) {
      validated.vx = command.vx
    }
    if (typeof command.vy === 'number' && !Number.isNaN(command.vy)) {
      validated.vy = command.vy
    }
  }

  /**
   * Валидирует команды для режима controller
   * @private
   */
  static _validateControllerCommand(command, validated) {
    if (this._isValidDirectionValue(command.dirX)) {
      validated.dirX = command.dirX
    }
    if (this._isValidDirectionValue(command.dirY)) {
      validated.dirY = command.dirY
    }
    if (this._isValidSpeed(command.speed)) {
      validated.speed = command.speed
    }
  }

  /**
   * Валидирует общие поля команд
   * @private
   */
  static _validateCommonCommandFields(command, validated) {
    if (typeof command.paused === 'boolean') {
      validated.paused = command.paused
    }
    if (command.reset === true) {
      validated.reset = true
    }
    if (this._isValidRadius(command.radius)) {
      validated.radius = command.radius
    }
    if (this._isValidColor(command.colorBall)) {
      validated.colorBall = command.colorBall
    }
    if (this._isValidColor(command.colorBg)) {
      validated.colorBg = command.colorBg
    }
  }

  /**
   * Проверяет корректность значения направления
   * @private
   */
  static _isValidDirectionValue(value) {
    return typeof value === 'number' && Math.abs(value) <= 1 && !Number.isNaN(value)
  }

  /**
   * Проверяет корректность значения скорости
   * @private
   */
  static _isValidSpeed(value) {
    return typeof value === 'number' && value >= 0 && value <= 100 && !Number.isNaN(value)
  }

  /**
   * Проверяет корректность значения радиуса
   * @private
   */
  static _isValidRadius(value) {
    return typeof value === 'number' && value > 0 && value <= 1000 && !Number.isNaN(value)
  }

  /**
   * Проверяет корректность hex цвета
   * @private
   */
  static _isValidColor(value) {
    // Поддержка форматов: #RRGGBB и #RGB
    return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
  }

  /**
   * Валидирует размеры экрана
   */
  static validateScreenSize(screenSize) {
    if (!screenSize || typeof screenSize !== 'object') {
      return null
    }

    const width = Number.parseInt(screenSize.width)
    const height = Number.parseInt(screenSize.height)

    if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) {
      return null
    }

    return { width, height }
  }
}

module.exports = ValidationUtils
