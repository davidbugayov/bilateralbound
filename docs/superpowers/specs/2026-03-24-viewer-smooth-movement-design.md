# Viewer Smooth Movement — Design Spec
**Date:** 2026-03-24
**Status:** Approved

---

## Problem

Users report choppy ball movement on the viewer (patient screen) with poor internet. Controller preview is smooth. Two separate bugs identified.

### Bug A — Periodic jitter every ~3 seconds ("обрывки")

**Root cause:** Drift correction in `PhysicsEngine` fires every 3 seconds and compares the viewer's local ball position against `_lastServerPos`. In `clientSimulationOnly: true` mode (the default), the server physics loop is skipped — `ballState.x/y` is never updated by the physics loop, only by explicit controller actions (play/pause/speed). So `_lastServerPos` stays at whatever position was last broadcast (typically center), while the ball has moved hundreds of pixels away. The correction tries to pull the ball back toward the stale center: `ease * 0.05 * offsetX` px/frame. At drift=300px this adds ~12px/frame of extra velocity for 300ms — a visible surge/jerk on the viewer.

The controller preview is unaffected because it does not receive server position updates and does not run drift correction.

### Bug B — "2 bounces normal, 3rd freezes" / "sticks to edge on pause"

**Root cause:** With high latency (500ms+), the pause command from the controller arrives late. The viewer ball has bounced locally 2 times in that interval. On the 3rd bounce the pause arrives → `setPaused(true)` → `seekingCenter` animation starts. This is *correct behavior* but looks like the ball "froze."

"Sticks to edge" occurs when the ball happens to be near a wall when the pause arrives. `seekingCenter` should start and animate the ball to center. A secondary fallback in `updatePhysicsFromState` (viewer.js) catches the case where `wasPaused === true` prevents `setPaused` from starting the animation.

Additionally, the "viewer connected but ball not moving" symptom occurs when the WebSocket opens but the server's `initial_state` message is missed or the viewer doesn't proactively request state on first connect.

---

## Solution

Two targeted fixes. No refactoring, no new abstractions.

### Fix 1 — Staleness gate on drift correction

**File:** `packages/shared/physics-engine.js` and `packages/web-client/public/js/physics-engine.js`

In `_checkDriftCorrection`, add a freshness check before running the drift comparison:

```js
// Existing:
if (!this._lastServerPos || this.state.paused) return

// Add after existing guard:
const posAge = performance.now() - this._lastServerPos.ts
if (posAge > 1500) return  // server position stale — skip correction
```

**Why 1500ms:** With `clientSimulationOnly: true`, the server only broadcasts on explicit controller actions. During normal play, no broadcasts happen → position becomes stale in <200ms. 1500ms provides a generous window while ensuring that if the server ever does run physics (5Hz = update every 200ms), drift correction remains fully active.

**Effect:** Drift correction is effectively disabled during play in `clientSimulationOnly: true` mode, eliminating the periodic jitter. No behavior change when server physics is active.

### Fix 2 — Request state sync on first connect

**File:** `packages/web-client/src/viewer.js`

Change the `wsClient.on('open', ...)` handler to always send `request_state_sync`, not only on reconnection:

```js
// Before:
if (event?.isReconnection) {
  fetchAndApplyState()
}

// After:
fetchAndApplyState()  // always — handles both first connect and reconnect
```

**Why:** On first connect the server sends `initial_state` automatically, but it can be missed if timing is off or the connection had a hiccup. Calling `fetchAndApplyState()` (REST GET `/api/session/:id/state`) is idempotent and cheap (50ms cache on server). This guarantees the viewer always has the correct state after any WS open event.

---

## Files changed

| File | Change |
|------|--------|
| `packages/shared/physics-engine.js` | +1 line in `_checkDriftCorrection` |
| `packages/web-client/public/js/physics-engine.js` | +1 line in `_checkDriftCorrection` (same) |
| `packages/web-client/src/viewer.js` | remove `if (event?.isReconnection)` guard around `fetchAndApplyState()` |

Total: ~3 lines changed.

---

## What is NOT changed

- Drift correction logic itself (threshold, duration, ease) — unchanged
- `clientSimulation` flag handling — unchanged
- `seekingCenter` / pause animation — unchanged
- Server-side physics or broadcast logic — unchanged
- Controller code — unchanged

---

## Testing

1. Open viewer in Chrome DevTools → Network → set throttling to "Slow 3G"
2. Start session, play ball at moderate speed
3. Observe: ball should move smoothly for >10 seconds without jitter
4. Controller presses pause → viewer ball should animate to center within 400ms
5. Disconnect viewer → reconnect → ball state should be correct immediately
6. Verify controller preview remains smooth throughout
