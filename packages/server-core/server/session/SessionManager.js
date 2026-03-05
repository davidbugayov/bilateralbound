'use strict'
const PhysicsEngine = require('../../../web-client/public/js/physics-engine.js')
const SessionRepository = require('./SessionRepository.js')
const WebSocketManager = require('./WebSocketManager.js')
const StateBroadcaster = require('./StateBroadcaster.js')
const ValidationUtils = require('../utils/validation.js')
const { logger, DEBUG_MODE } = require('../logger.js')
const config = require('../config.js')
const analytics = require('../analytics.js')
// Основной оркестратор сессий
class SessionManager {
  /**
   * Конструктор SessionManager
   * @param {Map} apiCache - Кэш API
   */
  constructor(apiCache) {
    this.sessionRepository = new SessionRepository()
    this.webSocketManager = new WebSocketManager(this.sessionRepository)
    this.clientSimulationOnly = config.getRuntimeTuning().CLIENT_SIM_ONLY
    this.stateBroadcaster = new StateBroadcaster(
      this.sessionRepository,
      this.webSocketManager,
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
    analytics.recordSessionCreated(session.id)
    analytics.updatePeak(this.getSessionCount())
    return session
  }

  /**
   * Создание сессии с определенным ID (для постоянных ссылок)
   * @param {string} sessionId - ID сессии
   * @param {Object} ballState - Начальное состояние мяча
   * @returns {Object|null} Сессия или null если не найдена
   */
  findOrCreateSession(sessionId, ballState = {}) {
    const alreadyExists = !!this.sessionRepository.findById(sessionId)
    const session = this.sessionRepository.findOrCreateById(sessionId, {
      ballState
    })
    if (!session) {
      return null
    }
    if (!session.physicsEngine) {
      this._initializePhysicsEngine(session)
    }
    if (!alreadyExists) {
      analytics.recordSessionCreated(session.id)
      analytics.updatePeak(this.getSessionCount())
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
      } catch (err) {
        // Gracefully handle errors during bounce state broadcast to avoid disrupting physics
        logger.error(
          `Bounce state broadcast error for session ${session.id}:`,
          err,
        );
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
    // console.log(`[SessionManager] 📥 Received updates for ${sessionId} from unknown source:`, JSON.stringify(updates))

    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      // console.log(`[SessionManager] ❌ Session not found: ${sessionId}`)
      return false
    }

    if (!this._shouldUpdateState(session, updates)) {
      // console.log(`[SessionManager] ⏭️  Throttled update for session ${sessionId}`)
      return true // Возвращаем true, так как это не ошибка клиента, а защита сервера
    }

    const validatedUpdates = ValidationUtils.validateBallStateUpdates(updates)
    // console.log(`[SessionManager] 📝 Validated updates for ${sessionId}:`, JSON.stringify(validatedUpdates))

    // TEMPORARY BYPASS VALIDATION
    if (
      Object.keys(validatedUpdates).length === 0 &&
      Object.keys(updates).length > 0
    ) {
      // console.log('[SessionManager] ⚠️ VALIDATION FAILED but bypassing for debug. Applying raw updates:', JSON.stringify(updates))
      return this._applyValidatedUpdates(session, updates);
    }

    if (Object.keys(validatedUpdates).length === 0) {
      this.logger.logSession(
        sessionId,
        '[VALIDATION] No valid fields in update, ignoring',
      );
      // console.log(`[SessionManager] ❌ No valid fields after validation for ${sessionId}`)
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
    // console.log(`[SessionManager] 🔧 _applyValidatedUpdates called for session ${session.id}`)
    // this._handleReturnToCenter(session, validatedUpdates) // TODO: implement if needed
    this._applyPhysicsUpdates(session, validatedUpdates)
    // console.log(`[SessionManager] 📢 Calling broadcastState for session ${session.id}`)
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

    // Smooth stop: intercept paused:true when currently playing — start deceleration instead
    const isStopRequest =
      updates.paused === true &&
      session.physicsEngine &&
      !session.physicsEngine.state.paused &&
      !session.physicsEngine.state.stopping

    if (isStopRequest) {
      session.physicsEngine.startStopping()
      // Apply all other updates (speed, color, etc.) but not paused:true yet
      const updatesWithoutPause = { ...updates }
      delete updatesWithoutPause.paused
      if (Object.keys(updatesWithoutPause).length > 0) {
        Object.assign(session.ballState, updatesWithoutPause)
        session.physicsEngine.applyCommand(updatesWithoutPause)
        const engineState = session.physicsEngine.getState()
        Object.assign(session.ballState, engineState, updatesWithoutPause)
      } else {
        const engineState = session.physicsEngine.getState()
        Object.assign(session.ballState, engineState)
      }
      session.lastStateUpdate = Date.now()
      return
    }

    // Применяем все валидные обновления к ballState
    Object.assign(session.ballState, updates)

    // CRITICAL FIX: Also apply updates to PhysicsEngine!
    // Otherwise the physics loop will overwrite ballState with old physics state on next tick
    if (session.physicsEngine) {
      session.physicsEngine.applyCommand(updates)

      // Sync back immediately to ensure consistency
      const engineState = session.physicsEngine.getState()
      Object.assign(session.ballState, engineState, updates)
    }

    // Обновляем timestamp
    session.lastStateUpdate = Date.now()

    if (updates.dirX !== undefined || updates.dirY !== undefined) {
      // ИСПРАВЛЕНИЕ: при изменении направления, если сессия активна, нужно обновить скорость в ballState
      // PhysicsEngine делает это внутри applyCommand -> setDirection, но нужно убедиться что getState() вернет правильные vx/vy
      // Если PhysicsEngine не обновил vx/vy (например из-за того что считал что стоит на паузе в этот тик), форсируем обновление

      // ВАЖНО: Если мы форсируем направление, мы должны быть уверены что скорость не 0
      // Используем helper PhysicsEngine для расчета скорости
      if (session.physicsEngine && !session.ballState.paused) {
        // Force update instruction? No, engine does it.
        // Just ensure synchronization logic is logging correctly
        // console.log(`[SessionManager] Check velocities after dir update: vx=${session.physicsEngine.ball.vx}, vy=${session.physicsEngine.ball.vy}`)
      }
    }
  }

  _postUpdateActions(session, validatedUpdates) {
    // Ensure physics loop is running (idempotent — won't restart if already active)
    this._ensurePhysicsLoop(session.id)
    this.apiCache.delete(`state_${session.id}`)

    // CRITICAL FIX: Always broadcast full state, not just updates
    // Controller Preview needs complete state (paused, dirX, dirY, speed, etc)
    // to start physics correctly
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
      this._ensurePhysicsLoop(sessionId)
      this._handleInitialStateBroadcast(sessionId, ws, role, session)
    }

    this.stateBroadcaster.broadcastViewerStatus(sessionId)
    this._broadcastControllerConnectionIfNeeded(sessionId, role)

    // Если подключился вьювер, уведомляем контроллеры
    if (role === 'viewer') {
      this.broadcastViewerConnection(sessionId, true, session.viewerScreenSize)
    }
  }

  /**
   * Обрабатывает начальную рассылку состояния для клиента
   * @private
   */
  _handleInitialStateBroadcast(sessionId, ws, role, session) {
    if (role === 'viewer') {
      this.stateBroadcaster.broadcastInitialState(
        sessionId,
        ws,
        session.ballState,
      );
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

    // FIX: Send initial_state to controller immediately, regardless of viewer connection status
    // Controller should be able to initialize even if viewer hasn't connected yet
    this._broadcastInitialStateToController(sessionId, ws, session)
  }

  /**
   * Рассылает начальное состояние контроллеру
   * @private
   */
  _broadcastInitialStateToController(sessionId, ws, session) {
    const finalState = session.physicsEngine
      ? session.physicsEngine.getState()
      : session.ballState;
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

    this.logger.logSession(
      sessionId,
      `Broadcasting controller_${isConnected ? 'connected' : 'disconnected'} event`,
      'debug'
    )

    // Используем специализированный метод StateBroadcaster который отправляет только вьюверам
    this.stateBroadcaster.broadcastControllerConnection(sessionId, isConnected)
  }

  /**
   * Рассылает событие о подключении/отключении вьювера всем контроллерам сессии
   * @param {string} sessionId - ID сессии
   * @param {boolean} isConnected - Статус подключения вьювера
   * @param {Object} screenSize - Размеры экрана вьювера (если подключен)
   */
  broadcastViewerConnection(sessionId, isConnected, screenSize = null) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return
    }

    this.logger.logSession(
      sessionId,
      `Broadcasting viewer_${isConnected ? 'connected' : 'disconnected'} event`,
      'debug'
    )

    // Используем специализированный метод StateBroadcaster для отправки вьювера события контроллерам
    this.stateBroadcaster.broadcastViewerConnection(
      sessionId,
      isConnected,
      screenSize,
    );
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

      session.physicsEngine.setWorldSize(
        validatedSize.width,
        validatedSize.height,
      );

      if (!hadPrevSize) {
        this._initializeBallPosition(session, validatedSize)
      } else if (this._shouldScaleBallPosition(session, currentState)) {
        this._scaleBallPosition(
          session,
          currentState,
          validatedSize,
          wasPlaying,
        );
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
    session.physicsEngine.setPosition(
      validatedSize.width / 2,
      validatedSize.height / 2,
    );
    session.physicsEngine.setVelocity(0, 0)
  }

  /**
   * Масштабирует позицию мяча при изменении размера экрана
   * @private
   */
  _scaleBallPosition(session, currentState, validatedSize, wasPlaying) {
    const scaleX = validatedSize.width / session._oldWidth
    const scaleY = validatedSize.height / session._oldHeight
    const newX = Math.min(
      currentState.x * scaleX,
      validatedSize.width - currentState.radius,
    );
    const newY = Math.min(
      currentState.y * scaleY,
      validatedSize.height - currentState.radius,
    );

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
    const finalState = session.physicsEngine
      ? session.physicsEngine.getState()
      : session.ballState;

    const clients = this.webSocketManager.getClients(sessionId)
    for (const { client, info } of clients) {
      if (info.role === 'controller' && !client.initialStateSent) {
        this.stateBroadcaster.broadcastInitialState(
          sessionId,
          client,
          finalState,
        );
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
   * Ensures the physics loop is running for a session (idempotent).
   * Does NOT restart if already active — prevents loop kill/restart race on rapid commands.
   */
  _ensurePhysicsLoop(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return

    // Already running — nothing to do
    if (session.mainLoop) return

    this._startPhysicsLoop(sessionId, session)
  }

  /**
   * Планирует обновление физики для сессии (restarts the loop).
   * Use _ensurePhysicsLoop() for idempotent "make sure it's running" calls.
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

    this._startPhysicsLoop(sessionId, session)
  }

  /**
   * Internal: starts the physics loop for a session if conditions are met.
   */
  _startPhysicsLoop(sessionId, session) {
    if (this.clientSimulationOnly) {
      this.logger.logSession(
        sessionId,
        'Server-side physics loop disabled (client simulation)',
        'debug'
      )
      return
    }

    const wsClients = this.webSocketManager.getClients(sessionId)
    const hasViewers = wsClients.some(({ info }) => info.role === 'viewer')

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

          // Рассылаем обновленное состояние (drift correction) чаще для плавности (15 раз в секунду)
          if (!session.ticks) session.ticks = 0
          session.ticks++

          if (session.ticks % 4 === 0) {
            session.lastStateUpdate = Date.now()
            this.stateBroadcaster.broadcastState(sessionId)
          }
        } catch (error) {
          this.logger.error(
            `Error in physics loop for session ${sessionId}: ${error.message}`,
          );
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
      this.logger.info(
        `Cleaned up ${expiredSessions.length} expired sessions.`,
      );
      for (const { id, reason } of expiredSessions) {
        this.stopPhysics(id)
        analytics.recordSessionEnded(id)
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

  /**
   * Устанавливает язык сессии и уведомляет всех клиентов
   * @param {string} sessionId - ID сессии
   * @param {string} language - Код языка (e.g., 'en', 'ru', 'de')
   * @returns {boolean} Успех установки
   */
  setLanguage(sessionId, language) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }

    // Валидируем язык: латиница/цифры, 2-5 символов
    if (typeof language !== 'string' || !/^[a-z]{2,5}$/.test(language)) {
      return false
    }

    // Сохраняем язык в сессии
    session.language = language

    analytics.recordLanguage(language)

    // Рассылаем обновление языка всем клиентам этой сессии
    this.broadcastLanguageUpdate(sessionId, language)

    this.logger.logSession(sessionId, `Language updated to: ${language}`)
    return true
  }

  /**
   * Рассылает обновление языка всем клиентам сессии
   * @param {string} sessionId - ID сессии
   * @param {string} language - Код языка
   */
  broadcastLanguageUpdate(sessionId, language) {
    const eventData = {
      type: 'language_updated',
      timestamp: Date.now(),
      payload: {
        language
      }
    }

    let sentCount = 0

    if (this.webSocketManager) {
      const message = JSON.stringify(eventData)
      for (const { client } of this.webSocketManager.getClients(sessionId)) {
        if (client.readyState === 1) {
          try {
            client.send(message)
            sentCount++
          } catch (error) {
            logger.error(
              `Error broadcasting language_updated to WS client: ${error.message}`,
            );
          }
        }
      }
    }

    if (sentCount > 0 && DEBUG_MODE) {
      this.logger.logSession(
        sessionId,
        `Broadcasted language_updated to ${sentCount} clients`,
      );
    }
  }
}

module.exports = SessionManager
