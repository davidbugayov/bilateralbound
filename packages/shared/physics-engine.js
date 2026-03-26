'use strict'
/**
 * PhysicsEngine - optimized physics engine for BilateralBound
 * Manages movement, bounces, and ball scaling
 * Optimized for performance and reusability
 */

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_OPTIONS = {
  worldWidth: 800,
  worldHeight: 600,
  ballRadius: 20,
  minSpeed: 50,
  maxSpeed: 5000,
  defaultSpeed: 30,
  bounceWallMargin: 10,
  centerSnapThreshold: 2,
  centerCheckThreshold: 10,
  driftStaleMs: 1500,
  smoothing: {
    driftThresholdPx: 50,
    driftCorrectionMs: 300,
    driftCheckIntervalMs: 3000
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

const DIRECTION_EPSILON = 1e-6
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/
const MAX_RADIUS = 500
const MAX_COMMAND_RADIUS = 1000
const MAX_DIRECTION_ABS = 1.001

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
 * Validates direction component
 * @param {number} value - Direction value
 * @returns {boolean}
 */
function isValidDirection(value) {
  return isFiniteNumber(value) && Math.abs(value) <= MAX_DIRECTION_ABS
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
  if (isValidHexColor(command.colorBall)) validated.colorBall = command.colorBall
  if (isValidHexColor(command.colorBg)) validated.colorBg = command.colorBg

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

/**
 * Checks if direction is vertical (no horizontal component)
 * @param {number} dirX - X direction
 * @returns {boolean}
 */
function isVerticalDirection(dirX) {
  return Math.abs(dirX) < DIRECTION_EPSILON
}

/**
 * Checks if direction is horizontal (no vertical component)
 * @param {number} dirY - Y direction
 * @returns {boolean}
 */
function isHorizontalDirection(dirY) {
  return Math.abs(dirY) < DIRECTION_EPSILON
}

/**
 * Normalizes direction vector
 * @param {number} vx - Velocity X
 * @param {number} vy - Velocity Y
 * @returns {{x: number, y: number}|null}
 */
function normalizeDirection(vx, vy) {
  const speed = Math.hypot(vx, vy)
  if (speed > 0) {
    return { x: vx / speed, y: vy / speed }
  }
  return null
}

// ============================================
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
      colorBall: null
    }

    // Colors
    this.colors = { ...DEFAULT_COLORS }

    // Physics state
    this.state = this._createInitialState()

    // Drift correction state
    this._lastServerPos = null
    this._lastDriftCheckTs = 0
    this._driftCorrection = null
    this._currentJitterMs = 0
    this._seekCenterStart = null

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
      radius: this.options.ballRadius
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
      const pps = calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed)
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

    if (this.state.seekingCenter) {
      this._snapToCenter()
    }

    this.state.seekingCenter = false
    this._seekCenterStart = null

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
   * Public method for returning to center
   */
  returnToCenter() {
    this._resetBallToCenter()
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
   * Updates physics for the given time delta
   * @param {number} deltaTime - Time elapsed since last frame
   */
  update(deltaTime) {
    if (this.isViewer) {
      this._updateViewerPhysics(deltaTime)
    } else {
      this._updateServerPhysics(deltaTime)
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
   */
  handleBoundaryCollisions() {
    const { ball, options, state } = this
    const { radius } = ball
    const { worldWidth, worldHeight } = options

    let bounceSide = null
    const dirX = state.lastDirection.x || 0
    const dirY = state.lastDirection.y || 0

    // Horizontal bounds
    if (ball.x <= radius) {
      ball.x = radius
      if (dirX < 0) {
        state.lastDirection.x = Math.abs(dirX)
        bounceSide = 'left'
      }
    } else if (ball.x >= worldWidth - radius) {
      ball.x = worldWidth - radius
      if (dirX > 0) {
        state.lastDirection.x = -Math.abs(dirX)
        bounceSide = 'right'
      }
    }

    // Vertical bounds
    if (ball.y <= radius) {
      ball.y = radius
      if (dirY < 0) {
        state.lastDirection.y = Math.abs(dirY)
        bounceSide = bounceSide || 'top'
      }
    } else if (ball.y >= worldHeight - radius) {
      ball.y = worldHeight - radius
      if (dirY > 0) {
        state.lastDirection.y = -Math.abs(dirY)
        bounceSide = bounceSide || 'bottom'
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
    const pps = calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed)
    this.ball.vx = this.state.lastDirection.x * pps
    this.ball.vy = this.state.lastDirection.y * pps

    this.ensureMinimumSpeed()

    this.state.lastVx = this.ball.vx
    this.state.lastVy = this.ball.vy

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

    this.bounceCallback({
      side,
      x: this.ball.x,
      y: this.ball.y,
      vx: this.ball.vx,
      vy: this.ball.vy,
      dirX: this.state.lastDirection.x,
      dirY: this.state.lastDirection.y
    })
  }

  /**
   * Dispatches bounce event
   * @param {string} side - Bounce side
   * @private
   */
  _dispatchBounceEvent(side) {
    try {
      if (typeof globalThis !== 'undefined') {
        const ev = new CustomEvent('bb_bounce', {
          detail: {
            side,
            x: this.ball.x,
            y: this.ball.y
          }
        })
        globalThis.dispatchEvent(ev)
      }
    } catch {
      // Silently ignore event dispatch errors
    }
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
      const fallbackDirX = this.ball.x < this.centerX ? 1 : -1
      const fallbackDirY = this.ball.y < this.centerY ? 1 : -1
      this.ball.vx = fallbackDirX * this.options.minSpeed
      this.ball.vy = fallbackDirY * this.options.minSpeed
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
   * Gets interpolated ball position
   * @param {number} [alpha=1] - Interpolation factor (0-1)
   * @returns {object}
   */
  getInterpolatedBall(alpha) {
    const a = clamp(typeof alpha === 'number' ? alpha : 1, 0, 1)

    this._interpBall.x = this._prevPos.x + (this._currPos.x - this._prevPos.x) * a
    this._interpBall.y = this._prevPos.y + (this._currPos.y - this._prevPos.y) * a
    this._interpBall.radius = this.ball.radius
    this._interpBall.colorBall = this.ball.colorBall || null

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
      colorBg: this.colors.bg
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

    const pps = calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed)
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
  }

  // ============================================
  // PRIVATE - PHYSICS UPDATE HELPERS
  // ============================================

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

    if (this.options.clientSimulation) {
      this.updateClientPhysics(deltaTime)
      this._applyDriftCorrection()
      this._checkDriftCorrection()
    } else {
      this.updateClientPhysics(deltaTime)
    }
  }

  /**
   * Updates server physics
   * @param {number} deltaTime - Time delta
   * @private
   */
  _updateServerPhysics(deltaTime) {
    if (this.state.paused) return
    if (!this._worldSizeSet) return

    const speedFactor = this._calculateSpeedFactor()
    if (speedFactor <= 0) {
      this.setPaused(true)
      return
    }

    const pps = calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed) * speedFactor
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
   * @returns {number}
   * @private
   */
  _calculateSpeedFactor() {
    if (!this.state.stopping) return 1.0

    const elapsed = (performance.now() - this.state.stoppingStartTs) / 1000
    const speedFactor = Math.max(0, 1 - elapsed / this.state.stoppingDuration)

    return speedFactor
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
   * Calculates client velocity
   * @returns {{vx: number, vy: number}}
   * @private
   */
  _calculateClientVelocity() {
    const pps = calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed)
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
    const pps = calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed)

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

    const newX = this._seekCenterStart.x + (this.centerX - this._seekCenterStart.x) * ease
    const newY = this._seekCenterStart.y + (this.centerY - this._seekCenterStart.y) * ease

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
   * Checks and applies drift correction
   * @private
   */
  _checkDriftCorrection() {
    if (!this._lastServerPos || this.state.paused) return

    const posAge = performance.now() - this._lastServerPos.ts
    if (posAge > this.options.driftStaleMs) return

    const now = performance.now()
    const checkInterval = this.options.smoothing.driftCheckIntervalMs

    if (this._lastDriftCheckTs && now - this._lastDriftCheckTs < checkInterval) return

    this._lastDriftCheckTs = now

    const dx = this._lastServerPos.x - this.ball.x
    const dy = this._lastServerPos.y - this.ball.y
    const drift = Math.hypot(dx, dy)
    const threshold = this.options.smoothing.driftThresholdPx

    if (drift > threshold) {
      this._driftCorrection = {
        offsetX: dx,
        offsetY: dy,
        startTs: now,
        duration: this.options.smoothing.driftCorrectionMs
      }
    }
  }

  /**
   * Applies drift correction offset
   * @private
   */
  _applyDriftCorrection() {
    if (!this._driftCorrection) return

    const now = performance.now()
    const elapsed = now - this._driftCorrection.startTs
    const t = Math.min(1, elapsed / this._driftCorrection.duration)

    if (t >= 1) {
      this._driftCorrection = null
      return
    }

    const ease = 1 - (1 - t) * (1 - t)
    const correctionFactor = 0.05

    this.ball.x += this._driftCorrection.offsetX * ease * correctionFactor
    this.ball.y += this._driftCorrection.offsetY * ease * correctionFactor
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

    if (command.reset) this.reset()
    if (command.radius !== undefined) this.setBallSize(command.radius)
    if (command.colorBall !== undefined) this.setBallColor(command.colorBall)
    if (command.colorBg !== undefined) this.setBgColor(command.colorBg)
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

    const cx = clamp(command.x, this.ball.radius, this.options.worldWidth - this.ball.radius)
    const cy = clamp(command.y, this.ball.radius, this.options.worldHeight - this.ball.radius)

    this.state.targetX = cx
    this.state.targetY = cy

    if (this.options.clientSimulation) {
      this._lastServerPos = { x: cx, y: cy, ts: performance.now() }
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
      const nearBottomWall = this.ball.y >= this.options.worldHeight - wallMargin
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

    if (this.options.clientSimulation && !this.state.paused) {
      const atCenter =
        Math.abs(this.ball.x - this.centerX) < this.options.centerCheckThreshold &&
        Math.abs(this.ball.y - this.centerY) < this.options.centerCheckThreshold

      if (!atCenter) return
    }

    let newDx = command.dirX ?? this.state.lastDirection.x
    let newDy = command.dirY ?? this.state.lastDirection.y

    if (Math.abs(newDx) < DIRECTION_EPSILON && Math.abs(newDy) < DIRECTION_EPSILON) {
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
      const pps = calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed)
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
    const pps = calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed)
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
    const willBeUnpaused = command.paused === false || this.state.paused === false
    if (willBeUnpaused) {
      this._restoreServerVelocity()
    }
  }

  /**
   * Restores server velocity
   * @private
   */
  _restoreServerVelocity() {
    const pps = calculatePixelsPerSecond(this.ball.speed, this.options.maxSpeed)
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