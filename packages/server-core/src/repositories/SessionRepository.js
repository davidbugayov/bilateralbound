'use strict'
// Интерфейс для управления данными сессий

// Maximum number of sessions to prevent memory exhaustion
const MAX_SESSIONS = 1000

class SessionRepository {
  /**
   * Конструктор SessionRepository
   */
  constructor() {
    this.sessions = new Map()
    // LRU tracking - Map сохраняет порядок вставки, первый = самый старый
    this.accessOrder = new Map() // sessionId -> lastAccessTime
  }

  /**
   * Update access time for LRU tracking
   * @param {string} sessionId
   * @private
   */
  _touchSession(sessionId) {
    // Удаляем и добавляем заново чтобы переместить в конец Map
    this.accessOrder.delete(sessionId)
    this.accessOrder.set(sessionId, Date.now())
  }

  /**
   * Check if session limit reached and evict oldest if needed (O(1) with LRU)
   * @private
   */
  _enforceSessionLimit() {
    if (this.sessions.size >= MAX_SESSIONS) {
      // Первый элемент в accessOrder - самый старый (LRU)
      const oldestId = this.accessOrder.keys().next().value
      if (oldestId) {
        this.sessions.delete(oldestId)
        this.accessOrder.delete(oldestId)
      }
    }
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
      radius: 40,
      colorBall: '#60a5fa',
      colorBg: '#020617',
      paused: true,
      soundEnabled: false,
      soundType: 'soft',
      ballEmoji: null,
      infinity: false,
      trackBand: 'center'
    }

    // Применяем пользовательские значения только если они есть
    const ballState =
      sessionData.ballState && Object.keys(sessionData.ballState).length > 0
        ? { ...defaultBallState, ...sessionData.ballState }
        : defaultBallState

    // Enforce session limit before creating new one
    this._enforceSessionLimit()

    const session = {
      id,
      ballState,
      controllerConnected: false,
      viewerConnected: false,
      viewerScreenSize: null,
      language: 'en', // Язык сессии (синхронизируется между контроллером и вьювером)
      createdAt: Date.now(),
      lastActivity: Date.now(),
      lastStateUpdate: Date.now(), // Время последнего обновления состояния (для детекции неактивности)
      partialDisconnectTime: null, // Время когда один из участников отключился
      /**
       * @type {Map<WebSocket, {role: string, connectedAt: number, sessionId: string}>}
       */
      clients: new Map()
    }

    this.sessions.set(session.id, session)
    this._touchSession(session.id) // Track in LRU
    return session
  }

  /**
   * Находит сессию по ID
   * @param {string} sessionId - ID сессии
   * @returns {Object|null} Сессия или null если не найдена
   */
  findById(sessionId) {
    const session = this.sessions.get(sessionId)
    if (session) {
      this._touchSession(sessionId) // Update LRU on access
    }
    return session || null
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
  cleanupExpired(
    maxAge = 60 * 60 * 1000,
    partialDisconnectTimeout = 15 * 60 * 1000,
    inactivityTimeout = 30 * 60 * 1000
  ) {
    const now = Date.now()
    const expiredIds = []

    for (const [id, session] of this.sessions) {
      const age = now - session.createdAt
      const inactiveTime = now - (session.lastActivity || session.createdAt)
      const noUpdatesTime =
        now - (session.lastStateUpdate || session.createdAt)

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
      if (
        !session.controllerConnected &&
        !session.viewerConnected &&
        inactiveTime > 30 * 60 * 1000
      ) {
        expiredIds.push({ id, reason: 'full_inactivity' })
        continue
      }

      // 4. Нет обновлений состояния более 30 минут (свернутая вкладка/неактивная сессия)
      // Проверяем только если хотя бы один клиент подключен
      if (
        (session.controllerConnected || session.viewerConnected) &&
        noUpdatesTime > inactivityTimeout
      ) {
        expiredIds.push({ id, reason: 'no_state_updates' })
        continue
      }
    }

    for (const { id } of expiredIds) {
      this.delete(id)
    }

    return expiredIds
  }
}

module.exports = SessionRepository
