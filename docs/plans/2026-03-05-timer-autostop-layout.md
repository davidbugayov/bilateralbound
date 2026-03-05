# Design: Timer Fix + Auto-Stop + Tablet Layout

## 1. Timer Bug Fix

**Root cause:** `bbCounters.tick(timestamp)` is only called inside `renderPreviewLoop` after the `previewPhysicsEngine && __previewRenderer` guard. Any early-return (during init, reconnect) silently drops time.

**Fix:** Add `setInterval(tickTimer, 100)` in `bbCounters.initDom()` that calls `this.tick(performance.now())` every 100ms. Remove `bbCounters.tick(timestamp)` from the RAF loop in controller.js — timer accumulation must not depend on rendering.

## 2. Auto-Stop Feature

Two optional numeric inputs in the controls area: "Stop after N passes" and "Stop after N seconds" (0 = disabled).

On each `bbCounters.tick()` and `bbCounters.onBounce()`, check limits:

- `autoStopPasses > 0 && passes >= autoStopPasses` → trigger stop
- `autoStopSeconds > 0 && timerMs >= autoStopSeconds * 1000` → trigger stop

Stop action: call `togglePlayPause()` (which sends `paused: true, returnToCenter: true` to server → smooth return). Increment set counter.

State stored in `bbCounters`: `autoStopPasses = 0`, `autoStopSeconds = 0`.
UI: two small number inputs with labels, placed in the controls card next to Play/Stop button. Limits reset to 0 after triggering (user must re-enter for next set).

## 3. Tablet Layout — Sticky Control Bar

Add a `#stickyControlBar` fixed element (bottom of viewport on mobile, hidden on desktop) containing:

- Timer display
- Passes count
- Sets count
- Play/Stop button (primary)
- Reset button (outline)

On mobile (≤768px): `position: fixed; bottom: 0; left: 0; right: 0` with safe-area padding for iOS.
On desktop (≥1024px): `display: none`.

Sticky bar syncs via same DOM ids as counters (mirrors bbCounters.render()) and mirrors PlayPauseController button state.

## Files to change

- `js/domain/counters.js` — timer setInterval, autoStop fields + check logic, render sticky bar elements
- `js/controller.js` — remove bbCounters.tick from RAF; add autoStop inputs wiring
- `session-controller.html` — add autoStop inputs in controls card; add sticky bar HTML
- `css/shared-components.css` — sticky bar styles
- `locales/*.json` — i18n keys for auto-stop labels
