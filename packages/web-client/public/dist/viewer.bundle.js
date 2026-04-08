/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "../shared/bounce-utils.js"
/*!*********************************!*\
  !*** ../shared/bounce-utils.js ***!
  \*********************************/
(module) {

"use strict";

/**
 * Bounce utilities for BilateralBound
 * Single source of truth for bounce message/event creation.
 * Used by PhysicsEngine, controller, and viewer.
 */

// ============================================
// BOUNCE MESSAGE FACTORY
// ============================================

/**
 * Creates bounce message for WebSocket sync
 * @param {string} side - Bounce side: 'left', 'right', 'top', 'bottom'
 * @param {object} ball - Ball state with x, y
 * @param {object} direction - Direction with x, y
 * @returns {object} Bounce message for sending over network
 */
function createBounceMessage(side, ball, direction) {
  return {
    side,
    x: ball.x,
    y: ball.y,
    dirX: direction.x || 0,
    dirY: direction.y || 0,
    timestamp: Date.now()
  }
}

/**
 * Creates bounce event detail for DOM events
 * @param {string} side - Bounce side
 * @param {object} ball - Ball state with x, y
 * @returns {object} Event detail for CustomEvent
 */
function createBounceEventDetail(side, ball) {
  return {
    side,
    x: ball.x,
    y: ball.y
  }
}

// ============================================
// BOUNCE PHYSICS DATA
// ============================================

/**
 * Creates complete bounce physics data
 * @param {string} side - Bounce side
 * @param {object} ball - Ball state
 * @param {object} direction - Last direction
 * @returns {object} Complete bounce data
 */
function createBouncePhysicsData(side, ball, direction) {
  return {
    side,
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    dirX: direction.x,
    dirY: direction.y
  }
}

// ============================================
// Bounce dispatch helper
// ============================================

/**
 * Dispatches bounce event to DOM
 * @param {string} side - Bounce side
 * @param {object} ball - Ball state
 */
function dispatchBounceEvent(side, ball) {
  try {
    if (typeof globalThis !== 'undefined') {
      const ev = new CustomEvent('bb_bounce', {
        detail: createBounceEventDetail(side, ball)
      })
      globalThis.dispatchEvent(ev)
    }
  } catch {
    // Silently ignore event dispatch errors
  }
}

module.exports = {
  createBounceMessage,
  createBounceEventDetail,
  createBouncePhysicsData,
  dispatchBounceEvent
}


/***/ },

/***/ "../shared/direction-utils.js"
/*!************************************!*\
  !*** ../shared/direction-utils.js ***!
  \************************************/
(module) {

"use strict";

/**
 * Direction utilities for BilateralBound
 * Single source of truth for direction calculations.
 * Used by PhysicsEngine, controller, and viewer.
 */

// Increased from 1e-6 to 1e-4 to prevent micro-drift
// At 1e-6, direction {x: 0.0000001, y: 1.0} is treated as vertical
// but causes visible X-axis drift
const DIRECTION_EPSILON = 1e-4
const MAX_DIRECTION_ABS = 1.001

// ============================================
// DIRECTION CHECKS
// ============================================

/**
 * Checks if direction is effectively vertical (no horizontal component)
 * @param {number} dirX - X direction component (-1 to 1)
 * @returns {boolean}
 */
function isVerticalDirection(dirX) {
  return Math.abs(dirX || 0) < DIRECTION_EPSILON
}

/**
 * Checks if direction is effectively horizontal (no vertical component)
 * @param {number} dirY - Y direction component (-1 to 1)
 * @returns {boolean}
 */
function isHorizontalDirection(dirY) {
  return Math.abs(dirY || 0) < DIRECTION_EPSILON
}

/**
 * Checks if direction is effectively zero (both components near zero)
 * @param {number} dirX - X direction
 * @param {number} dirY - Y direction
 * @returns {boolean}
 */
function isZeroDirection(dirX, dirY) {
  return (
    Math.abs(dirX || 0) < DIRECTION_EPSILON &&
    Math.abs(dirY || 0) < DIRECTION_EPSILON
  )
}

// ============================================
// DIRECTION NORMALIZATION
// ============================================

/**
 * Normalizes velocity to unit direction vector
 * @param {number} vx - Velocity X
 * @param {number} vy - Velocity Y
 * @returns {{x: number, y: number}|null} Unit vector or null if zero
 */
function normalizeDirection(vx, vy) {
  const speed = Math.hypot(vx || 0, vy || 0)
  if (speed > 0) {
    return { x: vx / speed, y: vy / speed }
  }
  return null
}

/**
 * Clamps direction components to valid range (-1.001 to 1.001)
 * @param {number} value - Direction value
 * @returns {boolean} True if value is valid
 */
function isValidDirection(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_DIRECTION_ABS
  )
}

// ============================================
// DIRECTION MODE (for UI)
// ============================================

/**
 * Determines movement mode from direction components
 * @param {number} dirX - X direction
 * @param {number} dirY - Y direction
 * @returns {string|null} 'horizontal', 'vertical', 'diagRL', 'diagRLL', or null
 */
function getDirectionMode(dirX, dirY) {
  const ax = Math.abs(dirX || 0)
  const ay = Math.abs(dirY || 0)

  // Pure modes
  if (ax > 0.9 && ay < 0.2) return 'horizontal'
  if (ay > 0.9 && ax < 0.2) return 'vertical'

  // Dominant axis
  if (ax > ay * 2) return 'horizontal'
  if (ay > ax * 2) return 'vertical'

  // Diagonal modes
  if (dirX > 0 && dirY > 0) return 'diagRL' // Top-left to bottom-right
  if (dirX > 0 && dirY < 0) return 'diagRLL' // Bottom-left to top-right

  return null
}

// ============================================
// AXIS LOCK
// ============================================

/**
 * Applies axis lock for pure vertical/horizontal movement
 * When direction is nearly vertical/horizontal, locks the other axis to zero
 * @param {object} velocity - Velocity object {vx, vy} to modify in-place
 * @param {number} dirX - X direction component
 * @param {number} dirY - Y direction component
 * @param {number} maxSpeed - Maximum pixels per second
 * @returns {object} Modified velocity
 */
function applyAxisLock(velocity, dirX, dirY, maxSpeed) {
  const dx = dirX || 0
  const dy = dirY || 0
  const isVertical = isVerticalDirection(dx) && Math.abs(dy) > 0
  const isHorizontal = isHorizontalDirection(dy) && Math.abs(dx) > 0

  if (isVertical) {
    velocity.vx = 0
    velocity.vy = dy * maxSpeed
  } else if (isHorizontal) {
    velocity.vy = 0
    velocity.vx = dx * maxSpeed
  }

  return velocity
}

// ============================================
// DIRECTION CALCULATION
// ============================================

/**
 * Calculates velocity from direction and speed
 * @param {number} dirX - X direction (-1 to 1)
 * @param {number} dirY - Y direction (-1 to 1)
 * @param {number} speedPercent - Speed as percentage (0-100)
 * @param {number} maxSpeed - Maximum speed in px/s
 * @returns {{vx: number, vy: number, pps: number}}
 */
function calculateVelocity(dirX, dirY, speedPercent, maxSpeed) {
  const pps = (speedPercent / 100) * maxSpeed
  return {
    vx: (dirX || 0) * pps,
    vy: (dirY || 0) * pps,
    pps
  }
}

/**
 * Gets fallback direction when current direction is zero
 * @param {number} x - Current X position
 * @param {number} y - Current Y position
 * @param {number} centerX - World center X
 * @param {number} centerY - World center Y
 * @returns {{x: number, y: number}} Fallback direction
 */
function getFallbackDirection(x, y, centerX, centerY) {
  return {
    x: x < centerX ? 1 : -1,
    y: y < centerY ? 1 : -1
  }
}

module.exports = {
  DIRECTION_EPSILON,
  MAX_DIRECTION_ABS,
  isVerticalDirection,
  isHorizontalDirection,
  isZeroDirection,
  normalizeDirection,
  isValidDirection,
  getDirectionMode,
  applyAxisLock,
  calculateVelocity,
  getFallbackDirection
}


/***/ },

/***/ "../shared/physics-engine.js"
/*!***********************************!*\
  !*** ../shared/physics-engine.js ***!
  \***********************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";

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
} = __webpack_require__(/*! ./direction-utils */ "../shared/direction-utils.js")

const {
  // createBounceMessage — unused, kept for API compatibility
  // createBounceEventDetail — unused, kept for API compatibility
  createBouncePhysicsData,
  dispatchBounceEvent
} = __webpack_require__(/*! ./bounce-utils */ "../shared/bounce-utils.js")

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
    // Base threshold reduced from 60 to 40px for tighter sync at low speeds
    // At 10% speed: was 65px (3.4% of 1920px), now 43px (2.2%)
    driftThresholdPx: 40,
    driftCorrectionMs: 200,
    // Reduced from 50ms to 33ms for more frequent drift checks (~30fps)
    // enables faster response after bounces and smoother edge transitions
    driftCheckIntervalMs: 33,
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
      colorBall: null
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
    this._seekCenterStart = null
    // Spring-damper state for continuous drift correction
    this._springState = { active: false, targetX: 0, targetY: 0, lastDt: 0 }

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

    // Clear drift correction state during pause to prevent conflict with seek-center animation
    this._lastServerPos = null
    this._springState.active = false
    this._springState._desyncStartTs = null

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
    }

    // Vertical bounds — check unless locked to pure horizontal movement
    if (!isPureHorizontal) {
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
    const pps = calculatePixelsPerSecond(
      this.ball.speed,
      this.options.maxSpeed
    )
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
   * Gets interpolated ball position
   * @param {number} [alpha=1] - Interpolation factor (0-1)
   * @returns {object}
   */
  getInterpolatedBall(alpha) {
    const a = clamp(typeof alpha === 'number' ? alpha : 1, 0, 1)

    this._interpBall.x =
      this._prevPos.x + (this._currPos.x - this._prevPos.x) * a
    this._interpBall.y =
      this._prevPos.y + (this._currPos.y - this._prevPos.y) * a
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
   * Calculates client velocity
   * @returns {{vx: number, vy: number}}
   * @private
   */
  _calculateClientVelocity() {
    const pps = calculatePixelsPerSecond(
      this.ball.speed,
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
      this.ball.speed,
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
    // Reduce margin significantly: only disable when ball is actually at the wall
    // was: radius(20) + bounceWallMargin(10) + 5 = 35px
    // now: radius(20) + 2 = 22px (only 2px past the bounce point)
    const margin = this.ball.radius + 2
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

    const posAge = performance.now() - this._lastServerPos.ts
    if (posAge > this.options.driftStaleMs) {
      this._springState.active = false
      return
    }

    // Skip drift correction near walls to prevent fighting with bounce
    if (this._isNearWall()) {
      this._springState.active = false
      return
    }

    const now = performance.now()
    // Check drift more frequently (every 33ms = ~30 fps instead of 50ms) for faster response
    // after bounces and smoother visual transition across edges
    const checkInterval = this.options.smoothing.driftCheckIntervalMs || 33

    if (this._lastDriftCheckTs && now - this._lastDriftCheckTs < checkInterval)
      return

    this._lastDriftCheckTs = now

    const dx = this._lastServerPos.x - this.ball.x
    const dy = this._lastServerPos.y - this.ball.y
    const drift = Math.hypot(dx, dy)

    // Adaptive threshold: base 40px + speed scaling.
    // At speed 30: 40 + 9 = 49px (tighter than before, was 75px)
    // At speed 80: 40 + 24 = 64px (tighter than before, was 100px)
    // This means drift correction activates LESS often for small drifts,
    // letting local physics dominate for smooth movement.
    const baseThreshold = this.options.smoothing.driftThresholdPx || 40
    const speedPercent = this.ball.speed || 30
    const adaptiveThreshold = baseThreshold + speedPercent * 0.3

    // Only activate spring-damper when drift is significant.
    // For minor drift (< threshold), do nothing — local physics is authoritative.
    if (drift > adaptiveThreshold) {
      // Track persistent desync for hard recovery
      if (!this._springState._desyncStartTs) {
        this._springState._desyncStartTs = now
      }
      const desyncDuration = now - this._springState._desyncStartTs

      // Hard snap recovery: if drift > 200px for > 3 seconds, teleport to server
      if (drift > 200 && desyncDuration > 3000) {
        this.ball.x = this._lastServerPos.x
        this.ball.y = this._lastServerPos.y
        this._springState.active = false
        this._springState.driftMagnitude = 0
        this._springState._desyncStartTs = null
        return
      }

      // Activate spring-damper correction
      this._springState.active = true
      this._springState.targetX = this._lastServerPos.x
      this._springState.targetY = this._lastServerPos.y
      this._springState.driftMagnitude = drift
    } else {
      // Drift is within tolerance — deactivate correction, let local physics run
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

    const sm = this.options.smoothing || {}
    const stiffness = sm.stiffness !== undefined ? sm.stiffness : 3
    const damping = sm.damping !== undefined ? sm.damping : 2

    const dx = this._springState.targetX - this.ball.x
    const dy = this._springState.targetY - this.ball.y

    // Combined spring + damping correction in one step
    // Correction = (stiffness * error - damping * velocity) * dt^2
    const factor = dt * dt
    const correctionX = (stiffness * dx - damping * this.ball.vx * dt) * factor
    const correctionY = (stiffness * dy - damping * this.ball.vy * dt) * factor

    // Adaptive maxCorrection based on drift magnitude
    // Increased from 5-15px to 8-25px for faster correction at edges and smoother
    // transition from bounce. This allows the ball to smoothly accelerate away from
    // the wall instead of getting stuck in micro-corrections.
    const driftMag = this._springState.driftMagnitude || 0
    const maxCorrection = driftMag > 100
      ? Math.min(25, 8 + (driftMag - 100) * 0.08)
      : 8

    this.ball.x += clamp(correctionX, -maxCorrection, maxCorrection)
    this.ball.y += clamp(correctionY, -maxCorrection, maxCorrection)
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
        Math.abs(this.ball.x - this.centerX) <
          this.options.centerCheckThreshold &&
        Math.abs(this.ball.y - this.centerY) <
          this.options.centerCheckThreshold

      if (!atCenter) return
    }

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
      this.ball.speed,
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


/***/ },

/***/ "../shared/smoothing-utils.js"
/*!************************************!*\
  !*** ../shared/smoothing-utils.js ***!
  \************************************/
(module) {

"use strict";


/**
 * Shared smoothing utilities for adaptive physics smoothing
 * Used by both viewer and controller
 *
 * ARCHITECTURE NOTE:
 * This module reads base config from BBConfig (globalThis.BBConfig)
 * and applies adaptive adjustments based on network jitter.
 *
 * All formulas use configurable factors from BBConfig rather than hardcoded values.
 * See BBConfig.smoothing for available parameters.
 */

// ============================================
// DEFAULT CONFIG
// ============================================

/**
 * Default smoothing configuration
 * These values are used if BBConfig.smoothing is not defined
 */
const DEFAULT_SMOOTHING_CONFIG = {
  // Base smoothing parameters — aligned with physics-engine.js defaults
  damping: 2, // Matches physics-engine stiffness default
  stiffness: 3, // Matches physics-engine damping default
  maxPredictSec: 0.02, // Max prediction time in seconds
  snapDistance: 0.3, // Snap distance threshold (0.2-0.4)

  // Adaptive factors — how much jitter affects each parameter
  dampingJitterFactor: 20, // jitterMs / factor added to damping
  stiffnessJitterFactor: 30, // jitterMs / factor subtracted from stiffness
  highJitterThreshold: 15 // Threshold for snapDistance increase
  // Removed: exponentialSmoothing, stateBuffering, bufferSize — unused
}

// ============================================
// CONFIG RESOLUTION
// ============================================

/**
 * Resolves smoothing config from BBConfig with fallback to defaults
 * @returns {object} Resolved smoothing configuration
 */
function resolveSmoothingConfig() {
  const globalConfig =
    typeof globalThis !== 'undefined' && globalThis.BBConfig
      ? globalThis.BBConfig.smoothing || globalThis.BBConfig
      : {}

  return { ...DEFAULT_SMOOTHING_CONFIG, ...globalConfig }
}

// ============================================
// ADAPTIVE SMOOTHING CALCULATION
// ============================================

/**
 * Calculates adaptive smoothing options based on network jitter
 *
 * FORMULA EXPLANATION:
 * - damping increases with jitter (more jitter → more smoothing)
 * - stiffness decreases with jitter (more jitter → less aggressive correction)
 * - snapDistance increases when jitter exceeds threshold (wider catch zone)
 *
 * @param {number} jitterMs - Current network jitter in milliseconds
 * @param {object} [customConfig] - Optional overrides for BBConfig values
 * @returns {object} Adaptive smoothing options
 *
 * @example
 * // With default config:
 * // jitter=10: damping = 20 + 10/20 = 20.5
 * // jitter=30: damping = 20 + 30/20 = 21.5
 * // jitter=50: damping = 20 + 50/20 = 22.5 (capped at 25)
 */
function calculateAdaptiveSmoothing(jitterMs, customConfig) {
  const config = customConfig || resolveSmoothingConfig()

  // Extract adaptive factors
  const baseDamping = config.damping || DEFAULT_SMOOTHING_CONFIG.damping
  const baseStiffness = config.stiffness || DEFAULT_SMOOTHING_CONFIG.stiffness
  const dampingFactor =
    config.dampingJitterFactor || DEFAULT_SMOOTHING_CONFIG.dampingJitterFactor
  const stiffnessFactor =
    config.stiffnessJitterFactor ||
    DEFAULT_SMOOTHING_CONFIG.stiffnessJitterFactor
  const highJitterThreshold =
    config.highJitterThreshold || DEFAULT_SMOOTHING_CONFIG.highJitterThreshold
  const baseSnapDistance =
    config.snapDistance || DEFAULT_SMOOTHING_CONFIG.snapDistance

  // Calculate adaptive values with clamping
  // Base values are now 2 (damping) and 3 (stiffness) — aligned with physics-engine.
  // Clamping range widened to allow meaningful adaptation:
  //   damping: 1-8 (good range for spring-damper stability)
  //   stiffness: 1-10 (good range for correction strength)

  // Damping: increases with jitter → more smoothing when network is bad
  const adaptiveDamping = Math.min(
    8, // max clamp
    Math.max(
      1, // min clamp
      baseDamping + jitterMs / dampingFactor
    )
  )

  // Stiffness: decreases with jitter → gentler correction when network is bad
  const adaptiveStiffness = Math.min(
    10, // max clamp
    Math.max(
      1, // min clamp
      baseStiffness - jitterMs / stiffnessFactor
    )
  )

  // Snap distance: increases when jitter is high → wider catch zone
  const adaptiveSnapDistance = Math.min(
    0.4, // max clamp
    Math.max(
      0.2, // min clamp
      baseSnapDistance + (jitterMs > highJitterThreshold ? 0.05 : 0)
    )
  )

  return {
    damping: adaptiveDamping,
    stiffness: adaptiveStiffness,
    maxPredictSec:
      config.maxPredictSec || DEFAULT_SMOOTHING_CONFIG.maxPredictSec,
    snapDistance: adaptiveSnapDistance
  }
}

// ============================================
// PHYSICS ENGINE INTEGRATION
// ============================================

/**
 * Applies adaptive smoothing to physics engine based on network metrics
 *
 * This is the main entry point called from controller.js and viewer.js
 * when net_metrics events are received.
 *
 * @param {object} physicsEngine - PhysicsEngine instance
 * @param {number} jitterMs - Current network jitter in milliseconds
 */
function applyAdaptiveSmoothing(physicsEngine, jitterMs) {
  if (!physicsEngine) return

  // Update jitter metric on the engine (used for drift correction)
  physicsEngine.updateJitter(jitterMs)

  // Calculate adaptive options based on current jitter
  const options = calculateAdaptiveSmoothing(jitterMs)

  // Apply to physics engine
  physicsEngine.setSmoothingOptions(options)
}

// ============================================
// DEBUG HELPERS
// ============================================

/**
 * Gets current smoothing config as human-readable string
 * Useful for debugging/logging
 * @returns {string} Config summary
 */
function getSmoothingConfigString() {
  const config = resolveSmoothingConfig()
  return `SmoothingConfig{damping:${config.damping}, stiffness:${config.stiffness}, maxPredictSec:${config.maxPredictSec}, snapDistance:${config.snapDistance}}`
}

module.exports = {
  DEFAULT_SMOOTHING_CONFIG,
  calculateAdaptiveSmoothing,
  applyAdaptiveSmoothing,
  resolveSmoothingConfig,
  getSmoothingConfigString
}


/***/ },

/***/ "./src/audio/audio-manager.js"
/*!************************************!*\
  !*** ./src/audio/audio-manager.js ***!
  \************************************/
(module) {

"use strict";

/**
 * AudioManager - Handles audio playback for the application.
 * Uses Web Audio API for both synthesized sounds and loaded audio files.
 * Supports multiple sound types with automatic fallback to synthesis.
 */
class AudioManager {
  constructor() {
    this.enabled = false
    this.volume = 0.5
    this.audioContext = null
    this.oscillatorType = 'sine' // sine, square, sawtooth, triangle
    this.frequency = 180 // Hz - low frequency for soft wooden sound
    this.duration = 0.12 // seconds - soft knock duration
    this.soundType = 'soft' // soft (EMDR default), tick, tone, click, bounce, beep
    this.audioBuffers = new Map()
    this.loadingPromises = new Map()
    this.soundFiles = {
      tick: '/sounds/tick.wav',
      click: '/sounds/click.wav',
      bounce: '/sounds/bounce.wav',
      tone: '/sounds/tone.wav',
      beep: '/sounds/beep.wav'
    }
    this.useAudioFiles = true
    this.filesLoaded = false
  }
  /**
   * Initializes the AudioContext. Must be called after a user gesture.
   * @param {boolean} preload - Whether to preload sounds immediately (default: false for lazy loading)
   */
  init(preload = false) {
    if (!this.audioContext) {
      const AudioContext =
        globalThis.AudioContext || globalThis.webkitAudioContext
      if (AudioContext) {
        this.audioContext = new AudioContext()
      } else {
        if (typeof logger !== 'undefined') {
          logger.warn('Web Audio API is not supported in this browser.')
        }
      }
    }
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume().catch((err) => {
        if (typeof logger !== 'undefined') {
          logger.warn('Failed to resume AudioContext:', err)
        }
      })
    }
    // Lazy loading: only preload when explicitly requested or when sound is enabled
    if (preload && this.useAudioFiles && !this.filesLoaded) {
      this.preloadSounds().catch((err) => {
        if (typeof logger !== 'undefined') {
          logger.warn(
            'Failed to load audio files, falling back to synthesis:',
            err
          )
        }
        this.useAudioFiles = false
      })
    }
  }
  /**
   * Загружает звуковой файл и декодирует его в AudioBuffer
   * @param {string} url - URL звукового файла
   * @returns {Promise<AudioBuffer>}
   */
  async loadSound(url) {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized')
    }
    if (this.audioBuffers.has(url)) {
      return this.audioBuffers.get(url)
    }
    if (this.loadingPromises.has(url)) {
      return await this.loadingPromises.get(url)
    }
    const loadPromise = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        return response.arrayBuffer()
      })
      .then((arrayBuffer) => this.audioContext.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        this.audioBuffers.set(url, audioBuffer)
        this.loadingPromises.delete(url)
        return audioBuffer
      })
      .catch((err) => {
        this.loadingPromises.delete(url)
        throw err
      })
    this.loadingPromises.set(url, loadPromise)
    return await loadPromise
  }
  /**
   * Предзагружает все звуковые файлы
   * @returns {Promise<void>}
   */
  async preloadSounds() {
    if (!this.audioContext) {
      return
    }
    logger?.log('🔊 Starting audio files preload...')
    const loadPromises = Object.values(this.soundFiles).map((url) =>
      this.loadSound(url)
        .then(() => true)
        .catch(() => null)
    )
    const results = await Promise.all(loadPromises)
    const loadedCount = results.filter((r) => r === true).length
    this.filesLoaded = loadedCount > 0
    if (loadedCount === Object.keys(this.soundFiles).length) {
      logger?.log(
        `✅ Audio files preloaded: ${loadedCount}/${Object.keys(this.soundFiles).length}`
      )
    } else if (loadedCount > 0) {
      logger?.warn(
        `⚠️ Partially loaded: ${loadedCount}/${Object.keys(this.soundFiles).length} (using synthesis for missing)`
      )
    } else {
      logger?.warn('⚠️ No audio files loaded, using synthesis fallback')
      this.useAudioFiles = false
    }
  }
  setEnabled(enabled) {
    this.enabled = !!enabled
    // Lazy load sounds when user enables sound for the first time
    if (
      enabled &&
      this.useAudioFiles &&
      !this.filesLoaded &&
      this.audioContext
    ) {
      this.preloadSounds().catch((err) => {
        if (typeof logger !== 'undefined') {
          logger.warn('Failed to load audio files:', err)
        }
        this.useAudioFiles = false
      })
    }
  }
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume))
  }
  setSoundType(type) {
    this.soundType = type
    switch (type) {
      case 'tone':
        this.oscillatorType = 'sine'
        this.frequency = 440
        this.duration = 0.15
        break
      case 'click':
        this.oscillatorType = 'square'
        this.frequency = 800
        this.duration = 0.03
        break
      case 'bounce':
        this.oscillatorType = 'sine'
        this.frequency = 220
        this.duration = 0.08
        break
      case 'beep':
        this.oscillatorType = 'sine'
        this.frequency = 880
        this.duration = 0.06
        break
      case 'soft':
        this.oscillatorType = 'sine'
        this.frequency = 180
        this.duration = 0.12
        break
      case 'tick':
      default:
        this.oscillatorType = 'sine'
        this.frequency = 600
        this.duration = 0.05
        break
    }
  }
  /**
   * Plays a tick sound using current or override type.
   * @param {string} [overrideType] - Optional: override the current sound type
   */
  playTick(overrideType) {
    if (!this.enabled || !this.audioContext) {
      return
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {})
      return
    }
    const soundType = overrideType || this.soundType
    if (overrideType && overrideType !== this.soundType) {
      this.setSoundType(overrideType)
    }
    if (this.useAudioFiles && this.filesLoaded) {
      const url = this.soundFiles[soundType]
      if (url && this.audioBuffers.has(url)) {
        this.playBufferedSound(url)
        return
      }
    }
    this.playSynthesizedSound()
  }
  /**
   * Воспроизводит загруженный звук из буфера
   * @param {string} url - URL звукового файла
   */
  playBufferedSound(url) {
    try {
      const buffer = this.audioBuffers.get(url)
      if (!buffer) {
        return
      }
      const source = this.audioContext.createBufferSource()
      const gainNode = this.audioContext.createGain()
      source.buffer = buffer
      gainNode.gain.value = this.volume
      source.connect(gainNode)
      gainNode.connect(this.audioContext.destination)
      source.start()
    } catch (error) {
      if (typeof logger !== 'undefined') {
        logger.error('Error playing buffered sound:', error)
      }
      this.playSynthesizedSound()
    }
  }
  /**
   * Воспроизводит синтезированный звук (оригинальный метод)
   */
  playSynthesizedSound() {
    try {
      if (this.soundType === 'soft') {
        this.playSoftWoodenSound()
        return
      }
      const oscillator = this.audioContext.createOscillator()
      const gainNode = this.audioContext.createGain()
      oscillator.type = this.oscillatorType
      oscillator.frequency.setValueAtTime(
        this.frequency,
        this.audioContext.currentTime
      )
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime)
      gainNode.gain.linearRampToValueAtTime(
        this.volume,
        this.audioContext.currentTime + 0.005
      )
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        this.audioContext.currentTime + this.duration
      )
      oscillator.connect(gainNode)
      gainNode.connect(this.audioContext.destination)
      oscillator.start()
      oscillator.stop(this.audioContext.currentTime + this.duration)
    } catch (error) {
      if (typeof logger !== 'undefined') {
        logger.error('Error playing synthesized sound:', error)
      }
    }
  }
  /**
   * Plays a soft low-frequency thud — default EMDR bilateral stimulation sound.
   * Pure sine sweep (120→60 Hz) with smooth decay. No harsh transients.
   */
  playSoftWoodenSound() {
    try {
      const now = this.audioContext.currentTime
      const duration = 0.16
      const osc = this.audioContext.createOscillator()
      const gain = this.audioContext.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(120, now)
      osc.frequency.exponentialRampToValueAtTime(60, now + duration)
      // Short linear attack to avoid click artifact, then smooth decay
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(this.volume * 0.8, now + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
      osc.connect(gain)
      gain.connect(this.audioContext.destination)
      osc.start(now)
      osc.stop(now + duration)
    } catch (error) {
      if (typeof logger !== 'undefined') {
        logger.error('Error playing soft wooden sound:', error)
      }
    }
  }
}
if (typeof globalThis !== 'undefined') {
  globalThis.AudioManager = AudioManager
}

module.exports = AudioManager


/***/ },

/***/ "./src/common.js"
/*!***********************!*\
  !*** ./src/common.js ***!
  \***********************/
(module) {

"use strict";
/* jshint esversion: 11, asi: true */


/**
 * Common utilities and functions for BilateralBound
 * Упрощенная версия с использованием общих утилит
 */
/**
 * Условное логирование только в режиме разработки.
 * @param {...*} args - Аргументы для логирования.
 */
const debugLog =
  typeof globalThis !== 'undefined' && globalThis.debugLog
    ? globalThis.debugLog
    : () => {}
/**
 * Логирует ошибки в режиме разработки.
 * @param {...*} args - Аргументы для логирования.
 */
const debugError =
  typeof globalThis !== 'undefined' && globalThis.debugError
    ? globalThis.debugError
    : () => {}
/**
 * Логирует предупреждения в режиме разработки.
 * @param {...*} args - Аргументы для логирования.
 */
const debugWarn =
  typeof globalThis !== 'undefined' && globalThis.debugWarn
    ? globalThis.debugWarn
    : () => {}
/**
 * Извлекает ID сессии из URL.
 * @returns {string|null} ID сессии или null, если не найден.
 */
const getSessionIdFromUrl =
  globalThis.CommonUtils?.getSessionIdFromUrl &&
  typeof globalThis.CommonUtils.getSessionIdFromUrl === 'function'
    ? globalThis.CommonUtils.getSessionIdFromUrl
    : function () {
        const path = globalThis.location.pathname
        const parts = path.split('/')
        if ((parts[1] === 'c' || parts[1] === 's') && parts[2]) {
          return parts[2]
        }
        const urlParams = new URLSearchParams(globalThis.location.search)
        return urlParams.get('sessionId')
      }
const toggleFullscreen =
  globalThis.CommonUtils?.toggleFullscreen &&
  typeof globalThis.CommonUtils.toggleFullscreen === 'function'
    ? globalThis.CommonUtils.toggleFullscreen
    : (function () {
        const canFullscreen = () => {
          const docEl = document.documentElement
          return !!(
            docEl.requestFullscreen ||
            docEl.webkitRequestFullscreen ||
            docEl.msRequestFullscreen ||
            docEl.mozRequestFullScreen
          )
        }
        const isFs = () =>
          !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement ||
            document.mozFullScreenElement
          )
        /**
         * Toggles fullscreen mode for a given element or the entire page.
         * Uses the Fullscreen API with fallbacks for different browsers.
         * @param {HTMLElement} [el] - The element to make fullscreen. Defaults to document.documentElement.
         * @returns {Promise<boolean>} A promise that resolves to true if the state changed, false otherwise.
         */
        return async function toggleFullscreen(el) {
          try {
            if (!canFullscreen()) {
              return false
            }
            if (isFs()) {
              const exitFullscreen =
                document.exitFullscreen ||
                document.webkitExitFullscreen ||
                document.msExitFullscreen ||
                document.mozCancelFullScreen
              await exitFullscreen?.call(document)
            } else {
              const target = el || document.documentElement
              const requestFullscreen =
                target.requestFullscreen ||
                target.webkitRequestFullscreen ||
                target.msRequestFullscreen ||
                target.mozRequestFullScreen
              await requestFullscreen?.call(target)
            }
            return true
          } catch (err) {
            debugError('Fullscreen API error:', err)
            return false
          }
        }
      })()
/**
 * Создает throttled-функцию, которая вызывает fn не чаще одного раза за указанный период.
 * @param {Function} fn - Функция для throttling.
 * @param {number} [wait=100] - Период ожидания в миллисекундах.
 * @returns {Function} Новая throttled-функция.
 */
const throttle =
  globalThis.CommonUtils &&
  typeof globalThis.CommonUtils.throttle === 'function'
    ? globalThis.CommonUtils.throttle
    : function throttleImplementation(fn, wait = 100) {
        if (typeof fn !== 'function') {
          return () => {}
        }
        let last = 0
        let timeoutId = null
        let trailingArgs = null
        return function throttled(...args) {
          const now = Date.now()
          const remaining = wait - (now - last)
          trailingArgs = args
          if (remaining <= 0 || remaining > wait) {
            if (timeoutId) {
              clearTimeout(timeoutId)
              timeoutId = null
            }
            last = now
            fn.apply(this, args)
          } else if (timeoutId === null) {
            timeoutId = setTimeout(() => {
              last = Date.now()
              timeoutId = null
              fn.apply(this, trailingArgs)
              trailingArgs = null
            }, remaining)
          }
        }
      }
if (typeof globalThis !== 'undefined') {
  globalThis.debugLog = debugLog
  globalThis.debugError = debugError
  globalThis.debugWarn = debugWarn
  globalThis.getSessionIdFromUrl = getSessionIdFromUrl
  globalThis.toggleFullscreen = toggleFullscreen
  globalThis.throttle = throttle
  globalThis.WS_MSG = Object.freeze({
    controllerUpdate: 'controller_update',
    heartbeat: 'heartbeat',
    initialState: 'initial_state',
    stateUpdate: 'state_update',
    viewerStatus: 'viewer_status',
    viewerAudioActivated: 'viewer_audio_activated',
    netMetrics: 'net_metrics',
    bounceSync: 'bounce_sync'
  })
}
/**
 * Manages the theme (light/dark) of the application.
 * @class ThemeManager
 */
class ThemeManager {
  /**
   * The key used to store the theme preference in localStorage.
   * @type {string}
   * @private
   */
  /**
   * Initializes the ThemeManager
   */
  constructor() {
    this.themeKey = 'bb_theme'
    this.init()
  }
  /**
   * Loads the saved theme and sets up the theme toggle button.
   * @private
   */
  init() {
    this.setupThemeToggle()
    this.loadTheme()
    this.setupThemeChangeListener()
  }
  /**
   * Loads the theme from localStorage and applies it to the body.
   * @private
   */
  loadTheme() {
    const savedTheme = localStorage.getItem(this.themeKey) || 'dark'
    document.body.classList.remove('dark-theme', 'light-theme')
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme')
      this.updateThemeButton('☀️')
    } else {
      document.body.classList.add('dark-theme')
      this.updateThemeButton('🌙')
    }
  }
  /**
   * Cycles through themes: dark -> light -> dark
   */
  toggleTheme() {
    const body = document.body
    const hasLightClass = body.classList.contains('light-theme')
    body.classList.remove('dark-theme', 'light-theme')
    if (hasLightClass) {
      body.classList.add('dark-theme')
      localStorage.setItem(this.themeKey, 'dark')
      this.updateThemeButton('🌙')
    } else {
      body.classList.add('light-theme')
      localStorage.setItem(this.themeKey, 'light')
      this.updateThemeButton('☀️')
    }
    // Notify controller to update viewer links with new theme
    globalThis.dispatchEvent(new CustomEvent('bb_theme_changed'))
  }
  /**
   * Updates the theme toggle button text/icon
   * @private
   */
  updateThemeButton(text) {
    const btn = document.getElementById('themeToggleBtn')
    if (btn) {
      btn.textContent = text
    }
  }
  /**
   * Finds the theme toggle button and attaches a click event listener.
   * @private
   */
  setupThemeToggle() {
    const toggleBtn = document.getElementById('themeToggleBtn')
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleTheme())
    }
  }
  /**
   * Listens for theme changes from WebSocket and updates the UI.
   * @private
   */
  setupThemeChangeListener() {
    globalThis.addEventListener('bb_theme_changed', () => {
      this.loadTheme()
    })
  }
}
/**
 * Копирует текст из элемента в буфер обмена.
 * @param {string} elementId - ID элемента, из которого нужно скопировать текст.
 * @param {string} successMessage - Сообщение, отображаемое при успешном копировании.
 */
async function copy(elementId, successMessage) {
  const element = document.getElementById(elementId)
  if (!element?.value) {
    if (globalThis.showErrorNotification) {
      globalThis.showErrorNotification(
        'Ошибка',
        'Элемент для копирования не найден.'
      )
    } else {
      debugError('Элемент для копирования не найден:', elementId)
    }
    return
  }
  try {
    await navigator.clipboard.writeText(element.value)
    if (globalThis.showSuccessNotification) {
      globalThis.showSuccessNotification(successMessage || 'Текст скопирован!')
    }
  } catch (err) {
    debugError('Ошибка копирования:', err)
    if (globalThis.showErrorNotification) {
      globalThis.showErrorNotification(
        'Ошибка копирования',
        'Не удалось скопировать текст.'
      )
    }
  }
}
/**
 * Navigates the user to the main page.
 */
function goBack() {
  globalThis.location.href = '/'
}
document.addEventListener('DOMContentLoaded', () => {
  globalThis.themeManager = new ThemeManager()
})
if (typeof globalThis !== 'undefined') {
  globalThis.copy = copy
  globalThis.goBack = goBack
}

module.exports = {
  ThemeManager,
  copy,
  goBack,
  getSessionIdFromUrl,
  toggleFullscreen,
  throttle
}


/***/ },

/***/ "./src/config.js"
/*!***********************!*\
  !*** ./src/config.js ***!
  \***********************/
(module) {

"use strict";

if (typeof globalThis !== 'undefined') {
  globalThis.BBConfig = globalThis.BBConfig || {
    rendering: {
      hiddenThrottleMs: 100, // при скрытой вкладке ~10 FPS
      adaptiveFrameRate: true, // Адаптивная частота кадров
      maxFrameTime: 32, // Максимальное время кадра в ms (для предотвращения спирали)
      targetFrameTime: 16 // Целевое время кадра для 60 FPS
    },
    smoothing: {
      // Base parameters (адаптивно меняются через smoothing-utils.js)
      damping: 22, // Base damping (15-25) — чем больше, тем мягче
      stiffness: 28, // Base stiffness (25-35) — чем меньше, тем плавнее
      maxPredictSec: 0.02, // Max prediction time (0.01-0.05)
      snapDistance: 0.3, // Snap distance threshold (0.2-0.4)
      // Adaptive smoothing factors
      dampingJitterFactor: 20, // jitterMs / factor для damping
      stiffnessJitterFactor: 30, // jitterMs / factor для stiffness
      highJitterThreshold: 15, // Порог для snapDistance increase
      // Drift correction
      driftThresholdPx: 50, // Порог дрейфа в пикселях (20-100)
      driftCorrectionMs: 400, // Время коррекции дрейфа (100-500, больше = плавнее)
      driftCheckIntervalMs: 3000, // Интервал проверки дрейфа
      // Legacy flags (сохранены для совместимости)
      predictionEnabled: true, // Включена предикция движения
      adaptiveStiffness: true, // Адаптивная жесткость на основе расстояния
      adaptiveDamping: true, // Адаптивное демпфирование на основе скорости
      exponentialSmoothing: true, // Включено экспоненциальное сглаживание
      stateBuffering: true, // Буферизация состояний для интерполяции
      bufferSize: 10, // Буфер для интерполяции
      smoothingFactor: 0.35, // Коэффициент сглаживания позиции
      velocitySmoothingAlpha: 0.1 // Коэффициент сглаживания скорости
    },
    network: {
      heartbeatInterval: 25000, // 25 секунд
      reconnectDelay: 2000, // Уменьшена задержка для быстрого восстановления
      messageTimeout: 5000, // 5 секунд
      maxReconnectAttempts: 10, // Увеличено количество попыток
      coalesceTypes: ['controller_update'], // Типы сообщений для коалесцирования
      coalesceDelayMs: 8, // Уменьшена задержка для большей плавности
      priorityTypes: ['controller_update', 'heartbeat'] // Приоритетные типы сообщений
    },
    performance: {
      deadReckonEps: 1, // Уменьшен порог dead reckoning для точности
      throttleDelay: 16, // Задержка throttling для 60 FPS
      adaptiveThrottling: true, // Адаптивное throttling
      maxFrameSteps: 3, // Максимальное количество шагов физики за кадр
      stepCapping: true // Включено ограничение шага для предотвращения рывков
    },
    physics: {
      minSpeed: 50, // Минимальная скорость после отскока
      maxSpeed: 5000, // Максимальная скорость
      ballRadius: 20, // Радиус мяча по умолчанию
      worldWidth: 800, // Ширина мира по умолчанию
      worldHeight: 600, // Высота мира по умолчанию
      maxAcceleration: 5000 // Максимальное ускорение для предотвращения рывков
    }
  }

  if ( true && module.exports) {
    module.exports = globalThis.BBConfig
  }
}


/***/ },

/***/ "./src/core/debug-logger.js"
/*!**********************************!*\
  !*** ./src/core/debug-logger.js ***!
  \**********************************/
(module) {

"use strict";
/**
 * @fileoverview Debug Logger - Unified debug logging with query toggle
 * @module utils/debug-logger
 * @version 2.0.0 - Optimized, merged bb-debug functionality
 *
 * Usage:
 *   Add ?debug=1 or ?bbdebug=1 to URL
 *   Example: /v/abc123?debug=1&debug-cat=sync,movement
 *
 * Categories: sync, physics, network, sse, state, command, movement, bounce, audio
 */
/* jshint esversion: 11, browser: true, node: true, boss: true, laxbreak: true, laxcomma: true, unused: false */
/* global globalThis, console, module, Map, Set */

const CATEGORY_COLORS = {
  sync: '#4A9EFF',
  sse: '#FF8C42',
  network: '#52B788',
  physics: '#9D4EDD',
  state: '#F72585',
  command: '#FF006E',
  movement: '#06FFA5',
  bounce: '#C77DFF',
  audio: '#FFD700'
}
class DebugLogger {
  constructor() {
    this.enabled = this._checkDebugMode()
    this.categories = this._getEnabledCategories()
    this.throttles = new Map()
    if (this.enabled) {
      this._logStats()
    }
  }
  _checkDebugMode() {
    if (globalThis.window === undefined) {
      return false
    }
    const params = new URLSearchParams(globalThis.location.search)
    return params.get('debug') === '1' || params.get('bbdebug') === '1'
  }
  _getEnabledCategories() {
    if (!this.enabled) {
      return new Set()
    }
    const params = new URLSearchParams(globalThis.location.search)
    const categories = params.get('debug-cat') || params.get('categories')
    return categories
      ? new Set(categories.split(',').map((c) => c.trim()))
      : new Set(Object.keys(CATEGORY_COLORS))
  }
  _logStats() {
    console.log(
      '%c[DEBUG MODE ENABLED]',
      'background: #0A0; color: white; font-weight: bold; padding: 4px 8px; border-radius: 3px;'
    )
    console.log(
      '📊 Enabled categories:',
      Array.from(this.categories).join(', ')
    )
  }
  _isEnabled(category) {
    return this.enabled && this.categories.has(category)
  }
  _log(category, message, data) {
    if (!this._isEnabled(category)) {
      return
    }
    const color = CATEGORY_COLORS[category] || '#999'
    const time = new Date().toISOString().split('T')[1].slice(0, -1)
    console.log(
      `%c[${category.toUpperCase()}] ${time} - ${message}`,
      `color: ${color}; font-weight: bold;`,
      data ?? ''
    )
  }
  sync(msg, data) {
    this._log('sync', msg, data)
  }
  sse(msg, data) {
    this._log('sse', msg, data)
  }
  physics(msg, data) {
    this._log('physics', msg, data)
  }
  network(msg, data) {
    this._log('network', msg, data)
  }
  state(msg, data) {
    this._log('state', msg, data)
  }
  command(msg, data) {
    this._log('command', msg, data)
  }
  movement(msg, data) {
    this._log('movement', msg, data)
  }
  bounce(msg, data) {
    this._log('bounce', msg, data)
  }
  audio(msg, data) {
    this._log('audio', msg, data)
  }
  throttle(key, intervalMs, category, message, data) {
    const now = Date.now()
    const last = this.throttles.get(key)
    if (last && now - last < intervalMs) {
      return
    }
    this.throttles.set(key, now)
    this._log(category, message, data)
  }
  error(msg, err) {
    console.error(
      `%c[ERROR] ${msg}`,
      'color: #F00; font-weight: bold;',
      err ?? ''
    )
  }
  warn(msg, data) {
    console.warn(
      `%c[WARN] ${msg}`,
      'color: #FA0; font-weight: bold;',
      data ?? ''
    )
  }
  info(msg, data) {
    console.info(
      `%cℹ️ ${msg}`,
      'color: #4A9EFF; font-weight: bold;',
      data ?? ''
    )
  }
  log(msg, data) {
    console.log(msg, data ?? '')
  }
  /**
   * Creates a scoped logger for a specific module
   * @param {string} moduleName - The name of the module
   * @returns {object} Scoped logger object
   * @public
   * @used
   * jshint unused: false
   */
  scope(moduleName) {
    return {
      sync: (msg, data) => this.sync(`[${moduleName}] ${msg}`, data),
      sse: (msg, data) => this.sse(`[${moduleName}] ${msg}`, data),
      physics: (msg, data) => this.physics(`[${moduleName}] ${msg}`, data),
      network: (msg, data) => this.network(`[${moduleName}] ${msg}`, data),
      state: (msg, data) => this.state(`[${moduleName}] ${msg}`, data),
      command: (msg, data) => this.command(`[${moduleName}] ${msg}`, data),
      movement: (msg, data) => this.movement(`[${moduleName}] ${msg}`, data),
      bounce: (msg, data) => this.bounce(`[${moduleName}] ${msg}`, data),
      audio: (msg, data) => this.audio(`[${moduleName}] ${msg}`, data),
      error: (msg, err) => this.error(`[${moduleName}] ${msg}`, err),
      warn: (msg, data) => this.warn(`[${moduleName}] ${msg}`, data),
      info: (msg, data) => this.info(`[${moduleName}] ${msg}`, data),
      log: (msg, data) => this.log(`[${moduleName}] ${msg}`, data)
    }
  }
}
const debugLogger = new DebugLogger()
if ( true && module?.exports) {
  module.exports = debugLogger
}
if (globalThis !== undefined) {
  globalThis.debugLogger = debugLogger
  globalThis.logger = debugLogger
  globalThis.createScopedLogger = (moduleName) => debugLogger.scope(moduleName)
  globalThis.debugLog = (...args) => {
    if (!debugLogger.enabled) {
      return
    }
    if (args.length === 1 && typeof args[0] === 'string') {
      console.log(args[0])
    } else if (args.length === 2) {
      console.log(args[0], args[1])
    } else {
      console.log(...args)
    }
  }
  globalThis.debugError = (...args) => {
    if (!debugLogger.enabled) {
      return
    }
    debugLogger.error(args[0], args[1])
  }
  globalThis.debugWarn = (...args) => {
    if (!debugLogger.enabled) {
      return
    }
    debugLogger.warn(args[0], args[1])
  }
}


/***/ },

/***/ "./src/i18n/constants.js"
/*!*******************************!*\
  !*** ./src/i18n/constants.js ***!
  \*******************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";
/* module decorator */ module = __webpack_require__.nmd(module);

/**
 * @fileoverview Shared i18n constants - Single Source of Truth
 * All language-related constants are defined here to avoid duplication
 * @module constants/i18n-constants
 */

/**
 * List of supported languages
 * @constant {string[]}
 */
const SUPPORTED_LANGUAGES = ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh']

/**
 * Human-readable language names
 * @constant {Object<string, string>}
 */
const LANGUAGE_NAMES = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  ja: '日本語',
  zh: '中文'
}

/**
 * LocalStorage key for language preference
 * @constant {string}
 */
const STORAGE_KEY = 'emdr-language'

/**
 * Default language fallback
 * @constant {string}
 */
const DEFAULT_LANGUAGE = 'en'

/**
 * Check if a language code is supported
 * @param {string} lang - Language code to check
 * @returns {boolean}
 */
function isSupported(lang) {
  return SUPPORTED_LANGUAGES.includes(lang)
}

/**
 * Detect language from domain
 * @returns {string} Language code
 */
function detectFromDomain() {
  // Safe access to location.hostname
  let hostname = 'localhost'
  if (typeof globalThis !== 'undefined' && globalThis.location) {
    hostname = globalThis.location.hostname
  }

  // Check domain for language detection (emdrbilateral is project name, not a typo)
  if (hostname.includes('emdrbilateral.ru')) {
    return 'ru'
  }
  if (hostname.includes('emdrbilateral.online')) {
    return 'en'
  }

  return DEFAULT_LANGUAGE
}

/**
 * Save language preference
 * @param {string} lang - Language code to save
 */
function saveLanguage(lang) {
  // Early return if not supported
  if (!isSupported(lang)) {
    return
  }

  // Save to localStorage if available
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Ignore storage errors
    }
  }
}

// Export constants
const I18nConstants = {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  STORAGE_KEY,
  DEFAULT_LANGUAGE,
  isSupported,
  detectFromDomain,
  saveLanguage
}

// Freeze to prevent accidental mutation
Object.freeze(I18nConstants)
Object.freeze(SUPPORTED_LANGUAGES)
Object.freeze(LANGUAGE_NAMES)

// Export to global scope (browser)
if (typeof globalThis !== 'undefined' && globalThis) {
  globalThis.I18nConstants = I18nConstants
}

// CommonJS export (Node.js)
if ( true && module && module.exports) {
  module.exports = I18nConstants
}

module.exports = I18nConstants


/***/ },

/***/ "./src/i18n/i18n.js"
/*!**************************!*\
  !*** ./src/i18n/i18n.js ***!
  \**************************/
(module) {

/**
 * i18n Configuration
 * Handles multi-language support for Bilateral Bound
 * Uses shared constants from constants/i18n-constants.js when available
 */

// Use shared constants or fallback to inline values
const constants = globalThis.I18nConstants || {
  SUPPORTED_LANGUAGES: ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh'],
  DEFAULT_LANGUAGE: 'en',
  STORAGE_KEY: 'emdr-language',
  detectFromDomain: () => {
    const hostname = typeof location !== 'undefined' ? location.hostname : ''
    if (hostname.includes('emdrbilateral.ru')) return 'ru'
    if (hostname.includes('emdrbilateral.online')) return 'en'
    return 'en'
  }
}

// Simple i18n manager for client-side
const I18n = {
  currentLanguage: constants.DEFAULT_LANGUAGE,
  defaultLanguage: constants.DEFAULT_LANGUAGE,
  translations: {},
  supportedLanguages: constants.SUPPORTED_LANGUAGES,
  isReady: false,
  _readyCallbacks: [],

  ready(callback) {
    if (typeof callback !== 'function') return
    if (this.isReady) {
      callback()
      return
    }
    this._readyCallbacks.push(callback)
  },

  _notifyReady() {
    // Remove anti-flash cloak
    if (typeof document !== 'undefined') {
      const cloak = document.getElementById('i18n-cloak')
      if (cloak) cloak.remove()
      document.documentElement.classList.add('i18n-ready')
    }

    if (this.isReady) return
    this.isReady = true
    while (this._readyCallbacks.length) {
      try {
        const cb = this._readyCallbacks.shift()
        cb()
      } catch (err) {
        // Silently ignore callback errors to prevent initialization blocking
        if (typeof globalThis !== 'undefined' && globalThis.debugError) {
          globalThis.debugError('i18n.ready callback error:', err)
        }
      }
    }
    if (typeof window !== 'undefined' && typeof Event === 'function') {
      // eslint-disable-next-line no-undef
      globalThis.dispatchEvent(new Event('i18nReady'))
    }
  },

  /**
   * Initialize i18n system
   */
  init: async function () {
    this.detectLanguage()
    if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
      globalThis.debugLog('[i18n] Detected language:', this.currentLanguage)
    }

    // Update document language immediately
    if (typeof document !== 'undefined') {
      document.documentElement.lang = this.currentLanguage
      document.documentElement.dataset.lang = this.currentLanguage
    }

    await this.loadTranslations()
    if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
      globalThis.debugLog(
        '[i18n] Translations loaded:',
        Object.keys(this.translations)
      )
    }

    // Apply translations in DOM after loading
    // If DOM is ready, apply immediately, otherwise wait for DOMContentLoaded
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        // DOM is still loading, wait for it
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            this.applyTranslations()
            this._notifyReady()
            // Применяем переводы еще раз с небольшой задержкой для динамически созданных элементов
            setTimeout(() => this.applyTranslations(), 100)
          },
          { once: true }
        )
      } else {
        // DOM is ready, apply now
        this.applyTranslations()
        this._notifyReady()
        // Применяем переводы еще раз с небольшой задержкой для динамически созданных элементов
        setTimeout(() => this.applyTranslations(), 100)
      }
    } else {
      this._notifyReady()
    }
    return this
  },

  /**
   * Detect language from multiple sources
   */
  detectLanguage: function () {
    // 1. Check URL parameter (highest priority)
    const params = new URLSearchParams(
      typeof globalThis !== 'undefined' &&
        globalThis.location &&
        globalThis.location.search
        ? globalThis.location.search
        : ''
    )
    const langParam = params.get('lang')
    if (langParam && this.supportedLanguages.includes(langParam)) {
      this.currentLanguage = langParam
      localStorage.setItem('emdr-language', langParam)
      return
    }

    // 2. Check localStorage (second priority) - сохраненный выбор пользователя
    const savedLang = localStorage.getItem('emdr-language')
    if (savedLang && this.supportedLanguages.includes(savedLang)) {
      this.currentLanguage = savedLang
      return
    }

    // 3. Check browser language
    const browserLang = navigator.language.split('-')[0].toLowerCase()
    if (this.supportedLanguages.includes(browserLang)) {
      this.currentLanguage = browserLang
      localStorage.setItem('emdr-language', browserLang)
      return
    }

    // 4. Check domain (lower priority) - только для новых пользователей без сохраненного выбора
    // Russian domain → Russian language
    // English domain → English language
    const hostname =
      typeof globalThis !== 'undefined' &&
      globalThis.location &&
      globalThis.location.hostname
        ? globalThis.location.hostname
        : ''
    if (hostname.includes('emdrbilateral.ru')) {
      this.currentLanguage = 'ru'
      localStorage.setItem('emdr-language', 'ru')
      return
    } else if (hostname.includes('emdrbilateral.online')) {
      this.currentLanguage = 'en'
      localStorage.setItem('emdr-language', 'en')
      return
    }

    // 5. Fallback to default English
    this.currentLanguage = this.defaultLanguage
    localStorage.setItem('emdr-language', this.defaultLanguage)
  },

  /**
   * Load translations from server.
   * Language is captured at call time to avoid a race condition where
   * currentLanguage changes during the async fetch, which would cause
   * translations for one language to be stored under a different key.
   */
  loadTranslations: async function () {
    // Capture language now — currentLanguage may change while we await the fetch
    const lang = this.currentLanguage
    try {
      const url = `/locales/${lang}/common.json`
      if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
        globalThis.debugLog('[i18n] Loading translations from:', url)
      }
      const response = await fetch(url)
      if (!response.ok) {
        // Log and trigger fallback without throwing (avoids throw-caught-locally lint warning)
        if (typeof globalThis !== 'undefined' && globalThis.debugError) {
          globalThis.debugError(
            `[i18n] Failed to load translations: ${response.statusText}`
          )
        }
        // If not English, switch to en and retry
        if (lang !== 'en') {
          this.currentLanguage = 'en'
          return await this.loadTranslations()
        }
        return false
      }
      this.translations[lang] = await response.json()
      if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
        globalThis.debugLog(
          '[i18n] Successfully loaded translations for:',
          lang
        )
      }
      return true
    } catch (error) {
      if (typeof globalThis !== 'undefined' && globalThis.debugError) {
        globalThis.debugError(
          `[i18n] Failed to load translations: ${error?.message || error}`
        )
      }
      // Fallback: load English if current language fails
      if (lang !== 'en') {
        this.currentLanguage = 'en'
        return await this.loadTranslations()
      }
      return false
    }
  },

  /**
   * Get translation by key with dot notation
   */
  t: function (key, options = {}) {
    // If not ready yet, return key without warning (during initialization)
    if (!this.isReady) {
      return key
    }

    const value = this.getValueByPath(
      this.translations[this.currentLanguage],
      key
    )

    if (!value) {
      // Check if translations object exists at all
      if (!this.translations[this.currentLanguage]) {
        if (typeof globalThis !== 'undefined' && globalThis.debugError) {
          globalThis.debugError(
            `No translations loaded for language: ${this.currentLanguage}`
          )
        }
      } else {
        if (typeof globalThis !== 'undefined' && globalThis.debugWarn) {
          globalThis.debugWarn(
            `Translation missing: ${key} (language: ${this.currentLanguage})`
          )
        }
      }
      return key
    }

    // Auto-inject VERSION from meta tag if placeholder exists
    if (typeof value === 'string' && value.includes('{{VERSION}}')) {
      const versionMeta = document.querySelector('meta[name="version"]')
      const version = versionMeta ? versionMeta.getAttribute('content') : 'dev'
      options.VERSION = `v${version}`
    }

    // Handle interpolation
    if (typeof value === 'string' && Object.keys(options).length > 0) {
      let result = value
      for (const [k, v] of Object.entries(options)) {
        result = result.replace(`{{${k}}}`, v)
      }
      return result
    }

    return value
  },

  /**
   * Get value from nested object using dot notation
   */
  getValueByPath: function (obj, path) {
    if (!obj) return null
    return path.split('.').reduce((current, part) => current?.[part], obj)
  },

  /**
   * Change current language
   */
  changeLanguage: async function (lang) {
    if (!this.supportedLanguages.includes(lang)) {
      if (typeof globalThis !== 'undefined' && globalThis.debugError) {
        globalThis.debugError(`Language '${lang}' is not supported`)
      }
      return false
    }
    this.currentLanguage = lang
    localStorage.setItem('emdr-language', lang)

    // Update document language immediately for accessibility
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
      document.documentElement.dataset.lang = lang
    }

    // Attempt to load translations; do not throw on failure, just return boolean
    const ok = await this.loadTranslations()
    if (ok) {
      this.applyTranslations()
    } else {
      // If translations failed to load, still try to apply whatever is available
      this.applyTranslations()
    }

    // Notify listeners that language has changed so pages can react (e.g., update titles/meta)
    try {
      if (typeof CustomEvent === 'function') {
        globalThis.dispatchEvent(
          new CustomEvent('i18nLanguageChanged', { detail: { lang } })
        )
      } else {
        // Fallback for very old environments
        // eslint-disable-next-line no-undef
        globalThis.dispatchEvent(new Event('i18nLanguageChanged'))
      }
    } catch (err) {
      if (typeof globalThis !== 'undefined' && globalThis.debugWarn) {
        globalThis.debugWarn(
          'Failed to dispatch i18nLanguageChanged event',
          err
        )
      }
    }

    return !!ok
  },

  /**
   * Alias for changeLanguage for API consistency
   * Used when receiving language updates from server
   */
  setLanguage: async function (lang) {
    return this.changeLanguage(lang)
  },

  /**
   * Apply translations to DOM elements with data-i18n or data-i18n-attr attributes.
   * - elements with `data-i18n` will have their textContent replaced
   * - elements with `data-i18n-attr` will set attributes, e.g. data-i18n-attr="placeholder:home.placeholder"
   */
  applyTranslations: function () {
    try {
      const translations = this.translations[this.currentLanguage]
      if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
        globalThis.debugLog(
          '[i18n] Applying translations for language:',
          this.currentLanguage
        )
      }

      // Check if translations are loaded
      if (!translations || Object.keys(translations).length === 0) {
        if (typeof globalThis !== 'undefined' && globalThis.debugWarn) {
          globalThis.debugWarn(
            '[i18n] Translations not loaded yet, skipping applyTranslations'
          )
        }
        return
      }

      // Helper to get translation by key
      const get = (key) => {
        if (!key) return null
        let value = this.getValueByPath(translations, key)

        // Auto-inject VERSION from meta tag if placeholder exists
        if (typeof value === 'string' && value.includes('{{VERSION}}')) {
          const versionMeta = document.querySelector('meta[name="version"]')
          const version = versionMeta
            ? versionMeta.getAttribute('content')
            : 'dev'
          value = value.replace('{{VERSION}}', `v${version}`)
        }

        return value
      }

      // Replace textContent for data-i18n
      const nodes = document.querySelectorAll('[data-i18n]')
      if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
        globalThis.debugLog(
          '[i18n] Found',
          nodes.length,
          'elements with data-i18n attribute'
        )
      }
      nodes.forEach((node) => {
        const key = node.getAttribute('data-i18n')
        const value = get(key)
        if (
          value !== null &&
          value !== undefined &&
          typeof value !== 'object'
        ) {
          // Проверяем, содержит ли перевод HTML-теги
          if (
            typeof value === 'string' &&
            (value.includes('<') || value.includes('>'))
          ) {
            // Если в переводе есть HTML, используем innerHTML
            node.innerHTML = value
          } else {
            // Иначе используем textContent для безопасности
            node.textContent = value
          }
        } else if (value === null || value === undefined) {
          if (typeof globalThis !== 'undefined' && globalThis.debugWarn) {
            globalThis.debugWarn('[i18n] Missing translation for key:', key)
          }
        }
      })

      // Handle attributes: data-i18n-attr="attrName:key.path;attr2:key2"
      const attrNodes = document.querySelectorAll('[data-i18n-attr]')
      attrNodes.forEach((node) => {
        const spec = node.getAttribute('data-i18n-attr')
        if (!spec) return
        // split by ; for multiple attr mappings
        spec.split(';').forEach((part) => {
          const [attr, key] = part.split(':').map((s) => s && s.trim())
          if (!attr || !key) return
          const value = get(key)
          if (value != null && typeof attr === 'string') {
            node.setAttribute(attr, value)
          }
        })
      })
    } catch (err) {
      if (typeof globalThis !== 'undefined' && globalThis.debugError) {
        globalThis.debugError('i18n.applyTranslations error:', err)
      }
    }
  }
}

// Export for CommonJS or attach to root
if ( true && module.exports) {
  module.exports = I18n
} else {
  globalThis.i18n = I18n
}

// Auto-initialize i18n IMMEDIATELY to prevent FOUC
// We need to start initialization as early as possible
if (typeof globalThis !== 'undefined' && globalThis.document) {
  // Start initialization immediately, don't wait for DOMContentLoaded
  I18n.init().catch((err) => {
    if (typeof globalThis !== 'undefined' && globalThis.debugError) {
      globalThis.debugError('Failed to initialize i18n:', err)
    }
  })
}
globalThis.i18n = I18n

module.exports = I18n


/***/ },

/***/ "./src/i18n/language-selector.js"
/*!***************************************!*\
  !*** ./src/i18n/language-selector.js ***!
  \***************************************/
(module) {

"use strict";


/**
 * Language Selector Manager with i18n Integration
 * Handles multi-language switching and page content translation
 * Uses shared constants from constants/i18n-constants.js
 */

const LanguageSelector = (function () {
  // Use shared constants or fallback to inline values (for backwards compatibility)
  const constants = globalThis.I18nConstants || {
    LANGUAGE_NAMES: {
      en: 'English',
      ru: 'Русский',
      es: 'Español',
      fr: 'Français',
      de: 'Deutsch',
      pt: 'Português',
      ja: '日本語',
      zh: '中文'
    },
    SUPPORTED_LANGUAGES: ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh'],
    STORAGE_KEY: 'emdr-language',
    isSupported: (lang) => constants.SUPPORTED_LANGUAGES.includes(lang),
    saveLanguage: (lang) => {
      try {
        localStorage.setItem(constants.STORAGE_KEY, lang)
      } catch {
        /* ignore */
      }
    }
  }

  const languageNames = constants.LANGUAGE_NAMES
  const supportedLanguages = new Set(constants.SUPPORTED_LANGUAGES)

  function init() {
    const btn = document.getElementById('languageSelectorBtn')
    const dropdown = document.getElementById('languageDropdown')
    const options = document.querySelectorAll('.language-option')

    if (!btn || !dropdown || options.length === 0) {
      return
    }

    const currentLang = detectCurrentLanguage()
    updateCurrentLanguage(currentLang)

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const isHidden = dropdown.hasAttribute('hidden')
      if (isHidden) {
        dropdown.removeAttribute('hidden')
        btn.setAttribute('aria-expanded', 'true')
      } else {
        dropdown.setAttribute('hidden', '')
        btn.setAttribute('aria-expanded', 'false')
      }
    })

    for (const option of options) {
      option.addEventListener('click', (e) => {
        e.preventDefault()
        const lang = option.dataset.lang
        changeLanguage(lang)
        dropdown.setAttribute('hidden', '')
        btn.setAttribute('aria-expanded', 'false')
      })

      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          const lang = option.dataset.lang
          changeLanguage(lang)
          dropdown.setAttribute('hidden', '')
          btn.setAttribute('aria-expanded', 'false')
        } else if (e.key === 'Escape') {
          dropdown.setAttribute('hidden', '')
          btn.setAttribute('aria-expanded', 'false')
          btn.focus()
        }
      })
    }

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.setAttribute('hidden', '')
        btn.setAttribute('aria-expanded', 'false')
      }
    })

    document.addEventListener('keydown', (e) => {
      if (btn.getAttribute('aria-expanded') === 'true') {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const activeOption = dropdown.querySelector('[role="option"]:focus')
          const allOptions = Array.from(
            dropdown.querySelectorAll('[role="option"]')
          )
          const currentIndex = activeOption
            ? allOptions.indexOf(activeOption)
            : -1
          const nextIndex = (currentIndex + 1) % allOptions.length
          allOptions[nextIndex].focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          const activeOption = dropdown.querySelector('[role="option"]:focus')
          const allOptions = Array.from(
            dropdown.querySelectorAll('[role="option"]')
          )
          const currentIndex = activeOption
            ? allOptions.indexOf(activeOption)
            : 0
          const prevIndex =
            currentIndex === 0 ? allOptions.length - 1 : currentIndex - 1
          allOptions[prevIndex].focus()
        }
      }
    })
  }

  function detectCurrentLanguage() {
    const params = new URLSearchParams(globalThis.location.search)
    const langParam = params.get('lang')
    if (langParam && supportedLanguages.has(langParam)) {
      localStorage.setItem('emdr-language', langParam)
      return langParam
    }

    const savedLang = localStorage.getItem('emdr-language')
    if (savedLang && supportedLanguages.has(savedLang)) {
      return savedLang
    }

    const browserLang = navigator.language.split('-')[0].toLowerCase()
    if (supportedLanguages.has(browserLang)) {
      localStorage.setItem('emdr-language', browserLang)
      return browserLang
    }

    // Default to English if no match found
    localStorage.setItem('emdr-language', 'en')
    return 'en'
  }

  function updateCurrentLanguage(lang) {
    const label = document.getElementById('currentLanguageLabel')
    const options = document.querySelectorAll('.language-option')

    if (label) {
      // Получаем название языка из i18n, если доступно и перевод существует
      const langNameKey = `common.lang.${lang}`
      let translatedName = null
      if (globalThis.i18n?.t) {
        const result = globalThis.i18n.t(langNameKey)
        // Проверяем, что перевод не вернул сам ключ (что означает отсутствие перевода)
        if (result && result !== langNameKey) {
          translatedName = result
        }
      }
      // Используем перевод или fallback на hardcoded languageNames
      label.textContent = translatedName || languageNames[lang] || lang
    }

    for (const option of options) {
      const optionLang = option.dataset.lang
      if (optionLang === lang) {
        option.classList.add('language-option--active')
        option.setAttribute('aria-selected', 'true')
      } else {
        option.classList.remove('language-option--active')
        option.setAttribute('aria-selected', 'false')
      }
    }

    document.documentElement.lang = lang
  }

  /**
   * Safe setter for i18n language across different implementations.
   * Tries async changeLanguage(lang) -> sync setLanguage(lang) -> direct assignment.
   * Returns a Promise that resolves to true/false depending on success.
   */
  async function safeSetI18nLanguage(lang) {
    const ii = globalThis?.i18n
    if (!ii) return false

    // Prefer async changeLanguage if available
    if (typeof ii.changeLanguage === 'function') {
      try {
        const res = await Promise.resolve(ii.changeLanguage(lang))
        return !!res
      } catch {
        // Fallback to next option
      }
    }

    // Fallback: if a legacy synchronous setLanguage exists, call it but guard errors
    if (typeof ii.setLanguage === 'function') {
      try {
        const res = ii.setLanguage(lang)
        return !!res
      } catch {
        // Fallback to next option
      }
    }

    // Last resort: set property directly if present
    if (ii.currentLanguage !== undefined) {
      try {
        ii.currentLanguage = lang
        if (typeof ii.applyTranslations === 'function') {
          try {
            ii.applyTranslations()
          } catch {
            /* ignore */
          }
        }
        // Emit language change event for fallback path
        try {
          if (typeof CustomEvent === 'function') {
            globalThis.dispatchEvent(
              new CustomEvent('i18nLanguageChanged', { detail: { lang } })
            )
          } else if (typeof Event === 'function') {
            // eslint-disable-next-line no-undef
            globalThis.dispatchEvent(new Event('i18nLanguageChanged'))
          }
        } catch {
          /* ignore event dispatch errors */
        }
        return true
      } catch {
        return false
      }
    }

    return false
  }

  function changeLanguage(lang) {
    if (!supportedLanguages.has(lang)) {
      return
    }

    // Сохраняем выбор
    localStorage.setItem('emdr-language', lang)

    // Обновляем UI селектора языка
    updateCurrentLanguage(lang)

    // Обновляем i18n - это автоматически обновит все элементы с data-i18n
    safeSetI18nLanguage(lang)
      .then((ok) => {
        if (ok) {
          // Обновляем title страницы
          if (globalThis.i18n?.t) {
            document.title = globalThis.i18n.t('home.title')
          }
        }
      })
      .catch(() => {
        // Silently fail
      })

    // Обновляем URL
    const url = new URL(globalThis.location.href)
    url.searchParams.set('lang', lang)
    globalThis.history.replaceState({}, '', url)

    // Синхронизируем язык с Viewer через API (только для Controller)
    if (globalThis.location.pathname.includes('/c/')) {
      const sessionId =
        globalThis.getSessionIdFromUrl?.() || extractSessionIdFromUrl()
      if (sessionId) {
        syncLanguageToViewer(sessionId, lang).catch((err) => {
          console.warn(
            '[LanguageSelector] Failed to sync language to Viewer:',
            err.message
          )
        })
      }
    }
  }

  /**
   * Extract sessionId from URL path
   */
  function extractSessionIdFromUrl() {
    const match = globalThis.location.pathname.match(/\/[cv]\/([a-f0-9]+)/)
    return match ? match[1] : null
  }

  /**
   * Sync language to Viewer via API
   */
  async function syncLanguageToViewer(sessionId, language) {
    try {
      const response = await globalThis.csrfFetch(`/api/session/${sessionId}/language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log(
        '[LanguageSelector] ✅ Language synced to Viewer:',
        data.language
      )
    } catch (error) {
      console.error('[LanguageSelector] ❌ Failed to sync language:', error)
      throw error
    }
  }

  return {
    init
  }
})();

// Инициализируем после готовности i18n и DOM
(function () {
  if (globalThis?.window === undefined) return

  let initialized = false
  let domListenerAdded = false

  const initSelector = () => {
    if (initialized) return
    initialized = true
    LanguageSelector.init()
  }

  // Если i18n уже готов, инициализируем сразу
  if (globalThis.i18n?.isReady) {
    if (document.readyState === 'loading') {
      if (!domListenerAdded) {
        domListenerAdded = true
        document.addEventListener('DOMContentLoaded', initSelector, {
          once: true
        })
      }
    } else {
      initSelector()
    }
  } else {
    // Ждем события i18nReady
    globalThis.addEventListener(
      'i18nReady',
      () => {
        if (document.readyState === 'loading') {
          if (!domListenerAdded) {
            domListenerAdded = true
            document.addEventListener('DOMContentLoaded', initSelector, {
              once: true
            })
          }
        } else {
          initSelector()
        }
      },
      { once: true }
    )

    // Fallback на случай если событие не сработает
    setTimeout(() => {
      if (!initialized) {
        if (document.readyState === 'loading') {
          if (!domListenerAdded) {
            domListenerAdded = true
            document.addEventListener('DOMContentLoaded', initSelector, {
              once: true
            })
          }
        } else {
          initSelector()
        }
      }
    }, 2000)
  }
})()

// Expose globally for debugging
if (typeof globalThis !== 'undefined') {
  globalThis.LanguageSelector = LanguageSelector
}

module.exports = LanguageSelector


/***/ },

/***/ "./src/network/csrf.js"
/*!*****************************!*\
  !*** ./src/network/csrf.js ***!
  \*****************************/
(module) {

"use strict";
/**
 * CSRF token helper for double-submit cookie pattern.
 * Reads the csrfToken cookie and returns it for use in X-CSRF-Token header.
 */


/**
 * Get CSRF token from the cookie.
 * @returns {string|null} The CSRF token or null if not found.
 */
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Fetch wrapper that automatically adds the CSRF token header.
 * @param {string} url - The URL to fetch.
 * @param {object} [options={}] - Fetch options.
 * @returns {Promise<Response>} The fetch response.
 */
async function csrfFetch(url, options = {}) {
  const token = getCsrfToken()
  if (token) {
    options.headers = {
      ...options.headers,
      'X-CSRF-Token': token
    }
  }
  return fetch(url, options)
}

module.exports = { getCsrfToken, csrfFetch }

// Expose on globalThis for use in bundled code
if (typeof globalThis !== 'undefined') {
  globalThis.csrfFetch = csrfFetch
  globalThis.getCsrfToken = getCsrfToken
}


/***/ },

/***/ "./src/network/realtime-client.js"
/*!****************************************!*\
  !*** ./src/network/realtime-client.js ***!
  \****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";
/**
 * RealtimeClient - WebSocket transport wrapper
 */


const WebSocketClient = __webpack_require__(/*! ./websocket-client */ "./src/network/websocket-client.js")

class RealtimeClient {
  constructor(sessionId, role, options = {}) {
    this.sessionId = sessionId
    this.role = role
    this.transportType = 'websocket'
    this.client = new WebSocketClient(sessionId, role, options)
  }
  async connect() {
    return this.client.connect()
  }
  async send(type, payload, options = {}) {
    return this.client.send(type, payload, options)
  }
  on(eventType, handler) {
    this.client.on(eventType, handler)
  }
  off(eventType, handler) {
    this.client.off(eventType, handler)
  }
  close() {
    this.client.close()
  }
  get isConnected() {
    return this.client.isConnected
  }
  getStats() {
    return {
      ...this.client.getStats(),
      transportType: this.transportType
    }
  }
  getTransportType() {
    return this.transportType
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.RealtimeClient = RealtimeClient
}

module.exports = RealtimeClient


/***/ },

/***/ "./src/network/websocket-client.js"
/*!*****************************************!*\
  !*** ./src/network/websocket-client.js ***!
  \*****************************************/
(module) {

"use strict";
/**
 * WebSocketClient - Модернизированный клиент для WebSocket соединений
 * Использует современные возможности JavaScript для лучшей надежности
 */


class WebSocketClient {
  constructor(sessionId, role, options = {}) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error(
        'Valid sessionId (string) is required for WebSocket connection'
      )
    }
    if (!role || !['controller', 'viewer'].includes(role)) {
      throw new Error(
        'Valid role ("controller" or "viewer") is required for WebSocket connection'
      )
    }
    const globalConfig = globalThis.BBConfig?.network || {}
    this.config = {
      isSecure: globalThis.location.protocol === 'https:',
      maxReconnectAttempts: globalConfig.maxReconnectAttempts || 50,
      reconnectInterval: globalConfig.reconnectDelay || 3000,
      heartbeatInterval: globalConfig.heartbeatInterval || 25000,
      messageTimeout: globalConfig.messageTimeout || 5000,
      coalesceTypes: globalConfig.coalesceTypes || ['controller_update'],
      coalesceDelayMs: globalConfig.coalesceDelayMs || 16, // ~60fps
      ...options
    }
    this.sessionId = sessionId
    this.role = role
    this.ws = null
    this.isConnected = false
    this.isConnecting = false
    this.eventHandlers = new Map()
    this.pendingMessages = new Map()
    this.messageIdCounter = 0
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.messageTimeouts = new Map()
    this._coalesceBuffers = new Map() // type -> latest payload
    this._coalesceTimers = new Map() // type -> timer id
    this.url = this._generateWebSocketUrl()
    this._stats = {
      messagesSent: 0,
      messagesReceived: 0,
      reconnectCount: 0,
      lastActivity: Date.now(),
      rttMs: 0,
      jitterMs: 0,
      _lastRttSamples: []
    }
  }
  _generateWebSocketUrl() {
    const protocol = this.config.isSecure ? 'wss:' : 'ws:'
    const host = globalThis.location.host
    const url = new URL(`${protocol}//${host}`)
    url.searchParams.set('sessionId', this.sessionId)
    url.searchParams.set('role', this.role)
    return url.toString()
  }
  /**
   * Подключение к WebSocket серверу
   */
  async connect() {
    if (this.isConnected || this.isConnecting) {
      this.log('Connection already in progress or established')
      return
    }
    return new Promise((resolve, reject) => {
      this.isConnecting = true
      this.log(`Connecting to ${this.url}`)
      try {
        this.ws = new WebSocket(this.url)
        this._setupEventHandlers()
        const connectionTimeout = setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false
            this.ws?.close()
            reject(new Error('Connection timeout'))
          }
        }, 10000)
        this.ws.onopen = () => {
          clearTimeout(connectionTimeout)
          this._handleConnectionSuccess()
          resolve()
        }
        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this._handleConnectionError(error)
          reject(new Error('WebSocket connection failed'))
        }
      } catch (error) {
        this.isConnecting = false
        reject(new Error(`WebSocket connection failed: ${error.message}`))
      }
    })
  }
  /**
   * Улучшенная отправка с приоритетами и буферизацией
   */
  async send(type, payload, options = {}) {
    if (!this.isConnected) {
      throw new Error('WebSocket is not connected')
    }
    const priorityTypes = ['controller_update', 'heartbeat']
    const isPriority = priorityTypes.includes(type)
    if (isPriority) {
      const messageId = ++this.messageIdCounter
      const message = {
        id: messageId,
        type,
        payload,
        timestamp: Date.now(),
        priority: true
      }
      return this._sendWithResponse(message, type, options)
    } else if (
      this.config.coalesceTypes.includes(type) &&
      !options.expectResponse
    ) {
      this._coalesceMessage(type, payload)
    } else {
      const messageId = ++this.messageIdCounter
      const message = { id: messageId, type, payload, timestamp: Date.now() }
      return this._sendWithResponse(message, type, options)
    }
  }
  _sendWithResponse(message, type, options) {
    if (options.expectResponse) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingMessages.delete(message.id)
          reject(new Error(`Message timeout: ${type}`))
        }, this.config.messageTimeout)
        this.pendingMessages.set(message.id, { resolve, reject, timeout })
        this._sendMessage(message)
      })
    } else {
      this._sendMessage(message)
    }
  }
  _coalesceMessage(type, payload) {
    this._coalesceBuffers.set(type, payload)
    if (!this._coalesceTimers.has(type)) {
      const timerId = setTimeout(() => {
        const latest = this._coalesceBuffers.get(type)
        this._coalesceBuffers.delete(type)
        this._coalesceTimers.delete(type)
        const coalescedMessage = {
          id: ++this.messageIdCounter,
          type,
          payload: latest,
          timestamp: Date.now(),
          batched: true
        }
        try {
          this._sendMessage(coalescedMessage)
        } catch (e) {
          this.log(`Coalesced send failed: ${e.message}`, 'warning')
        }
      }, this.config.coalesceDelayMs)
      this._coalesceTimers.set(type, timerId)
    }
  }
  /**
   * Регистрация обработчика события
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType).push(handler)
  }
  off(eventType, handler) {
    const handlers = this.eventHandlers.get(eventType)
    if (!handlers) return
    const idx = handlers.indexOf(handler)
    if (idx !== -1) handlers.splice(idx, 1)
  }
  close() {
    this._clearTimers()
    if (this.ws) {
      this.ws.onclose = null // prevent reconnect on intentional close
      this.ws.close(1000, 'Client closed')
      this.ws = null
    }
    this.isConnected = false
    this.isConnecting = false
  }
  getStats() {
    return {
      messagesSent: this._stats.messagesSent,
      messagesReceived: this._stats.messagesReceived,
      reconnectCount: this._stats.reconnectCount,
      lastActivity: this._stats.lastActivity,
      rttMs: this._stats.rttMs,
      jitterMs: this._stats.jitterMs
    }
  }
  _setupEventHandlers() {
    this.ws.onmessage = this._handleMessage.bind(this)
    this.ws.onclose = this._handleClose.bind(this)
    this.ws.onerror = this._handleError.bind(this)
  }
  _handleConnectionSuccess() {
    this.isConnected = true
    this.isConnecting = false
    const isReconnection = this._stats.reconnectCount > 0
    this._stats.reconnectCount = 0
    this._stats.lastActivity = Date.now()
    this._startHeartbeat()
    this._emit('open', {
      sessionId: this.sessionId,
      role: this.role,
      isReconnection
    })
    this.log(
      'Connected successfully' + (isReconnection ? ' (reconnected)' : '')
    )
  }
  _handleConnectionError(error) {
    this._emit('error', { error, type: 'connection' })
    this._scheduleReconnect()
  }
  _handleMessage(event) {
    try {
      const message = JSON.parse(event.data)
      this._stats.messagesReceived++
      this._stats.lastActivity = Date.now()
      if (this._handlePendingMessage(message)) return
      this._emit(message.type, message.payload)
      this._emit('message', message)
      if (message?.timestamp) {
        this._updateNetworkMetrics(message.timestamp)
      }
    } catch (error) {
      this.log(`Failed to parse message: ${error.message}`, 'error')
      this._emit('error', { error, type: 'parse', rawData: event.data })
    }
  }
  _handlePendingMessage(message) {
    if (!message.id || !this.pendingMessages.has(message.id)) return false
    const pending = this.pendingMessages.get(message.id)
    clearTimeout(pending.timeout)
    this.pendingMessages.delete(message.id)
    pending.resolve(message.payload)
    return true
  }
  _updateNetworkMetrics(timestamp) {
    const now = performance.now()
    const rtt = Math.max(0, now - timestamp)
    this._stats._lastRttSamples.push(rtt)
    if (this._stats._lastRttSamples.length > 20) {
      this._stats._lastRttSamples.shift()
    }
    const n = this._stats._lastRttSamples.length
    const avg = this._stats._lastRttSamples.reduce((a, b) => a + b, 0) / n
    const variance =
      this._stats._lastRttSamples.reduce(
        (a, b) => a + Math.pow(b - avg, 2),
        0
      ) / n
    const jitter = Math.sqrt(variance)
    this._stats.rttMs = Math.round(avg)
    this._stats.jitterMs = Math.round(jitter)
    this._emit('net_metrics', {
      rttMs: this._stats.rttMs,
      jitterMs: this._stats.jitterMs
    })
  }
  _handleClose(event) {
    this.isConnected = false
    this._clearTimers()
    this._emit('close', event)
    if (event.code !== 1000) {
      this._scheduleReconnect()
    }
  }
  _handleError(error) {
    this._emit('error', { error, type: 'websocket' })
  }
  _scheduleReconnect() {
    if (this._stats.reconnectCount >= this.config.maxReconnectAttempts) {
      this.log('Max reconnection attempts reached', 'error')
      this._emit('maxReconnectAttemptsReached')
      return
    }
    this._stats.reconnectCount++
    const delay =
      this.config.reconnectInterval *
      Math.pow(1.5, this._stats.reconnectCount - 1)
    this.log(
      `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this._stats.reconnectCount})`
    )
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        this._scheduleReconnect()
      })
    }, delay)
  }
  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send('heartbeat', { timestamp: Date.now() }).catch((err) => {
          this.log(`Heartbeat failed: ${err.message}`, 'warning')
        })
      }
    }, this.config.heartbeatInterval)
  }
  _sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
      this._stats.messagesSent++
    } else {
      throw new Error('WebSocket is not connected')
    }
  }
  _emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch (error) {
          this.log(
            `Error in event handler for ${eventType}: ${error.message}`,
            'error'
          )
        }
      }
    }
  }
  _clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    for (const timeout of this.messageTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.messageTimeouts.clear()
    for (const timerId of this._coalesceTimers.values()) {
      clearTimeout(timerId)
    }
    this._coalesceTimers.clear()
    this._coalesceBuffers.clear()
  }
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString()
    const prefix = `[WS:${this.role}]`
    const coloredMessage = `%c${prefix} ${message}`
    let style
    if (type === 'error') {
      style = 'color: #ef4444; font-weight: bold;'
    } else if (type === 'warning') {
      style = 'color: #f59e0b; font-weight: bold;'
    } else {
      style = 'color: #3b82f6; font-weight: bold;'
    }
    console[type === 'error' ? 'error' : 'log'](
      coloredMessage,
      style,
      timestamp
    )
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.WebSocketClient = WebSocketClient
}

module.exports = WebSocketClient


/***/ },

/***/ "./src/rendering/renderer.js"
/*!***********************************!*\
  !*** ./src/rendering/renderer.js ***!
  \***********************************/
(module) {

/* global globalThis, Path2D, debugError */
/**
 * BallRenderer - оптимизированный модуль рендеринга для BilateralBound
 * Отвечает за отрисовку шарика и фона
 * Оптимизирован для производительности и поддержки переиспользования
 */
class BallRenderer {
  constructor(canvas, physicsEngine, options = {}) {
    if (!canvas) {
      throw new Error('Canvas element is required for BallRenderer')
    }
    if (!physicsEngine) {
      throw new Error('PhysicsEngine is required for BallRenderer')
    }
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.physics = physicsEngine
    if (!this.ctx) {
      throw new Error('Unable to get 2D context from canvas')
    }
    this.animationFrameId = null
    this.lastTime = 0
    this.frameCount = 0
    this.frameTimeHistory = [] // История времен кадров для расчета реального FPS
    this.adaptiveFrameRate = true // Адаптивная частота кадров
    this.maxFrameTime = 50 // Максимальное время кадра в ms
    this.fixedStepMs = 1000 / 60
    this.accumulatorMs = 0
    this.maxSubsteps = 3
    this.onFrameCallback = null
    this.options = {
      localPhysics: false, // Флаг для локальной физики (для вьювера)
      ...options
    }
    this.adaptiveFrameRate =
      globalThis.BBConfig?.rendering?.adaptiveFrameRate ??
      this.adaptiveFrameRate
    this.maxFrameTime =
      globalThis.BBConfig?.rendering?.maxFrameTime ?? this.maxFrameTime
    this.pi2 = Math.PI * 2
    this.fillRect = this.ctx.fillRect.bind(this.ctx)
    this.beginPath = this.ctx.beginPath.bind(this.ctx)
    this.fill = this.ctx.fill.bind(this.ctx)
    this.ball = this.physics.ball
    this.colors = this.physics.colors
    this._cached = {
      radius: null,
      color: null,
      gradient: null,
      path: null
    }
  }
  /**
   * Запускает рендеринг
   */
  start() {
    if (this.animationFrameId) {
      this.stop()
    }
    this.lastTime = performance.now()
    this.renderLoop = this.renderLoop.bind(this)
    this.renderLoop(performance.now())
  }
  /**
   * Останавливает рендеринг
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }
  _calculateDeltaTime(currentTime) {
    const deltaTime = currentTime - this.lastTime
    if (this.adaptiveFrameRate) {
      this.frameTimeHistory.push(deltaTime)
      if (this.frameTimeHistory.length > 20) this.frameTimeHistory.shift()
    }
    return Math.min(deltaTime, this.maxFrameTime)
  }
  _updatePhysics(clampedDeltaTime) {
    this.accumulatorMs += clampedDeltaTime
    if (this.onFrameCallback) {
      this.onFrameCallback(clampedDeltaTime / 1000)
    }
    if (this.options.localPhysics) {
      let substeps = 0
      while (
        this.accumulatorMs >= this.fixedStepMs &&
        substeps < this.maxSubsteps
      ) {
        this.physics.update(this.fixedStepMs / 1000)
        this.accumulatorMs -= this.fixedStepMs
        substeps++
      }
    }
  }
  _renderFrame(currentTime) {
    let alpha = 1
    if (this.fixedStepMs > 0) {
      if (this.options.localPhysics) {
        alpha = Math.max(0, Math.min(1, this.accumulatorMs / this.fixedStepMs))
      } else {
        const now = currentTime
        const lastTs = this.physics?.__lastPhysicsUpdateTs ?? now
        alpha = Math.max(0, Math.min(1, (now - lastTs) / this.fixedStepMs))
      }
    }
    this.render(alpha)
  }
  renderLoop(currentTime) {
    if (this.validateCanvas()) {
      const clientW = this.canvas.clientWidth
      const clientH = this.canvas.clientHeight
      if (
        (clientW && clientW !== this.canvas.width) ||
        (clientH && clientH !== this.canvas.height)
      ) {
        this.resize(
          clientW || this.canvas.width,
          clientH || this.canvas.height
        )
        this.lastTime = currentTime
        this.animationFrameId = requestAnimationFrame(this.renderLoop)
        return
      }
      const clampedDeltaTime = this._calculateDeltaTime(currentTime)
      this.frameCount++
      try {
        this._updatePhysics(clampedDeltaTime)
        this._renderFrame(currentTime)
        this.lastTime = currentTime
      } catch (err) {
        if (typeof globalThis?.logger?.error === 'function') {
          globalThis.logger.error('Render loop error:', err)
        }
        this.stop()
        return
      }
      this.animationFrameId = requestAnimationFrame(this.renderLoop)
    } else {
      this.stop()
    }
  }
  /**
   * Renders the scene using a full repaint strategy.
   * @param {number} alpha - The interpolation factor.
   * @private
   */
  _renderFull(alpha) {
    // Use world dimensions for fill so background covers full canvas even when scaled
    const w = this.physics.options.worldWidth || this.canvas.width
    const h = this.physics.options.worldHeight || this.canvas.height
    this.ctx.fillStyle = this.colors.bg
    this.fillRect(0, 0, w, h)
    const ballState = this.physics.getInterpolatedBall
      ? this.physics.getInterpolatedBall(alpha)
      : this.physics.ball
    this.renderBall(ballState)
    // Render debug overlay if enabled
    if (this.options.showDebug) {
      this._renderDebugOverlay()
    }
  }

  /**
   * Renders a debug overlay with jitter/smoothing diagnostics.
   * Shows FPS, frame time, damping/stiffness from physics engine.
   * @private
   */
  _renderDebugOverlay() {
    const ctx = this.ctx
    const padding = 8
    const lineH = 16
    const lines = this._buildDebugLines()
    const boxW = this._estimateDebugBoxWidth(lines)
    const boxH = lines.length * lineH + padding * 2

    // Position: top-right corner in world coords
    const worldW = this.physics.options.worldWidth || this.canvas.width
    const _worldH = this.physics.options.worldHeight || this.canvas.height // reserved for future use
    const x = worldW - boxW - padding
    const y = padding

    ctx.save()
    ctx.font = '12px monospace'
    ctx.textBaseline = 'top'

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
    ctx.fillRect(x, y, boxW, boxH)

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, boxW, boxH)

    // Text
    const jitterClass = this._getJitterLevel()
    ctx.fillStyle =
      jitterClass === 'bad'
        ? '#ff6b6b'
        : jitterClass === 'warn'
          ? '#ffd93d'
          : '#6bff6b'
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle =
        i === 0
          ? jitterClass === 'bad'
            ? '#ff6b6b'
            : jitterClass === 'warn'
              ? '#ffd93d'
              : '#6bff6b'
          : '#ffffff'
      ctx.fillText(lines[i], x + padding, y + padding + i * lineH)
    }
    ctx.restore()
  }

  /**
   * Builds debug lines for the overlay.
   * Returns array of strings.
   * @returns {string[]}
   */
  _buildDebugLines() {
    const lines = []
    const fps = this._getRealFps()
    const frameMs = this._getLastFrameTime()
    const smoothing = this.physics.options.smoothing || {}

    lines.push(`${fps.toFixed(0)} FPS | ${frameMs.toFixed(1)}ms`)

    if (smoothing.damping !== undefined || smoothing.stiffness !== undefined) {
      const damping = smoothing.damping != null ? smoothing.damping : '-'
      const stiffness = smoothing.stiffness != null ? smoothing.stiffness : '-'
      lines.push(`damp:${damping} stiff:${stiffness}`)
    }

    if (smoothing.driftThresholdPx != null) {
      lines.push(`drift: >${smoothing.driftThresholdPx}px`)
    }

    // Show jitter level
    const jitter = this._getEstimatedJitterMs()
    lines.push(`jitter: ~${jitter.toFixed(0)}ms (${this._getJitterLevel()})`)

    return lines
  }

  /**
   * Estimates the box width for debug overlay based on text.
   * @param {string[]} lines
   * @returns {number}
   * @private
   */
  _estimateDebugBoxWidth(lines) {
    // Approximate: ~7px per character in 12px monospace
    let maxChars = 0
    for (const line of lines) {
      if (line.length > maxChars) maxChars = line.length
    }
    return maxChars * 7.5 + 16
  }

  /**
   * Calculates a rolling average frames per second.
   * @returns {number} Average FPS over recent frames.
   */
  _getRealFps() {
    if (!this.frameTimeHistory || this.frameTimeHistory.length === 0) return 60
    const total = this.frameTimeHistory.reduce((sum, v) => sum + v, 0)
    return 1000 / (total / this.frameTimeHistory.length)
  }

  /**
   * Returns the last frame time in ms.
   * @returns {number}
   */
  _getLastFrameTime() {
    if (!this.frameTimeHistory || this.frameTimeHistory.length === 0) return 16
    return this.frameTimeHistory[this.frameTimeHistory.length - 1]
  }

  /**
   * Heuristic estimate of network jitter from frame time variance.
   * Uses standard deviation of recent frame times.
   * @returns {number} Estimated jitter in ms.
   */
  _getEstimatedJitterMs() {
    if (!this.frameTimeHistory || this.frameTimeHistory.length < 4) return 0
    const recent = this.frameTimeHistory.slice(-8)
    const mean = recent.reduce((s, v) => s + v, 0) / recent.length
    const variance =
      recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length
    return Math.sqrt(variance)
  }

  /**
   * Classifies jitter level: 'good', 'warn', or 'bad'.
   * @returns {string}
   */
  _getJitterLevel() {
    const jitter = this._getEstimatedJitterMs()
    if (jitter > 15) return 'bad'
    if (jitter > 8) return 'warn'
    return 'good'
  }
  /**
   * Renders the scene.
   * @param {number} [alpha=1] - The interpolation factor for smooth animation.
   */
  render(alpha = 1) {
    if (!this.canvas || !this.ctx || !this.physics) {
      return
    }
    const worldW = this.physics.options.worldWidth
    const worldH = this.physics.options.worldHeight
    const needsScale =
      worldW > 0 &&
      worldH > 0 &&
      (this.canvas.width !== worldW || this.canvas.height !== worldH)
    try {
      if (needsScale) {
        this.ctx.save()
        this.ctx.scale(this.canvas.width / worldW, this.canvas.height / worldH)
      }
      this._renderFull(alpha)
      if (needsScale) {
        this.ctx.restore()
      }
    } catch (err) {
      if (needsScale) {
        this.ctx.restore()
      }
      if (typeof debugError === 'function') {
        debugError('Error during render:', err)
      }
    }
  }
  /**
   * Рисует шарик (оптимизированная версия)
   */
  renderBall(ballState) {
    const ball = ballState || this.ball
    if (ball && typeof ball.x === 'number' && typeof ball.y === 'number') {
      if (ball.radius <= 0 || ball.radius > 1000) {
        return
      }
      try {
        const col = ball.colorBall || this.colors.ball
        if (this._cached.radius !== ball.radius || this._cached.color !== col) {
          this._cached.radius = ball.radius
          this._cached.color = col
          const g = this.ctx.createRadialGradient(
            -ball.radius * 0.3,
            -ball.radius * 0.3,
            0,
            0,
            0,
            ball.radius
          )
          g.addColorStop(0, col)
          g.addColorStop(1, this.adjustBrightness(col, -20))
          this._cached.gradient = g
          const p = new Path2D()
          p.arc(0, 0, Math.max(ball.radius, 2), 0, this.pi2)
          this._cached.path = p
        }
        this.beginPath()
        this.ctx.save()
        this.ctx.imageSmoothingEnabled = true
        this.ctx.imageSmoothingQuality = 'high'
        this.ctx.translate(ball.x, ball.y)
        this.ctx.fillStyle = this._cached.gradient
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
        this.ctx.shadowBlur = 4
        this.ctx.shadowOffsetX = 2
        this.ctx.shadowOffsetY = 2
        this.ctx.fill(this._cached.path)
        this.ctx.restore()
        this.ctx.shadowColor = 'transparent'
        this.ctx.shadowBlur = 0
        this.ctx.shadowOffsetX = 0
        this.ctx.shadowOffsetY = 0
      } catch (err) {
        if (typeof globalThis?.logger?.warn === 'function') {
          globalThis.logger.warn('Error rendering ball:', err)
        }
      }
    }
  }
  /**
   * Изменяет яркость цвета
   */
  adjustBrightness(color, amount) {
    const hex = color.replace('#', '')
    const r = Math.max(
      0,
      Math.min(255, Number.parseInt(hex.slice(0, 2), 16) + amount)
    )
    const g = Math.max(
      0,
      Math.min(255, Number.parseInt(hex.slice(2, 4), 16) + amount)
    )
    const b = Math.max(
      0,
      Math.min(255, Number.parseInt(hex.slice(4, 6), 16) + amount)
    )
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }
  /**
   * Инвалидирует кэш шарика (градиент и геометрию)
   * Вызывается при изменении цвета или размера
   */
  invalidateBallCache() {
    this._cached.radius = null
    this._cached.color = null
    this._cached.gradient = null
    this._cached.path = null
  }
  /**
   * Изменяет размеры canvas
   */
  resize(width, height) {
    if (!this.canvas) {
      return
    }
    try {
      this.canvas.width = width
      this.canvas.height = height
      this.canvas.style.width = width + 'px'
      this.canvas.style.height = height + 'px'
      if (this.physics) {
        this.physics.setWorldSize(width, height)
      }
      this._cached.radius = null
      this._cached.color = null
      this._cached.gradient = null
      this._cached.path = null
    } catch (err) {
      if (typeof globalThis?.logger?.error === 'function') {
        globalThis.logger.error('Canvas resize error:', err)
      }
    }
  }
  /**
   * Проверяет и восстанавливает canvas при необходимости
   */
  validateCanvas() {
    if (!this.canvas) {
      return false
    }
    if (!this.canvas.parentNode) {
      return false
    }
    if (!this.ctx) {
      try {
        this.ctx = this.canvas.getContext('2d')
        if (this.ctx) {
          this.fillRect = this.ctx.fillRect.bind(this.ctx)
          this.beginPath = this.ctx.beginPath.bind(this.ctx)
          this.fill = this.ctx.fill.bind(this.ctx)
          return true
        }
      } catch (err) {
        if (typeof globalThis?.logger?.warn === 'function') {
          globalThis.logger.warn('Failed to recover canvas context:', err)
        }
      }
      return false
    }
    return true
  }
  /**
   * Устанавливает новый движок физики
   */
  setPhysicsEngine(physicsEngine) {
    if (!physicsEngine) {
      return
    }
    if (!physicsEngine.ball || !physicsEngine.colors) {
      return
    }
    this.physics = physicsEngine
    this.ball = this.physics.ball
    this.colors = this.physics.colors
  }
  /**
   * Рендерит один кадр с переданным состоянием.
   * Удобно для внешнего цикла рендеринга.
   * @param {object} state - Состояние для рендеринга.
   */
  drawFrame(state) {
    if (!this.validateCanvas() || !state) {
      return
    }
    try {
      this.ctx.fillStyle = state.colorBg || this.colors.bg
      this.fillRect(0, 0, this.canvas.width, this.canvas.height)
      this.renderBall(state)
    } catch (err) {
      if (typeof globalThis?.logger?.warn === 'function') {
        globalThis.logger.warn('Error drawing frame:', err)
      }
    }
  }
  /**
   * Устанавливает цвет фона
   */
  setBackgroundColor(color) {
    if (this.colors) {
      this.colors.bg = color
    }
    this._cached.radius = null
    this._cached.color = null
  }
}
if (typeof globalThis !== 'undefined') {
  globalThis.BallRenderer = BallRenderer
}

module.exports = BallRenderer


/***/ },

/***/ "./src/ui/shared-components.js"
/*!*************************************!*\
  !*** ./src/ui/shared-components.js ***!
  \*************************************/
(module) {

"use strict";
/* jshint -W033, -W104, -W119 */
/* global globalThis, Map, module */

/**
 * SharedComponents - переиспользуемые компоненты для BilateralBound
 * Содержит общую логику для controller и viewer
 */

class SharedComponents {
  constructor() {
    this.components = new Map()
  }
  /**
   * Создает переиспользуемый компонент управления скоростью
   */
  createSpeedControl(container, options = {}) {
    const defaultOptions = {
      min: 5, // Новое минимальное значение - медленная скорость
      max: 100, // Максимальное значение - быстрая скорость
      defaultValue: 30, // Установлено значение "Средне" (30)
      onSpeedChange: null,
      showValue: true,
      showLabels: true,
      simple: true,
      ...options
    }
    const component = {
      container,
      options: defaultOptions,
      currentSpeed: defaultOptions.defaultValue,
      elements: {},
      render() {
        const speedControl = document.createElement('div')
        speedControl.className = 'speed-control'
        if (defaultOptions.simple) {
          speedControl.innerHTML = `
  <div class="speed-info">
  ${defaultOptions.showValue ? `<div class="speed-display"><span class="speed-value">${globalThis.i18n?.t('controller.speedMedium') || 'Medium'}</span></div>` : ''}
  </div>
  <div class="speed-slider-container">
  <label for="speedRange" class="sr-only" data-i18n="controller.speedTitle">Speed</label>
  <input type="range"
  id="speedRange"
  class="speed-range"
  min="${defaultOptions.min}"
  max="${defaultOptions.max}"
  value="${defaultOptions.currentSpeed}"
  step="1">
  </div>
  `
        } else {
          speedControl.innerHTML = `
  <div class="speed-header">
  <div class="speed-icon">⚡</div>
  <div class="speed-info">
  ${defaultOptions.showValue ? `<div class="speed-display"><span class="speed-value">${globalThis.i18n?.t('controller.speedMedium') || 'Medium'}</span></div>` : ''}
  </div>
  <div class="speed-indicator">
  <div class="speed-bar">
  <div class="speed-fill" style="width: 40%"></div>
  </div>
  </div>
  </div>
  <div class="speed-controls">
  <div class="speed-presets">
  <button class="speed-preset slow" data-speed="20">🐌<span>${globalThis.i18n?.t('controller.speedSlow') || 'Slow'}</span></button>
  <button class="speed-preset normal active" data-speed="40">⚡<span>${globalThis.i18n?.t('controller.speedMedium') || 'Medium'}</span></button>
  <button class="speed-preset fast" data-speed="80">🚀<span>${globalThis.i18n?.t('controller.speedFast') || 'Fast'}</span></button>
  </div>
  <div class="speed-slider-container">
  <label for="speedRange" class="sr-only" data-i18n="controller.speedTitle">Speed</label>
  <div class="speed-track">
  <input type="range"
  id="speedRange"
  class="speed-range"
  min="${defaultOptions.min}"
  max="${defaultOptions.max}"
  value="${defaultOptions.currentSpeed}"
  step="1">
  <div class="speed-marks">
  <span class="mark" style="left: 0">0</span>
  <span class="mark" style="left: 25%">25</span>
  <span class="mark" style="left: 50%">50</span>
  <span class="mark" style="left: 75%">75</span>
  <span class="mark" style="left: 100%">100</span>
  </div>
  </div>
  </div>
  </div>
  `
        }
        container.appendChild(speedControl)
        this.setupElements()
        this.setupEventListeners()
        return this
      },
      setupElements() {
        this.elements.range = container.querySelector('.speed-range')
        this.elements.value = container.querySelector('.speed-value')
        this.elements.display = container.querySelector('.speed-display')
        this.elements.fill = container.querySelector('.speed-fill')
        this.elements.presets = container.querySelectorAll('.speed-preset')
      },
      setupEventListeners() {
        if (this.elements.range) {
          this.elements.range.addEventListener('input', (e) => {
            this.setSpeed(Number.parseInt(e.target.value, 10))
          })
        }
        if (this.elements?.presets?.length) {
          for (const preset of this.elements.presets) {
            preset.addEventListener('click', () => {
              const speed = Number.parseInt(preset.dataset.speed, 10)
              this.setSpeed(speed)
              this.updateActivePreset(speed)
            })
          }
        }
      },
      updateActivePreset(speed) {
        if (this.elements?.presets?.length === 0) {
          return
        }
        for (const preset of this.elements.presets) {
          preset.classList.remove('active')
        }
        let activePreset = null
        if (speed <= 30) {
          activePreset = 'slow'
        } else if (speed <= 60) {
          activePreset = 'normal'
        } else {
          activePreset = 'fast'
        }
        const activeElement = container.querySelector(
          `.speed-preset.${activePreset}`
        )
        if (activeElement) {
          activeElement.classList.add('active')
        }
      },
      setSpeed(speed, silent = false) {
        this.currentSpeed = Math.max(
          this.options.min,
          Math.min(this.options.max, speed)
        )
        if (this.elements.range) {
          this.elements.range.value = this.currentSpeed
        }
        // Get speed category and color based on current speed
        const { category, color } = this._getSpeedCategoryAndColor(
          this.currentSpeed
        )
        if (this.elements.value) {
          this.elements.value.textContent = category
          this.elements.value.style.color = color
        }
        if (this.elements.fill) {
          this.elements.fill.style.width = `${this.currentSpeed}%`
          this.elements.fill.style.background = color
        }
        this.updateActivePreset(this.currentSpeed)
        if (!silent && this.options.onSpeedChange) {
          this.options.onSpeedChange(this.currentSpeed)
        }
      },
      _getSpeedCategoryAndColor(speed) {
        const t = (key) => globalThis.i18n?.t(key) || key
        if (speed <= 15) {
          return { category: t('controller.speedVerySlow'), color: '#22c55e' }
        }
        if (speed <= 25) {
          return { category: t('controller.speedSlow'), color: '#3b82f6' }
        }
        if (speed <= 35) {
          return { category: t('controller.speedMedium'), color: '#8b5cf6' }
        }
        if (speed <= 50) {
          return { category: t('controller.speedFast'), color: '#f59e0b' }
        }
        return { category: t('controller.speedVeryFast'), color: '#ef4444' }
      },
      getSpeed() {
        return this.currentSpeed
      },
      reset() {
        this.setSpeed(this.options.defaultValue)
      }
    }
    component.render()
    // Refresh speed label on language change
    globalThis.addEventListener('i18nLanguageChanged', () => {
      component.setSpeed(component.currentSpeed, true)
    })
    return component
  }
  /**
   * Создает переиспользуемый компонент управления цветом
   */
  createColorControl(container, options = {}) {
    const defaultOptions = {
      colors: [
        '#60a5fa',
        '#ef4444',
        '#10b981',
        '#f59e0b',
        '#8b5cf6',
        '#ec4899'
      ],
      defaultValue: null, // Будет установлен в colors[0] если не указан
      onColorChange: null,
      title: '🎨 Цвет',
      ...options
    }
    const component = {
      container,
      options: defaultOptions,
      currentColor: defaultOptions.defaultValue || defaultOptions.colors[0],
      elements: {},
      render() {
        const colorControl = document.createElement('div')
        colorControl.className = 'color-control'
        colorControl.innerHTML = `
  <h3>${defaultOptions.title}</h3>
  <div class="color-palette">
  ${defaultOptions.colors
    .map(
      (color) => `
  <button class="color-btn"
  data-color="${color}"
  style="background-color: ${color}"
  title="${color}"
  aria-label="Color: ${color}">
  </button>
  `
    )
    .join('')}
  </div>
  `
        container.appendChild(colorControl)
        this.setupEventListeners()
        this.setColor(this.currentColor)
        return this
      },
      setupEventListeners() {
        const buttons = container.querySelectorAll('.color-btn')
        for (const button of buttons) {
          button.addEventListener('click', () => {
            const color = button.dataset.color
            this.setColor(color)
          })
        }
      },
      setColor(color) {
        this.currentColor = color
        const buttons = container.querySelectorAll('.color-btn')
        for (const btn of buttons) {
          btn.classList.toggle('active', btn.dataset.color === color)
        }
        this.options.onColorChange?.(color)
      }
    }
    return component.render()
  }
  /**
   * Создает переиспользуемый компонент управления размером
   */
  createSizeControl(container, options = {}) {
    const defaultOptions = {
      sizes: [20, 40, 80, 100],
      defaultValue: 20,
      onSizeChange: null,
      title: '📏 Размер',
      ...options
    }
    const component = {
      container,
      options: defaultOptions,
      currentSize: defaultOptions.defaultValue,
      elements: {},
      render() {
        const sizeControl = document.createElement('div')
        sizeControl.className = 'size-control'
        sizeControl.innerHTML = `
  <h3>${defaultOptions.title}</h3>
  <div class="size-palette">
  ${defaultOptions.sizes
    .map(
      (size, index) => `
  <button class="size-btn"
  data-size="${size}"
  title="${size}px"
  aria-label="Size: x${index + 1} (${size}px)">
  x${index + 1}
  </button>
  `
    )
    .join('')}
  </div>
  `
        container.appendChild(sizeControl)
        this.setupEventListeners()
        this.setSize(this.currentSize)
        return this
      },
      setupEventListeners() {
        const buttons = container.querySelectorAll('.size-btn')
        for (const button of buttons) {
          button.addEventListener('click', () => {
            const size = Number.parseInt(button.dataset.size, 10)
            this.setSize(size)
          })
        }
      },
      setSize(size) {
        this.currentSize = size
        const buttons = container.querySelectorAll('.size-btn')
        for (const btn of buttons) {
          btn.classList.toggle(
            'active',
            Number.parseInt(btn.dataset.size, 10) === size
          )
        }
        this.options.onSizeChange?.(size)
      }
    }
    return component.render()
  }
  /**
   * Создает переиспользуемый компонент статуса
   * @param {HTMLElement} container - Контейнер для компонента
   * @param {Object} options - Опции компонента
   * @returns {StatusIndicatorComponent} Объект компонента
   */
  createStatusIndicator(container, options = {}) {
    const defaultOptions = {
      title: 'Статус',
      showIcon: true,
      autoHide: false,
      hideDelay: 3000,
      ...options
    }
    const component = {
      container,
      options: defaultOptions,
      currentStatus: 'idle',
      elements: {},
      render() {
        const statusIndicator = document.createElement('div')
        statusIndicator.className = 'status-indicator'
        statusIndicator.innerHTML = `
  <div class="status-content">
  ${defaultOptions.showIcon ? '<span class="status-icon">⏳</span>' : ''}
  <span class="status-text">${defaultOptions.title}</span>
  </div>
  `
        container.appendChild(statusIndicator)
        this.setupElements()
        return this
      },
      setupElements() {
        this.elements.container = container.querySelector('.status-indicator')
        this.elements.icon = container.querySelector('.status-icon')
        this.elements.text = container.querySelector('.status-text')
      },
      setStatus(status, message) {
        this.currentStatus = status
        if (this.elements.text) {
          this.elements.text.textContent = message || ''
        }
        if (this.elements.icon) {
          const icons = {
            success: '✅',
            warning: '⚠️',
            error: '❌',
            waiting: '⏳',
            idle: '⏳'
          }
          this.elements.icon.textContent = icons[status] || '⏳'
        }
        if (this.elements.container) {
          this.elements.container.className =
            'status-indicator status-' + status
        }
      }
    }
    return component.render()
  }
}
const sharedComponents = new SharedComponents()
if (typeof globalThis !== 'undefined') {
  globalThis.SharedComponents = SharedComponents
  globalThis.sharedComponents = sharedComponents
}

module.exports = { SharedComponents, sharedComponents }


/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Check if module exists (development only)
/******/ 		if (__webpack_modules__[moduleId] === undefined) {
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			loaded: false,
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	(() => {
/******/ 		__webpack_require__.nmd = (module) => {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
// This entry needs to be wrapped in an IIFE because it needs to be in strict mode.
(() => {
"use strict";
/*!***********************!*\
  !*** ./src/viewer.js ***!
  \***********************/
/* jshint esversion: 11, browser: true, node: true */
/* global globalThis, localStorage, console, document, performance, PhysicsEngine, BallRenderer, WebSocketClient, WS_MSG, AudioManager, sharedComponents, getSessionIdFromUrl, logger, debugError, debugLog, debugWarn, RealtimeClient */

// Initialize global state first
if (!globalThis.__current) globalThis.__current = {}

// Require dependencies (side effects populate globalThis)
__webpack_require__(/*! ./core/debug-logger */ "./src/core/debug-logger.js")
__webpack_require__(/*! ./config */ "./src/config.js")
__webpack_require__(/*! ./common */ "./src/common.js")
__webpack_require__(/*! ./i18n/constants */ "./src/i18n/constants.js")
__webpack_require__(/*! ./i18n/i18n */ "./src/i18n/i18n.js")
__webpack_require__(/*! ./i18n/language-selector */ "./src/i18n/language-selector.js")
__webpack_require__(/*! ./audio/audio-manager */ "./src/audio/audio-manager.js")
__webpack_require__(/*! ./rendering/renderer */ "./src/rendering/renderer.js")
__webpack_require__(/*! ./network/websocket-client */ "./src/network/websocket-client.js")
__webpack_require__(/*! ./network/realtime-client */ "./src/network/realtime-client.js")
__webpack_require__(/*! ./network/csrf */ "./src/network/csrf.js")
__webpack_require__(/*! ./ui/shared-components */ "./src/ui/shared-components.js")

const PhysicsEngine = __webpack_require__(/*! @emdr/shared/physics-engine */ "../shared/physics-engine.js")
const { applyAdaptiveSmoothing } = __webpack_require__(/*! @emdr/shared/smoothing-utils */ "../shared/smoothing-utils.js")
globalThis.PhysicsEngine = PhysicsEngine

// ============================================================================
// Viewer Application Logic (moved from viewer.html inline <script>)
// ============================================================================

/**
 * @typedef {Object} StatusIndicatorComponent
 * @property {function(string, string): void} setStatus
 */

function showError(message) {
  console.error('❌ Viewer Error:', message)
  const loading = document.getElementById('loading')
  if (loading) {
    loading.textContent = '❌ ' + message
    loading.style.color = '#ef4444'
  }
  // Используем ту же систему что и контроллер
  if (globalThis.errorStateManager?.show) {
    globalThis.errorStateManager.show('critical-error', {
      title: globalThis.i18n?.t('viewer.errorTitle') || 'Connection Error',
      message: message,
      actions: [
        {
          label: globalThis.i18n?.t('viewer.reload') || 'Reload page',
          callback: () => globalThis.location.reload()
        }
      ]
    })
  } else if (globalThis.emdrErrorOverlay) {
    globalThis.emdrErrorOverlay.show({
      title: globalThis.i18n?.t('viewer.errorTitle') || 'Connection Error',
      message,
      actionText: globalThis.i18n?.t('viewer.reload') || 'Reload page',
      onAction: () => globalThis.location.reload()
    })
  } else {
    alert(
      `${globalThis.i18n?.t('viewer.errorTitle') || 'Connection Error'}\n\n${message}`
    )
  }
}

function hideLoading() {
  const loading = document.getElementById('loading')
  if (loading) {
    loading.style.display = 'none'
  }
}

// Centered banner over canvas for transient connection states
let _bannerEl = null

function _clearBanner() {
  if (_bannerEl) {
    while (_bannerEl.firstChild) _bannerEl.firstChild.remove()
  }
}

function showConnectionBanner(message, icon = '⚠️') {
  if (!_bannerEl) {
    const style = document.createElement('style')
    style.textContent = `
      #viewerConnectionBanner {
        position: fixed;
        inset: 0;
        z-index: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      #viewerConnectionBanner .vcb-card {
        background: rgba(2, 6, 23, 0.88);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(239, 68, 68, 0.35);
        border-radius: 16px;
        padding: 28px 40px;
        text-align: center;
        box-shadow: 0 0 40px rgba(239, 68, 68, 0.15), 0 8px 32px rgba(0,0,0,0.5);
        animation: vcbFadeIn 0.3s ease;
        max-width: 360px;
      }
      @keyframes vcbFadeIn {
        from { opacity: 0; transform: scale(0.92) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      #viewerConnectionBanner .vcb-icon {
        font-size: 2.5rem;
        margin-bottom: 12px;
        display: block;
      }
      #viewerConnectionBanner .vcb-text {
        font-size: 1.1rem;
        font-weight: 600;
        color: #f1f5f9;
        line-height: 1.4;
        letter-spacing: 0.01em;
      }
    `
    document.head.appendChild(style)
    _bannerEl = document.createElement('div')
    _bannerEl.id = 'viewerConnectionBanner'
    document.body.appendChild(_bannerEl)
  }
  _clearBanner()
  const card = document.createElement('div')
  card.className = 'vcb-card'
  const iconEl = document.createElement('span')
  iconEl.className = 'vcb-icon'
  iconEl.textContent = icon
  const textEl = document.createElement('span')
  textEl.className = 'vcb-text'
  textEl.textContent = message
  card.appendChild(iconEl)
  card.appendChild(textEl)
  _bannerEl.appendChild(card)
  _bannerEl.style.display = 'flex'
}

function hideConnectionBanner() {
  if (_bannerEl) {
    _bannerEl.style.display = 'none'
    _clearBanner()
  }
}

function resizeCanvas() {
  const canvas = document.getElementById('viewerCanvas')
  if (canvas) {
    canvas.width = globalThis.innerWidth
    canvas.height = globalThis.innerHeight
    canvas.style.width = canvas.width + 'px'
    canvas.style.height = canvas.height + 'px'
    if (physicsEngine) {
      physicsEngine.setWorldSize(globalThis.innerWidth, globalThis.innerHeight)
    }
  }
}

async function connectToSession(sessionId) {
  try {
    const response = await globalThis.csrfFetch(`/api/session/${sessionId}/viewer/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenSize: {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight
        }
      })
    })
    if (response.ok) {
      debugLog('✅ Viewer connected to session')
    } else {
      debugWarn('⚠️ Failed to connect viewer to session')
    }
  } catch (error) {
    debugWarn('⚠️ Error connecting to session:', error)
  }
}

function updateStatus(data) {
  if (!globalThis.__current) {
    globalThis.__current = {}
  }
  if (typeof data.controllerConnected === 'boolean') {
    globalThis.__current.controllerConnected = data.controllerConnected
    console.log(
      '📊 [VIEWER] controllerConnected updated to:',
      data.controllerConnected
    )
  }
  if (!components.status) {
    return
  }
  const isControllerConnected = data.controllerConnected === true
  const isControllerDisconnected = data.controllerConnected === false
  if (isControllerConnected) {
    const msg =
      globalThis.i18n?.t('viewer.controllerConnected') ||
      'Controller connected'
    components.status.setStatus('success', msg)
  } else if (isControllerDisconnected) {
    const msg =
      globalThis.i18n?.t('viewer.waitingForController') ||
      'Waiting for controller...'
    components.status.setStatus('waiting', msg)
  }
}

function onStateUpdate(state) {
  if (
    state &&
    state.language &&
    state.language !== localStorage.getItem('emdr-language')
  ) {
    onLanguageUpdate({ language: state.language })
  }
  if (physicsEngine && state) {
    updatePhysicsFromState(state)
  }
  if (state && audioManager) {
    updateAudioFromState(state)
  }
  if (state && typeof state.controllerConnected === 'boolean') {
    updateStatus(state)
  }
}

function updatePhysicsFromState(state) {
  debugLog('📥 [VIEWER] Received state update:', state)

  // Capture viewer's current ball position BEFORE applying server state.
  // When server sends returnToCenter + paused, the server position is already
  // at center — we need to animate from the viewer's current position, not snap.
  const viewerBallX = physicsEngine.ball.x
  const viewerBallY = physicsEngine.ball.y
  const dxBefore = physicsEngine.centerX - viewerBallX
  const dyBefore = physicsEngine.centerY - viewerBallY
  const distBefore = Math.hypot(dxBefore, dyBefore)
  const isReturningToCenter =
    state.paused === true && distBefore > physicsEngine.options.centerSnapThreshold

  physicsEngine.applyCommand(state)

  // If server sent returnToCenter + paused, force seekingCenter animation
  // from the viewer's pre-update position (not the snapped server position).
  if (isReturningToCenter && !physicsEngine.state.seekingCenter) {
    physicsEngine.state.seekingCenter = true
    physicsEngine._seekCenterStart = {
      x: viewerBallX,
      y: viewerBallY,
      ts: performance.now()
    }
    debugLog('🎯 [VIEWER] Forced seekCenter animation from viewer position', {
      fromX: viewerBallX.toFixed(1),
      fromY: viewerBallY.toFixed(1),
      distBefore: distBefore.toFixed(1)
    })
  }

  const isPaused = physicsEngine.state.paused
  const isNotSeeking = !physicsEngine.state.seekingCenter
  const isNotStopping = !physicsEngine.state.stopping
  if (isPaused && isNotSeeking && isNotStopping) {
    const dx = physicsEngine.centerX - physicsEngine.ball.x
    const dy = physicsEngine.centerY - physicsEngine.ball.y
    const distanceFromCenter = Math.hypot(dx, dy)
    if (distanceFromCenter > 2) {
      physicsEngine.state.seekingCenter = true
      physicsEngine._seekCenterStart = {
        x: physicsEngine.ball.x,
        y: physicsEngine.ball.y,
        ts: performance.now()
      }
    }
  }
  debugLog('📥 [VIEWER] Engine state after update:', {
    paused: physicsEngine.state.paused,
    seekingCenter: physicsEngine.state.seekingCenter
  })
}

function updateAudioFromState(state) {
  if (typeof state.soundEnabled === 'boolean') {
    debugLog('🔊 [VIEWER] soundEnabled from state:', state.soundEnabled)
    audioManager.setEnabled(state.soundEnabled)
    checkAudioOverlay()
  }
  if (state.soundType) {
    debugLog('🔊 [VIEWER] soundType from state:', state.soundType)
    audioManager.setSoundType(state.soundType)
  }
}

function onLanguageUpdate(data) {
  const language = data?.language
  if (!language) {
    debugWarn('❌ Invalid language update data:', data)
    return
  }
  debugLog('🌍 Language update received:', language)
  if (globalThis.i18n && typeof globalThis.i18n.setLanguage === 'function') {
    try {
      globalThis.i18n.setLanguage(language)
      debugLog('✅ Language applied:', language)
    } catch (err) {
      debugWarn('❌ Failed to apply language:', err.message)
    }
  } else {
    debugWarn('⚠️ i18n not available for language update')
  }
}

function setupEventListeners() {
  globalThis.addEventListener('resize', () => {
    resizeCanvas()
    if (wsClient) {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        wsClient
          .send('viewer_screen_size', {
            width: globalThis.innerWidth,
            height: globalThis.innerHeight
          })
          .catch(() => {})
      }, 300)
    }
  })

  globalThis.toggleFullscreen = function () {
    const isFullscreen = !!document.fullscreenElement
    if (!isFullscreen) {
      document.documentElement.requestFullscreen().catch((err) => {
        debugWarn('Error attempting to enable fullscreen:', err)
      })
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch((err) => {
        debugWarn('Error attempting to exit fullscreen:', err)
      })
    }
  }

  function updateFullscreenButton() {
    const btn = document.querySelector('.fullscreen-btn')
    if (!btn) return
    const isFs = !!document.fullscreenElement
    const key = isFs ? 'viewer.exitFullscreen' : 'viewer.fullscreen'
    const fallback = isFs ? '⛶ Выйти' : '⛶ Полноэкранный'
    btn.textContent = globalThis.i18n?.t ? globalThis.i18n.t(key) : fallback
    if (btn instanceof HTMLElement) {
      btn.dataset.i18n = key
    }
  }

  document.addEventListener('fullscreenchange', () => {
    updateFullscreenButton()
    resizeCanvas()
    if (wsClient) {
      wsClient
        .send('viewer_screen_size', {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight
        })
        .catch(() => {})
    }
  })

  globalThis.addEventListener('i18nReady', () => {
    if (globalThis.i18n?.applyTranslations) {
      globalThis.i18n.applyTranslations()
    }
    if (components.status?.currentStatus === 'idle') {
      const msg = globalThis.i18n?.t('viewer.connecting') || 'Connecting...'
      components.status.setStatus('idle', msg)
    }
  })

  globalThis.addEventListener('i18nLanguageChanged', () => {
    if (globalThis.i18n?.applyTranslations) {
      globalThis.i18n.applyTranslations()
    }
    updateFullscreenButton()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      if (wsClient && physicsEngine) {
        const currentPaused = physicsEngine.state?.paused ?? true
        const newPaused = !currentPaused
        debugLog(
          `[VIEWER] Space pressed: toggling pause from ${currentPaused} to ${newPaused}`
        )
        wsClient.send('viewer_update', { paused: newPaused })
      }
    }
  })
}

// Global variables
let wsClient
let physicsEngine
let ballRenderer
let audioManager = null
let audioActivated = false
let pendingSoundEnabled = false
const components = {}
let resizeTimeout = null

if (typeof globalThis !== 'undefined') {
  globalThis.audioManager = audioManager
  globalThis.audioActivated = audioActivated
  globalThis.resetAudioActivation = function () {
    localStorage.removeItem('bb_audioActivated')
    audioActivated = false
    globalThis.audioActivated = false
    if (audioManager) {
      checkAudioOverlay()
    }
    console.log(
      '🔊 Audio activation state reset. Reload page to see unmute overlay again.'
    )
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  debugLog('🚀 DOMContentLoaded fired')
  debugLog(
    '🔊 Audio activation state restored from localStorage:',
    audioActivated
  )
  debugLog('🚀 Доступные глобальные объекты:', {
    AudioManager: typeof AudioManager,
    PhysicsEngine: typeof PhysicsEngine,
    BallRenderer: typeof BallRenderer,
    WebSocketClient: typeof WebSocketClient,
    RealtimeClient: typeof RealtimeClient,
    sharedComponents: typeof sharedComponents
  })
  try {
    const sessionId = getSessionIdFromUrl()
    if (!sessionId) {
      showError('Session ID не найден в URL')
      return
    }
    debugLog('📱 Session ID получен:', sessionId)
    initializeComponents()
    await initializeViewer(sessionId)
  } catch (error) {
    debugError('❌ Критическая ошибка инициализации:', error)
    let errorMsg = error.message || error
    if (
      errorMsg?.includes('Session with this ID not found') ||
      errorMsg?.includes('not found')
    ) {
      errorMsg =
        'Session with this ID not found. Please check the URL and try again.'
    } else if (errorMsg?.includes('Realtime connection')) {
      errorMsg =
        'Failed to connect to session. Please reload the page and try again.'
    }
    showError(errorMsg)
  }
})

function initializeComponents() {
  debugLog('📦 initializeComponents вызван')
  if (typeof sharedComponents !== 'undefined') {
    components.status = sharedComponents.createStatusIndicator(
      document.getElementById('statusContainer'),
      {
        title:
          (globalThis.i18n?.isReady &&
            globalThis.i18n.t('viewer.connecting')) ||
          'Connecting...',
        showIcon: true,
        autoHide: false
      }
    )
  }
  debugLog('📦 Status indicator создан')
  debugLog('🔊 Проверка AudioManager:', typeof AudioManager)
  const audioManagerLoaded = typeof AudioManager === 'function'
  if (audioManagerLoaded) {
    debugLog('🔊 AudioManager доступен, инициализируем сразу')
    initAudioManager()
  } else {
    debugLog('🔊 AudioManager еще не загружен, ждем...')
    let attempts = 0
    const checkAudioManager = setInterval(() => {
      attempts++
      debugLog(
        `🔊 Попытка ${attempts}/50 найти AudioManager:`,
        typeof AudioManager
      )
      const isAudioManagerReady = typeof AudioManager === 'function'
      if (isAudioManagerReady) {
        clearInterval(checkAudioManager)
        debugLog('🔊 AudioManager загружен, инициализируем')
        initAudioManager()
      }
    }, 100)
    setTimeout(() => {
      clearInterval(checkAudioManager)
      const audioManagerFailed = typeof AudioManager !== 'function'
      if (audioManagerFailed) {
        debugError('❌ AudioManager не загрузился за 5 секунд!')
      }
    }, 5000)
  }
}

function initAudioManager() {
  const audioManagerAvailable = typeof AudioManager !== 'undefined'
  if (!audioManagerAvailable) {
    debugWarn('AudioManager not loaded yet')
    return
  }
  audioManager = new AudioManager()
  globalThis.audioManager = audioManager
  if (typeof logger !== 'undefined') {
    logger.audio('AudioManager создан, enabled:', audioManager.enabled)
  }
  setupAudioActivationHandlers()
  globalThis.checkAudioOverlay = checkAudioOverlay
  const hasPendingSound = pendingSoundEnabled !== false
  if (hasPendingSound) {
    debugLog('🔊 Применяем отложенный soundEnabled:', pendingSoundEnabled)
    audioManager.setEnabled(pendingSoundEnabled)
    pendingSoundEnabled = false
  }
  checkAudioOverlay()
}

function setupAudioActivationHandlers() {
  const initAudioContextOnFirstUserGesture = () => {
    const shouldInitAudio =
      audioActivated === false && audioManager && audioManager.enabled
    if (!shouldInitAudio) return
    audioManager.init()
    audioActivated = true
    globalThis.audioActivated = true
    localStorage.setItem('bb_audioActivated', 'true')
    if (typeof logger !== 'undefined') {
      logger.audio(
        '🖱️ Audio context initialized on user gesture (implicit click) - кнопка скрыта'
      )
    }
    document.removeEventListener('click', initAudioContextOnFirstUserGesture)
    document.removeEventListener(
      'touchstart',
      initAudioContextOnFirstUserGesture
    )
  }

  document.addEventListener('click', initAudioContextOnFirstUserGesture, {
    once: true
  })
  document.addEventListener('touchstart', initAudioContextOnFirstUserGesture, {
    once: true
  })

  const unmuteBtn = document.getElementById('unmuteBtn')
  const unMuteBtnExists = unmuteBtn !== null
  if (!unMuteBtnExists) {
    debugWarn('🔊 Unmute button НЕ найдена!')
    return
  }
  if (typeof logger !== 'undefined') {
    logger.audio('Unmute button найдена, добавляем обработчики')
  }
  unmuteBtn.addEventListener('click', () => {
    activateAudio(initAudioContextOnFirstUserGesture)
  })
  unmuteBtn.addEventListener('touchstart', (e) => {
    e.preventDefault()
    activateAudio(initAudioContextOnFirstUserGesture)
  })

  const viewerVolumeSlider = document.getElementById('viewerVolumeSlider')
  if (viewerVolumeSlider) {
    const handleVolumeChange = (event) => {
      const input = event.target
      if (input instanceof HTMLInputElement) {
        const value = input.value
        if (audioManager && value) {
          audioManager.setVolume(value / 100)
        }
      }
    }
    viewerVolumeSlider.addEventListener('input', handleVolumeChange)
  }
}

function activateAudio(initHandler) {
  debugLog('🔘 [activateAudio] Функция вызвана')
  if (!audioManager) {
    debugWarn('❌ [activateAudio] audioManager не инициализирован!')
    return
  }
  audioManager.init()
  audioActivated = true
  globalThis.audioActivated = true
  localStorage.setItem('bb_audioActivated', 'true')
  debugLog('✅ [activateAudio] audioActivated установлен на true')
  checkAudioOverlay()
  if (initHandler) {
    document.removeEventListener('click', initHandler)
    document.removeEventListener('touchstart', initHandler)
  }
  if (typeof logger !== 'undefined') {
    logger.audio('✅ Audio activated by user gesture - кнопка нажата!')
  }
  sendAudioActivationNotification()
}

function sendAudioActivationNotification() {
  const sessionId = getSessionIdFromUrl()
  if (sessionId && wsClient) {
    debugLog('📤 [activateAudio] Отправляем viewerAudioActivated на сервер')
    wsClient
      .send(WS_MSG.viewerAudioActivated, { activated: true })
      .catch(() => {})
  }
}

function checkAudioOverlay() {
  const overlay = document.getElementById('unmuteOverlay')
  if (!overlay) {
    debugWarn('🔊 checkAudioOverlay: overlay element НЕ найден!')
    return
  }

  const shouldShow = audioManager && audioManager.enabled && !audioActivated
  overlay.classList.toggle('hidden', !shouldShow)

  if (typeof logger !== 'undefined') {
    if (shouldShow) {
      logger.audio(
        'Показываем unmute overlay - звук включен, но не активирован'
      )
    } else {
      const reason = !audioManager
        ? 'audioManager не инициализирован'
        : !audioManager.enabled
          ? 'звук отключен на контроллере'
          : 'уже активирован'
      logger.audio('Скрываем unmute overlay', { reason })
    }
  }

  const audioControls = document.getElementById('viewerAudioControls')
  if (audioControls) {
    const isAudioActive = audioManager && audioActivated
    audioControls.classList.toggle('hidden', !isAudioActive)
    audioControls.style.display = isAudioActive ? 'flex' : 'none'
  }
}

function onBounce(side, dirX, dirY) {
  if (audioManager && audioManager.enabled && audioActivated) {
    audioManager.playTick()
  }
  if (wsClient && physicsEngine) {
    const ball = physicsEngine.ball
    wsClient
      .send('bounce', {
        side: side,
        x: ball.x,
        y: ball.y,
        dirX: dirX || 0,
        dirY: dirY || 0,
        timestamp: Date.now()
      })
      .catch((err) => {
        debugWarn('Failed to send bounce:', err)
      })
  }
}

async function initializeViewer(sessionId) {
  try {
    debugLog('📱 Инициализация viewer для сессии:', sessionId)
    hideLoading()
    if (!globalThis.__current) {
      globalThis.__current = {}
    }
    globalThis.__current.sessionId = sessionId
    const canvas = document.getElementById('viewerCanvas')
    if (!canvas) {
      console.error('Canvas не найден')
      return
    }
    resizeCanvas()
    const bounceCallback = (bounceData) => {
      onBounce(bounceData.side, bounceData.dirX, bounceData.dirY)
    }
    physicsEngine = new PhysicsEngine({
      worldWidth: globalThis.innerWidth,
      worldHeight: globalThis.innerHeight,
      isViewer: true,
      clientSimulation: true,
      bounceCallback: bounceCallback
    })
    globalThis.physicsEngine = physicsEngine
    physicsEngine.setWorldSize(globalThis.innerWidth, globalThis.innerHeight)
    physicsEngine.setPaused(true)
    ballRenderer = new BallRenderer(canvas, physicsEngine, {
      localPhysics: true
    })
    physicsEngine.setRenderer(ballRenderer)
    await connectToSession(sessionId)
    wsClient = new RealtimeClient(sessionId, 'viewer')
    // eslint-disable-next-line require-atomic-updates
    globalThis.wsClient = wsClient
    debugLog('✅ WebSocketClient создан')
    setupWebSocketHandlers(wsClient, sessionId)
    try {
      await wsClient.connect()
    } catch (error) {
      debugWarn(
        '⚠️ First connection attempt failed, will retry:',
        error.message
      )
    }
    if (ballRenderer) {
      ballRenderer.start()
    }
    setupEventListeners()
    setTimeout(() => {
      const hotkeysHint = document.getElementById('hotkeysHint')
      if (hotkeysHint) {
        hotkeysHint.classList.add('hidden')
      }
    }, 10000)
    debugLog('✅ Viewer успешно инициализирован')
  } catch (error) {
    debugError('❌ Ошибка инициализации viewer:', error)
    showError(
      (globalThis.i18n?.t('viewer.initError') || 'Initialization error: ') +
        error.message
    )
  }
}

function setupWebSocketHandlers(wsClient, sessionId) {
  async function fetchAndApplyState() {
    try {
      const resp = await globalThis.csrfFetch(`/api/session/${sessionId}/state`)
      if (!resp.ok) return
      const state = await resp.json()
      onStateUpdate(state)
      updateStatus(state)
    } catch (e) {
      debugWarn('Не удалось получить состояние через REST', e)
    }
  }

  wsClient.on('open', () => {
    debugLog('✅ WS connection established.')
    hideConnectionBanner()
    const connMsg =
      globalThis.i18n?.t('viewer.connectionEstablished') ||
      'Connection established'
    components.status?.setStatus('success', connMsg)
    debugLog('🔄 Fetching state via REST (first connect or reconnect)')
    fetchAndApplyState().catch(() => {})
    wsClient
      .send('viewer_connected', {
        timestamp: Date.now(),
        sessionId: sessionId,
        role: 'viewer',
        screenSize: {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight
        }
      })
      .catch(() => {})
  })

  wsClient.on('close', () => {
    debugWarn('🔌 WS connection closed.')
    // Center ball and pause on connection loss
    if (physicsEngine) {
      physicsEngine.applyCommand({ paused: true, returnToCenter: true })
    }
    const lostMsg =
      globalThis.i18n?.t('viewer.connectionLost') ||
      'Connection lost. Reconnecting…'
    showConnectionBanner(lostMsg, '🔄')
  })

  wsClient.on('error', (error) => {
    handleWebSocketError(error)
  })

  wsClient.on('maxReconnectAttemptsReached', () => {
    const msg =
      globalThis.i18n?.t('viewer.connectionFailed') ||
      'Cannot connect to the server. Please check your internet connection and reload the page.'
    showError(msg)
  })

  wsClient.on('controller_status', (status) => {
    debugLog('📊 Статус контроллера:', status)
    updateStatus(status)
  })

  wsClient.on('controller_connected', (data) => {
    console.log(
      '📊 [VIEWER] Controller connected event received:',
      JSON.stringify(data)
    )
    debugLog('📊 Controller connected event:', data)
    hideConnectionBanner()
    const hasControllerConnected =
      typeof data.controllerConnected === 'boolean'
    const statusData = hasControllerConnected
      ? data
      : { controllerConnected: true }
    updateStatus(statusData)
  })

  wsClient.on('viewer_connected', (data) => {
    debugLog('📊 [VIEWER] viewer_connected event received:', data)
  })

  wsClient.on('controller_disconnected', (data) => {
    console.log(
      '📊 [VIEWER] Controller disconnected event received:',
      JSON.stringify(data)
    )
    debugLog('📊 Controller disconnected event:', data)
    if (!globalThis.__current) globalThis.__current = {}
    globalThis.__current.controllerConnected = false

    // Pause the ball when controller disconnects
    if (physicsEngine) {
      physicsEngine.applyCommand({ paused: true, returnToCenter: true })
    }

    const msg =
      globalThis.i18n?.t('viewer.controllerDisconnected') ||
      'Controller disconnected'
    if (components.status) {
      components.status.setStatus('warning', msg)
    }
    showConnectionBanner(msg, '🔌')
  })

  wsClient.on('state_update', onStateUpdate)
  wsClient.on('initial_state', onStateUpdate)
  wsClient.on('viewer_status', updateStatus)
  wsClient.on('language_updated', onLanguageUpdate)

  // Handle network metrics for adaptive smoothing
  wsClient.on('net_metrics', ({ jitterMs }) => {
    applyAdaptiveSmoothing(physicsEngine, jitterMs)
  })

  // Bounce ack - server sends authoritative position/direction on bounce
  // Direction is synced immediately (critical for correct post-bounce movement)
  // Position drift is handled by periodic spring-damper correction (physics-engine.js)
  // to avoid visual jitter from conflicting correction sources.
  wsClient.on('bounce_ack', (data) => {
    if (!physicsEngine) return

    // Always sync direction from server (immediate, always safe — direction changes at bounce)
    const serverDirX = data.serverDirX
    const serverDirY = data.serverDirY
    if (
      typeof serverDirX === 'number' &&
      typeof serverDirY === 'number'
    ) {
      physicsEngine.state.lastDirection.x = serverDirX
      physicsEngine.state.lastDirection.y = serverDirY
      // Recalculate velocity from synced direction
      const pps = (physicsEngine.ball.speed / 100) * physicsEngine.options.maxSpeed
      physicsEngine.ball.vx = serverDirX * pps
      physicsEngine.ball.vy = serverDirY * pps
    }

    // Snap position on bounce to prevent drifting away from server position
    // This is critical: after bounce, viewer position may diverge from server due to network latency
    // Hard snap at bounce ensures they start in sync for the next movement segment
    if (typeof data.serverX === 'number' && typeof data.serverY === 'number') {
      // Snap ball to server position to reset accumulation of drift errors
      physicsEngine.ball.x = data.serverX
      physicsEngine.ball.y = data.serverY
      physicsEngine._prevPos.x = data.serverX
      physicsEngine._prevPos.y = data.serverY
      physicsEngine._currPos.x = data.serverX
      physicsEngine._currPos.y = data.serverY

      // Clear drift correction state after snap to prevent spring-damper from fighting the snap
      physicsEngine._lastServerPos = null
      physicsEngine._springState.active = false
    }
  })
}

function handleWebSocketError(error) {
  const isConnectionClosed = error?.type === 'connection_closed'
  const isFirstAttemptError = error?.isFirstAttempt === true
  const isControllerNeverConnected = !globalThis.__current?.controllerConnected
  const shouldSuppressError =
    isConnectionClosed && (isFirstAttemptError || isControllerNeverConnected)
  if (shouldSuppressError) {
    const reason = isFirstAttemptError
      ? 'first attempt'
      : 'controller not connected yet'
    debugLog(`ℹ️ Realtime: ${error?.type} (${reason})`)
    return
  }
  debugError('❌ WebSocket error:', error)
  if (error?.type === 'connection') {
    showError(
      globalThis.i18n?.t('viewer.connectionError') || 'Connection error'
    )
  }
}

// simulateReconnectError реализован в controller.js для тестирования

})();

/******/ })()
;
//# sourceMappingURL=viewer.bundle.js.map