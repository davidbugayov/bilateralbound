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
    if (!this.isValidCustomId(id)) return null
    return this.sessions.get(id) || this._createInternal(id, sessionData)
  }

  /**
   * Внутренний метод создания сессии
   * @param {string} id - ID сессии
   * @param {Object} sessionData - Данные сессии
   * @returns {Object} Созданная сессия
   */
  _createInternal(id, sessionData = {}) {
    const session = {
      id,
      ballState: {
        speed: 30,
        radius: 20,
        colorBall: '#60a5fa',
        colorBg: '#020617',
        paused: true,
        soundEnabled: false,
        soundType: 'soft',
        ...sessionData.ballState
      },
      controllerConnected: false,
      viewerConnected: false,
      viewerScreenSize: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      /**
       * @type {Map<WebSocket, {role: string, connectedAt: number, sessionId: string}>}
       */
      clients: new Map(),
      mainLoop: null, // Единый цикл для физики и рассылки
      lastStateUpdate: 0, // Добавляем для отслеживания последнего обновления состояния
      ...sessionData
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
    if (!session) return false
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
    if (!session) return false
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
   * @returns {Array} Массив ID удаленных сессий
   */
  cleanupExpired(maxAge = 60 * 60 * 1000) {
    // 1 hour
    const now = Date.now()
    const expiredIds = []

    for (const [id, session] of this.sessions) {
      // Удаляем сессии старше maxAge ИЛИ неактивные более 30 минут
      const inactiveTime = now - (session.lastActivity || session.createdAt)
      if (now - session.createdAt > maxAge || inactiveTime > 30 * 60 * 1000) {
        expiredIds.push(id)
      }
    }

    for (const id of expiredIds) {
      this.delete(id)
    }
    return expiredIds
  }
}

module.exports = SessionRepository
