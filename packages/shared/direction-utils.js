'use strict'
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
// DIRECTION CALCULATION
// ============================================

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
  isVerticalDirection,
  isHorizontalDirection,
  normalizeDirection,
  isValidDirection,
  getFallbackDirection
}
