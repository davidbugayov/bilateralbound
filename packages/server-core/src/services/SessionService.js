/* jshint node: true, esversion: 11, strict: true */
'use strict'

const ValidationUtils = require('../utils/validation.js')

// Throttle delays per update type (ms) — configured to balance responsiveness and stability
const THROTTLE_DEFAULT = 50
const THROTTLE_COLOR = 200 // Color changes are less urgent
const THROTTLE_SPEED = 100
const THROTTLE_DIRECTION = 0 // No throttle — don't lose clicks
const THROTTLE_PAUSE = 0 // Instant response for play/pause

// Session cleanup delay (ms)
const PENDING_DELETE_DELAY = 5 * 60 * 1000 // 5 minutes

// Direction normalization timeouts (ms)
const NORMALIZE_TIMEOUT_WITH_PREV = 600
const NORMALIZE_TIMEOUT_NEW = 150

class SessionService {
  /**
   * Facade for session business logic — everything that isn't physics or broadcast.
   * @param {Object} sessionRepository
   * @param {Object} physicsService
   * @param {Object} broadcastService
   * @param {Object} webSocketManager
   * @param {Object} options
   * @param {Object} options.logger
   * @param {Object} options.analytics
   * @param {Map} options.apiCache
   * @param {Object} [options.subscriptionService] - Optional subscription gating
   */
  constructor(
    sessionRepository,
    physicsService,
    broadcastService,
    webSocketManager,
    { logger, analytics, apiCache, subscriptionService }
  ) {
    this.repo = sessionRepository
    this.physics = physicsService
    this.broadcast = broadcastService
    this.wsManager = webSocketManager
    this.logger = logger
    this.analytics = analytics
    this.apiCache = apiCache
    this.subscriptionService = subscriptionService
  }
  /**
   * Creates a new session with physics engine
   * @param {Object} ballState - Initial ball state
   * @returns {Promise<Object>} Created session
   */
  async createSession(ballState = {}) {
    const session = await this.repo.create({ ballState })
    this.physics.initializeEngine(session)
    this.analytics.recordSessionCreated(session.id)
    this.analytics.updatePeak(this.getSessionCount())
    return session
  }

  /**
   * Finds existing session or creates one with the given ID
   * @param {string} sessionId
   * @param {Object} ballState
   * @returns {Object|null}
   */
  findOrCreateSession(sessionId, ballState = {}) {
    const alreadyExists = !!this.repo.findById(sessionId)
    const session = this.repo.findOrCreateById(sessionId, { ballState })
    if (!session) {
      return null
    }
    if (!session.physicsEngine) {
      this.physics.initializeEngine(session)
    }
    if (!alreadyExists) {
      this.analytics.recordSessionCreated(session.id)
      this.analytics.updatePeak(this.getSessionCount())
    }
    return session
  }

  /**
   * Gets session by ID
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    return this.repo.findById(sessionId)
  }

  /**
   * Returns count of active sessions
   * @returns {number}
   */
  getSessionCount() {
    return this.repo.getAll().length
  }

  /**
   * Updates ball state for a session
   * @param {string} sessionId
   * @param {Object} updates
   * @returns {boolean}
   */
  updateBallState(sessionId, updates) {
    const session = this.repo.findById(sessionId)
    if (!session) {
      return false
    }

    if (!this._shouldUpdateState(session, updates)) {
      return true // Not an error — server-side throttle protection
    }

    const validatedUpdates = ValidationUtils.validateBallStateUpdates(updates)

    if (Object.keys(validatedUpdates).length === 0) {
      this.logger.logSession(
        sessionId,
        '[VALIDATION] No valid fields in update, ignoring'
      )
      return false
    }

    this.physics.applyUpdates(session, validatedUpdates)
    this._postUpdateActions(session, validatedUpdates)
    return true
  }

  /**
   * Sets viewer screen size and updates physics accordingly
   * @param {string} sessionId
   * @param {Object} screenSize
   * @returns {boolean}
   */
  setViewerScreenSize(sessionId, screenSize) {
    const session = this.repo.findById(sessionId)
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
    this.physics.updateScreenSize(session, validatedSize, hadPrevSize)

    this.broadcast.broadcastState(sessionId)
    this._setDirectionNormalizationTimeout(session, hadPrevSize)
    this._sendInitialStateToControllers(sessionId, session)

    return true
  }

  /**
   * Sets session language and broadcasts to all clients
   * @param {string} sessionId
   * @param {string} language
   * @returns {boolean}
   */
  setLanguage(sessionId, language) {
    const session = this.repo.findById(sessionId)
    if (!session) {
      return false
    }

    // Validate language: latin letters, 2-5 chars
    if (typeof language !== 'string' || !/^[a-z]{2,5}$/.test(language)) {
      return false
    }

    session.language = language
    this.analytics.recordLanguage(language)
    this.broadcast.broadcastLanguageUpdate(sessionId, language)
    this.logger.logSession(sessionId, `Language updated to: ${language}`)
    return true
  }

  /**
   * Cleans up expired sessions, stopping physics and recording analytics
   * @returns {number} Number of cleaned sessions
   */
  cleanupExpiredSessions() {
    const expiredSessions = this.repo.cleanupExpired()
    if (expiredSessions.length > 0) {
      this.logger.info(
        `Cleaned up ${expiredSessions.length} expired sessions.`
      )
      for (const { id, reason } of expiredSessions) {
        const session = this.repo.findById(id)
        if (session) {
          this.physics.stopPhysics(session)
        }
        // Clear delta compression cache to prevent memory leak
        this.broadcast.clearDeltaCache(id)
        this.analytics.recordSessionEnded(id)
        this.logger.logSession(id, `Session cleaned up: ${reason}`)
      }
    }

    return expiredSessions.length
  }

  /**
   * Handles a new WebSocket client connection
   * @param {WebSocket} ws
   * @param {string} sessionId
   * @param {string} role - 'viewer' or 'controller'
   */
  handleWebSocketConnection(ws, sessionId, role) {
    if (!this.wsManager.addClient(sessionId, ws, role)) {
      ws.close(1011, 'Session not found')
      return
    }

    const session = this.repo.findById(sessionId)
    if (session) {
      session.lastActivity = Date.now()
      session.pendingDeleteAt = null // cancel pending deletion on reconnect

      // Restore physics engine if it was freed on last disconnect
      if (!session.physicsEngine) {
        this.physics.initializeEngine(session)
        this.logger.logSession(
          sessionId,
          'Physics engine restored on reconnect'
        )
      }

      this._handleInitialStateBroadcast(sessionId, ws, role, session)
    }

    this.broadcast.broadcastViewerStatus(sessionId)
    this._broadcastControllerConnectionIfNeeded(sessionId, role)

    // Notify controllers when a viewer connects
    if (role === 'viewer' && session) {
      this.broadcast.broadcastViewerConnection(
        sessionId,
        true,
        session.viewerScreenSize
      )
    }
  }

  /**
   * Handles WebSocket client disconnection
   * @param {WebSocket} ws
   */
  handleWebSocketDisconnection(ws) {
    const clientInfo = this.getClientInfo(ws)
    const sessionId = this.wsManager.removeClient(ws)

    if (sessionId) {
      const session = this.repo.findById(sessionId)
      if (session) {
        const remaining = this.wsManager.getClients(sessionId)
        if (remaining.length === 0) {
          // No clients left — free physics engine, schedule session deletion
          session.physicsEngine = null
          session.pendingDeleteAt = Date.now() + PENDING_DELETE_DELAY
          // Clear delta compression cache to prevent memory leak
          this.broadcast.clearDeltaCache(sessionId)
          this.logger.logSession(
            sessionId,
            'All clients disconnected — physics freed, session pending delete in 5 min'
          )
        }
      }
      this.broadcast.broadcastViewerStatus(sessionId)
    }

    if (clientInfo?.role === 'controller') {
      this.broadcast.broadcastControllerConnection(sessionId, false)
    }
  }

  /**
   * Gets client info for a WebSocket connection
   * @param {WebSocket} ws
   * @returns {Object|null}
   */
  getClientInfo(ws) {
    return this.wsManager.getClientInfo(ws)
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  /**
   * Throttling check — decides whether to process an update
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
   * Returns throttle delay in ms based on update type
   * Constants defined at module level for easier tuning and testing
   * @private
   */
  _getThrottleDelay(updates) {
    if (!updates) {
      return THROTTLE_DEFAULT
    }
    if (updates.colorBall !== undefined || updates.colorBg !== undefined) {
      return THROTTLE_COLOR
    }
    if (updates.speed !== undefined) {
      return THROTTLE_SPEED
    }
    if (updates.dirX !== undefined || updates.dirY !== undefined) {
      return THROTTLE_DIRECTION
    }
    if (updates.paused !== undefined || updates.resume === true) {
      return THROTTLE_PAUSE
    }
    return THROTTLE_DEFAULT
  }

  /**
   * Post-update side effects: clear cache and broadcast state
   * @private
   */
  _postUpdateActions(session, validatedUpdates) {
    /* jshint unused: false */
    this.apiCache.delete(`state_${session.id}`)
    this.broadcast.broadcastState(session.id)
  }

  /**
   * Routes initial state broadcast based on role
   * @private
   */
  _handleInitialStateBroadcast(sessionId, ws, role, session) {
    if (role === 'viewer') {
      this.broadcast.broadcastInitialState(sessionId, ws, session.ballState)
    } else {
      this._handleControllerInitialState(sessionId, ws, role, session)
    }
  }

  /**
   * Handles initial state for a controller connection
   * @private
   */
  _handleControllerInitialState(sessionId, ws, role, session) {
    /* jshint unused: false */
    try {
      ws.initialStateSent = false
    } catch {
      /* ignore */
    }

    // Send initial_state to controller immediately, regardless of viewer connection
    this._broadcastInitialStateToController(sessionId, ws, session)
  }

  /**
   * Sends initial_state to a single controller
   * @private
   */
  _broadcastInitialStateToController(sessionId, ws, session) {
    const finalState = session.physicsEngine
      ? session.physicsEngine.getState()
      : session.ballState
    this.broadcast.broadcastInitialState(sessionId, ws, finalState)
    ws.initialStateSent = true
    this.logger.logSession(
      sessionId,
      'Sent initial_state to controller (viewer screen size already set)'
    )
  }

  /**
   * Broadcasts controller connection event if the connecting role is controller
   * @private
   */
  _broadcastControllerConnectionIfNeeded(sessionId, role) {
    if (role === 'controller') {
      this.broadcast.broadcastControllerConnection(sessionId, true)
    }
  }

  /**
   * Checks whether viewer screen size has been set
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
   * Stores previous screen size before overwriting
   * @private
   */
  _storePreviousScreenSize(session, hadPrevSize) {
    if (hadPrevSize) {
      session._oldWidth = session.viewerScreenSize.width
      session._oldHeight = session.viewerScreenSize.height
    }
  }

  /**
   * Sets direction normalization timeout after screen size change
   * @private
   */
  _setDirectionNormalizationTimeout(session, hadPrevSize) {
    session.normalizeDirectionUntilTs =
      Date.now() +
      (hadPrevSize ? NORMALIZE_TIMEOUT_WITH_PREV : NORMALIZE_TIMEOUT_NEW)
  }

  /**
   * Sends initial state to controllers that haven't received it yet
   * @private
   */
  _sendInitialStateToControllers(sessionId, session) {
    const finalState = session.physicsEngine
      ? session.physicsEngine.getState()
      : session.ballState

    const clients = this.wsManager.getClients(sessionId)
    for (const { client, info } of clients) {
      if (info.role === 'controller' && !client.initialStateSent) {
        this.broadcast.broadcastInitialState(sessionId, client, finalState)
        client.initialStateSent = true
      }
    }
  }
}

module.exports = SessionService
