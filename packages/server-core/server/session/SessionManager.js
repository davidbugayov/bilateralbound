'use strict'
const PhysicsEngine = require('../../../web-client/public/js/physics-engine.js')
const SessionRepository = require('./SessionRepository.js')
const WebSocketManager = require('./WebSocketManager.js')
const SSEManager = require('./SSEManager.js')
const StateBroadcaster = require('./StateBroadcaster.js')
const ValidationUtils = require('../utils/validation.js')
const { logger, DEBUG_MODE } = require('../logger.js')
const config = require('../config.js')
// Основной оркестратор сессий
class SessionManager {
  /**
   * Конструктор SessionManager
   * @param {Map} apiCache - Кэш API
   */
  constructor(apiCache) {
    this.sessionRepository = new SessionRepository()
    this.webSocketManager = new WebSocketManager(this.sessionRepository)
    this.sseManager = new SSEManager(this.sessionRepository)
    this.clientSimulationOnly = config.getRuntimeTuning().CLIENT_SIM_ONLY
    this.stateBroadcaster = new StateBroadcaster(
      this.sessionRepository,
      this.webSocketManager,
      this.sseManager,
      { clientSimulationOnly: this.clientSimulationOnly }
    )
    this.apiCache = apiCache // Получаем ссылку на кэш API
    this.logger = {
      ...logger,
      logSession: (sessionId, msg, level = 'info') => {
        // Оптимизированное логирование - только для отладки
        if (DEBUG_MODE && level === 'debug') {
          logger.logSession(sessionId, msg)
        }
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
    if (!session) {
      return null
    }
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
        if (soundEnabled !== undefined) {
          session.ballState.soundEnabled = soundEnabled
        }
        if (soundType !== undefined) {
          session.ballState.soundType = soundType
        }
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
    // ВАЖНО: не устанавливаем скорость напрямую, только направление
    session.physicsEngine.setDirection(1, 0)
    session.ballState.dirX = 1
    session.ballState.dirY = 0
    // Скорость будет пересчитана при старте на основе направления

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
    console.log(`[SessionManager] 📥 Received updates for ${sessionId} from unknown source:`, JSON.stringify(updates))

    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      console.log(`[SessionManager] ❌ Session not found: ${sessionId}`)
      return false
    }

    if (!this._shouldUpdateState(session, updates)) {
      console.log(`[SessionManager] ⏭️  Throttled update for session ${sessionId}`)
      return true // Возвращаем true, так как это не ошибка клиента, а защита сервера
    }

    const validatedUpdates = ValidationUtils.validateBallStateUpdates(updates)
    console.log(`[SessionManager] 📝 Validated updates for ${sessionId}:`, JSON.stringify(validatedUpdates))

    // TEMPORARY BYPASS VALIDATION
    if (Object.keys(validatedUpdates).length === 0 && Object.keys(updates).length > 0) {
       console.log('[SessionManager] ⚠️ VALIDATION FAILED but bypassing for debug. Applying raw updates:', JSON.stringify(updates))
       return this._applyValidatedUpdates(session, updates)
    }

    if (Object.keys(validatedUpdates).length === 0) {
      this.logger.logSession(sessionId, '[VALIDATION] No valid fields in update, ignoring')
      console.log(`[SessionManager] ❌ No valid fields after validation for ${sessionId}`)
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
    // this._handleReturnToCenter(session, validatedUpdates) // TODO: implement if needed
    this._applyPhysicsUpdates(session, validatedUpdates)
    this._postUpdateActions(session, validatedUpdates)
    return true
  }

  /**
   * Применяет обновления физики к состоянию сессии
   * @private
   */
  _applyPhysicsUpdates(session, updates) {
    if (!session.ballState) {
      session.ballState = {}
    }

    // Применяем все валидные обновления к ballState
    Object.assign(session.ballState, updates)

    // CRITICAL FIX: Also apply updates to PhysicsEngine!
    // Otherwise the physics loop will overwrite ballState with old physics state on next tick
    if (session.physicsEngine) {
      // PhysicsEngine expects commands like { paused: true, speed: 50, ... }
      // It has its own internal validation, so passing updates is safe
      console.log(`[SessionManager] 🎯 Applying command to PhysicsEngine:`, JSON.stringify(updates))
      session.physicsEngine.applyCommand(updates)

      // Sync back immediately to ensure consistency
      Object.assign(session.ballState, session.physicsEngine.getState())
    }

    // Обновляем timestamp
    session.lastStateUpdate = Date.now()
  }

  _postUpdateActions(session, validatedUpdates) {
    this._schedulePhysicsUpdate(session.id)
    this.apiCache.delete(`state_${session.id}`)

    if (this.clientSimulationOnly) {
      this.stateBroadcaster.broadcastState(session.id, 'state_update', validatedUpdates)
      return
    }

    this.stateBroadcaster.broadcastState(session.id)
  }

  /**
   * Определяет задержку throttling в зависимости от типа обновления
   */
  _getThrottleDelay(updates) {
    if (!updates) {
      return 50
    }
    if (updates.colorBall !== undefined || updates.colorBg !== undefined) {
      return 200
    }
    if (updates.speed !== undefined) {
      return 100
    }
    if (updates.dirX !== undefined || updates.dirY !== undefined) {
      return 0 // Отключаем троттл для направления, чтобы не терять клики
    }
    if (updates.paused !== undefined || updates.resume === true) {
      return 0
    }
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
   * Обрабатывает подключение SSE клиента
   * @param {Object} res - Express response объект
   * @param {string} sessionId - ID сессии
   * @param {string} role - Роль клиента (viewer или controller)
   */
  handleSSEConnection(res, sessionId, role) {
    const session = this.sessionRepository.findOrCreateById(sessionId)
    if (!session) {
      res.status(400).json({ error: 'Invalid session id' })
      return false
    }

    if (!session.physicsEngine) {
      this._initializePhysicsEngine(session)
    }

    if (!this.sseManager.addClient(sessionId, res, role)) {
      res.status(500).json({ error: 'Failed to add SSE client' })
      return false
    }

    // Устанавливаем флаги подключения
    if (role === 'viewer') {
      session.viewerConnected = true
      console.log(`[SessionManager] ✅ Viewer connected via SSE to session ${sessionId}`)
      this.logger.logSession(sessionId, 'Viewer connected via SSE')
    } else if (role === 'controller') {
      session.controllerConnected = true
      console.log(`[SessionManager] ✅ Controller connected via SSE to session ${sessionId}`)
      this.logger.logSession(sessionId, 'Controller connected via SSE')
    }

    session.lastActivity = Date.now()
    this._schedulePhysicsUpdate(sessionId)

    // Отправляем начальное состояние
    if (role === 'viewer') {
      this.stateBroadcaster.broadcastInitialState(sessionId, res, session.ballState)

      // CRITICAL FIX: Explicitly send controller connection status to viewer
      // When viewer connects AFTER controller, the controller_connected event was already sent
      // So we need to explicitly notify the viewer about current controller status
      // Add small delay to ensure browser is ready to receive SSE events
      if (session.controllerConnected) {
        setImmediate(() => {
          // Send controller_connected event directly to this viewer
          const controllerStatusEvent = {
            type: 'controller_connected',
            timestamp: Date.now(),
            payload: { controllerConnected: true }
          }
          this.sseManager.sendEvent(res, 'controller_connected', controllerStatusEvent)
          this.logger.logSession(sessionId, 'Sent controller_connected to newly connected viewer')
        })
      }

      // CRITICAL FIX: When viewer connects, notify controller about viewer connection
      // This ensures controller UI updates immediately when viewer connects via SSE
      setImmediate(() => {
        const controllers = this.sseManager.getClients(sessionId, 'controller')
        console.log(`[SessionManager] 📡 Found ${controllers.length} controller(s) to notify about viewer connection for session ${sessionId}`)
        this.logger.logSession(sessionId, `Found ${controllers.length} controller(s) to notify about viewer connection`)

        for (const controllerClient of controllers) {
          const viewerConnectedEvent = {
            type: 'viewer_status',
            timestamp: Date.now(),
            payload: {
              connected: true,
              viewerConnected: true,
              screenSize: session.viewerScreenSize
            }
          }
          const sent = this.sseManager.sendEvent(controllerClient.res, 'viewer_status', viewerConnectedEvent)
          console.log(`[SessionManager] 📤 Sent viewer_status to controller for session ${sessionId}: ${sent}`)
          this.logger.logSession(sessionId, `Sent viewer_status to controller: ${sent}`)
        }
        console.log(`[SessionManager] ✅ Completed sending viewer_status to controller(s) for session ${sessionId}`)
        this.logger.logSession(sessionId, 'Sent viewer_status to controller(s) when viewer connected')
      })
    } else {
      this._handleSSEControllerInitialState(sessionId, res, session)
    }

    this.stateBroadcaster.broadcastViewerStatus(sessionId)
    this._broadcastControllerConnectionIfNeeded(sessionId, role)

    this.logger.logSession(sessionId, `SSE ${role} connected`)
    return true
  }

  /**
   * Обрабатывает начальное состояние для SSE контроллера
   * @private
   */
  _handleSSEControllerInitialState(sessionId, res, session) {
    if (this._isViewerScreenSizeSet(session)) {
      const finalState = session.physicsEngine ? session.physicsEngine.getState() : session.ballState
      this.stateBroadcaster.broadcastInitialState(sessionId, res, finalState)
      this.logger.logSession(
        sessionId,
        'Sent initial_state to SSE controller (viewer screen size already set)'
      )
    } else {
      this.logger.logSession(
        sessionId,
        'SSE Controller connected, deferring initial_state until viewer screen size is set.'
      )
    }
  }

  /**
   * Обрабатывает отключение SSE клиента
   * @param {Object} res - Express response объект
   */
  handleSSEDisconnection(res) {
    const sessionId = this.sseManager.removeClient(res)
    if (sessionId) {
      this._schedulePhysicsUpdate(sessionId)
      this.stateBroadcaster.broadcastViewerStatus(sessionId)

      const session = this.sessionRepository.findById(sessionId)
      if (session && !session.controllerConnected) {
        this.broadcastControllerConnection(sessionId, false)
      }
    }
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
    if (!session) {
      return
    }

    const payload = { controllerConnected: isConnected }

    // TEMPORARY DEBUG LOG
    this.logger.logSession(
      sessionId,
      `Broadcasting controller_${isConnected ? 'connected' : 'disconnected'} event`,
      'debug'
    )

    // Рассылаем через StateBroadcaster (поддерживает SSE и WebSocket)
    this.stateBroadcaster.broadcastState(
      sessionId,
      isConnected ? 'controller_connected' : 'controller_disconnected',
      payload
    )
  }

  /**
   * Устанавливает размер экрана вьювера
   * @param {string} sessionId - ID сессии
   * @param {Object} screenSize - Размеры экрана
   * @returns {boolean} Успех установки
   */
  setViewerScreenSize(sessionId, screenSize) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }

    const validatedSize = ValidationUtils.validateScreenSize(screenSize)
    if (!validatedSize) {
      return false
    }

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

      // Сохраняем настройки которые НЕ должны перезаписываться
      const soundEnabled = session.ballState.soundEnabled
      const soundType = session.ballState.soundType
      const userDirX = session.ballState.dirX
      const userDirY = session.ballState.dirY

      Object.assign(session.ballState, session.physicsEngine.getState())

      // Восстанавливаем сохраненные настройки
      if (soundEnabled !== undefined) {
        session.ballState.soundEnabled = soundEnabled
      }
      if (soundType !== undefined) {
        session.ballState.soundType = soundType
      }
      if (userDirX !== undefined && userDirY !== undefined) {
        session.ballState.dirX = userDirX
        session.ballState.dirY = userDirY
      }
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
    if (!session) {
      return
    }
    this._schedulePhysicsUpdate(sessionId)
    this.logger.logSession(sessionId, 'Physics manager initialized', 'debug')
  }

  /**
   * Планирует обновление физики для сессии
   * @param {string} sessionId - ID сессии
   */
  _schedulePhysicsUpdate(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return
    }

    // Останавливаем существующий цикл если есть
    if (session.mainLoop) {
      clearInterval(session.mainLoop)
      session.mainLoop = null
    }

    if (this.clientSimulationOnly) {
      this.logger.logSession(sessionId, 'Server-side physics loop disabled (client simulation)', 'debug')
      return
    }

    // Проверяем есть ли подключенные вьюверы (WebSocket или SSE)
    const wsClients = this.webSocketManager.getClients(sessionId)
    const sseClients = this.sseManager.getClients(sessionId)
    const hasViewers = wsClients.some(({ info }) => info.role === 'viewer') ||
                       sseClients.some(c => c.role === 'viewer')

    // Запускаем серверный цикл физики только если есть вьюверы
    if (hasViewers && session.physicsEngine) {
      const PHYSICS_TICK_RATE = 60 // Гц - фиксированная частота обновления
      const PHYSICS_DT = 1000 / PHYSICS_TICK_RATE // ~16.67 мс

      session.mainLoop = setInterval(() => {
        try {
          // КРИТИЧЕСКИ ВАЖНО: Сохраняем направление выбранное пользователем ДО обновления физики
          const userDirX = session.ballState.dirX
          const userDirY = session.ballState.dirY
          const soundEnabled = session.ballState.soundEnabled
          const soundType = session.ballState.soundType

          // Обновляем физику на сервере
          session.physicsEngine.update(PHYSICS_DT / 1000)

          // Синхронизируем состояние сессии с движком
          Object.assign(session.ballState, session.physicsEngine.getState())

          // Восстанавливаем направление выбранное пользователем
          if (userDirX !== undefined && userDirY !== undefined) {
            session.ballState.dirX = userDirX
            session.ballState.dirY = userDirY
          }

          // Восстанавливаем звуковые настройки
          if (soundEnabled !== undefined) {
            session.ballState.soundEnabled = soundEnabled
          }
          if (soundType !== undefined) {
            session.ballState.soundType = soundType
          }

          // Рассылаем обновленное состояние (drift correction) только раз в секунду
          // Bounces (отскоки) и Start/Stop рассылаются мгновенно через events/callbacks
          if (!session.ticks) session.ticks = 0
          session.ticks++

          if (session.ticks % 60 === 0) {
             this.stateBroadcaster.broadcastState(sessionId)
          }
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
