'use strict'

/**
 * Shared smoothing utilities for adaptive physics smoothing
 * Used by both viewer and controller
 */

/**
 * Calculates adaptive smoothing options based on network jitter
 * @param {number} jitterMs - Current network jitter in milliseconds
 * @param {object} baseConfig - Base smoothing configuration from BBConfig
 * @returns {object} Adaptive smoothing options
 */
function calculateAdaptiveSmoothing(jitterMs, baseConfig = {}) {
  const base = baseConfig.smoothing || baseConfig

  const adaptiveDamping = Math.min(
    25,
    Math.max(15, (base.damping || 20) + jitterMs / 20)
  )
  const adaptiveStiffness = Math.min(
    35,
    Math.max(25, (base.stiffness || 30) - jitterMs / 30)
  )
  const fixedPredictTime = base.maxPredictSec || 0.02
  const adaptiveSnapDistance = Math.min(
    0.4,
    Math.max(0.2, (base.snapDistance || 0.3) + (jitterMs > 15 ? 0.05 : 0))
  )

  return {
    damping: adaptiveDamping,
    stiffness: adaptiveStiffness,
    maxPredictSec: fixedPredictTime,
    snapDistance: adaptiveSnapDistance,
    exponentialSmoothing: base.exponentialSmoothing,
    stateBuffering: base.stateBuffering,
    bufferSize: base.bufferSize
  }
}

/**
 * Applies adaptive smoothing to physics engine based on network metrics
 * @param {object} physicsEngine - PhysicsEngine instance
 * @param {number} jitterMs - Current network jitter in milliseconds
 */
function applyAdaptiveSmoothing(physicsEngine, jitterMs) {
  if (!physicsEngine) return

  physicsEngine.updateJitter(jitterMs)

  const baseConfig = typeof globalThis !== 'undefined' && globalThis.BBConfig
    ? globalThis.BBConfig
    : {}

  const options = calculateAdaptiveSmoothing(jitterMs, baseConfig)
  physicsEngine.setSmoothingOptions(options)
}

module.exports = {
  calculateAdaptiveSmoothing,
  applyAdaptiveSmoothing
}