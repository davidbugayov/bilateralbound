'use strict'
/**
 * PreviewSmoother — predictive smoothing for controller preview ball movement
 *
 * WHY (architecture decision):
 * Unlike classic game networking problems, our viewer and controller both know
 * velocity and direction from the server. This enables dead reckoning + snapshot
 * interpolation for perfectly smooth movement at 60Hz between 15Hz server updates.
 *
 * The smoother combines three techniques:
 * 1. Dead Reckoning — predicts position using last known velocity between updates
 * 2. Cubic Hermite Interpolation — smooth curves through snapshotted positions
 *    using velocity as tangents, avoiding sharp direction changes
 * 3. Spring-Damper Correction — gradually corrects drift instead of snapping,
 *   eliminating visible jitter when server position differs from prediction
 *
 * PERFORMANCE: All operations are O(1) per frame — single matrix calculation
 * for Hermite, single spring-damper step. No allocation in hot path.
 */

// ============================================
// CUBIC HERMITE SPLINE
// ============================================

/**
 * Cubic Hermite interpolation between two points with velocity tangents.
 * WHY: Unlike linear interpolation which creates sharp direction changes at
 * snapshot boundaries, Hermite splines guarantee C1 continuity (smooth velocity)
 * because the curve honors both position AND velocity at endpoints.
 *
 * @param {number} t - Interpolation factor [0, 1]
 * @param {number} p0 - Start position
 * @param {number} p1 - End position
 * @param {number} m0 - Tangent at start (velocity * time_span)
 * @param {number} m1 - Tangent at end (velocity * time_span)
 * @returns {number} Interpolated value
 */
function cubicHermite(t, p0, p1, m0, m1) {
  // Clamp t to [0, 1] to prevent extrapolation artifacts
  const clampedT = t < 0 ? 0 : t > 1 ? 1 : t
  const t2 = clampedT * clampedT
  const t3 = t2 * clampedT

  // Hermite basis functions:
  // H00(t) = 2t³ - 3t² + 1  (position at start)
  // H10(t) = t³ - 2t² + t   (tangent at start)
  // H01(t) = -2t³ + 3t²     (position at end)
  // H11(t) = t³ - t²         (tangent at end)
  return (2 * t3 - 3 * t2 + 1) * p0 +
         (t3 - 2 * t2 + clampedT) * m0 +
         (-2 * t3 + 3 * t2) * p1 +
         (t3 - t2) * m1
}

// ============================================
// SPRING-DAMPER MODEL
// ============================================

/**
 * Spring-damper system for smooth drift correction.
 * WHY: Instead of snapping the ball to the server position (causes visible jitter),
 * we model a virtual spring between current and target position. The spring force
 * pulls toward target while damping prevents oscillation.
 *
 * F_spring = stiffness * displacement
 * F_damper = damping * velocity
 * F_total = F_spring - F_damper
 *
 * @param {number} current - Current position
 * @param {number} target - Target (server) position
 * @param {number} currentVelocity - Current velocity of the object
 * @param {number} dt - Time delta in seconds
 * @param {number} stiffness - Spring stiffness coefficient (higher = faster correction)
 * @param {number} damping - Damping coefficient (higher = less overshoot)
 * @returns {{pos: number, vel: number}} Updated position and velocity
 */
function applySpringDamper(current, target, currentVelocity, dt, stiffness, damping) {
  const displacement = target - current

  // Spring force: pulls toward target
  const springForce = stiffness * displacement

  // Damper force: resists motion (prevents oscillation)
  const damperForce = damping * currentVelocity

  // Net acceleration
  const acceleration = springForce - damperForce

  // Integrate: semi-implicit Euler (stable for stiff springs)
  const newVelocity = currentVelocity + acceleration * dt
  const newPosition = current + newVelocity * dt

  return { pos: newPosition, vel: newVelocity }
}

// ============================================
// SNAPSHOT BUFFER
// ============================================

/**
 * Circular buffer of server state snapshots for interpolation.
 * WHY: Server updates arrive at irregular intervals (~15Hz) due to network jitter.
 * By buffering snapshots and rendering with a small delay (jitter buffer), we can
 * always interpolate between two known-good states instead of extrapolating.
 *
 * Memory: Fixed-size circular buffer (3 entries) = constant O(1) memory.
 */
class SnapshotBuffer {
  /**
   * @param {number} capacity - Max snapshots to store (default: 3)
   * @param {number} delayMs - Render delay in ms for jitter compensation (default: 50)
   */
  constructor(capacity = 3, delayMs = 50) {
    this._buffer = new Array(capacity)
    this._capacity = capacity
    this._head = 0
    this._count = 0
    this._delayMs = delayMs
  }

  /**
   * Add a server snapshot to the buffer.
   * @param {number} timestamp - Server update timestamp (performance.now())
   * @param {number} x - Ball X position
   * @param {number} y - Ball Y position
   * @param {number} vx - Ball X velocity (px/s)
   * @param {number} vy - Ball Y velocity (px/s)
   */
  addSnapshot(timestamp, x, y, vx, vy) {
    const snapshot = { timestamp, x, y, vx, vy }
    this._buffer[this._head] = snapshot
    this._head = (this._head + 1) % this._capacity
    if (this._count < this._capacity) {
      this._count++
    }
  }

  /**
   * Get interpolated position at render time using cubic Hermite spline.
   * Renders at (now - delayMs) to allow jitter buffer to smooth network variance.
   *
   * @param {number} renderTime - Current time (performance.now())
   * @returns {{x: number, y: number, vx: number, vy: number, valid: boolean}}
   */
  getPosition(renderTime) {
    const targetTime = renderTime - this._delayMs

    // Need at least 2 snapshots for interpolation
    if (this._count < 2) {
      // Fallback: return oldest snapshot with dead reckoning
      const oldest = this._buffer[0]
      if (!oldest) return { x: 0, y: 0, vx: 0, vy: 0, valid: false }

      const dt = (targetTime - oldest.timestamp) / 1000
      return {
        x: oldest.x + oldest.vx * dt,
        y: oldest.y + oldest.vy * dt,
        vx: oldest.vx,
        vy: oldest.vy,
        valid: true
      }
    }

    // Find the two snapshots bracketing targetTime
    let s0 = null
    let s1 = null

    for (let i = 0; i < this._count - 1; i++) {
      const idx = (this._head - this._count + 1 + i + this._capacity) % this._capacity
      const nextIdx = (idx + 1) % this._capacity

      const a = this._buffer[idx]
      const b = this._buffer[nextIdx]

      if (a && b && a.timestamp <= targetTime && b.timestamp >= targetTime) {
        s0 = a
        s1 = b
        break
      }
    }

    // Fallback: if no bracketing pair found, use the two most recent
    if (!s0 || !s1) {
      const recent1 = this._buffer[(this._head - 2 + this._capacity) % this._capacity]
      const recent2 = this._buffer[(this._head - 1 + this._capacity) % this._capacity]
      if (recent1 && recent2) {
        s0 = recent1
        s1 = recent2
      } else {
        return { x: 0, y: 0, vx: 0, vy: 0, valid: false }
      }
    }

    // Calculate interpolation parameter t
    const timeSpan = s1.timestamp - s0.timestamp
    if (timeSpan <= 0) return { x: s1.x, y: s1.y, vx: s1.vx, vy: s1.vy, valid: true }

    const t = (targetTime - s0.timestamp) / timeSpan

    // Hermite tangents: velocity * time_span gives proper tangent magnitude
    const mx = s0.vx * (timeSpan / 1000)
    const my = s0.vy * (timeSpan / 1000)
    const mx1 = s1.vx * (timeSpan / 1000)
    const my1 = s1.vy * (timeSpan / 1000)

    return {
      x: cubicHermite(t, s0.x, s1.x, mx, mx1),
      y: cubicHermite(t, s0.y, s1.y, my, my1),
      vx: s1.vx,
      vy: s1.vy,
      valid: true
    }
  }

  /**
   * Clear all snapshots (e.g., on pause).
   */
  clear() {
    this._head = 0
    this._count = 0
    this._buffer.fill(null)
  }

  get count() { return this._count }
}

// ============================================
// PREDICTIVE SMOOTHER (MAIN CLASS)
// ============================================

/**
 * Combines dead reckoning, snapshot buffering, and spring-damper correction
 * for smooth controller preview ball movement.
 */
class PreviewSmoother {
  /**
   * @param {object} [options={}] - Configuration
   * @param {number} [options.bufferCapacity=3] - Snapshot buffer size
   * @param {number} [options.bufferDelayMs=50] - Render delay for jitter buffer
   * @param {number} [options.springStiffness=12] - Spring stiffness (higher = faster correction)
   * @param {number} [options.springDamping=6] - Spring damping (higher = less overshoot)
   * @param {number} [options.driftThreshold=15] - Drift threshold in px before correction triggers
   */
  constructor(options = {}) {
    this._snapshotBuffer = new SnapshotBuffer(
      options.bufferCapacity ?? 3,
      options.bufferDelayMs ?? 50
    )

    // Spring-damper parameters
    this._stiffness = options.springStiffness ?? 12
    this._damping = options.springDamping ?? 6
    this._driftThreshold = options.driftThreshold ?? 15

    // Spring-damper state
    this._springVelX = 0
    this._springVelY = 0
    this._isSpringActive = false

    // Dead reckoning state
    this._lastKnownX = 0
    this._lastKnownY = 0
    this._lastKnownVx = 0
    this._lastKnownVy = 0
    this._lastKnownTs = 0

    // Drift tracking
    this._driftX = 0
    this._driftY = 0
    this._hasDriftCorrection = false

    // Adaptive parameters (updated by applyAdaptiveSmoothing)
    this._adaptiveStiffness = this._stiffness
    this._adaptiveDamping = this._damping
    this._adaptiveDriftThreshold = this._driftThreshold
  }

  /**
   * Update smoother with new server state.
   * Call this when receiving state_update from WebSocket.
   *
   * @param {number} timestamp - Current time (performance.now())
   * @param {number} x - Server ball X position
   * @param {number} y - Server ball Y position
   * @param {number} vx - Server ball X velocity (or calculated from direction)
   * @param {number} vy - Server ball Y velocity
   */
  addServerUpdate(timestamp, x, y, vx, vy) {
    this._lastKnownX = x
    this._lastKnownY = y
    this._lastKnownVx = vx
    this._lastKnownVy = vy
    this._lastKnownTs = timestamp

    // Add to snapshot buffer for Hermite interpolation
    this._snapshotBuffer.addSnapshot(timestamp, x, y, vx, vy)

    // Calculate drift for spring-damper correction
    this._hasDriftCorrection = true
  }

  /**
   * Get smoothed/predicted position for rendering.
   * Call this every render frame (60Hz).
   *
   * @param {number} renderTime - Current time (performance.now())
   * @param {number} physicsEngineX - Current physics engine X (for drift correction)
   * @param {number} physicsEngineY - Current physics engine Y
   * @param {number} dt - Frame delta time in seconds
   * @returns {{x: number, y: number}} Smoothed position
   */
  getPredictedPosition(renderTime, physicsEngineX, physicsEngineY, dt) {
    // Get interpolated position from snapshot buffer
    const interpolated = this._snapshotBuffer.getPosition(renderTime)

    if (!interpolated.valid) {
      // Fallback: dead reckoning from last known state
      const dtSec = (renderTime - this._lastKnownTs) / 1000
      return {
        x: this._lastKnownX + this._lastKnownVx * dtSec,
        y: this._lastKnownY + this._lastKnownVy * dtSec
      }
    }

    // Calculate drift between interpolated and physics engine position
    this._driftX = interpolated.x - physicsEngineX
    this._driftY = interpolated.y - physicsEngineY

    const driftMagnitude = Math.hypot(this._driftX, this._driftY)

    // Only apply spring-damper if drift exceeds threshold
    // WHY: Small drifts are imperceptible; correcting them wastes CPU and can
    // introduce micro-jitter. Threshold prevents unnecessary correction.
    if (driftMagnitude > this._adaptiveDriftThreshold) {
      this._isSpringActive = true

      // Apply spring-damper correction to smooth the drift
      const springX = applySpringDamper(
        physicsEngineX, interpolated.x, this._springVelX, dt,
        this._adaptiveStiffness, this._adaptiveDamping
      )
      const springY = applySpringDamper(
        physicsEngineY, interpolated.y, this._springVelY, dt,
        this._adaptiveStiffness, this._adaptiveDamping
      )

      this._springVelX = springX.vel
      this._springVelY = springY.vel

      return { x: springX.pos, y: springY.pos }
    } else {
      // Drift is acceptable, use physics engine position directly
      // WHY: Physics engine already runs dead reckoning at 60Hz, which is
      // perfectly smooth when drift is small (< threshold).
      this._springVelX *= 0.5  // Decay spring velocity when inactive
      this._springVelY *= 0.5
      this._isSpringActive = false

      return { x: physicsEngineX, y: physicsEngineY }
    }
  }

  /**
   * Reset smoother state (e.g., on pause or reset).
   */
  reset() {
    this._snapshotBuffer.clear()
    this._springVelX = 0
    this._springVelY = 0
    this._isSpringActive = false
    this._driftX = 0
    this._driftY = 0
    this._hasDriftCorrection = false
  }

  /**
   * Force snap to exact position (bypasses all smoothing).
   * Use for immediate corrections like pause/center.
   *
   * @param {number} x - Target X
   * @param {number} y - Target Y
   */
  snapToPosition(x, y) {
    this._lastKnownX = x
    this._lastKnownY = y
    this._springVelX = 0
    this._springVelY = 0
    this._isSpringActive = false
  }

  /**
   * Update adaptive parameters from network jitter measurement.
   * Called when net_metrics event is received.
   *
   * @param {number} jitterMs - Current network jitter in milliseconds
   */
  updateAdaptiveParams(jitterMs) {
    // Higher jitter = higher threshold (tolerate more drift before correcting)
    // and lower stiffness/ stronger damping (slower, smoother correction)
    this._adaptiveDriftThreshold = Math.min(
      30,
      Math.max(10, this._driftThreshold + jitterMs * 0.5)
    )

    this._adaptiveStiffness = Math.min(
      20,
      Math.max(6, this._stiffness - jitterMs * 0.2)
    )

    this._adaptiveDamping = Math.min(
      12,
      Math.max(4, this._damping + jitterMs * 0.1)
    )
  }

  // ============================================
  // Getters for debugging/inspection
  // ============================================

  get driftX() { return this._driftX }
  get driftY() { return this._driftY }
  get isSpringActive() { return this._isSpringActive }
  get bufferCount() { return this._snapshotBuffer.count }
  get stiffness() { return this._adaptiveStiffness }
  get damping() { return this._adaptiveDamping }
  get driftThreshold() { return this._adaptiveDriftThreshold }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  PreviewSmoother,
  SnapshotBuffer,
  cubicHermite,
  applySpringDamper
}