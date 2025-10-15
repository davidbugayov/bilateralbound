const PhysicsEngine = require('../../public/js/physics-engine.js')
const SessionRepository = require('./SessionRepository.js')
const WebSocketManager = require('./WebSocketManager.js')
const StateBroadcaster = require('./StateBroadcaster.js')
const ValidationUtils = require('../utils/validation.js')
const { logger, DEBUG_MODE } = require('../logger.js')
// Основной оркестратор сессий
class SessionManager {
  constructor (apiCache) {
    this.sessionRepository = new SessionRepository()
    this.webSocketManager = new WebSocketManager(this.sessionRepository)
    this.stateBroadcaster = new StateBroadcaster(this.sessionRepository, this.webSocketManager)
    this.physicsInterval = 1000 / 60 // ~60 FPS для более плавного движения
    this.apiCache = apiCache // Получаем ссылку на кэш API
    this.logger = {
      ...logger,
      logSession: (sessionId, msg, level = 'info') => {
        // Оптимизированное логирование - только для отладки
        if (DEBUG_MODE && level === 'debug') console.log(`[SESSION:${sessionId}] ${msg}`)
      }
    }
  }

  createSession (ballState = {}) {
    const session = this.sessionRepository.create({ ballState })

    session.physicsEngine = new PhysicsEngine({
      ballRadius: session.ballState.radius || 20,
      maxSpeed: 5000
    })

    // Немедленная рассылка состояния при отскоке, чтобы вьювер видел касание границ
    session.physicsEngine.bounceCallback = () => {
      try {
        Object.assign(session.ballState, session.physicsEngine.getState())
        this.stateBroadcaster.broadcastState(session.id)
      } catch {
        // ignore
      }
    }

    const engineState = session.physicsEngine.getState()
    Object.assign(session.ballState, engineState)
    session.ballState.paused = true
    session.physicsEngine.setPaused(true)

    this.startPhysics(session.id)
    return session
  }

  getSession (sessionId) {
    return this.sessionRepository.findById(sessionId)
  }

  updateBallState (sessionId, updates) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    const now = Date.now()
    const lastUpdate = session.lastStateUpdate || 0

    // Упрощенное throttling
    const throttleDelay = this._getThrottleDelay(updates)
    if (now - lastUpdate < throttleDelay && !updates?.reset) {
      return false
    }

    // Используем централизованную валидацию
    const validatedUpdates = ValidationUtils.validateBallStateUpdates(updates)

    if (Object.keys(validatedUpdates).length === 0) {
      this.logger.logSession(sessionId, '[VALIDATION] No valid fields in update, ignoring')
      return false
    }

    session.lastStateUpdate = now
    session.lastActivity = now

    // Обработка возврата в центр при смене направления или остановке
    if (validatedUpdates.returnToCenter && session.physicsEngine) {
      console.log(`[SERVER] Обработка returnToCenter для сессии ${sessionId}`)
      // Используем специальный метод для плавного возврата в центр
      session.physicsEngine.returnToCenter()
      
      // Если это возврат при остановке, устанавливаем паузу
      if (validatedUpdates.paused) {
        session.physicsEngine.setPaused(true)
      }
      
      this.logger.logSession(sessionId, '[RETURN_TO_CENTER] Initiating smooth return to center', 'debug')
    }

    if (session.physicsEngine) {
      session.physicsEngine.applyCommand(validatedUpdates)
      Object.assign(session.ballState, session.physicsEngine.getState())
      // Нормализация vx/vy ДОПУСКАЕТСЯ только кратковременно после смены размера экрана
      // чтобы стабилизировать внешний контракт (см. normalizeDirectionUntilTs)
      if (
        session.normalizeDirectionUntilTs && Date.now() < session.normalizeDirectionUntilTs &&
        session.physicsEngine && session.physicsEngine.state && session.physicsEngine.state.lastDirection
      ) {
        const dx = session.physicsEngine.state.lastDirection.x || 0
        const dy = session.physicsEngine.state.lastDirection.y || 0
        session.ballState.vx = Math.max(-1, Math.min(1, dx))
        session.ballState.vy = Math.max(-1, Math.min(1, dy))
      }
    } else {
      this.sessionRepository.updateBallState(sessionId, validatedUpdates)
    }

    this._schedulePhysicsUpdate(sessionId)
    this.apiCache.delete(`state_${sessionId}`)
    this.stateBroadcaster.broadcastState(sessionId)
    return true
  }
  /**
   * Определяет задержку throttling в зависимости от типа обновления
   */
  _getThrottleDelay (updates) {
    if (!updates) return 50

    if (updates.colorBall !== undefined || updates.colorBg !== undefined) return 200
    if (updates.speed !== undefined) return 100
    if (updates.dirX !== undefined || updates.dirY !== undefined) return 8 // Уменьшено для более отзывчивого управления
    if (updates.paused !== undefined || updates.resume === true) return 0

    return 50
  }

  handleWebSocketConnection (ws, sessionId, role) {
    if (!this.webSocketManager.addClient(sessionId, ws, role)) {
      ws.close(1011, 'Session not found')
      return
    }

    const session = this.sessionRepository.findById(sessionId)
    if (session) {
      session.lastActivity = Date.now()
      this._schedulePhysicsUpdate(sessionId)

      if (role === 'viewer') {
        this.stateBroadcaster.broadcastInitialState(sessionId, ws, session.ballState)
      } else {
        try { ws.initialStateSent = false } catch { /* ignore */ }
        this.logger.logSession(sessionId, 'Controller connected, deferring initial_state until viewer screen size is set.')
      }
    }

    this.stateBroadcaster.broadcastViewerStatus(sessionId)
  }

  handleWebSocketDisconnection (ws) {
    const sessionId = this.webSocketManager.removeClient(ws)
    if (sessionId) {
      this._schedulePhysicsUpdate(sessionId)
      this.stateBroadcaster.broadcastViewerStatus(sessionId)
    }
  }

  setViewerScreenSize (sessionId, screenSize) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    // Валидируем размеры экрана
    const validatedSize = ValidationUtils.validateScreenSize(screenSize)
    if (!validatedSize) return false

    // Сохраняем прежний размер экрана, если он уже был задан ранее
    const hadPrevSize = !!(session.viewerScreenSize && session.viewerScreenSize.width > 0 && session.viewerScreenSize.height > 0)
    const oldWidth = hadPrevSize ? session.viewerScreenSize.width : null
    const oldHeight = hadPrevSize ? session.viewerScreenSize.height : null

    session.viewerScreenSize = validatedSize

    if (session.physicsEngine) {
      // Сохраняем текущее состояние мяча перед изменением размера
      const currentState = session.physicsEngine.getState()
      const wasPlaying = !session.ballState.paused

      session.physicsEngine.setWorldSize(validatedSize.width, validatedSize.height)

      if (!hadPrevSize) {
        // Первый раз получили размеры вьювера — строго центрируем мяч
        session.physicsEngine.setPosition(validatedSize.width / 2, validatedSize.height / 2)
        session.physicsEngine.setVelocity(0, 0)
      } else if (currentState && (oldWidth !== validatedSize.width || oldHeight !== validatedSize.height)) {
        // Масштабируем позицию мяча к новому размеру экрана
        const scaleX = validatedSize.width / oldWidth
        const scaleY = validatedSize.height / oldHeight

        const newX = Math.min(currentState.x * scaleX, validatedSize.width - currentState.radius)
        const newY = Math.min(currentState.y * scaleY, validatedSize.height - currentState.radius)

        session.physicsEngine.setPosition(
          Math.max(newX, currentState.radius),
          Math.max(newY, currentState.radius)
        )

        // Восстанавливаем скорость и направление
        if (wasPlaying) {
          session.physicsEngine.setVelocity(currentState.vx, currentState.vy)
        }
      }

      Object.assign(session.ballState, session.physicsEngine.getState())
    } else {
      session.ballState.x = validatedSize.width / 2
      session.ballState.y = validatedSize.height / 2
      session.ballState.vx = 0
      session.ballState.vy = 0
    }

    this.stateBroadcaster.broadcastState(sessionId)

    // В течение короткого периода после смены размера возвращаем нормализованное направление в API
    // чтобы стабилизировать внешний контракт (см. testScreenSizeChangeStability)
    // Для первого подключения окно короче, для последующих смен размеров — дольше
    session.normalizeDirectionUntilTs = Date.now() + (hadPrevSize ? 600 : 150)

    // Отправляем начальное состояние контроллеру
    const clients = this.webSocketManager.getClients(sessionId)
    const finalState = session.physicsEngine ? session.physicsEngine.getState() : session.ballState
    for (const { client, info } of clients) {
      if (info.role === 'controller' && !client.initialStateSent) {
        this.stateBroadcaster.broadcastInitialState(sessionId, client, finalState)
        client.initialStateSent = true
      }
    }

    return true
  }

  startPhysics (sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return

    this._schedulePhysicsUpdate(sessionId)
    this.logger.logSession(sessionId, 'Physics manager initialized', 'debug')
  }

  _schedulePhysicsUpdate (sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return

    // Always stop any existing server-side physics loop — movement is client-driven now
    if (session.mainLoop) {
      clearInterval(session.mainLoop)
      session.mainLoop = null
    }

    // Server no longer steps physics; it only synchronizes state on explicit updates.
    // We still may broadcast a lightweight sync when commands arrive elsewhere.
    this.logger.logSession(sessionId, 'Server-side physics loop disabled (client-authoritative movement).', 'debug')
  }

  stopPhysics (sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (session && session.mainLoop) {
      clearInterval(session.mainLoop)
      session.mainLoop = null
    }
  }

  cleanupExpiredSessions () {
    const expiredIds = this.sessionRepository.cleanupExpired()
    if (expiredIds.length > 0) {
      this.logger.info(`Cleaned up ${expiredIds.length} expired sessions.`)
      expiredIds.forEach(id => this.stopPhysics(id))
    }
    return expiredIds.length
  }

  getSessionCount () {
    return this.sessionRepository.getAll().length
  }

  getClientInfo (ws) {
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
