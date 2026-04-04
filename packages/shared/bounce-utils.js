'use strict';
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
    timestamp: Date.now(),
  };
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
    y: ball.y,
  };
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
  createBounceMessage,
  createBounceEventDetail,
  createBouncePhysicsData,
  dispatchBounceEvent,
};
