/* jshint boss: true, laxbreak: true, laxcomma: true, asi: true, unused: false, esversion: 11, es3: false, es5: false, eqeqeq: false, immed: false, nonbsp: true, strict: false, curly: false, forin: false, -W140: true */
/* global globalThis, console, module, process */

'use strict'
// Интерфейс для управления данными сессий
class SessionRepository {
  /**
   * Конструктор SessionRepository
   */
  constructor() {
    this.sessions = new Map()
  }
  /**
   * Валидация пользовательского ID сессии: латиница/цифры/подчеркивание/дефис, 3..32 символа
   * @param {string} id - ID для валидации
   * @returns {boolean} Результат валидации
   */
  isValidCustomId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{3,32}$/.test(id)
  }

  /**
   * Создает новую сессию с случайным ID
   * @param {Object} sessionData - Данные сессии
   * @returns {Promise<Object>} Созданная сессия
   */
  async create(sessionData = {}) {
    const { v4: uuidv4 } = await import('uuid')
    return this._createInternal(uuidv4().substring(0, 6), sessionData)
  }

  /**
   * Находит или создает сессию по ID
   * @param {string} id - ID сессии
   * @param {Object} sessionData - Данные сессии
   * @returns {Object|null} Сессия или null если ID невалиден
   */
  findOrCreateById(id, sessionData = {}) {
    if (!this.isValidCustomId(id)) {
      return null
    }
    return this.sessions.get(id) || this._createInternal(id, sessionData)
  }

  /**
   * Внутренний метод создания сессии
   * @param {string} id - ID сессии
   * @param {Object} sessionData - Данные сессии
   * @returns {Object} Созданная сессия
   */
  _createInternal(id, sessionData = {}) {
    // Создаем базовый ballState с дефолтными значениями
    const defaultBallState = {
      speed: 30,
      radius: 20,
      colorBall: '#60a5fa',
      colorBg: '#020617',
      paused: true,
      soundEnabled: false,
      soundType: 'soft'
    }

    // Применяем пользовательские значения только если они есть
    const ballState = sessionData.ballState && Object.keys(sessionData.ballState).length > 0
      ? { ...defaultBallState, ...sessionData.ballState }
      : defaultBallState

    const session = {
      id,
      ballState,
      controllerConnected: false,
      viewerConnected: false,
      viewerScreenSize: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      lastStateUpdate: Date.now(), // Время последнего обновления состояния (для детекции неактивности)
      partialDisconnectTime: null, // Время когда один из участников отключился
      /**
       * @type {Map<WebSocket, {role: string, connectedAt: number, sessionId: string}>}
       */
      clients: new Map(),
      mainLoop: null // Единый цикл для физики и рассылки
    }

    this.sessions.set(session.id, session)
    return session
  }

  /**
   * Находит сессию по ID
   * @param {string} sessionId - ID сессии
   * @returns {Object|null} Сессия или null если не найдена
   */
  findById(sessionId) {
    return this.sessions.get(sessionId) || null
  }

  /**
   * Обновляет данные сессии
   * @param {string} sessionId - ID сессии
   * @param {Object} updates - Обновления
   * @returns {boolean} Успех обновления
   */
  update(sessionId, updates) {
    const session = this.findById(sessionId)
    if (!session) {
      return false
    }
    Object.assign(session, updates)
    session.lastActivity = Date.now()
    return true
  }

  /**
   * Обновляет состояние мяча в сессии
   * @param {string} sessionId - ID сессии
   * @param {Object} ballUpdates - Обновления состояния мяча
   * @returns {boolean} Успех обновления
   */
  updateBallState(sessionId, ballUpdates) {
    const session = this.findById(sessionId)
    if (!session) {
      return false
    }
    Object.assign(session.ballState, ballUpdates)
    return true
  }

  /**
   * Удаляет сессию по ID
   * @param {string} sessionId - ID сессии
   * @returns {boolean} Успех удаления
   */
  delete(sessionId) {
    return this.sessions.delete(sessionId)
  }

  /**
   * Возвращает все сессии
   * @returns {Array} Массив сессий
   */
  getAll() {
    return Array.from(this.sessions.values())
  }

  /**
   * Очищает истекшие сессии
   * @param {number} maxAge - Максимальный возраст сессии в мс (по умолчанию 1 час)
   * @param {number} partialDisconnectTimeout - Таймаут после частичного отключения в мс (по умолчанию 15 минут)
   * @param {number} inactivityTimeout - Таймаут при отсутствии обновлений состояния в мс (по умолчанию 30 минут)
   * @returns {Array} Массив ID удаленных сессий
   */
  cleanupExpired(maxAge = 60 * 60 * 1000, partialDisconnectTimeout = 15 * 60 * 1000, inactivityTimeout = 30 * 60 * 1000) {
    const now = Date.now()
    const expiredIds = []

    for (const [id, session] of this.sessions) {
      const age = now - session.createdAt
      const inactiveTime = now - (session.lastActivity || session.createdAt)
      const noUpdatesTime = now - (session.lastStateUpdate || session.createdAt)

      // Причины удаления сессии:
      // 1. Сессия старше 1 часа (maxAge)
      if (age > maxAge) {
        expiredIds.push({ id, reason: 'max_age_exceeded' })
        continue
      }

      // 2. Один из участников отключился более 15 минут назад
      if (session.partialDisconnectTime) {
        const disconnectAge = now - session.partialDisconnectTime
        if (disconnectAge > partialDisconnectTimeout) {
          expiredIds.push({ id, reason: 'partial_disconnect_timeout' })
          continue
        }
      }

      // 3. Полная неактивность (никто не подключен) более 30 минут
      if (!session.controllerConnected && !session.viewerConnected && inactiveTime > 30 * 60 * 1000) {
        expiredIds.push({ id, reason: 'full_inactivity' })
        continue
      }

      // 4. Нет обновлений состояния более 30 минут (свернутая вкладка/неактивная сессия)
      // Проверяем только если хотя бы один клиент подключен
      if ((session.controllerConnected || session.viewerConnected) && noUpdatesTime > inactivityTimeout) {
        expiredIds.push({ id, reason: 'no_state_updates' })
        continue
      }
    }

    for (const { id, reason } of expiredIds) {
      this.delete(id)
    }

    return expiredIds
  }
}

module.exports = SessionRepository
