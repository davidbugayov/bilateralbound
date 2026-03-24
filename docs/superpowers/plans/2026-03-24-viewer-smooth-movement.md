# Viewer Smooth Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs causing choppy/frozen ball movement on the viewer screen when internet is slow.

**Architecture:** Two surgical fixes: (1) add a 1500ms staleness gate in `_checkDriftCorrection` so stale server positions never trigger drift correction during pure client simulation; (2) call `fetchAndApplyState()` on every WS open event (not just reconnections) to guarantee the viewer has correct state after any connection.

**Tech Stack:** Vanilla JS (physics-engine), Node.js (server), Webpack (bundles `src/viewer.js` → `public/dist/viewer.bundle.js`)

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/physics-engine.js` | +2 lines in `_checkDriftCorrection` (line 367) |
| `packages/web-client/public/js/physics-engine.js` | +2 lines in `_checkDriftCorrection` (line 365) — same change |
| `packages/web-client/src/viewer.js` | Remove `if (event?.isReconnection)` guard around `fetchAndApplyState()` (lines 611–614) |

**Note on two physics-engine files:**
- `packages/shared/physics-engine.js` — compiled by Webpack into `public/dist/viewer.bundle.js` (used by viewer page)
- `packages/web-client/public/js/physics-engine.js` — loaded directly via `<script>` tag by controller (no bundler)
Both files must receive the same fix.

**Note on viewer.js:**
- `packages/web-client/src/viewer.js` — compiled by Webpack, source of truth for viewer logic
- `public/js/viewer.js` does NOT exist; do not touch it

---

## Task 1: Staleness gate in `packages/shared/physics-engine.js`

**Files:**
- Modify: `packages/shared/physics-engine.js:367`

### Background

`_checkDriftCorrection` fires every 3 seconds and compares the viewer's local ball position to `_lastServerPos`. In `clientSimulationOnly: true` mode (the default), the server never broadcasts position updates during play — so `_lastServerPos` stays at the last controller-action position (usually center). The correction then tries to pull the ball toward that stale center: visible as a surge/jerk every 3 seconds.

The fix: before computing drift, check how old `_lastServerPos` is. If it's older than 1500ms, the position is stale — skip correction entirely.

`_lastServerPos` is set in `_handleViewerPositionUpdate` as `{ x, y, ts: performance.now() }`. The `ts` field already exists. The fix reads it.

- [ ] **Step 1: Verify current code**

Read `packages/shared/physics-engine.js` lines 366–375 and confirm:
```js
_checkDriftCorrection() {
  if (!this._lastServerPos || this.state.paused) return
  const now = performance.now()
```

- [ ] **Step 2: Add staleness gate**

In `packages/shared/physics-engine.js`, after line 367 (`if (!this._lastServerPos || this.state.paused) return`), insert:

```js
    const posAge = performance.now() - this._lastServerPos.ts
    if (posAge > 1500) return  // server position stale — skip correction
```

The result should be:
```js
  _checkDriftCorrection() {
    if (!this._lastServerPos || this.state.paused) return
    const posAge = performance.now() - this._lastServerPos.ts
    if (posAge > 1500) return  // server position stale — skip correction
    const now = performance.now()
    const checkInterval = this.options.smoothing.driftCheckIntervalMs || 3000
```

- [ ] **Step 3: Verify the edit looks correct**

Read `packages/shared/physics-engine.js` lines 366–380. Confirm the two new lines appear between the null guard and `const now = performance.now()`.

---

## Task 2: Staleness gate in `packages/web-client/public/js/physics-engine.js`

**Files:**
- Modify: `packages/web-client/public/js/physics-engine.js:365`

This is the same fix as Task 1, applied to the standalone file used by the controller page. The structure is identical — only the indentation style may differ (4 spaces vs 2 spaces).

- [ ] **Step 1: Verify current code**

Read `packages/web-client/public/js/physics-engine.js` lines 365–374. Confirm the same `_checkDriftCorrection` pattern.

- [ ] **Step 2: Add staleness gate**

After the null guard line (`if (!this._lastServerPos || this.state.paused) return`), insert:

```js
      const posAge = performance.now() - this._lastServerPos.ts
      if (posAge > 1500) return  // server position stale — skip correction
```

Match the existing indentation style of the surrounding code.

- [ ] **Step 3: Verify the edit looks correct**

Read `packages/web-client/public/js/physics-engine.js` lines 365–380. Confirm the two new lines appear in the right place.

- [ ] **Step 4: Commit both physics-engine fixes**

```bash
git add packages/shared/physics-engine.js packages/web-client/public/js/physics-engine.js
git commit -m "fix: skip drift correction when server position is stale (>1500ms)"
```

---

## Task 3: Always fetch state on WS open in `packages/web-client/src/viewer.js`

**Files:**
- Modify: `packages/web-client/src/viewer.js:611–614`

### Background

Currently `fetchAndApplyState()` (REST GET `/api/session/:id/state`) is only called on reconnections. On first connect, the server sends `initial_state` via WebSocket, but with bad internet this message can be missed or arrive out-of-order. Calling `fetchAndApplyState()` unconditionally on every WS open is safe: the REST endpoint has a 50ms server-side cache, and the function is idempotent.

- [ ] **Step 1: Verify current code**

Read `packages/web-client/src/viewer.js` lines 607–625. Confirm:
```js
  wsClient.on('open', (event) => {
    debugLog('✅ WS connection established.')
    const connMsg = globalThis.i18n?.t('viewer.connectionEstablished') || 'Connection established'
    components.status?.setStatus('success', connMsg)
    if (event?.isReconnection) {
      debugWarn('🔄 WS reconnected - fetching state via REST')
      fetchAndApplyState()
    }
    wsClient.send('viewer_connected', {
```

- [ ] **Step 2: Remove the isReconnection guard**

Replace the guarded block with an unconditional call:

**Before:**
```js
    if (event?.isReconnection) {
      debugWarn('🔄 WS reconnected - fetching state via REST')
      fetchAndApplyState()
    }
```

**After:**
```js
    fetchAndApplyState()
```

- [ ] **Step 3: Verify the edit**

Read `packages/web-client/src/viewer.js` lines 607–625. Confirm the `if (event?.isReconnection)` block is gone and `fetchAndApplyState()` is called unconditionally.

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/src/viewer.js
git commit -m "fix: always fetch state on WS open, not only on reconnect"
```

---

## Task 4: Build and verify

**Files:**
- Run: `npm run build` (Webpack compiles `src/viewer.js` → `public/dist/viewer.bundle.js`)

The changes to `src/viewer.js` and `packages/shared/physics-engine.js` only take effect after rebuilding the bundle.

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: build completes with no errors. The file `packages/web-client/public/dist/viewer.bundle.js` is updated.

- [ ] **Step 2: Verify the staleness gate is in the bundle**

```bash
grep -c "posAge > 1500" packages/web-client/public/dist/viewer.bundle.js
```

Expected: `1` (minified, but the literal should survive).

- [ ] **Step 3: Verify the fetchAndApplyState change is in the bundle**

```bash
grep -c "isReconnection" packages/web-client/public/dist/viewer.bundle.js
```

Expected: `0` — the guard is gone.

- [ ] **Step 4: Commit the built bundle**

```bash
git add packages/web-client/public/dist/viewer.bundle.js
git commit -m "build: rebuild viewer bundle with smooth movement fixes"
```

---

## Task 5: Manual testing

No automated E2E tests cover slow-network physics (they run against localhost with no throttling). Manual verification in Chrome DevTools is the correct approach.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open viewer with throttling**

1. Open Chrome DevTools → Network tab → set throttling to **Slow 3G** (or "Fast 3G")
2. Open `http://localhost:3000/s/test` as viewer in that throttled tab
3. Open `http://localhost:3000/c/test` as controller in a second tab (no throttling)

- [ ] **Step 3: Test Fix 1 — no jitter during play**

1. Controller: press Play at moderate speed
2. Viewer: watch the ball for at least **15 seconds**
3. Expected: ball moves smoothly — no surges or direction changes at the ~3 second mark
4. Previously: a visible jerk/surge every ~3 seconds

- [ ] **Step 4: Test Fix 2 — correct state on first connect**

1. Viewer: hard-reload the page (`Cmd+Shift+R`) while ball is playing
2. Expected: within 1–2 seconds, ball is moving on the viewer in the correct direction/speed
3. Previously (rare): viewer showed "connected" but ball didn't start moving

- [ ] **Step 5: Test pause behavior**

1. Controller: press Pause while ball is near an edge
2. Expected: ball animates to center within ~400ms (seekingCenter animation)
3. Controller: press Play again → ball starts moving

- [ ] **Step 6: Test controller preview**

1. Throughout all above steps, verify controller preview ball remains smooth
2. Expected: no change — controller preview is unaffected by these fixes

---

## Summary

| Fix | File(s) | Lines changed |
|-----|---------|---------------|
| Staleness gate on drift correction | `packages/shared/physics-engine.js` + `packages/web-client/public/js/physics-engine.js` | +2 lines each |
| Always fetch state on connect | `packages/web-client/src/viewer.js` | -3 lines (remove guard) |
| Rebuild | `packages/web-client/public/dist/viewer.bundle.js` | generated |

Total source changes: ~1 line net added across 3 files.
