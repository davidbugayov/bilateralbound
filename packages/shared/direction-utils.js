'use strict'
/**
 * Direction utilities for BilateralBound
 * Single source of truth for direction calculations.
 * Used by PhysicsEngine, controller, and viewer.
 */

const DIRECTION_EPSILON = 1e-6
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
  return Math.abs(dirX || 0) < DIRECTION_EPSILON && Math.abs(dirY || 0) < DIRECTION_EPSILON
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
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_DIRECTION_ABS
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
  if (dirX > 0 && dirY > 0) return 'diagRL'  // Top-left to bottom-right
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