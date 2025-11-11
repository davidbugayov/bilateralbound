'use strict'
const { v4: uuidv4 } = require('uuid')
// Интерфейс для управления данными сессий
class SessionRepository {
  /**
   * Конструктор SessionRepository
   */
  constructor() {
    this.sessions = new Map()
    this.sessionCache = new Map() // Кэш для часто запрашиваемых сессий
    this.cacheExpiration = 30000 // 30 секунд
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
   * @returns {Object} Созданная сессия
   */
  create(sessionData = {}) {
    const session = this._createInternal(uuidv4().substring(0, 6), sessionData)
    return session
  }

  /**
   * Создает сессию с указанным ID или возвращает существующую
   * @param {string} customId - Пользовательский ID сессии
   * @param {Object} sessionData - Данные сессии
   * @returns {Object} Сессия
   * @throws {Error} Если ID невалиден
   */
  createWithId(customId, sessionData = {}) {
    const id = String(customId)
    if (!this.isValidCustomId(id)) {
      throw new Error('Invalid session id format')
    }

    if (this.sessions.has(id)) {
      // Возвращаем существующую сессию, делая операцию идемпотентной
      return this.sessions.get(id)
    }

    return this._createInternal(id, sessionData)
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
        ...sessionData.ballState
      },
      controllerConnected: false,
      viewerConnected: false,
      viewerScreenSize: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      clients: new Map(),
      mainLoop: null, // Единый цикл для физики и рассылки
      lastStateUpdate: 0, // Добавляем для отслеживания последнего обновления состояния
      ...sessionData
    }

    this.sessions.set(session.id, session)
    return session
  }

  /**
   * Находит сессию по ID с кэшированием
   * @param {string} sessionId - ID сессии
   * @returns {Object|null} Сессия или null если не найдена
   */
  findById(sessionId) {
    // Проверяем кэш сначала
    const cached = this.sessionCache.get(sessionId)
    if (cached && Date.now() - cached.timestamp < this.cacheExpiration) {
      return cached.session
    }
    // Ищем в основном хранилище
    const session = this.sessions.get(sessionId) || null
    // Кэшируем результат (даже если null)
    if (session) {
      this.sessionCache.set(sessionId, {
        session,
        timestamp: Date.now()
      })
    }

    return session
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
    // Инвалидируем кэш
    this.sessionCache.delete(sessionId)
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
    // Инвалидируем кэш
    this.sessionCache.delete(sessionId)
    return true
  }

  /**
   * Удаляет сессию по ID
   * @param {string} sessionId - ID сессии
   * @returns {boolean} Успех удаления
   */
  delete(sessionId) {
    this.sessionCache.delete(sessionId) // Очищаем кэш
    return this.sessions.delete(sessionId)
  }
  /**
   * Очистка устаревшего кэша для оптимизации памяти
   */
  cleanupCache() {
    const now = Date.now()
    for (const [sessionId, cached] of this.sessionCache) {
      if (now - cached.timestamp > this.cacheExpiration) {
        this.sessionCache.delete(sessionId)
      }
    }
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
    // Также очищаем устаревший кэш
    this.cleanupCache()
    return expiredIds
  }
}

module.exports = SessionRepository
