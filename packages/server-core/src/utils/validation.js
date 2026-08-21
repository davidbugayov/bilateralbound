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
    this._validateNewFields(updates, validated)

    return validated
  }

  /**
   * Валидирует значение скорости
   * @private
   */
  static _validateSpeed(updates, validated) {
    if (updates.speed !== undefined)
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
    if (updates.paused !== undefined)
      if (typeof updates.paused === 'boolean') {
        validated.paused = updates.paused
      }
  }

  /**
   * Валидирует направление
   * @private
   */
  static _validateDirection(updates, validated) {
    if (
      updates.dirX !== undefined &&
      this._isValidDirectionValue(updates.dirX)
    ) {
      validated.dirX = updates.dirX
    }
    if (
      updates.dirY !== undefined &&
      this._isValidDirectionValue(updates.dirY)
    ) {
      validated.dirY = updates.dirY
    }
  }

  /**
   * Валидирует цвета
   * @private
   */
  static _validateColors(updates, validated) {
    if (this._isValidColor(updates.colorBall)) {
      validated.colorBall = updates.colorBall
    }
    if (this._isValidColor(updates.colorBg)) {
      validated.colorBg = updates.colorBg
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
    if (
      updates.soundType &&
      ['soft', 'tick', 'tone', 'click', 'bounce', 'beep'].includes(
        updates.soundType
      )
    ) {
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
    if (typeof updates.stopping === 'boolean') {
      validated.stopping = updates.stopping
    }
  }

  /**
   * Валидирует новые поля (ballEmoji, infinity, trackBand)
   * @private
   */
  static _validateNewFields(updates, validated) {
    if (updates.ballEmoji !== undefined && (updates.ballEmoji === null || (typeof updates.ballEmoji === 'string' && updates.ballEmoji.length <= 2))) {
      validated.ballEmoji = updates.ballEmoji
    }
    if (updates.infinity !== undefined && typeof updates.infinity === 'boolean') {
      validated.infinity = updates.infinity
    }
    if (updates.brainspotting !== undefined && typeof updates.brainspotting === 'boolean') {
      validated.brainspotting = updates.brainspotting
    }
    // Allow x/y position updates for brainspotting mode (therapist sets position)
    if (updates.x !== undefined && typeof updates.x === 'number' && !Number.isNaN(updates.x)) {
      validated.x = updates.x
    }
    if (updates.y !== undefined && typeof updates.y === 'number' && !Number.isNaN(updates.y)) {
      validated.y = updates.y
    }
    if (updates.trackBand !== undefined && ['top', 'center', 'bottom'].includes(updates.trackBand)) {
      validated.trackBand = updates.trackBand
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
    return (
      typeof value === 'number' && Math.abs(value) <= 1 && !Number.isNaN(value)
    )
  }

  /**
   * Проверяет корректность значения скорости
   * @private
   */
  static _isValidSpeed(value) {
    return (
      typeof value === 'number' &&
      value >= 0 &&
      value <= 100 &&
      !Number.isNaN(value)
    )
  }

  /**
   * Проверяет корректность значения радиуса
   * @private
   */
  static _isValidRadius(value) {
    return (
      typeof value === 'number' &&
      value > 0 &&
      value <= 1000 &&
      !Number.isNaN(value)
    )
  }

  /**
   * Проверяет корректность hex цвета
   * @private
   */
  static _isValidColor(value) {
    // Поддержка форматов: #RRGGBB и #RGB
    return (
      typeof value === 'string' &&
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
    )
  }

  /**
   * Валидирует bounce sync payload
   */
  static validateBouncePayload(data) {
    if (!data || typeof data !== 'object') {
      return null
    }

    const validated = {}

    // side: string, one of allowed values
    const allowedSides = ['left', 'right', 'top', 'bottom']
    if (typeof data.side === 'string' && allowedSides.includes(data.side)) {
      validated.side = data.side
    }

    // x, y: numbers
    if (typeof data.x === 'number' && !Number.isNaN(data.x)) {
      validated.x = data.x
    }
    if (typeof data.y === 'number' && !Number.isNaN(data.y)) {
      validated.y = data.y
    }

    // dirX, dirY: numbers between -1 and 1
    if (
      typeof data.dirX === 'number' &&
      !Number.isNaN(data.dirX) &&
      Math.abs(data.dirX) <= 1
    ) {
      validated.dirX = data.dirX
    }
    if (
      typeof data.dirY === 'number' &&
      !Number.isNaN(data.dirY) &&
      Math.abs(data.dirY) <= 1
    ) {
      validated.dirY = data.dirY
    }

    // timestamp: positive number
    if (
      typeof data.timestamp === 'number' &&
      !Number.isNaN(data.timestamp) &&
      data.timestamp > 0
    ) {
      validated.timestamp = data.timestamp
    }

    return Object.keys(validated).length > 0 ? validated : null
  }

  /**
   * Валидирует sessionId формат
   */
  static validateSessionId(sessionId) {
    return (
      typeof sessionId === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(sessionId)
    )
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

    if (
      Number.isNaN(width) ||
      Number.isNaN(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return null
    }

    return { width, height }
  }
}

module.exports = ValidationUtils
