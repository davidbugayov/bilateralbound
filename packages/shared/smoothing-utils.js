'use strict';

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
  highJitterThreshold: 15, // Threshold for snapDistance increase
  // Removed: exponentialSmoothing, stateBuffering, bufferSize — unused
};

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
      : {};

  return { ...DEFAULT_SMOOTHING_CONFIG, ...globalConfig };
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
  const config = customConfig || resolveSmoothingConfig();

  // Extract adaptive factors
  const baseDamping = config.damping || DEFAULT_SMOOTHING_CONFIG.damping;
  const baseStiffness = config.stiffness || DEFAULT_SMOOTHING_CONFIG.stiffness;
  const dampingFactor =
    config.dampingJitterFactor || DEFAULT_SMOOTHING_CONFIG.dampingJitterFactor;
  const stiffnessFactor =
    config.stiffnessJitterFactor ||
    DEFAULT_SMOOTHING_CONFIG.stiffnessJitterFactor;
  const highJitterThreshold =
    config.highJitterThreshold || DEFAULT_SMOOTHING_CONFIG.highJitterThreshold;
  const baseSnapDistance =
    config.snapDistance || DEFAULT_SMOOTHING_CONFIG.snapDistance;

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
      baseDamping + jitterMs / dampingFactor,
    ),
  );

  // Stiffness: decreases with jitter → gentler correction when network is bad
  const adaptiveStiffness = Math.min(
    10, // max clamp
    Math.max(
      1, // min clamp
      baseStiffness - jitterMs / stiffnessFactor,
    ),
  );

  // Snap distance: increases when jitter is high → wider catch zone
  const adaptiveSnapDistance = Math.min(
    0.4, // max clamp
    Math.max(
      0.2, // min clamp
      baseSnapDistance + (jitterMs > highJitterThreshold ? 0.05 : 0),
    ),
  );

  return {
    damping: adaptiveDamping,
    stiffness: adaptiveStiffness,
    maxPredictSec:
      config.maxPredictSec || DEFAULT_SMOOTHING_CONFIG.maxPredictSec,
    snapDistance: adaptiveSnapDistance,
  };
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
  if (!physicsEngine) return;

  // Update jitter metric on the engine (used for drift correction)
  physicsEngine.updateJitter(jitterMs);

  // Calculate adaptive options based on current jitter
  const options = calculateAdaptiveSmoothing(jitterMs);

  // Apply to physics engine
  physicsEngine.setSmoothingOptions(options);
}

module.exports = {
  calculateAdaptiveSmoothing,
  applyAdaptiveSmoothing,
};
