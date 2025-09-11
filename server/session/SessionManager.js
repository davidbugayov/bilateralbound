const PhysicsEngine = require('../../public/js/physics-engine.js');
const SessionRepository = require('./SessionRepository.js');
const WebSocketManager = require('./WebSocketManager.js');
const StateBroadcaster = require('./StateBroadcaster.js');
const { logger, DEBUG_MODE } = require('../logger.js');
const config = require('../config.js');

// Основной оркестратор сессий
class SessionManager {
  constructor(apiCache) {
    this.sessionRepository = new SessionRepository()
    this.webSocketManager = new WebSocketManager(this.sessionRepository)
    this.stateBroadcaster = new StateBroadcaster(this.sessionRepository, this.webSocketManager)
    this.physicsInterval = 1000 / 60 // ~60 FPS
    this.apiCache = apiCache; // Получаем ссылку на кэш API
    this.logger = {
      ...logger,
      logSession: (sessionId, msg, level = 'info') => {
        // Оптимизированное логирование - только для отладки
        if (DEBUG_MODE && level === 'debug') console.log(`[SESSION:${sessionId}] ${msg}`);
      }
    };
  }

  createSession(ballState = {}) {
    const session = this.sessionRepository.create({ ballState })
    
    session.physicsEngine = new PhysicsEngine({
        ballRadius: session.ballState.radius || 20,
        maxSpeed: 1000
    });
    const engineState = session.physicsEngine.getState();
    Object.assign(session.ballState, engineState);
    session.ballState.paused = true;
    session.physicsEngine.setPaused(true);

    this.startPhysics(session.id)
    return session
  }

  getSession(sessionId) {
    return this.sessionRepository.findById(sessionId)
  }

  updateBallState(sessionId, updates) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
        return false;
    }

    const now = Date.now();
    const lastUpdate = session.lastStateUpdate || 0;
    const isDirectionChange = updates && (updates.dirX !== undefined || updates.dirY !== undefined);
    const isPauseToggle = updates && (updates.paused !== undefined || updates.resume === true);
    const isSpeedChange = updates && (updates.speed !== undefined);
    const isColorChange = updates && (updates.colorBall !== undefined || updates.colorBg !== undefined);

    let throttleDelay = 50;
    if (isColorChange) throttleDelay = 200;
    if (isSpeedChange) throttleDelay = 100;
    if (isDirectionChange) throttleDelay = 30;
    if (isPauseToggle) throttleDelay = 0;

    if (now - lastUpdate < throttleDelay && !updates.reset) {
        return false;
    }

    this.logger.logSession(sessionId, `[VALIDATION] Processing updates: ${JSON.stringify(updates)}`);
    const validatedUpdates = {};
    if (updates) {
        if (typeof updates.speed === 'number' && updates.speed >= 0 && updates.speed <= 100 && !isNaN(updates.speed)) validatedUpdates.speed = updates.speed;
        if (typeof updates.radius === 'number' && updates.radius > 0 && updates.radius <= 1000 && !isNaN(updates.radius)) validatedUpdates.radius = updates.radius;
        if (typeof updates.paused === 'boolean') validatedUpdates.paused = updates.paused;
        if (typeof updates.dirX === 'number' && Math.abs(updates.dirX) <= 1 && !isNaN(updates.dirX)) validatedUpdates.dirX = updates.dirX;
        if (typeof updates.dirY === 'number' && Math.abs(updates.dirY) <= 1 && !isNaN(updates.dirY)) validatedUpdates.dirY = updates.dirY;
        if (typeof updates.colorBall === 'string' && /^#[0-9a-fA-F]{6}$/.test(updates.colorBall)) validatedUpdates.colorBall = updates.colorBall;
        if (typeof updates.colorBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(updates.colorBg)) validatedUpdates.colorBg = updates.colorBg;
        if (updates.reset === true) validatedUpdates.reset = true;
        if (updates.resume === true) validatedUpdates.paused = false;
        if (updates.pause === true) validatedUpdates.paused = true;
    }

    this.logger.logSession(sessionId, `[VALIDATION] Validated updates: ${JSON.stringify(validatedUpdates)}`);

    if (Object.keys(validatedUpdates).length === 0) {
        this.logger.logSession(sessionId, `[VALIDATION] No valid fields in update, ignoring`);
        return false;
    }

    session.lastStateUpdate = now;
    session.lastActivity = now;

    if (session.physicsEngine) {
        session.physicsEngine.applyCommand(validatedUpdates);
        Object.assign(session.ballState, session.physicsEngine.getState());
        this.logger.logSession(sessionId, `[STATE SYNC] Applied ${Object.keys(validatedUpdates).length} updates`, 'debug');
    } else {
        this.sessionRepository.updateBallState(sessionId, validatedUpdates);
    }

    this._schedulePhysicsUpdate(sessionId);
    this.apiCache.delete(`state_${sessionId}`);
    this.stateBroadcaster.broadcastState(sessionId);
    return true;
  }

  handleWebSocketConnection(ws, sessionId, role) {
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
        try { ws.initialStateSent = false } catch (e) {}
        this.logger.logSession(sessionId, `Controller connected, deferring initial_state until viewer screen size is set.`);
      }
    }

    this.stateBroadcaster.broadcastViewerStatus(sessionId)
  }

  handleWebSocketDisconnection(ws) {
    const sessionId = this.webSocketManager.removeClient(ws)
    if (sessionId) {
      this._schedulePhysicsUpdate(sessionId)
      this.stateBroadcaster.broadcastViewerStatus(sessionId)
    }
  }

  setViewerScreenSize(sessionId, screenSize) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    session.viewerScreenSize = screenSize

    if (session.physicsEngine) {
        this.logger.logSession(sessionId, `[SET_SIZE] Received screenSize: ${screenSize.width}x${screenSize.height}`);
        this.logger.logSession(sessionId, `[SET_SIZE] Before: engine.options.worldWidth=${session.physicsEngine.options.worldWidth}, _worldSizeSet=${session.physicsEngine._worldSizeSet}`);
        
        session.physicsEngine.setWorldSize(screenSize.width, screenSize.height);
        
        this.logger.logSession(sessionId, `[SET_SIZE] After: engine.options.worldWidth=${session.physicsEngine.options.worldWidth}, _worldSizeSet=${session.physicsEngine._worldSizeSet}`);

        session.physicsEngine.reset();
        Object.assign(session.ballState, session.physicsEngine.getState());
        this.logger.logSession(sessionId, `Centered ball via PhysicsEngine for screen size ${screenSize.width}×${screenSize.height}`);
    } else {
       session.ballState.x = screenSize.width / 2;
       session.ballState.y = screenSize.height / 2;
       session.ballState.vx = 0;
       session.ballState.vy = 0;
    }

    this.stateBroadcaster.broadcastState(sessionId)
    this.logger.logSession(sessionId, `Broadcasted state update after centering`)

    const clients = this.webSocketManager.getClients(sessionId);
    const finalState = session.physicsEngine ? session.physicsEngine.getState() : session.ballState;
    for (const { client, info } of clients) {
        if (info.role === 'controller' && !client.initialStateSent) {
            this.stateBroadcaster.broadcastInitialState(sessionId, client, finalState);
            client.initialStateSent = true;
        }
    }

    return true
  }

  startPhysics(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return

    this._schedulePhysicsUpdate(sessionId)
    this.logger.logSession(sessionId, 'Physics manager initialized', 'debug')
  }

  _schedulePhysicsUpdate(sessionId) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) return;

    if (session.mainLoop) {
      clearInterval(session.mainLoop);
      session.mainLoop = null;
    }

    const hasActiveClients = session.controllerConnected || session.viewerConnected;
    const isBallMoving = session.ballState && !session.ballState.paused;

    if (hasActiveClients && isBallMoving) {
      session.mainLoop = setInterval(() => {
        const currentSession = this.sessionRepository.findById(sessionId);
        if (!currentSession || !currentSession.physicsEngine || currentSession.ballState.paused || !(currentSession.controllerConnected || currentSession.viewerConnected)) {
          if (session.mainLoop) {
             clearInterval(session.mainLoop);
             session.mainLoop = null;
             this.logger.logSession(sessionId, 'Main loop self-terminated due to state change.');
          }
          return;
        }

        const deltaTime = this.physicsInterval / 1000;
        currentSession.physicsEngine.update(deltaTime);
        Object.assign(currentSession.ballState, currentSession.physicsEngine.getState());

        const prevSent = currentSession._lastBroadcast || { x: NaN, y: NaN };
        const dx = Math.abs((currentSession.ballState.x || 0) - (prevSent.x || 0));
        const dy = Math.abs((currentSession.ballState.y || 0) - (prevSent.y || 0));
        const moved = dx > config.getRuntimeTuning().DEAD_RECKON_EPS || dy > config.getRuntimeTuning().DEAD_RECKON_EPS;
        if (moved) {
          this.stateBroadcaster.broadcastState(sessionId);
          currentSession._lastBroadcast = { x: currentSession.ballState.x, y: currentSession.ballState.y };
        }
      }, this.physicsInterval);

      this.logger.logSession(sessionId, `Main loop started at ${Math.round(1000/this.physicsInterval)} FPS.`);
    } else {
      this.logger.logSession(sessionId, `Main loop not started (isBallMoving: ${isBallMoving}, hasActiveClients: ${hasActiveClients}).`);
    }
  }

  stopPhysics(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (session && session.mainLoop) {
        clearInterval(session.mainLoop)
        session.mainLoop = null
    }
  }

  cleanupExpiredSessions() {
    const expiredIds = this.sessionRepository.cleanupExpired()
    if (expiredIds.length > 0) {
      this.logger.info(`Cleaned up ${expiredIds.length} expired sessions.`);
      expiredIds.forEach(id => this.stopPhysics(id));
    }
    return expiredIds.length;
  }

  getSessionCount() {
    return this.sessionRepository.getAll().length
  }

  getClientInfo(ws) {
    for (const session of this.sessionRepository.getAll()) {
      if (session.clients.has(ws)) {
        const clientInfo = session.clients.get(ws);
        return { sessionId: clientInfo.sessionId, role: clientInfo.role };
      }
    }
    return null;
  }
}

module.exports = SessionManager
