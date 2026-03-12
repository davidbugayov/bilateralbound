# Smooth Ball Movement — Pure Client Simulation

## Problem

Viewers report ball stuttering despite good internet. Controller preview also jitters. Root causes:

1. Server sends x/y coordinates at 15Hz, conflicting with local 60Hz client simulation
2. Complex interpolation pipeline (jitter buffer, dead reckoning, hermite, spring physics) fights with clientSimulation mode
3. Controller preview uses setInterval (drifts) separate from requestAnimationFrame (vsync)
4. Double `setPaused()` call in viewer.html resets velocity

## Solution: Pure Client Simulation (Approach A)

Viewer runs autonomous physics. Server sends only commands (speed, direction, play/pause), not position coordinates.

### Changes

#### 1. Viewer: ignore server x/y in clientSimulation mode

- `_handleViewerPositionUpdate()`: skip x/y/vx/vy when `clientSimulation: true`
- Accept only: paused, speed, dirX/dirY, colorBall, colorBg, radius, stopping

#### 2. Remove dead interpolation code from PhysicsEngine

- Remove: `_jitterBuffer`, `_addToJitterBuffer()`, `_consumeJitterBuffer()`
- Remove: `_hermiteInterpolate()`, `_linearInterpolate()`, `_applySmoothCorrection()`
- Remove: `_applyDeadReckoning()`, `_applyLegacyInterpolation()`
- Remove: `_applySpringPhysics()`, `_limitStepSize()`, `_autoSnapIfNeeded()`
- Remove: `_updateStateBuffer()`, `_applyExponentialSmoothing()`, `_calculateAdaptiveClamping()`
- Remove: `_interpolatePositionWithSteps()`, `_applyInterpolationSmoothing()`
- Remove: `updateViewerInterpolation()`, `_canInterpolate()`
- Keep: `updateClientPhysics()`, `_updateServerPhysics()`

#### 3. Fix double setPaused() in viewer.html

- Line ~269: remove redundant `physicsEngine.setPaused(state.paused)` — already called inside `applyCommand()`

#### 4. Controller Preview: replace setInterval with rAF-only loop

- Remove `setInterval(physicsLoop, PHYSICS_DT)`
- Set `localPhysics: true` on BallRenderer — it already has fixed-step physics loop
- Single requestAnimationFrame loop handles both physics and rendering

#### 5. Periodic drift correction (every 3s)

- Viewer checks server x/y vs local x/y every 3 seconds
- If drift > 50px: smooth correction over 300ms using lerp
- Store last server position for comparison, don't apply immediately

#### 6. Reduce server broadcast rate

- SessionManager: change broadcast from every 4th tick (15Hz) to every 12th tick (5Hz)
- Bounce events still broadcast immediately
- Sufficient for drift check + controller preview sync

## Files to Modify

- `packages/web-client/public/js/physics-engine.js` — main changes
- `packages/web-client/public/viewer.html` — remove double setPaused
- `packages/web-client/public/js/application/controller/preview-manager.js` — rAF-only
- `packages/server-core/server/session/SessionManager.js` — broadcast rate
