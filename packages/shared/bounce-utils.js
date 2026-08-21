'use strict';
/**
 * Bounce utilities for BilateralBound
 * Single source of truth for bounce message/event creation.
 * Used by PhysicsEngine, controller, and viewer.
 */

// ============================================
// BOUNCE PHYSICS DATA
// ============================================

/**
 * Creates bounce event detail for DOM events (internal)
 * @param {string} side - Bounce side
 * @param {object} ball - Ball state with x, y
 * @returns {object} Event detail for CustomEvent
 */
function createBounceEventDetail(side, ball) {
  return {
    side,
    x: ball.x,
    y: ball.y,
  };
}

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
    dirY: direction.y,
  };
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
        detail: createBounceEventDetail(side, ball),
      });
      globalThis.dispatchEvent(ev);
    }
  } catch {
    // Silently ignore event dispatch errors
  }
}

module.exports = {
  createBouncePhysicsData,
  dispatchBounceEvent,
};
