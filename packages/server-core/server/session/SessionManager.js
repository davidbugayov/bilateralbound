const PhysicsEngine = require('../../../web-client/public/js/physics-engine.js')
const SessionRepository = require('./SessionRepository.js')
const WebSocketManager = require('./WebSocketManager.js')
const StateBroadcaster = require('./StateBroadcaster.js')
const ValidationUtils = require('../utils/validation.js')
const { logger, DEBUG_MODE } = require('../logger.js')
// Основной оркестратор сессий
class SessionManager {
  /**
   * Конструктор SessionManager
   * @param {Map} apiCache - Кэш API
   */
  constructor(apiCache) {
    this.sessionRepository = new SessionRepository()
    this.webSocketManager = new WebSocketManager(this.sessionRepository)
    this.stateBroadcaster = new StateBroadcaster(this.sessionRepository, this.webSocketManager)
    this.apiCache = apiCache // Получаем ссылку на кэш API
    this.logger = {
      ...logger,
      logSession: (sessionId, msg, level = 'info') => {
        // Оптимизированное логирование - только для отладки
        if (DEBUG_MODE && level === 'debug') logger.logSession(sessionId, msg)
      }
    }
  }

  /**
   * Создает новую сессию с физическим движком
   * @param {Object} ballState - Начальное состояние мяча
   * @returns {Promise<Object>} Созданная сессия
   */
  async createSession(ballState = {}) {
    const session = await this.sessionRepository.create({ ballState })
    this._initializePhysicsEngine(session)
    return session
  }

  /**
   * Создание сессии с определенным ID (для постоянных ссылок)
   * @param {string} sessionId - ID сессии
   * @param {Object} ballState - Начальное состояние мяча
   * @returns {Object|null} Сессия или null если не найдена
   */
  findOrCreateSession(sessionId, ballState = {}) {
    const session = this.sessionRepository.findOrCreateById(sessionId, { ballState })
    if (!session) return null
    if (!session.physicsEngine) {
      this._initializePhysicsEngine(session)
    }

    return session
  }

  /**
   * Инициализирует колбэки физического движка
   * @param {Object} session - Сессия
   */
  _initPhysicsCallbacks(session) {
    // Немедленная рассылка состояния при отскоке, чтобы вьювер видел касание границ
    session.physicsEngine.bounceCallback = () => {
      try {
        // Сохраняем звуковые настройки
        const soundEnabled = session.ballState.soundEnabled
        const soundType = session.ballState.soundType
        Object.assign(session.ballState, session.physicsEngine.getState())
        // Восстанавливаем звуковые настройки
        if (soundEnabled !== undefined) session.ballState.soundEnabled = soundEnabled
        if (soundType !== undefined) session.ballState.soundType = soundType
        this.stateBroadcaster.broadcastState(session.id)
      } catch {
        // ignore
      }
    }
  }

  /**
   * Инициализирует физический движок для сессии
   * @param {Object} session - Сессия
   * @private
   */
  _initializePhysicsEngine(session) {
    session.physicsEngine = new PhysicsEngine({
      ballRadius: session.ballState.radius || 20,
      maxSpeed: 5000
    })
    this._initPhysicsCallbacks(session)
    const engineState = session.physicsEngine.getState()
    // Сохраняем звуковые настройки перед обновлением от физического движка
    const soundSettings = {}
    if (session.ballState.soundEnabled !== undefined) {
      soundSettings.soundEnabled = session.ballState.soundEnabled
    }
    if (session.ballState.soundType !== undefined) {
      soundSettings.soundType = session.ballState.soundType
    }
    Object.assign(session.ballState, engineState)
    // Восстанавливаем звуковые настройки только если они были определены
    if (Object.keys(soundSettings).length > 0) {
      Object.assign(session.ballState, soundSettings)
    }

    // Устанавливаем начальное направление движения (горизонтальное)
    session.physicsEngine.setVelocity(1, 0)
    session.ballState.vx = 1
    session.ballState.vy = 0

    session.ballState.paused = true
    session.physicsEngine.setPaused(true)
    this.startPhysics(session.id)
  }

  /**
   * Получает сессию по ID
   * @param {string} sessionId - ID сессии
   * @returns {Object|null} Сессия или null если не найдена
   */
  getSession(sessionId) {
    return this.sessionRepository.findById(sessionId)
  }

  /**
   * Обновляет состояние мяча в сессии
   * @param {string} sessionId - ID сессии
   * @param {Object} updates - Обновления состояния
   * @returns {boolean} Успех обновления
   */
  updateBallState(sessionId, updates) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    if (!this._shouldUpdateState(session, updates)) {
      return false
    }

    const validatedUpdates = ValidationUtils.validateBallStateUpdates(updates)
    if (Object.keys(validatedUpdates).length === 0) {
      this.logger.logSession(sessionId, '[VALIDATION] No valid fields in update, ignoring')
      return false
    }

    return this._applyValidatedUpdates(session, validatedUpdates)
  }

  /**
   * Проверяет, нужно ли обновлять состояние сессии
   * @private
   */
  _shouldUpdateState(session, updates) {
    const now = Date.now()
    const lastUpdate = session.lastStateUpdate || 0
    const throttleDelay = this._getThrottleDelay(updates)

    if (now - lastUpdate < throttleDelay && !updates?.reset) {
      return false
    }

    session.lastStateUpdate = now
    session.lastActivity = now
    return true
  }

  /**
   * Применяет валидированные обновления к сессии
   * @private
   */
  _applyValidatedUpdates(session, validatedUpdates) {
    this._handleReturnToCenter(session, validatedUpdates)
    this._applyPhysicsUpdates(session, validatedUpdates)
    this._postUpdateActions(session)
    return true
  }

  /**
   * Обрабатывает возврат в центр при необходимости
   * @private
   */
  _handleReturnToCenter(session, validatedUpdates) {
    if (validatedUpdates.returnToCenter && session.physicsEngine) {
      session.physicsEngine.returnToCenter()
      if (validatedUpdates.paused) {
        session.physicsEngine.setPaused(true)
      }
      this.logger.logSession(
        session.id,
        '[RETURN_TO_CENTER] Initiating smooth return to center',
        'debug'
      )
    }
  }

  /**
   * Применяет физические обновления к сессии
   * @private
   */
  _applyPhysicsUpdates(session, validatedUpdates) {
    if (session.physicsEngine) {
      session.physicsEngine.applyCommand(validatedUpdates)
      // Сохраняем звуковые настройки перед обновлением от физического движка
      const soundSettings = {}
      if (session.ballState.soundEnabled !== undefined) {
        soundSettings.soundEnabled = session.ballState.soundEnabled
      }
      if (session.ballState.soundType !== undefined) {
        soundSettings.soundType = session.ballState.soundType
      }
      Object.assign(session.ballState, session.physicsEngine.getState())
      // Восстанавливаем звуковые настройки
      if (Object.keys(soundSettings).length > 0) {
        Object.assign(session.ballState, soundSettings)
      }

      // Применяем новые звуковые настройки из validatedUpdates (они имеют приоритет)
      if (validatedUpdates.soundEnabled !== undefined) {
        session.ballState.soundEnabled = validatedUpdates.soundEnabled
      }
      if (validatedUpdates.soundType !== undefined) {
        session.ballState.soundType = validatedUpdates.soundType
      }

      this._normalizeDirectionIfNeeded(session)
    } else {
      this.sessionRepository.updateBallState(session.id, validatedUpdates)
    }
  }

  /**
   * Нормализует направление при необходимости
   * @private
   */
  _normalizeDirectionIfNeeded(session) {
    if (
      session.normalizeDirectionUntilTs &&
      Date.now() < session.normalizeDirectionUntilTs &&
      session?.physicsEngine?.physicsEngine?.state
    ) {
      const dx = session.physicsEngine.state.lastDirection.x || 0
      const dy = session.physicsEngine.state.lastDirection.y || 0
      session.ballState.vx = Math.max(-1, Math.min(1, dx))
      session.ballState.vy = Math.max(-1, Math.min(1, dy))
    }
  }

  /**
   * Выполняет действия после обновления
   * @private
   */
  _postUpdateActions(session) {
    this._schedulePhysicsUpdate(session.id)
    this.apiCache.delete(`state_${session.id}`)
    this.stateBroadcaster.broadcastState(session.id)
  }

  /**
   * Определяет задержку throttling в зависимости от типа обновления
   */
  _getThrottleDelay(updates) {
    if (!updates) return 50
    if (updates.colorBall !== undefined || updates.colorBg !== undefined) return 200
    if (updates.speed !== undefined) return 100
    if (updates.dirX !== undefined || updates.dirY !== undefined) return 8 // Уменьшено для более отзывчивого управления
    if (updates.paused !== undefined || updates.resume === true) return 0
    return 50
  }

  /**
   * Обрабатывает подключение WebSocket клиента
   * @param {WebSocket} ws - WebSocket соединение
   * @param {string} sessionId - ID сессии
   * @param {string} role - Роль клиента (viewer или controller)
   */
  handleWebSocketConnection(ws, sessionId, role) {
    if (!this.webSocketManager.addClient(sessionId, ws, role)) {
      ws.close(1011, 'Session not found')
      return
    }

    const session = this.sessionRepository.findById(sessionId)
    if (session) {
      session.lastActivity = Date.now()
      this._schedulePhysicsUpdate(sessionId)
      this._handleInitialStateBroadcast(sessionId, ws, role, session)
    }

    this.stateBroadcaster.broadcastViewerStatus(sessionId)
    this._broadcastControllerConnectionIfNeeded(sessionId, role)
  }

  /**
   * Обрабатывает начальную рассылку состояния для клиента
   * @private
   */
  _handleInitialStateBroadcast(sessionId, ws, role, session) {
    if (role === 'viewer') {
      this.stateBroadcaster.broadcastInitialState(sessionId, ws, session.ballState)
    } else {
      this._handleControllerInitialState(sessionId, ws, role, session)
    }
  }

  /**
   * Обрабатывает начальное состояние для контроллера
   * @private
   */
  _handleControllerInitialState(sessionId, ws, role, session) {
    try {
      ws.initialStateSent = false
    } catch {
      /* ignore */
    }

    if (this._isViewerScreenSizeSet(session)) {
      this._broadcastInitialStateToController(sessionId, ws, session)
    } else {
      this.logger.logSession(
        sessionId,
        'Controller connected, deferring initial_state until viewer screen size is set.'
      )
    }
  }

  /**
   * Рассылает начальное состояние контроллеру
   * @private
   */
  _broadcastInitialStateToController(sessionId, ws, session) {
    const finalState = session.physicsEngine ? session.physicsEngine.getState() : session.ballState
    this.stateBroadcaster.broadcastInitialState(sessionId, ws, finalState)
    ws.initialStateSent = true
    this.logger.logSession(
      sessionId,
      'Sent initial_state to controller (viewer screen size already set)'
    )
  }

  /**
   * Рассылает событие подключения контроллера, если нужно
   * @private
   */
  _broadcastControllerConnectionIfNeeded(sessionId, role) {
    if (role === 'controller') {
      this.broadcastControllerConnection(sessionId, true)
    }
  }

  /**
   * Проверяет, установлен ли размер экрана вьювера
   * @private
   */
  _isViewerScreenSizeSet(session) {
    return (
      session.viewerScreenSize &&
      session.viewerScreenSize.width > 0 &&
      session.viewerScreenSize.height > 0
    )
  }

  /**
   * Обрабатывает отключение WebSocket клиента
   * @param {WebSocket} ws - WebSocket соединение
   */
  handleWebSocketDisconnection(ws) {
    const sessionId = this.webSocketManager.removeClient(ws)
    if (sessionId) {
      this._schedulePhysicsUpdate(sessionId)
      this.stateBroadcaster.broadcastViewerStatus(sessionId)
    }
    // Рассылаем событие об отключении контроллера всем клиентам
    const clientInfo = this.getClientInfo(ws)
    if (clientInfo?.role === 'controller') {
      this.broadcastControllerConnection(sessionId, false)
    }
  }

  /**
   * Рассылает событие о подключении/отключении контроллера всем клиентам сессии
   * @param {string} sessionId - ID сессии
   * @param {boolean} isConnected - Статус подключения контроллера
   */
  broadcastControllerConnection(sessionId, isConnected) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return
    const clients = this.webSocketManager.getClients(sessionId)
    const message = JSON.stringify({
      type: isConnected ? 'controller_connected' : 'controller_disconnected',
      payload: { controllerConnected: isConnected },
      timestamp: Date.now()
    })
    for (const { client } of clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        try {
          client.send(message)
          this.logger.logSession(
            sessionId,
            `Broadcasted controller ${isConnected ? 'connected' : 'disconnected'} to client`
          )
        } catch (error) {
          this.logger.error(`Error broadcasting controller connection status: ${error.message}`)
        }
      }
    }
  }

  /**
   * Устанавливает размер экрана вьювера
   * @param {string} sessionId - ID сессии
   * @param {Object} screenSize - Размеры экрана
   * @returns {boolean} Успех установки
   */
  setViewerScreenSize(sessionId, screenSize) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    const validatedSize = ValidationUtils.validateScreenSize(screenSize)
    if (!validatedSize) return false

    const hadPrevSize = this._isViewerScreenSizeSet(session)
    this._storePreviousScreenSize(session, hadPrevSize)

    session.viewerScreenSize = validatedSize
    this._updatePhysicsEngineForNewScreen(session, validatedSize, hadPrevSize)

    this.stateBroadcaster.broadcastState(sessionId)
    this._setDirectionNormalizationTimeout(session, hadPrevSize)
    this._sendInitialStateToControllers(sessionId, session)

    return true
  }

  /**
   * Сохраняет предыдущий размер экрана
   * @private
   */
  _storePreviousScreenSize(session, hadPrevSize) {
    if (hadPrevSize) {
      session._oldWidth = session.viewerScreenSize.width
      session._oldHeight = session.viewerScreenSize.height
    }
  }

  /**
   * Обновляет физический движок для нового размера экрана
   * @private
   */
  _updatePhysicsEngineForNewScreen(session, validatedSize, hadPrevSize) {
    if (session.physicsEngine) {
      const currentState = session.physicsEngine.getState()
      const wasPlaying = !session.ballState.paused

      session.physicsEngine.setWorldSize(validatedSize.width, validatedSize.height)

      if (!hadPrevSize) {
        this._initializeBallPosition(session, validatedSize)
      } else if (this._shouldScaleBallPosition(session, currentState)) {
        this._scaleBallPosition(session, currentState, validatedSize, wasPlaying)
      }

      // Сохраняем звуковые настройки перед обновлением от физического движка
      const soundEnabled = session.ballState.soundEnabled
      const soundType = session.ballState.soundType
      Object.assign(session.ballState, session.physicsEngine.getState())
      // Восстанавливаем звуковые настройки
      if (soundEnabled !== undefined) session.ballState.soundEnabled = soundEnabled
      if (soundType !== undefined) session.ballState.soundType = soundType
    } else {
      this._setDefaultBallState(session, validatedSize)
    }
  }

  /**
   * Инициализирует позицию мяча при первом подключении
   * @private
   */
  _initializeBallPosition(session, validatedSize) {
    session.physicsEngine.setPosition(validatedSize.width / 2, validatedSize.height / 2)
    session.physicsEngine.setVelocity(0, 0)
  }

  /**
   * Масштабирует позицию мяча при изменении размера экрана
   * @private
   */
  _scaleBallPosition(session, currentState, validatedSize, wasPlaying) {
    const scaleX = validatedSize.width / session._oldWidth
    const scaleY = validatedSize.height / session._oldHeight
    const newX = Math.min(currentState.x * scaleX, validatedSize.width - currentState.radius)
    const newY = Math.min(currentState.y * scaleY, validatedSize.height - currentState.radius)

    session.physicsEngine.setPosition(
      Math.max(newX, currentState.radius),
      Math.max(newY, currentState.radius)
    )

    if (wasPlaying) {
      session.physicsEngine.setVelocity(currentState.vx, currentState.vy)
    }
  }

  /**
   * Устанавливает состояние мяча по умолчанию
   * @private
   */
  _setDefaultBallState(session, validatedSize) {
    session.ballState.x = validatedSize.width / 2
    session.ballState.y = validatedSize.height / 2
    session.ballState.vx = 0
    session.ballState.vy = 0
  }

  /**
   * Проверяет, нужно ли масштабировать позицию мяча
   * @private
   */
  _shouldScaleBallPosition(session, currentState) {
    return (
      currentState &&
      (session._oldWidth !== session.viewerScreenSize.width ||
        session._oldHeight !== session.viewerScreenSize.height)
    )
  }

  /**
   * Устанавливает таймаут для нормализации направления
   * @private
   */
  _setDirectionNormalizationTimeout(session, hadPrevSize) {
    session.normalizeDirectionUntilTs = Date.now() + (hadPrevSize ? 600 : 150)
  }

  /**
   * Отправляет начальное состояние контроллерам
   * @private
   */
  _sendInitialStateToControllers(sessionId, session) {
    const clients = this.webSocketManager.getClients(sessionId)
    const finalState = session.physicsEngine ? session.physicsEngine.getState() : session.ballState

    for (const { client, info } of clients) {
      if (info.role === 'controller' && !client.initialStateSent) {
        this.stateBroadcaster.broadcastInitialState(sessionId, client, finalState)
        client.initialStateSent = true
      }
    }
  }

  /**
   * Запускает физический движок для сессии
   * @param {string} sessionId - ID сессии
   */
  startPhysics(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return
    this._schedulePhysicsUpdate(sessionId)
    this.logger.logSession(sessionId, 'Physics manager initialized', 'debug')
  }

  /**
   * Планирует обновление физики для сессии
   * @param {string} sessionId - ID сессии
   */
  _schedulePhysicsUpdate(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return

    // Останавливаем существующий цикл если есть
    if (session.mainLoop) {
      clearInterval(session.mainLoop)
      session.mainLoop = null
    }

    // Проверяем есть ли подключенные вьюверы
    const clients = this.webSocketManager.getClients(sessionId)
    const hasViewers = clients.some(({ info }) => info.role === 'viewer')

    // Запускаем серверный цикл физики только если есть вьюверы
    if (hasViewers && session.physicsEngine) {
      const PHYSICS_TICK_RATE = 60 // Гц - фиксированная частота обновления
      const PHYSICS_DT = 1000 / PHYSICS_TICK_RATE // ~16.67 мс

      session.mainLoop = setInterval(() => {
        try {
          // Обновляем физику на сервере
          session.physicsEngine.update(PHYSICS_DT / 1000)

          // Сохраняем звуковые настройки перед синхронизацией
          const soundEnabled = session.ballState.soundEnabled
          const soundType = session.ballState.soundType

          // Синхронизируем состояние сессии с движком
          Object.assign(session.ballState, session.physicsEngine.getState())

          // Восстанавливаем звуковые настройки
          if (soundEnabled !== undefined) session.ballState.soundEnabled = soundEnabled
          if (soundType !== undefined) session.ballState.soundType = soundType

          // Рассылаем обновленное состояние всем клиентам
          this.stateBroadcaster.broadcastState(sessionId)
        } catch (error) {
          this.logger.error(`Error in physics loop for session ${sessionId}: ${error.message}`)
        }
      }, PHYSICS_DT)

      this.logger.logSession(
        sessionId,
        `Server-side physics loop started at ${PHYSICS_TICK_RATE}Hz`,
        'debug'
      )
    } else {
      this.logger.logSession(
        sessionId,
        'Server-side physics loop not started (no viewers connected)',
        'debug'
      )
    }
  }

  /**
   * Останавливает физический движок для сессии
   * @param {string} sessionId - ID сессии
   */
  stopPhysics(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (session?.mainLoop) {
      clearInterval(session.mainLoop)
      session.mainLoop = null
    }
  }

  /**
   * Очищает истекшие сессии
   * @returns {number} Количество очищенных сессий
   */
  cleanupExpiredSessions() {
    const expiredSessions = this.sessionRepository.cleanupExpired()
    if (expiredSessions.length > 0) {
      this.logger.info(`Cleaned up ${expiredSessions.length} expired sessions.`)
      for (const { id, reason } of expiredSessions) {
        this.stopPhysics(id)
        this.logger.logSession(id, `Session cleaned up: ${reason}`)
      }
    }

    return expiredSessions.length
  }

  /**
   * Возвращает количество активных сессий
   * @returns {number} Количество сессий
   */
  getSessionCount() {
    return this.sessionRepository.getAll().length
  }

  /**
   * Получает информацию о клиенте по WebSocket соединению
   * @param {WebSocket} ws - WebSocket соединение
   * @returns {Object|null} Информация о клиенте или null
   */
  getClientInfo(ws) {
    for (const session of this.sessionRepository.getAll()) {
      if (session.clients.has(ws)) {
        const clientInfo = session.clients.get(ws)
        return { sessionId: clientInfo.sessionId, role: clientInfo.role }
      }
    }

    return null
  }
}

module.exports = SessionManager
