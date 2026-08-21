/* jshint node: true, esversion: 11, strict: true */
'use strict'

const PhysicsEngine = require('@emdr/shared/physics-engine')

class PhysicsService {
  /**
   * @param {Object} sessionRepository - SessionRepository instance
   * @param {Object} broadcastService - BroadcastService instance
   * @param {Object} webSocketManager - WebSocketManager instance
   * @param {Object} options
   * @param {boolean} options.clientSimulationOnly - Skip server-side physics
   * @param {Object} options.logger - Logger instance
   * @param {Object} options.analytics - Analytics instance
   */
  constructor(
    sessionRepository,
    broadcastService,
    webSocketManager,
    { clientSimulationOnly, logger, analytics }
  ) {
    this.repo = sessionRepository
    this.broadcast = broadcastService
    this.webSocketManager = webSocketManager
    this.clientSimulationOnly = clientSimulationOnly === true
    this.logger = logger
    this.analytics = analytics
    this._startSharedPhysicsLoop()
  }

  /**
   * Initializes physics engine for a session
   * @param {Object} session
   */
  initializeEngine(session) {
    session.physicsEngine = new PhysicsEngine({
      ballRadius: session.ballState.radius || 40,
      maxSpeed: 5000
    })
    this._initCallbacks(session)
    const engineState = session.physicsEngine.getState()
    this._withSoundPreserved(session, () => {
      Object.assign(session.ballState, engineState)
    })

    // Set initial horizontal direction (no velocity — recalculated on start)
    session.physicsEngine.setDirection(1, 0)
    session.ballState.dirX = 1
    session.ballState.dirY = 0

    session.ballState.paused = true
    session.physicsEngine.setPaused(true)
  }

  /**
   * Initializes bounce callback on the physics engine
   * @param {Object} session
   * @private
   */
  _initCallbacks(session) {
    session.physicsEngine.bounceCallback = () => {
      try {
        this._withSoundPreserved(session, () => {
          Object.assign(session.ballState, session.physicsEngine.getState())
        })
        this.broadcast.broadcastState(session.id)
      } catch (err) {
        this.logger.error(
          `Bounce state broadcast error for session ${session.id}:`,
          err
        )
        this.analytics.recordSessionError(session.id, 'bounce_broadcast_error')
      }
    }
  }

  /**
   * Applies validated physics updates to a session
   * @param {Object} session
   * @param {Object} updates - Validated ball state updates
   */
  applyUpdates(session, updates) {
    if (!session.ballState) {
      session.ballState = {}
    }

    // Immediate return to center: skip deceleration, snap to center and pause
    if (
      updates.returnToCenter === true &&
      updates.paused === true &&
      session.physicsEngine
    ) {
      session.physicsEngine.state.stopping = false
      session.physicsEngine.setPaused(true)
      session.physicsEngine.returnToCenter()
      const remaining = { ...updates }
      delete remaining.paused
      delete remaining.returnToCenter
      if (Object.keys(remaining).length > 0) {
        Object.assign(session.ballState, remaining)
        session.physicsEngine.applyCommand(remaining)
      }
      this._withSoundPreserved(session, () => {
        Object.assign(session.ballState, session.physicsEngine.getState())
      })
      session.lastStateUpdate = Date.now()
      return
    }

    // Clear stuck stopping state when play request arrives (clientSimulationOnly: physics loop never
    // runs on server, so stopping never completes — must clear manually on play)
    if (updates.paused === false && session.physicsEngine?.state?.stopping) {
      session.physicsEngine.state.stopping = false
    }

    // Smooth stop: intercept paused:true when currently playing — start deceleration instead
    // Skip when clientSimulationOnly: server physics loop doesn't run, so stopping never completes
    // and the engine would get permanently stuck in {paused:false, stopping:true}
    const isStopRequest =
      updates.paused === true &&
      session.physicsEngine &&
      !session.physicsEngine.state.paused &&
      !session.physicsEngine.state.stopping &&
      !this.clientSimulationOnly

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

    // Apply all valid updates to ballState
    Object.assign(session.ballState, updates)

    // Also apply updates to PhysicsEngine so the physics loop doesn't overwrite with old state
    if (session.physicsEngine) {
      session.physicsEngine.applyCommand(updates)

      // Sync back immediately to ensure consistency
      const engineState = session.physicsEngine.getState()
      Object.assign(session.ballState, engineState, updates)
    }

    session.lastStateUpdate = Date.now()
  }

  /**
   * Updates physics engine world size for a new viewer screen
   * @param {Object} session
   * @param {Object} validatedSize - { width, height }
   * @param {boolean} hadPrevSize - Whether a previous screen size existed
   */
  updateScreenSize(session, validatedSize, hadPrevSize) {
    if (session.physicsEngine) {
      const currentState = session.physicsEngine.getState()
      const wasPlaying = !session.ballState.paused

      session.physicsEngine.setWorldSize(
        validatedSize.width,
        validatedSize.height
      )

      if (!hadPrevSize) {
        this._initializeBallPosition(session, validatedSize)
      } else if (this._shouldScaleBallPosition(session, currentState)) {
        this._scaleBallPosition(
          session,
          currentState,
          validatedSize,
          wasPlaying
        )
      }

      this._withSoundPreserved(session, () => {
        Object.assign(session.ballState, session.physicsEngine.getState())
      })
    } else {
      // No physics engine — set defaults directly
      session.ballState.x = validatedSize.width / 2
      session.ballState.y = validatedSize.height / 2
      session.ballState.vx = 0
      session.ballState.vy = 0
    }
  }

  /**
   * Stops physics for a session by freeing the engine
   * @param {Object} session
   */
  stopPhysics(session) {
    session.physicsEngine = null
  }

  /**
   * Preserves soundEnabled/soundType across a ballState mutation
   * (PhysicsEngine doesn't track sound state, so Object.assign overwrites them)
   * @param {Object} session
   * @param {Function} fn - mutation to execute
   * @private
   */
  _withSoundPreserved(session, fn) {
    const { soundEnabled, soundType } = session.ballState
    fn()
    if (soundEnabled !== undefined)
      session.ballState.soundEnabled = soundEnabled
    if (soundType !== undefined) session.ballState.soundType = soundType
  }

  /**
   * Initializes ball position at screen center on first viewer connect
   * @private
   */
  _initializeBallPosition(session, size) {
    session.physicsEngine.setPosition(size.width / 2, size.height / 2)
    session.physicsEngine.setVelocity(0, 0)
  }

  /**
   * Scales ball position proportionally when screen size changes
   * @private
   */
  _scaleBallPosition(session, state, size, wasPlaying) {
    const scaleX = size.width / session._oldWidth
    const scaleY = size.height / session._oldHeight
    const newX = Math.min(state.x * scaleX, size.width - state.radius)
    const newY = Math.min(state.y * scaleY, size.height - state.radius)

    session.physicsEngine.setPosition(
      Math.max(newX, state.radius),
      Math.max(newY, state.radius)
    )

    if (wasPlaying) {
      session.physicsEngine.setVelocity(state.vx, state.vy)
    }
  }

  /**
   * Checks whether ball position needs scaling (screen dimensions changed)
   * @private
   */
  _shouldScaleBallPosition(session, state) {
    return (
      state &&
      (session._oldWidth !== session.viewerScreenSize.width ||
        session._oldHeight !== session.viewerScreenSize.height)
    )
  }

  /**
   * Starts the single shared 60Hz physics loop that serves all sessions.
   * Uses a self-correcting setTimeout instead of setInterval: each tick
   * schedules the next one relative to the ideal fire time, so cumulative
   * timer drift is automatically cancelled out rather than accumulating.
   * @private
   */
  _startSharedPhysicsLoop() {
    if (this._sharedPhysicsLoop) return

    const PHYSICS_TICK_RATE = 60
    const PHYSICS_DT = 1000 / PHYSICS_TICK_RATE
    // 15Hz broadcast (every 4th tick) for drift correction
    const BROADCAST_EVERY_N_TICKS = 4

    let _lastTickAt = Date.now()
    // _nextTickAt tracks when this tick *should* have fired, not when it actually did.
    // The next setTimeout delay = _nextTickAt - Date.now(), so late ticks are
    // automatically compensated by an earlier next tick.
    let _nextTickAt = Date.now() + PHYSICS_DT

    const tick = () => {
      const now = Date.now()
      const elapsed = now - _lastTickAt
      this.analytics.recordPhysicsTick(elapsed)
      const actualDt = Math.min(elapsed, PHYSICS_DT * 3) / 1000
      _lastTickAt = now

      if (!this.clientSimulationOnly) {
        for (const session of this.repo.sessions.values()) {
          if (session.pendingDeleteAt && Date.now() > session.pendingDeleteAt) {
            this.repo.delete(session.id)
            this.analytics.recordSessionEnded(session.id)
            this.logger.logSession(
              session.id,
              'Session deleted after grace period'
            )
            continue
          }

          if (!session.physicsEngine) continue

          const hasViewers = this.webSocketManager.hasRole(
            session.id,
            'viewer'
          )
          if (!hasViewers) continue

          try {
            this._withSoundPreserved(session, () => {
              session.physicsEngine.update(actualDt)
              Object.assign(
                session.ballState,
                session.physicsEngine.getState()
              )
            })

            if (!session.ticks) session.ticks = 0
            session.ticks++

            if (session.ticks % BROADCAST_EVERY_N_TICKS === 0) {
              session.lastStateUpdate = Date.now()
              this.broadcast.broadcastState(session.id, {
                deltaCompression: true
              })
            }
          } catch (error) {
            this.logger.error(
              `Shared physics loop error for session ${session.id}: ${error.message}`
            )
          }
        }
      }

      // Schedule next tick relative to ideal time, not actual time
      _nextTickAt += PHYSICS_DT
      const delay = Math.max(0, _nextTickAt - Date.now())
      this._sharedPhysicsLoop = setTimeout(tick, delay)
    }

    this._sharedPhysicsLoop = setTimeout(tick, PHYSICS_DT)
  }

  destroy() {
    clearTimeout(this._sharedPhysicsLoop)
    this._sharedPhysicsLoop = null
  }
}

module.exports = PhysicsService
