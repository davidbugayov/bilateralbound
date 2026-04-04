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
  // Base smoothing parameters
  damping: 20, // Base damping (15-25 range) — higher = smoother
  stiffness: 30, // Base stiffness (25-35 range) — lower = smoother
  maxPredictSec: 0.02, // Max prediction time in seconds
  snapDistance: 0.3, // Snap distance threshold (0.2-0.4)

  // Adaptive factors — how much jitter affects each parameter
  dampingJitterFactor: 20, // jitterMs / factor added to damping
  stiffnessJitterFactor: 30, // jitterMs / factor subtracted from stiffness
  highJitterThreshold: 15, // Threshold for snapDistance increase

  // Exponential smoothing
  exponentialSmoothing: false, // Use exponential smoothing
  stateBuffering: false, // Use state buffering
  bufferSize: 10, // Buffer size for state buffering
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
  // Damping: increases with jitter → more smoothing when network is bad
  const adaptiveDamping = Math.min(
    25, // max clamp
    Math.max(
      15, // min clamp
      baseDamping + jitterMs / dampingFactor,
    ),
  );

  // Stiffness: decreases with jitter → gentler correction when network is bad
  const adaptiveStiffness = Math.min(
    35, // max clamp
    Math.max(
      25, // min clamp
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
    exponentialSmoothing: config.exponentialSmoothing,
    stateBuffering: config.stateBuffering,
    bufferSize: config.bufferSize,
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

// ============================================
// DEBUG HELPERS
// ============================================

/**
 * Gets current smoothing config as human-readable string
 * Useful for debugging/logging
 * @returns {string} Config summary
 */
function getSmoothingConfigString() {
  const config = resolveSmoothingConfig();
  return `SmoothingConfig{damping:${config.damping}, stiffness:${config.stiffness}, maxPredictSec:${config.maxPredictSec}, snapDistance:${config.snapDistance}}`;
}

module.exports = {
  DEFAULT_SMOOTHING_CONFIG,
  calculateAdaptiveSmoothing,
  applyAdaptiveSmoothing,
  resolveSmoothingConfig,
  getSmoothingConfigString,
};
