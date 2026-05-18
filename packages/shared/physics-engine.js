'use strict'
/**
 * PhysicsEngine - optimized physics engine for BilateralBound
 * Manages movement, bounces, and ball scaling
 * Optimized for performance and reusability
 *
 * NOTE: Uses shared direction-utils and bounce-utils to avoid duplication.
 * See packages/shared/direction-utils.js and packages/shared/bounce-utils.js
 */

// Import shared utilities (avoid duplication)
const {
  DIRECTION_EPSILON,
  isVerticalDirection,
  isHorizontalDirection,
  normalizeDirection,
  isValidDirection,
  // calculateVelocity — unused, kept for API compatibility
  getFallbackDirection
} = require('./direction-utils')

const {
  // createBounceMessage — unused, kept for API compatibility
  // createBounceEventDetail — unused, kept for API compatibility
  createBouncePhysicsData,
  dispatchBounceEvent
} = require('./bounce-utils')

// ============================================
// CONSTANTS
// ============================================

/**
 * Fixed physics timestep for deterministic simulation.
 * Both viewer and server step physics at exactly this interval,
 * eliminating drift caused by different FPS / deltaTime values.
 */
const FIXED_DT = 1 / 60

/**
 * Maximum accumulated time per frame (3 steps).
 * Prevents "spiral of death" on slow machines or hidden tabs.
 */
const MAX_ACCUMULATOR = FIXED_DT * 3

const DEFAULT_OPTIONS = {
  worldWidth: 800,
  worldHeight: 600,
  ballRadius: 40,
  minSpeed: 50,
  maxSpeed: 5000,
  defaultSpeed: 30,
  bounceWallMargin: 10,
  centerSnapThreshold: 2,
  centerCheckThreshold: 10,
  driftStaleMs: 1500,
  trackBand: 'center',
  smoothing: {
    // CLIENT-SIDE AUTHORITY: high threshold — server coords used only for coarse sync.
    // Viewer is authoritative; only correct if drift > 100px.
    driftThresholdPx: 100,
    driftCorrectionMs: 200,
    // Drift check every 50ms (~20fps) — reduces correction frequency for smoother motion
    driftCheckIntervalMs: 50,
    // Adaptive spring-damper parameters (used by _applyDriftCorrection)
    stiffness: 3,
    damping: 2
  }
}

const DEFAULT_STATE = {
  paused: true,
  lastDirection: { x: 0, y: 0 },
  targetVx: 0,
  targetVy: 0,
  smoothVx: 0,
  smoothVy: 0,
  allowInterpWhenPaused: false,
  stopping: false,
  stoppingStartTs: 0,
  stoppingDuration: 0.6,
  seekingCenter: false,
  seekingCenterDuration: 0.4
}

const DEFAULT_COLORS = {
  ball: '#60a5fa',
  bg: '#020617'
}

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/
const MAX_RADIUS = 500
const MAX_COMMAND_RADIUS = 1000

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validates a number is finite
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Validates speed percentage
 * @param {number} value - Speed value
 * @returns {boolean}
 */
function isValidSpeed(value) {
  return (
    typeof value === 'number' &&
    value >= 0 &&
    value <= 100 &&
    !Number.isNaN(value)
  )
}

/**
 * Validates hex color string
 * @param {string} value - Color value
 * @returns {boolean}
 */
function isValidHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_REGEX.test(value)
}

/**
 * Validates radius value
 * @param {number} value - Radius value
 * @returns {boolean}
 */
function isValidRadius(value) {
  return isFiniteNumber(value) && value > 0 && value <= MAX_COMMAND_RADIUS
}

// ============================================
// COMMAND VALIDATORS
// ============================================

/**
 * Validates viewer-specific command fields
 * @param {object} command - Command to validate
 * @returns {object} Validated fields
 */
function validateViewerCommand(command) {
  const validated = {}

  if (isFiniteNumber(command.x)) validated.x = command.x
  if (isFiniteNumber(command.y)) validated.y = command.y
  if (isFiniteNumber(command.vx)) validated.vx = command.vx
  if (isFiniteNumber(command.vy)) validated.vy = command.vy
  if (isValidDirection(command.dirX)) validated.dirX = command.dirX
  if (isValidDirection(command.dirY)) validated.dirY = command.dirY
  if (isValidSpeed(command.speed)) validated.speed = command.speed

  return validated
}

/**
 * Validates server-specific command fields
 * @param {object} command - Command to validate
 * @returns {object} Validated fields
 */
function validateServerCommand(command) {
  const validated = {}

  if (isValidDirection(command.dirX)) validated.dirX = command.dirX
  if (isValidDirection(command.dirY)) validated.dirY = command.dirY
  if (isValidSpeed(command.speed)) validated.speed = command.speed

  return validated
}

/**
 * Validates common command fields
 * @param {object} command - Command to validate
 * @returns {object} Validated fields
 */
function validateCommonCommand(command) {
  const validated = {}

  if (typeof command.paused === 'boolean') validated.paused = command.paused
  if (typeof command.stopping === 'boolean')
    validated.stopping = command.stopping
  if (command.reset === true) validated.reset = true
  if (isValidRadius(command.radius)) validated.radius = command.radius
  if (isValidHexColor(command.colorBall))
    validated.colorBall = command.colorBall
  if (isValidHexColor(command.colorBg)) validated.colorBg = command.colorBg
  if (command.ballEmoji !== undefined && (command.ballEmoji === null || (typeof command.ballEmoji === 'string' && command.ballEmoji.length <= 2))) {
    validated.ballEmoji = command.ballEmoji
  }
  if (command.infinity !== undefined && typeof command.infinity === 'boolean') validated.infinity = command.infinity
  if (command.trackBand !== undefined && ['top', 'center', 'bottom'].includes(command.trackBand)) validated.trackBand = command.trackBand

  return validated
}

// ============================================
// MATH HELPERS
// ============================================

/**
 * Calculates speed in pixels per second
 * @param {number} speedPercent - Speed as percentage (0-100)
 * @param {number} maxSpeed - Maximum speed in px/s
 * @returns {number}
 */
function calculatePixelsPerSecond(speedPercent, maxSpeed) {
  return (speedPercent / 100) * maxSpeed
}

/**
 * Clamps value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum
 * @param {number} max - Maximum
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

// NOTE: isVerticalDirection and isHorizontalDirection are imported from direction-utils.js
// They are available via destructured import at top of file

// PHYSICS ENGINE CLASS
// ============================================

class PhysicsEngine {
  /**
   * @param {object} [options={}] - Engine configuration
   * @param {number} [options.worldWidth=800] - World width
   * @param {number} [options.worldHeight=600] - World height
   * @param {number} [options.ballRadius=20] - Ball radius
   * @param {number} [options.minSpeed=50] - Minimum speed
   * @param {number} [options.maxSpeed=5000] - Maximum speed
   * @param {boolean} [options.isViewer=false] - Whether this is viewer mode
   * @param {boolean} [options.clientSimulation=false] - Whether to use client simulation
   * @param {Function} [options.bounceCallback=null] - Callback on bounce
   */
  constructor(options = {}) {
    // Initialize options with defaults
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      smoothing: {
        ...DEFAULT_OPTIONS.smoothing,
        ...(options.smoothing || {})
      }
    }

    // Merge global smoothing config if available
    this._mergeGlobalSmoothingConfig()

    this.isViewer = Boolean(options.isViewer ?? false)
    this._worldSizeSet = false

    // Initialize center coordinates
    this.centerX = this.options.worldWidth / 2
    this.centerY = this.options.worldHeight / 2

    // Initialize ball state
    this.ball = this._createInitialBall()

    // Position tracking for interpolation
    this._prevPos = { x: this.ball.x, y: this.ball.y }
    this._currPos = { x: this.ball.x, y: this.ball.y }
    this._interpBall = {
      x: this.ball.x,
      y: this.ball.y,
      radius: this.ball.radius,
      colorBall: null,
      ballEmoji: null
    }

    // Colors
    this.colors = { ...DEFAULT_COLORS }

    // Physics state
    this.state = this._createInitialState()

    // Drift correction state (spring-damper model)
    this._lastServerPos = null
    this._lastDriftCheckTs = 0
    this._driftCorrection = null
    this._currentJitterMs = 0
    this._lastLocalBounceTs = 0
    this._seekCenterStart = null
    // Spring-damper state for continuous drift correction
    this._springState = { active: false, targetX: 0, targetY: 0, lastDt: 0 }

    // Speed transition: smooths instantaneous speed changes on viewer (clientSimulation only)
    this._speedTransition = null

    // Visual offset: decouples physics position from render position.
    // When drift correction teleports ball.x/y, an equal+opposite offset is applied
    // here so the rendered position doesn't change. The offset decays to zero over
    // ~300ms, hiding the correction behind a smooth visual slide.
    this._visualOffsetX = 0
    this._visualOffsetY = 0

    // Fixed-timestep accumulator for deterministic simulation.
    // Ensures identical physics output regardless of caller FPS.
    this._accumulator = 0
    this._infinityT = 0

    // Callbacks
    this.bounceCallback = this.options.bounceCallback
    this.renderer = null
  }

  /**
   * Merges global BBConfig smoothing options
   * @private
   */
  _mergeGlobalSmoothingConfig() {
    if (typeof globalThis !== 'undefined' && globalThis.BBConfig?.smoothing) {
      this.options.smoothing = {
        ...this.options.smoothing,
        ...globalThis.BBConfig.smoothing
      }
    }
  }

  /**
   * Creates initial ball state
   * @private
   * @returns {object}
   */
  _createInitialBall() {
    return {
      x: this.centerX,
      y: this.centerY,
      vx: 0,
      vy: 0,
      speed: DEFAULT_OPTIONS.defaultSpeed,
      radius: this.options.ballRadius,
      infinity: false,
      ballEmoji: null
    }
  }

  /**
   * Creates initial physics state
   * @private
   * @returns {object}
   */
  _createInitialState() {
    return {
      ...DEFAULT_STATE,
      targetX: this.centerX,
      targetY: this.centerY
    }
  }

  // ============================================
  // PUBLIC API - CONFIGURATION
  // ============================================

  /**
   * Sets renderer for cache invalidation on color change
   * @param {object} renderer - BallRenderer instance
   */
  setRenderer(renderer) {
    this.renderer = renderer
  }

  /**
   * Sets smoothing options
   * @param {object} [opts={}] - Smoothing options
   */
  setSmoothingOptions(opts = {}) {
    if (opts && typeof opts === 'object') {
      this.options.smoothing = { ...this.options.smoothing, ...opts }
    }
  }

  /**
   * Updates jitter metric from external source
   * @param {number} jitterMs - Current jitter in milliseconds
   */
  updateJitter(jitterMs) {
    this._currentJitterMs = jitterMs
  }

  /**
   * Returns lightweight sync diagnostics for runtime monitoring.
   * @returns {{driftPx:number,jitterMs:number,springActive:boolean}}
   */
  getSyncDiagnostics() {
    let driftPx = 0
    if (this._lastServerPos) {
      const dx = this._lastServerPos.x - this.ball.x
      const dy = this._lastServerPos.y - this.ball.y
      driftPx = Math.round(Math.hypot(dx, dy) * 10) / 10
    }

    return {
      driftPx,
      jitterMs: Number(this._currentJitterMs) || 0,
      springActive: this._springState?.active === true
    }
  }

  // ============================================
  // PUBLIC API - WORLD & POSITION
  // ============================================

  /**
   * Sets world dimensions and recalculates center
   * @param {number} width - World width
   * @param {number} height - World height
   */
  setWorldSize(width, height) {
    this.options.worldWidth = width
    this.options.worldHeight = height
    this.centerX = width / 2
    this.centerY = height / 2
    this._worldSizeSet = true

    if (this.state?.paused) {
      this.state.seekingCenter = false
      this._seekCenterStart = null
      this._snapToCenter()
    }

    this.clampBallWithinBounds()
  }

  /**
   * Sets ball position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  setPosition(x, y) {
    this.ball.x = x
    this.ball.y = y

    this.state.seekingCenter = false
    this._seekCenterStart = null

    this.clampBallWithinBounds()

    this._prevPos.x = this.ball.x
    this._prevPos.y = this.ball.y
    this._currPos.x = this.ball.x
    this._currPos.y = this.ball.y
    this._visualOffsetX = 0
    this._visualOffsetY = 0

    if (this.isViewer) {
      this.state.targetX = this.ball.x
      this.state.targetY = this.ball.y
      this.state.smoothVx = 0
      this.state.smoothVy = 0
      this.state.lastVx = 0
      this.state.lastVy = 0
    }
  }

  // ============================================
  // PUBLIC API - VELOCITY & DIRECTION
  // ============================================

  /**
   * Sets ball speed (as percentage)
   * @param {number} percent - Speed percentage (0-100)
   */
  setSpeed(percent) {
    this.ball.speed = clamp(percent, 0, 100)
  }

  /**
   * Sets movement direction
   * @param {number} dirX - X direction (-1 to 1)
   * @param {number} dirY - Y direction (-1 to 1)
   */
  setDirection(dirX, dirY) {
    this.state.lastDirection.x = dirX
    this.state.lastDirection.y = dirY

    if (!this.isViewer || this.options.clientSimulation) {
      const pps = calculatePixelsPerSecond(
        this.ball.speed,
        this.options.maxSpeed
      )
      this.ball.vx = dirX * pps
      this.ball.vy = dirY * pps
    }
  }

  /**
   * Sets movement velocity
   * @param {number} vx - Velocity X
   * @param {number} vy - Velocity Y
   */
  setVelocity(vx, vy) {
    this.ball.vx = vx
    this.ball.vy = vy
    this.state.targetVx = vx
    this.state.targetVy = vy

    const normalized = normalizeDirection(vx, vy)
    if (normalized) {
      this.state.lastDirection.x = normalized.x
      this.state.lastDirection.y = normalized.y
    }
  }

  // ============================================
  // PUBLIC API - STATE CONTROL
  // ============================================

  /**
   * Sets pause state
   * @param {boolean} paused - Pause state
   */
  setPaused(paused) {
    const wasPaused = this.state.paused
    this.state.paused = Boolean(paused)

    if (wasPaused === this.state.paused) return

    this.state.stopping = false

    if (this.state.paused) {
      this._handlePause()
    } else {
      this._handleUnpause()
    }
  }

  /**
   * Handles pause transition
   * @private
   */
  _handlePause() {
    if (this.isViewer) {
      this._handleViewerPause()
    } else {
      this._resetBallToCenter()
    }
  }

  /**
   * Handles viewer pause with animation
   * @private
   */
  _handleViewerPause() {
    this.state.allowInterpWhenPaused = false
    this.state.lastVx = 0
    this.state.lastVy = 0
    this.state.smoothVx = 0
    this.state.smoothVy = 0
    this.ball.vx = 0
    this.ball.vy = 0

    this._speedTransition = null

    // Clear drift correction state during pause to prevent conflict with seek-center animation
    this._lastServerPos = null
    this._springState.active = false
    this._springState._desyncStartTs = null
    this._visualOffsetX = 0
    this._visualOffsetY = 0

    const dx = this.centerX - this.ball.x
    const dy = this.centerY - this.ball.y
    const distanceFromCenter = Math.hypot(dx, dy)

    if (distanceFromCenter > this.options.centerSnapThreshold) {
      this.state.seekingCenter = true
      this._seekCenterStart = {
        x: this.ball.x,
        y: this.ball.y,
        ts: performance.now()
      }
    } else {
      this.state.seekingCenter = false
      this._snapToCenter()
    }

    this.clampBallWithinBounds()
  }

  /**
   * Handles unpause transition
   * @private
   */
  _handleUnpause() {
    this.state.allowInterpWhenPaused = false

    // Infinity mode: reset phase so server and viewer restart from t=0 simultaneously.
    // Early return prevents trackBand snap (infinity uses full-screen center).
    if (this.ball.infinity) {
      this._infinityT = 0
      this._snapToCenter()
      if (this.options.clientSimulation) {
        this._restoreLocalVelocity()
      }
      return
    }

    if (this.state.seekingCenter) {
      this._snapToCenter()
    }

    this.state.seekingCenter = false
    this._seekCenterStart = null

    if (this.options.trackBand && this.options.trackBand !== 'center') {
      const bandY = this._getTrackBandCenterY()
      this.ball.y = bandY
      this._prevPos.y = bandY
      this._currPos.y = bandY
      if (typeof this.state.targetY === 'number') this.state.targetY = bandY
    }

    if (this.options.clientSimulation) {
      this._restoreLocalVelocity()
    }
  }

  /**
   * Starts smooth deceleration
   * @param {number} [duration=0.6] - Deceleration duration in seconds
   */
  startStopping(duration = 0.6) {
    if (this.state.paused) return

    this.state.stopping = true
    this.state.stoppingStartTs = performance.now()
    this.state.stoppingDuration = duration
  }

  /**
   * Public method for returning to center.
   * For viewer mode: starts smooth seek-center animation (like pause).
   * For server mode: instant snap to center.
   */
  returnToCenter() {
    if (this.isViewer) {
      const dx = this.centerX - this.ball.x
      const dy = this.centerY - this.ball.y
      const distanceFromCenter = Math.hypot(dx, dy)

      if (distanceFromCenter > this.options.centerSnapThreshold) {
        this.state.seekingCenter = true
        this._seekCenterStart = {
          x: this.ball.x,
          y: this.ball.y,
          ts: performance.now()
        }
      } else {
        this.state.seekingCenter = false
        this._snapToCenter()
      }
      this.clampBallWithinBounds()
    } else {
      this._resetBallToCenter()
    }
  }

  // ============================================
  // PUBLIC API - APPEARANCE
  // ============================================

  /**
   * Sets ball color
   * @param {string} color - Hex color
   */
  setBallColor(color) {
    if (typeof color === 'string' && color.length > 0) {
      this.colors.ball = color
      this._invalidateRendererCache()
    }
  }

  /**
   * Sets background color
   * @param {string} color - Hex color
   */
  setBgColor(color) {
    if (typeof color === 'string' && color.length > 0) {
      this.colors.bg = color
      this._invalidateRendererCache()
    }
  }

  /**
   * Sets ball size
   * @param {number} radius - Ball radius
   */
  setBallSize(radius) {
    if (typeof radius === 'number' && radius > 0 && radius <= MAX_RADIUS) {
      this.ball.radius = radius
      this.clampBallWithinBounds()
    }
  }

  /**
   * Invalidates renderer cache
   * @private
   */
  _invalidateRendererCache() {
    if (
      this.renderer &&
      typeof this.renderer.invalidateBallCache === 'function'
    ) {
      this.renderer.invalidateBallCache()
    }
  }

  // ============================================
  // PUBLIC API - PHYSICS UPDATE
  // ============================================

  /**
   * Updates physics using a Fixed Timestep accumulator.
   *
   * DETERMINISM: Both viewer and server advance by exactly FIXED_DT (1/60 s)
   * per sub-step, regardless of the caller's FPS. This guarantees identical
   * ball positions on any hardware or update frequency — eliminating drift
   * caused by floating-point accumulation over variable deltaTime.
   *
   * The accumulator is capped at MAX_ACCUMULATOR (2 steps) to prevent
   * the "spiral of death" on slow machines or throttled background tabs.
   *
   * @param {number} deltaTime - Wall-clock time elapsed since last call (seconds)
   */
  update(deltaTime) {
    // Guard: clamp incoming deltaTime — large spikes (tab hidden, debugger) must not
    // cause runaway physics by only allowing up to MAX_ACCUMULATOR worth of work.
    this._accumulator += Math.min(deltaTime, MAX_ACCUMULATOR)

    while (this._accumulator >= FIXED_DT) {
      if (this.isViewer) {
        this._updateViewerPhysics(FIXED_DT)
      } else {
        this._updateServerPhysics(FIXED_DT)
      }
      this._accumulator -= FIXED_DT
    }

    this.__lastPhysicsUpdateTs = performance?.now?.() ?? Date.now()
  }

  /**
   * Updates client-side physics
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateClientPhysics(deltaTime) {
    if (this.state.paused) return
    if (!this._ensureWorldSizeSet()) return

    const speedFactor = this._calculateSpeedFactor()
    if (speedFactor <= 0) {
      this.setPaused(true)
      return
    }

    const velocity = this._calculateClientVelocity()
    this._applyAxisLock(velocity)
    velocity.vx *= speedFactor
    velocity.vy *= speedFactor

    this._updateBallPosition(velocity, deltaTime)
    this.handleBoundaryCollisions()
    this._updateCurrentPosition()
  }

  // ============================================
  // PUBLIC API - BOUNDARY & COLLISION
  // ============================================

  /**
   * Handles boundary collisions
   * Respects axis lock: in horizontal mode only, vertical bounces are ignored;
   * in vertical mode only, horizontal bounces are ignored.
   * Diagonal mode always bounces on all sides.
   * Prevents the ball from leaving the screen.
   */
  handleBoundaryCollisions() {
    const { ball, options, state } = this
    const { radius } = ball
    const { worldWidth, worldHeight } = options

    let bounceSide = null
    const dirX = state.lastDirection.x || 0
    const dirY = state.lastDirection.y || 0

    // Check if movement is locked to a single axis
    // Pure horizontal: dirY ≈ 0 and dirX ≠ 0 → skip vertical wall checks
    const isPureHorizontal =
      Math.abs(dirY) < DIRECTION_EPSILON && Math.abs(dirX) >= DIRECTION_EPSILON
    // Pure vertical: dirX ≈ 0 and dirY ≠ 0 → skip horizontal wall checks
    const isPureVertical =
      Math.abs(dirX) < DIRECTION_EPSILON && Math.abs(dirY) >= DIRECTION_EPSILON

    // Horizontal bounds — check unless locked to pure vertical movement
    if (!isPureVertical) {
      if (ball.x < radius) {
        const overflow = radius - ball.x
        ball.x = radius + overflow + 0.1 // Add epsilon to skip wall
        if (dirX < 0) {
          state.lastDirection.x = Math.abs(dirX)
          bounceSide = 'left'
        }
      } else if (ball.x > worldWidth - radius) {
        const overflow = ball.x - (worldWidth - radius)
        ball.x = worldWidth - radius - overflow - 0.1 // Add epsilon to skip wall
        if (dirX > 0) {
          state.lastDirection.x = -Math.abs(dirX)
          bounceSide = 'right'
        }
      }
    }

    // Vertical bounds — check unless locked to pure horizontal movement
    if (!isPureHorizontal) {
      const yMin = this._getTrackBandYMin()
      const yMax = this._getTrackBandYMax()
      if (ball.y < yMin + radius) {
        const overflow = (yMin + radius) - ball.y
        ball.y = yMin + radius + overflow + 0.1 // Add epsilon to skip wall
        if (dirY < 0) {
          state.lastDirection.y = Math.abs(dirY)
          bounceSide = bounceSide || 'top'
        }
      } else if (ball.y > yMax - radius) {
        const overflow = ball.y - (yMax - radius)
        ball.y = yMax - radius - overflow - 0.1 // Add epsilon to skip wall
        if (dirY > 0) {
          state.lastDirection.y = -Math.abs(dirY)
          bounceSide = bounceSide || 'bottom'
        }
      }
    }

    if (bounceSide) {
      this.handleBounce(bounceSide)
    }
  }

  /**
   * Handles bounce off boundary
   * @param {string} side - Bounce side: 'left', 'right', 'top', 'bottom'
   */
  handleBounce(side) {
    // Cancel speed transition on bounce — bounce is a natural velocity discontinuity
    this._speedTransition = null
    const pps = calculatePixelsPerSecond(
      this.ball.speed,
      this.options.maxSpeed
    )
    this.ball.vx = this.state.lastDirection.x * pps
    this.ball.vy = this.state.lastDirection.y * pps

    this.ensureMinimumSpeed()

    this.state.lastVx = this.ball.vx
    this.state.lastVy = this.ball.vy
    this._lastLocalBounceTs = performance.now()

    // After a local bounce, stale server snapshots can briefly pull the ball back to the wall.
    // Clear correction target and let local physics settle first.
    if (this.isViewer && this.options.clientSimulation) {
      this._lastServerPos = null
      this._springState.active = false
      this._springState.driftMagnitude = 0
      this._springState._desyncStartTs = null
    }

    this._triggerBounceCallback(side)
    this._dispatchBounceEvent(side)
  }

  /**
   * Triggers bounce callback
   * @param {string} side - Bounce side
   * @private
   */
  _triggerBounceCallback(side) {
    if (!this.bounceCallback) return

    const data = createBouncePhysicsData(
      side,
      this.ball,
      this.state.lastDirection
    )
    this.bounceCallback(data)
  }

  /**
   * Dispatches bounce event
   * @param {string} side - Bounce side
   * @private
   */
  _dispatchBounceEvent(side) {
    dispatchBounceEvent(side, this.ball)
  }

  /**
   * Ensures minimum speed after bounce
   */
  ensureMinimumSpeed() {
    const currentSpeed = Math.hypot(this.ball.vx, this.ball.vy)

    if (currentSpeed > 0 && currentSpeed < this.options.minSpeed) {
      const scale = this.options.minSpeed / currentSpeed
      this.ball.vx *= scale
      this.ball.vy *= scale
    } else if (currentSpeed === 0) {
      this._setFallbackVelocity()
    }
  }

  /**
   * Sets fallback velocity when speed is zero
   * @private
   */
  _setFallbackVelocity() {
    const dirX = this.state.lastDirection.x || 0
    const dirY = this.state.lastDirection.y || 0

    if (isVerticalDirection(dirX) && Math.abs(dirY) > 0) {
      this.ball.vx = 0
      this.ball.vy = Math.sign(dirY) * this.options.minSpeed
    } else if (isHorizontalDirection(dirY) && Math.abs(dirX) > 0) {
      this.ball.vx = Math.sign(dirX) * this.options.minSpeed
      this.ball.vy = 0
    } else {
      const fallback = getFallbackDirection(
        this.ball.x,
        this.ball.y,
        this.centerX,
        this.centerY
      )
      this.ball.vx = fallback.x * this.options.minSpeed
      this.ball.vy = fallback.y * this.options.minSpeed
    }
  }

  /**
   * Ensures ball stays within world boundaries
   */
  clampBallWithinBounds() {
    const { radius } = this.ball
    const w = this.options.worldWidth
    const h = this.options.worldHeight

    if (w <= 0 || h <= 0 || radius < 0) return

    const clampedX = clamp(this.ball.x, radius, w - radius)
    const clampedY = clamp(this.ball.y, radius, h - radius)

    if (clampedX !== this.ball.x) {
      this.ball.x = clampedX
      if (this.isViewer) this.state.smoothVx = 0
    }

    if (clampedY !== this.ball.y) {
      this.ball.y = clampedY
      if (this.isViewer) this.state.smoothVy = 0
    }

    if (typeof this.state.targetX === 'number') {
      this.state.targetX = clamp(this.state.targetX, radius, w - radius)
    }

    if (typeof this.state.targetY === 'number') {
      this.state.targetY = clamp(this.state.targetY, radius, h - radius)
    }
  }

  // ============================================
  // PUBLIC API - INTERPOLATION
  // ============================================

  /**
   * Returns current interpolation alpha (0-1) for smooth rendering.
   * Represents the fractional progress within the current fixed timestep.
   * @returns {number}
   */
  getInterpolationAlpha() {
    return Math.max(0, Math.min(1, this._accumulator / (1 / 60))) // Use 1/60 (FIXED_DT)
  }

  /**
   * Gets interpolated ball position
   * @param {number} [alpha] - Optional manual alpha, otherwise uses internal accumulator.
   * @returns {object}
   */
  getInterpolatedBall(alpha) {
    const a = typeof alpha === 'number' ? Math.max(0, Math.min(1, alpha)) : this.getInterpolationAlpha()

    this._interpBall.x =
      this._prevPos.x + (this._currPos.x - this._prevPos.x) * a + this._visualOffsetX
    this._interpBall.y =
      this._prevPos.y + (this._currPos.y - this._prevPos.y) * a + this._visualOffsetY
    this._interpBall.radius = this.ball.radius
    this._interpBall.colorBall = this.ball.colorBall || null
    this._interpBall.ballEmoji = this.ball.ballEmoji ?? null

    return this._interpBall
  }

  // ============================================
  // PUBLIC API - COMMAND HANDLING
  // ============================================

  /**
   * Applies command from server
   * @param {object} command - Command object
   */
  applyCommand(command) {
    if (!command) return

    const validatedCommand = this._validateCommand(command)
    if (Object.keys(validatedCommand).length === 0) return

    this._handleCommonCommands(validatedCommand)

    if (this.isViewer) {
      this._handleViewerCommand(validatedCommand)
    } else {
      this._handleServerCommand(validatedCommand)
    }
  }

  /**
   * Gets current physics engine state
   * @returns {object} Ball and engine state
   */
  getState() {
    return {
      x: this.ball.x,
      y: this.ball.y,
      vx: this.ball.vx,
      vy: this.ball.vy,
      dirX: this.state.lastDirection.x,
      dirY: this.state.lastDirection.y,
      speed: this.ball.speed,
      radius: this.ball.radius,
      paused: this.state.paused,
      stopping: this.state.stopping,
      colorBall: this.colors.ball,
      colorBg: this.colors.bg,
      ballEmoji: this.ball.ballEmoji ?? null,
      infinity: this.ball.infinity ?? false,
      trackBand: this.options.trackBand ?? 'center'
    }
  }

  /**
   * Resets state to initial
   */
  reset() {
    this.ball.x = this.centerX
    this.ball.y = this.centerY
    this.ball.vx = 0
    this.ball.vy = 0
    this.ball.speed = DEFAULT_OPTIONS.defaultSpeed
    this.ball.radius = this.options.ballRadius

    this.state.lastDirection.x = 0
    this.state.lastDirection.y = 0
    this.state.targetVx = 0
    this.state.targetVy = 0
    this.state.targetX = this.centerX
    this.state.targetY = this.centerY

    this._speedTransition = null

    this.ball.ballEmoji = null
    this.ball.infinity = false
    this._infinityT = 0
  }

  // ============================================
  // PRIVATE - TRACK BAND HELPERS
  // ============================================

  _getTrackBandYMin() {
    const h = this.options.worldHeight
    return this.options.trackBand === 'bottom' ? h * 0.5 : 0
  }

  _getTrackBandYMax() {
    const h = this.options.worldHeight
    return this.options.trackBand === 'top' ? h * 0.5 : h
  }

  _getTrackBandCenterY() {
    return (this._getTrackBandYMin() + this._getTrackBandYMax()) / 2
  }

  // Lemniscate (Bernoulli figure-8) path. Parametric formula:
  //   x(t) = cx + (W/2 * scale) * cos(t) / (1 + sin²(t))
  //   y(t) = cy + (H/2 * scale) * sin(t)*cos(t) / (1 + sin²(t))
  // Both server and viewer advance _infinityT at the same rate → identical trajectory.
  _stepInfinityPath(dt) {
    const w = this.options.worldWidth
    const h = this.options.worldHeight
    const cx = w / 2
    const cy = h / 2
    const scale = 0.75

    // Advance phase: speed=30 → ~1.2 rad/s → ~5s per cycle
    this._infinityT = ((this._infinityT || 0) + this.ball.speed * FIXED_DT * 0.04) % (2 * Math.PI)
    const t = this._infinityT
    const denom = 1 + Math.sin(t) * Math.sin(t)

    this._prevPos.x = this.ball.x
    this._prevPos.y = this.ball.y
    this.ball.x = cx + (w / 2 * scale) * Math.cos(t) / denom
    this.ball.y = cy + (h / 2 * scale) * Math.sin(t) * Math.cos(t) / denom
    this.ball.vx = 0
    this.ball.vy = 0
    this._currPos.x = this.ball.x
    this._currPos.y = this.ball.y
  }

  // ============================================
  // PRIVATE - VELOCITY HELPERS
  // ============================================

  /**
   * Restores velocity for local simulation
   * @private
   */
  _restoreLocalVelocity() {
    if (
      Math.abs(this.state.lastDirection.x || 0) < DIRECTION_EPSILON &&
      Math.abs(this.state.lastDirection.y || 0) < DIRECTION_EPSILON
    ) {
      this.state.lastDirection.x = 1
      this.state.lastDirection.y = 0
    }

    const pps = calculatePixelsPerSecond(
      this.ball.speed,
      this.options.maxSpeed
    )
    this.ball.vx = this.state.lastDirection.x * pps
    this.ball.vy = this.state.lastDirection.y * pps
    this.state.lastVx = this.ball.vx
    this.state.lastVy = this.ball.vy
  }

  /**
   * Resets ball to center
   * @private
   */
  _resetBallToCenter() {
    this.ball.x = this.centerX
    this.ball.y = this.centerY
    this.ball.vx = 0
    this.ball.vy = 0
    this.state.targetX = this.centerX
    this.state.targetY = this.centerY
    this.clampBallWithinBounds()
  }

  /**
   * Snaps ball to center and syncs position state
   * @private
   */
  _snapToCenter() {
    this.ball.x = this.centerX
    this.ball.y = this.centerY
    this.ball.vx = 0
    this.ball.vy = 0
    this._prevPos.x = this.centerX
    this._prevPos.y = this.centerY
    this._currPos.x = this.centerX
    this._currPos.y = this.centerY
    this.state.targetX = this.centerX
    this.state.targetY = this.centerY
    this._visualOffsetX = 0
    this._visualOffsetY = 0
  }

  // ============================================
  // PRIVATE - PHYSICS UPDATE HELPERS
  // ============================================

  /**
   * Decays the visual offset toward zero each physics step.
   * Half-life ~150ms: correction is 50% hidden at 150ms, 75% at 300ms.
   * @param {number} dt - Fixed timestep in seconds
   * @private
   */
  _decayVisualOffset(dt) {
    if (this._visualOffsetX === 0 && this._visualOffsetY === 0) return
    const factor = Math.pow(0.5, dt / 0.15)
    this._visualOffsetX *= factor
    this._visualOffsetY *= factor
    if (Math.abs(this._visualOffsetX) < 0.05) this._visualOffsetX = 0
    if (Math.abs(this._visualOffsetY) < 0.05) this._visualOffsetY = 0
  }

  /**
   * Updates viewer physics
   * @param {number} deltaTime - Time delta
   * @private
   */
  _updateViewerPhysics(deltaTime) {
    if (this.state.paused) {
      if (this.state.seekingCenter) {
        this._updateSeekCenter()
      }
      return
    }

    // NEW: lemniscate path bypasses bounce physics
    if (this.ball.infinity) {
      this._stepInfinityPath(deltaTime)
      this._decayVisualOffset(deltaTime)
      return
    }

    if (this.options.clientSimulation) {
      this.updateClientPhysics(deltaTime)
      this._applyDriftCorrection()
      this._checkDriftCorrection()
    } else {
      this.updateClientPhysics(deltaTime)
    }

    this._decayVisualOffset(deltaTime)
  }

  /**
   * Updates server physics
   * @param {number} deltaTime - Time delta
   * @private
   */
  _updateServerPhysics(deltaTime) {
    if (this.state.paused) return
    if (!this._worldSizeSet) return

    // NEW: lemniscate path bypasses bounce physics
    if (this.ball.infinity) {
      this._stepInfinityPath(deltaTime)
      return
    }

    const speedFactor = this._calculateSpeedFactor()
    if (speedFactor <= 0) {
      this.setPaused(true)
      return
    }

    const pps =
      calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed) *
      speedFactor
    this.ball.vx = this.state.lastDirection.x * pps
    this.ball.vy = this.state.lastDirection.y * pps

    this._prevPos.x = this.ball.x
    this._prevPos.y = this.ball.y

    this.ball.x += this.ball.vx * deltaTime
    this.ball.y += this.ball.vy * deltaTime

    this.handleBoundaryCollisions()

    this._currPos.x = this.ball.x
    this._currPos.y = this.ball.y
  }

  /**
   * Calculates speed factor based on stopping state
   * Uses cubic ease-out for smooth deceleration (industry standard)
   * @returns {number}
   * @private
   */
  _calculateSpeedFactor() {
    if (!this.state.stopping) return 1.0

    const elapsed = (performance.now() - this.state.stoppingStartTs) / 1000
    const t = Math.min(1, elapsed / this.state.stoppingDuration)
    // Cubic ease-out: 1 - (1-t)^3 creates smooth deceleration curve
    return 1 - (1 - t) * (1 - t) * (1 - t)
  }

  /**
   * Ensures world size is set
   * @returns {boolean}
   * @private
   */
  _ensureWorldSizeSet() {
    if (this._worldSizeSet) return true

    if (this.options.worldWidth > 0 && this.options.worldHeight > 0) {
      this._worldSizeSet = true
      return true
    }

    return false
  }

  /**
   * Returns interpolated speed during a viewer-side speed transition.
   * Falls back to ball.speed when no transition is active.
   * Only set for isViewer+clientSimulation instances.
   * @returns {number}
   * @private
   */
  _getEffectiveSpeed() {
    if (!this._speedTransition) return this.ball.speed
    const elapsed = performance.now() - this._speedTransition.startTs
    if (elapsed >= this._speedTransition.duration) {
      this._speedTransition = null
      return this.ball.speed
    }
    const t = elapsed / this._speedTransition.duration
    const eased = 1 - (1 - t) * (1 - t)
    return this._speedTransition.from + (this._speedTransition.to - this._speedTransition.from) * eased
  }

  /**
   * Calculates client velocity
   * @returns {{vx: number, vy: number}}
   * @private
   */
  _calculateClientVelocity() {
    const pps = calculatePixelsPerSecond(
      this._getEffectiveSpeed(),
      this.options.maxSpeed
    )
    return {
      vx: (this.state.lastDirection.x || 0) * pps,
      vy: (this.state.lastDirection.y || 0) * pps
    }
  }

  /**
   * Applies axis lock for pure vertical/horizontal movement
   * @param {object} velocity - Velocity object to modify
   * @private
   */
  _applyAxisLock(velocity) {
    const dirX = this.state.lastDirection.x || 0
    const dirY = this.state.lastDirection.y || 0
    const pps = calculatePixelsPerSecond(
      this._getEffectiveSpeed(),
      this.options.maxSpeed
    )

    const isVertical = isVerticalDirection(dirX) && Math.abs(dirY) > 0
    const isHorizontal = isHorizontalDirection(dirY) && Math.abs(dirX) > 0

    if (isVertical) {
      velocity.vx = 0
      velocity.vy = dirY * pps
      this.state.smoothVx = 0
    } else if (isHorizontal) {
      velocity.vy = 0
      velocity.vx = dirX * pps
      this.state.smoothVy = 0
    } else if (Math.abs(dirX) > 0 || Math.abs(dirY) > 0) {
      velocity.vx = dirX * pps
      velocity.vy = dirY * pps
    }
  }

  /**
   * Updates ball position
   * @param {object} velocity - Velocity
   * @param {number} deltaTime - Time delta
   * @private
   */
  _updateBallPosition(velocity, deltaTime) {
    this.ball.vx = velocity.vx
    this.ball.vy = velocity.vy
    this._prevPos.x = this.ball.x
    this._prevPos.y = this.ball.y
    this.ball.x += velocity.vx * deltaTime
    this.ball.y += velocity.vy * deltaTime
  }

  /**
   * Updates current position tracking
   * @private
   */
  _updateCurrentPosition() {
    this._currPos.x = this.ball.x
    this._currPos.y = this.ball.y
  }

  /**
   * Updates seek-to-center animation
   * @private
   */
  _updateSeekCenter() {
    if (!this._seekCenterStart) {
      this.state.seekingCenter = false
      this._snapToCenter()
      return
    }

    const elapsed = (performance.now() - this._seekCenterStart.ts) / 1000
    const t = Math.min(1, elapsed / this.state.seekingCenterDuration)
    const ease = 1 - (1 - t) * (1 - t)

    const newX =
      this._seekCenterStart.x + (this.centerX - this._seekCenterStart.x) * ease
    const newY =
      this._seekCenterStart.y + (this.centerY - this._seekCenterStart.y) * ease

    this._prevPos.x = newX
    this._prevPos.y = newY
    this._currPos.x = newX
    this._currPos.y = newY
    this.ball.x = newX
    this.ball.y = newY

    if (t >= 1) {
      this.state.seekingCenter = false
      this._seekCenterStart = null
      this._snapToCenter()
    }
  }

  // ============================================
  // PRIVATE - DRIFT CORRECTION
  // ============================================

  /**
   * Checks if ball is near a wall boundary (within margin)
   * Skips drift correction near walls to prevent fighting with bounce events
   * Uses a very tight margin (just the radius + 1px) to only disable correction
   * when the ball is literally touching the wall. This prevents jitter after bounces
   * by allowing drift correction to work smoothly right up to the bounce point.
   * @private
   * @returns {boolean} true if near wall
   */
  _isNearWall() {
    // CLIENT-SIDE AUTHORITY: Extended wall immunity zone.
    // margin = radius + 40px (was radius + 10px).
    // This ~60px-wide zone around each wall ensures drift correction
    // never fights the bounce logic on either side of impact.
    // Server extrapolation can place the ball slightly outside bounds;
    // this larger margin prevents "bumping" when the viewer is near a wall.
    const margin = this.ball.radius + 40
    const { worldWidth, worldHeight } = this.options
    return (
      this.ball.x <= margin ||
      this.ball.x >= worldWidth - margin ||
      this.ball.y <= margin ||
      this.ball.y >= worldHeight - margin
    )
  }

  /**
   * Checks and activates spring-damper drift correction.
   *
   * KEY OPTIMIZATION FOR CLIENT SIMULATION:
   * When clientSimulation is true, the viewer runs local physics at 60FPS which
   * is the authoritative position source. Drift correction should ONLY activate
   * when drift is significant (> adaptiveThreshold), preventing micro-corrections
   * that cause jitter.
   *
   * Uses bounce cooldown to avoid fighting with bounce events.
   * @private
   */
  _checkDriftCorrection() {
    if (!this._lastServerPos || this.state.paused) return
    const now = performance.now()

    // CLIENT-SIDE AUTHORITY: Extended cooldown after local wall bounce.
    // 500ms (was 250ms) — server packets confirming the old direction
    // arrive late and would fight with post-bounce local physics.
    if (now - this._lastLocalBounceTs < 500) {
      this._springState.active = false
      return
    }

    const posAge = now - this._lastServerPos.ts
    const serverTimeAge = this._lastServerPos.serverTime
      ? (Date.now() - this._lastServerPos.serverTime)
      : posAge

    if (posAge > this.options.driftStaleMs) {
      this._springState.active = false
      return
    }

    const checkInterval = this.options.smoothing.driftCheckIntervalMs || 50
    if (this._lastDriftCheckTs && now - this._lastDriftCheckTs < checkInterval)
      return

    // CLIENT-SIDE AUTHORITY: Skip drift correction near walls.
    // Expanded immunity zone (radius+40) prevents correction fighting bounce logic.
    if (this._isNearWall()) {
      this._springState.active = false
      return
    }

    this._lastDriftCheckTs = now

    // Extrapolate server position based on its velocity and time since last update
    let serverX = this._lastServerPos.x
    let serverY = this._lastServerPos.y
    const serverVx = this._lastServerPos.vx
    const serverVy = this._lastServerPos.vy

    if (serverVx !== undefined && serverVy !== undefined) {
      const dt = serverTimeAge / 1000
      serverX += serverVx * dt
      serverY += serverVy * dt
    }

    // Clamp extrapolated server position to viewer's world bounds.
    const { worldWidth, worldHeight } = this.options
    const { radius } = this.ball
    serverX = Math.max(radius, Math.min(worldWidth - radius, serverX))
    serverY = Math.max(radius, Math.min(worldHeight - radius, serverY))

    const dx = serverX - this.ball.x
    const dy = serverY - this.ball.y
    const drift = Math.hypot(dx, dy)

    // CLIENT-SIDE AUTHORITY: Velocity vector guard.
    // If server velocity matches local velocity closely, the simulation is already
    // in sync by parameters — skip position correction entirely.
    // This is the core of "sync by events, not coordinates".
    if (serverVx !== undefined && serverVy !== undefined) {
      const velDx = Math.abs(serverVx - this.ball.vx)
      const velDy = Math.abs(serverVy - this.ball.vy)
      const velocitiesMatch = velDx < 10 && velDy < 10
      if (velocitiesMatch && drift < this.options.smoothing.driftThresholdPx) {
        // Vectors are aligned — viewer's local simulation is authoritative
        this._springState._desyncStartTs = null
        this._springState.active = false
        this._springState.driftMagnitude = 0
        return
      }
    }

    // Adaptive threshold: base 100px + speed scaling.
    // High threshold means server coords are only used for coarse correction.
    const baseThreshold = this.options.smoothing.driftThresholdPx || 100
    const speedPercent = this.ball.speed || 30
    const adaptiveThreshold = baseThreshold + speedPercent * 0.3

    if (drift > adaptiveThreshold) {
      // Track persistent desync for hard recovery
      if (!this._springState._desyncStartTs) {
        this._springState._desyncStartTs = now
      }
      const desyncDuration = now - this._springState._desyncStartTs

      // Hard snap recovery: if drift > 200px for > 3 seconds, teleport to server
      if (drift > 200 && desyncDuration > 3000) {
        this.ball.x = serverX
        this.ball.y = serverY
        this._visualOffsetX = 0
        this._visualOffsetY = 0
        this._springState.active = false
        this._springState.driftMagnitude = 0
        this._springState._desyncStartTs = null
        return
      }

      // Activate spring-damper correction
      this._springState.active = true
      this._springState.targetX = serverX
      this._springState.targetY = serverY
      this._springState.driftMagnitude = drift
    } else {
      // Drift is within tolerance — deactivate correction, let local physics run.
      // NOTE: The old "5% subtle correction" block (drift > 2px) has been REMOVED.
      // It was the primary source of visual jitter. Local physics is now authoritative
      // for all drift below adaptiveThreshold.
      this._springState._desyncStartTs = null
      this._springState.active = false
      this._springState.driftMagnitude = 0
    }
  }

  /**
   * Applies spring-damper drift correction.
   *
   * OPTIMIZED: Uses simplified formula that combines spring + damping
   * into a single correction step. This avoids per-axis branching
   * and reduces math operations by ~30%.
   *
   * Only called when _springState.active === true (significant drift detected).
   * @private
   */
  _applyDriftCorrection() {
    if (!this._springState.active || !this._lastServerPos) return
    if (this._isNearWall()) {
      this._springState.active = false
      return
    }

    const now = performance.now()
    const lastTs = this._springState._lastCorrectionTs || now
    // Cap dt at 33ms (30fps) to prevent instability on hidden tabs
    const dt = Math.min(33, now - lastTs) / 1000
    this._springState._lastCorrectionTs = now

    // Advance the target position so it moves alongside the ball
    this._springState.targetX += this.ball.vx * dt
    this._springState.targetY += this.ball.vy * dt

    const sm = this.options.smoothing || {}
    const stiffness = sm.stiffness !== undefined ? sm.stiffness : 3

    const dx = this._springState.targetX - this.ball.x
    const dy = this._springState.targetY - this.ball.y

    // Smooth proportional correction toward the moving target
    const correctionX = dx * stiffness * dt
    const correctionY = dy * stiffness * dt

    // Adaptive maxCorrection based on drift magnitude
    const driftMag = this._springState.driftMagnitude || 0
    const maxCorrection = driftMag > 100
      ? Math.min(25, 8 + (driftMag - 100) * 0.08)
      : 8

    const appliedX = clamp(correctionX, -maxCorrection, maxCorrection)
    const appliedY = clamp(correctionY, -maxCorrection, maxCorrection)

    this.ball.x += appliedX
    this.ball.y += appliedY

    // Equal+opposite offset so the rendered position doesn't jump.
    // Decays to zero over ~300ms via _decayVisualOffset().
    this._visualOffsetX -= appliedX
    this._visualOffsetY -= appliedY
  }

  // ============================================
  // PRIVATE - COMMAND VALIDATION
  // ============================================

  /**
   * Validates incoming command
   * @param {object} command - Command to validate
   * @returns {object} Validated command
   * @private
   */
  _validateCommand(command) {
    const modeSpecific = this.isViewer
      ? validateViewerCommand(command)
      : validateServerCommand(command)

    const common = validateCommonCommand(command)

    return { ...modeSpecific, ...common }
  }

  // ============================================
  // PRIVATE - COMMAND HANDLERS
  // ============================================

  /**
   * Handles common commands
   * @param {object} command - Validated command
   * @private
   */
  _handleCommonCommands(command) {
    if (
      command.stopping === true &&
      this.isViewer &&
      !this.state.paused &&
      !this.state.stopping
    ) {
      this.startStopping()
    }

    if (command.paused !== undefined) {
      const wasPaused = this.state.paused
      this.setPaused(command.paused)

      if (this.isViewer && wasPaused && command.paused === false) {
        this._handleViewerUnpause(command)
      }
    }

    if (command.returnToCenter) {
      // _handleViewerPause (called via setPaused above) already starts seekingCenter.
      // Only call returnToCenter if seekingCenter wasn't already started by the pause handler.
      if (this.isViewer && !this.state.seekingCenter) {
        this.returnToCenter()
      } else if (!this.isViewer) {
        this.returnToCenter()
      }
      if (this.options.clientSimulation) {
        this._hasReceivedFirstMovingUpdate = false
      }
    }

    if (command.reset) this.reset()
    if (command.radius !== undefined) this.setBallSize(command.radius)
    if (command.colorBall !== undefined) this.setBallColor(command.colorBall)
    if (command.colorBg !== undefined) this.setBgColor(command.colorBg)
    if (command.ballEmoji !== undefined) this.ball.ballEmoji = command.ballEmoji
    if (typeof command.infinity === 'boolean') {
      const wasInfinity = this.ball.infinity
      this.ball.infinity = command.infinity
      if (!command.infinity && wasInfinity) this._infinityT = 0
    }
    if (command.trackBand !== undefined) this.options.trackBand = command.trackBand
  }

  /**
   * Handles viewer unpause
   * @param {object} command - Command
   * @private
   */
  _handleViewerUnpause(command) {
    if (command.dirX !== undefined || command.dirY !== undefined) {
      const newDx = command.dirX ?? this.state.lastDirection.x ?? 1
      const newDy = command.dirY ?? this.state.lastDirection.y ?? 0
      this.state.lastDirection.x = newDx
      this.state.lastDirection.y = newDy
    }

    if (
      Math.abs(this.state.lastDirection.x || 0) < DIRECTION_EPSILON &&
      Math.abs(this.state.lastDirection.y || 0) < DIRECTION_EPSILON
    ) {
      this.setDirection(1, 0)
    }

    this._updatePredictionBase()
  }

  /**
   * Handles viewer commands
   * @param {object} command - Command
   * @private
   */
  _handleViewerCommand(command) {
    this._handleViewerPositionUpdate(command)
    this._handleViewerVelocityUpdate(command)
    this._handleViewerSpeedUpdate(command)
    this._handleViewerDirectionUpdate(command)
  }

  /**
   * Handles viewer position update
   * @param {object} command - Command
   * @private
   */
  _handleViewerPositionUpdate(command) {
    if (command.x === undefined || command.y === undefined) return

    const cx = clamp(
      command.x,
      this.ball.radius,
      this.options.worldWidth - this.ball.radius
    )
    const cy = clamp(
      command.y,
      this.ball.radius,
      this.options.worldHeight - this.ball.radius
    )

    this.state.targetX = cx
    this.state.targetY = cy

    const serverTime = command.serverTimestamp || command.ts || Date.now()
    const now = performance.now()

    if (this.options.clientSimulation) {
      this._lastServerPos = {
        x: cx,
        y: cy,
        vx: command.vx,
        vy: command.vy,
        ts: now,
        serverTime: serverTime
      }
      return
    }

    if (command.paused === true) {
      this._handleViewerPositionPause()
    } else if (command.paused === false) {
      if (command.vx !== undefined) this.state.lastVx = command.vx
      if (command.vy !== undefined) this.state.lastVy = command.vy
    }
  }

  /**
   * Handles viewer position pause
   * @private
   */
  _handleViewerPositionPause() {
    this.state.allowInterpWhenPaused = false
    this.state.smoothVx = 0
    this.state.smoothVy = 0
    this.state.lastVx = 0
    this.state.lastVy = 0

    if (!this.state.seekingCenter) {
      const dx = this.centerX - this.ball.x
      const dy = this.centerY - this.ball.y

      if (Math.hypot(dx, dy) > this.options.centerSnapThreshold) {
        this.state.seekingCenter = true
        this._seekCenterStart = {
          x: this.ball.x,
          y: this.ball.y,
          ts: performance.now()
        }
      }
    }
  }

  /**
   * Handles viewer velocity update
   * @param {object} command - Command
   * @private
   */
  _handleViewerVelocityUpdate(command) {
    if (this.options.clientSimulation) return

    let newVx = command.vx
    let newVy = command.vy

    if (newVx !== undefined) {
      const wallMargin = this.ball.radius + this.options.bounceWallMargin
      const nearLeftWall = this.ball.x <= wallMargin
      const nearRightWall = this.ball.x >= this.options.worldWidth - wallMargin
      const serverMovingLeft = newVx < 0
      const serverMovingRight = newVx > 0
      const localMovingLeft = this.ball.vx < 0
      const localMovingRight = this.ball.vx > 0

      if (
        (nearLeftWall && serverMovingLeft && localMovingRight) ||
        (nearRightWall && serverMovingRight && localMovingLeft)
      ) {
        newVx = undefined
      }
    }

    if (newVy !== undefined) {
      const wallMargin = this.ball.radius + this.options.bounceWallMargin
      const nearTopWall = this.ball.y <= wallMargin
      const nearBottomWall =
        this.ball.y >= this.options.worldHeight - wallMargin
      const serverMovingUp = newVy < 0
      const serverMovingDown = newVy > 0
      const localMovingUp = this.ball.vy < 0
      const localMovingDown = this.ball.vy > 0

      if (
        (nearTopWall && serverMovingUp && localMovingDown) ||
        (nearBottomWall && serverMovingDown && localMovingUp)
      ) {
        newVy = undefined
      }
    }

    if (newVx !== undefined) this.state.lastVx = newVx
    if (newVy !== undefined) this.state.lastVy = newVy

    const lvx = typeof this.state.lastVx === 'number' ? this.state.lastVx : 0
    const lvy = typeof this.state.lastVy === 'number' ? this.state.lastVy : 0
    const sp = Math.hypot(lvx, lvy)

    if (sp > 0) {
      this.state.lastDirection.x = lvx / sp
      this.state.lastDirection.y = lvy / sp
    }
  }

  /**
   * Handles viewer speed update
   * @param {object} command - Command
   * @private
   */
  _handleViewerSpeedUpdate(command) {
    if (command.speed === undefined) return

    if (!this.state.paused && this.options.clientSimulation && this.ball.speed !== command.speed) {
      this._speedTransition = {
        from: this.ball.speed,
        to: command.speed,
        startTs: performance.now(),
        duration: 100
      }
    }

    this.setSpeed(command.speed)

    if (!this.state.paused) {
      this._updatePredictionBase()
    }
  }

  /**
   * Handles viewer direction update
   * @param {object} command - Command
   * @private
   */
  _handleViewerDirectionUpdate(command) {
    if (command.dirX === undefined && command.dirY === undefined) return

    // Accept direction updates even if moving.
    // Sync by parameters (Client-Side Authority) means we should follow the server's
    // intention, but let local boundary detection handle the exact bounce timing.

    let newDx = command.dirX ?? this.state.lastDirection.x
    let newDy = command.dirY ?? this.state.lastDirection.y

    if (
      Math.abs(newDx) < DIRECTION_EPSILON &&
      Math.abs(newDy) < DIRECTION_EPSILON
    ) {
      if (
        Math.abs(this.state.lastDirection.x) > DIRECTION_EPSILON ||
        Math.abs(this.state.lastDirection.y) > DIRECTION_EPSILON
      ) {
        newDx = this.state.lastDirection.x
        newDy = this.state.lastDirection.y
      } else {
        newDx = 1
        newDy = 0
      }
    }

    this.state.lastDirection.x = newDx
    this.state.lastDirection.y = newDy

    if (this.options.clientSimulation) {
      const pps = calculatePixelsPerSecond(
        this.ball.speed,
        this.options.maxSpeed
      )
      this.ball.vx = newDx * pps
      this.ball.vy = newDy * pps
    }

    if (!this.state.paused) {
      this._updatePredictionBase()
    }
  }

  /**
   * Updates prediction base velocity
   * @private
   */
  _updatePredictionBase() {
    const pps = calculatePixelsPerSecond(
      this._getEffectiveSpeed(),
      this.options.maxSpeed
    )
    const dx = this.state.lastDirection.x || 0
    const dy = this.state.lastDirection.y || 0

    if (dx !== 0 || dy !== 0) {
      this.state.lastVx = dx * pps
      this.state.lastVy = dy * pps

      if (this.options.clientSimulation) {
        this.ball.vx = dx * pps
        this.ball.vy = dy * pps
      }
    }
  }

  /**
   * Handles server commands
   * @param {object} command - Command
   * @private
   */
  _handleServerCommand(command) {
    this._handleServerDirection(command)
    this._handleServerSpeed(command)
    this._handleServerUnpause(command)
  }

  /**
   * Handles server direction
   * @param {object} command - Command
   * @private
   */
  _handleServerDirection(command) {
    if (command.dirX === undefined && command.dirY === undefined) return

    const newDx = command.dirX ?? this.state.lastDirection.x
    const newDy = command.dirY ?? this.state.lastDirection.y
    this.setDirection(newDx, newDy)
  }

  /**
   * Handles server speed
   * @param {object} command - Command
   * @private
   */
  _handleServerSpeed(command) {
    if (command.speed !== undefined) {
      this.setSpeed(command.speed)
    }
  }

  /**
   * Handles server unpause
   * @param {object} command - Command
   * @private
   */
  _handleServerUnpause(command) {
    if (this.ball.infinity) return
    const willBeUnpaused =
      command.paused === false || this.state.paused === false
    if (willBeUnpaused) {
      this._restoreServerVelocity()
    }
  }

  /**
   * Restores server velocity
   * @private
   */
  _restoreServerVelocity() {
    const pps = calculatePixelsPerSecond(
      this.ball.speed,
      this.options.maxSpeed
    )
    let dirX = this.state.lastDirection.x || 0
    let dirY = this.state.lastDirection.y || 0

    if (dirX === 0 && dirY === 0) {
      dirX = 1
      dirY = 0
      this.setDirection(dirX, dirY)
    }

    this.setVelocity(dirX * pps, dirY * pps)
  }
}

module.exports = PhysicsEngine
