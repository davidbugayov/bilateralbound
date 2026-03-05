# Timer Fix + Auto-Stop + Sticky Control Bar — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the slow timer bug, add auto-stop by passes or seconds, and add a sticky control bar so therapists don't need to scroll on tablets.

**Architecture:** Three independent changes to `controller.js` (local `bbCounters`) + `session-controller.html` + CSS. The timer is decoupled from the RAF render loop via `setInterval`. Auto-stop is checked inside `bbCounters.tick()` and `bbCounters.onBounce()`. The sticky bar mirrors the existing counter DOM and the same `togglePlayPause()` global.

**Tech Stack:** Vanilla JS, CSS (no bundler), i18n via `globalThis.i18n?.t('key') || 'fallback'`

---

## Context You Must Know

- **`bbCounters` in `controller.js` (line 49)** is the ACTIVE counter object — it has DOM elements bound and is what shows on screen. There is a SECOND `bbCounters` exported from `js/domain/counters.js` via `globalThis.bbCounters` — it is NOT displayed (no `initDom()` called on it). All changes go to the one in `controller.js`.
- **`renderPreviewLoop` in `controller.js` (line 801)** currently calls `bbCounters.tick(timestamp)` at line 809. This is the bug: the function guards early-return when `previewPhysicsEngine` or `__previewRenderer` is null, silently dropping time. We remove the tick from here.
- **`togglePlayPause()`** is a global function in `controller.js` called by HTML buttons. It is safe to call from `bbCounters` via `globalThis.togglePlayPause?.()`.
- **i18n pattern:** `globalThis.i18n?.t('controller.someKey') || 'English fallback'`. Keys live in `packages/web-client/public/locales/*/common.json` under `"controller": { ... }`.
- **No bundler.** Script load order in `session-controller.html` matters. `controller.js` is last.
- **CSS:** shared styles in `packages/web-client/public/css/shared-components.css`. Controller-specific styles in `css/controller.css`.

---

## Task 1: Fix Timer — Decouple from RAF

**Files:**

- Modify: `packages/web-client/public/js/controller.js`

The timer currently ticks only when the render loop is healthy. Replace with a dedicated interval.

**Step 1: Find and remove the RAF tick**

In `controller.js`, find `renderPreviewLoop` (~line 801). Remove ONLY this line:

```js
bbCounters.tick(timestamp);
```

Do not remove anything else from the function.

**Step 2: Add interval tick to `bbCounters.initDom()`**

In `controller.js`, find `bbCounters.initDom()` (~line 67). Add a `setInterval` at the end of the method, before the closing `}`:

```js
// Drive timer accumulation independently of render loop
this._timerInterval = setInterval(() => {
  this.tick(performance.now());
}, 100);
```

Also add `_timerInterval: null` to the bbCounters object properties (top of the object, near the other `null` fields).

**Step 3: Clear interval in `bbCounters.resetAll()`**

At the end of `resetAll()`, the interval should NOT be cleared (it should keep running). No change needed — the interval always runs while the page is open.

**Step 4: Verify manually**

Run `npm run dev`, open the controller page, start a session, run a stopwatch for 60 seconds. Timer should show 1:00 (±1s). Previously showed ~0:40.

**Step 5: Commit**

```bash
git add packages/web-client/public/js/controller.js
git commit -m "fix: drive timer via setInterval, not RAF"
```

---

## Task 2: Add Auto-Stop Fields to `bbCounters`

**Files:**

- Modify: `packages/web-client/public/js/controller.js`

**Step 1: Add state fields**

At the top of the `bbCounters` object (with the other properties), add:

```js
autoStopPasses: 0,    // 0 = disabled
autoStopSeconds: 0,   // 0 = disabled
_autoStopFired: false,
```

**Step 2: Add `_checkAutoStop()` method**

Add this method to the `bbCounters` object:

```js
_checkAutoStop() {
  if (this._autoStopFired || !this.running) return
  const passLimit = this.autoStopPasses
  const secLimit = this.autoStopSeconds
  const passHit = passLimit > 0 && this.passes >= passLimit
  const secHit = secLimit > 0 && this.timerMs >= secLimit * 1000
  if (passHit || secHit) {
    this._autoStopFired = true
    // Small delay so the last bounce registers visually
    setTimeout(() => {
      if (typeof globalThis.togglePlayPause === 'function') {
        globalThis.togglePlayPause()
      }
    }, 200)
  }
},
```

**Step 3: Call `_checkAutoStop()` in `tick()` and `onBounce()`**

In `tick()`, add at the end of the `if (dt > 0)` block (after `this.render()`):

```js
this._checkAutoStop();
```

In `onBounce()`, add at the end (after `this.render()`):

```js
this._checkAutoStop();
```

**Step 4: Reset `_autoStopFired` on `start()`**

In `bbCounters.start()`, add:

```js
this._autoStopFired = false;
```

**Step 5: Commit**

```bash
git add packages/web-client/public/js/controller.js
git commit -m "feat: add auto-stop logic to bbCounters"
```

---

## Task 3: Add Auto-Stop UI Inputs

**Files:**

- Modify: `packages/web-client/public/session-controller.html`
- Modify: `packages/web-client/public/locales/en/common.json`
- Modify: `packages/web-client/public/locales/ru/common.json`
- Modify: `packages/web-client/public/js/controller.js`

**Step 1: Add i18n keys to `en/common.json`**

Inside `"controller": { ... }`, add:

```json
"autoStopLabel": "Auto-stop",
"autoStopPassesLabel": "passes",
"autoStopSecondsLabel": "sec",
"autoStopPlaceholder": "0 = off"
```

**Step 2: Add same keys to `ru/common.json`**

```json
"autoStopLabel": "Авто-стоп",
"autoStopPassesLabel": "пасов",
"autoStopSecondsLabel": "сек",
"autoStopPlaceholder": "0 = выкл"
```

**Step 3: Add the same keys to all other 6 locales** (`de`, `es`, `fr`, `pt`, `ja`, `zh`) using the English values as fallback (translators can fix later).

**Step 4: Add auto-stop inputs to HTML**

In `session-controller.html`, find the `actions-grid` div that contains `#playPauseBtn` and the reset button (~line 528). After the closing `</div>` of `actions-grid`, add:

```html
<div class="autostop-row" id="autoStopRow">
  <span class="autostop-label" data-i18n="controller.autoStopLabel"
    >Auto-stop</span
  >
  <div class="autostop-field">
    <input
      type="number"
      id="autoStopPassesInput"
      class="autostop-input"
      min="0"
      max="9999"
      value="0"
      data-i18n-attr="placeholder:controller.autoStopPlaceholder"
      placeholder="0 = off"
    />
    <span class="autostop-unit" data-i18n="controller.autoStopPassesLabel"
      >passes</span
    >
  </div>
  <div class="autostop-field">
    <input
      type="number"
      id="autoStopSecondsInput"
      class="autostop-input"
      min="0"
      max="9999"
      value="0"
      data-i18n-attr="placeholder:controller.autoStopPlaceholder"
      placeholder="0 = off"
    />
    <span class="autostop-unit" data-i18n="controller.autoStopSecondsLabel"
      >sec</span
    >
  </div>
</div>
```

**Step 5: Wire inputs in `controller.js`**

Find where `bbCounters.initDom()` is called (~line 244). After it, add:

```js
const autoStopPassesInput = document.getElementById("autoStopPassesInput");
const autoStopSecondsInput = document.getElementById("autoStopSecondsInput");
if (autoStopPassesInput) {
  autoStopPassesInput.addEventListener("change", () => {
    bbCounters.autoStopPasses = Math.max(
      0,
      parseInt(autoStopPassesInput.value, 10) || 0,
    );
  });
}
if (autoStopSecondsInput) {
  autoStopSecondsInput.addEventListener("change", () => {
    bbCounters.autoStopSeconds = Math.max(
      0,
      parseInt(autoStopSecondsInput.value, 10) || 0,
    );
  });
}
```

**Step 6: Add CSS for auto-stop inputs**

In `packages/web-client/public/css/shared-components.css`, at the end of the file, add:

```css
.autostop-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.autostop-label {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 500;
  min-width: 70px;
}

.autostop-field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.autostop-input {
  width: 64px;
  padding: 5px 7px;
  border-radius: 6px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;
  text-align: center;
}

.light-theme .autostop-input {
  background: #fff;
  border-color: #cbd5e1;
  color: #374151;
}

.autostop-unit {
  font-size: 12px;
  color: #64748b;
}
```

**Step 7: Verify manually**

Run `npm run dev`. Set auto-stop to 5 passes. Start session. After 5 passes the ball should smoothly return to center and a new set should be counted.

**Step 8: Commit**

```bash
git add packages/web-client/public/session-controller.html \
        packages/web-client/public/js/controller.js \
        packages/web-client/public/css/shared-components.css \
        packages/web-client/public/locales/*/common.json
git commit -m "feat: add auto-stop by passes and seconds"
```

---

## Task 4: Sticky Control Bar HTML + CSS

**Files:**

- Modify: `packages/web-client/public/session-controller.html`
- Modify: `packages/web-client/public/css/shared-components.css`

> Use the `frontend-design` skill when making styling decisions for this task.

**Step 1: Add sticky bar HTML**

At the bottom of `<body>` in `session-controller.html`, before the `<script>` tags, add:

```html
<div
  id="stickyControlBar"
  class="sticky-control-bar"
  role="toolbar"
  aria-label="Session controls"
>
  <div class="sticky-counters">
    <div class="sticky-counter">
      <span class="sticky-counter-label" data-i18n="controller.timerLabel"
        >Timer</span
      >
      <span
        id="stickyTimer"
        class="sticky-counter-value sticky-counter-value--timer"
        >0:00</span
      >
    </div>
    <div class="sticky-counter">
      <span class="sticky-counter-label" data-i18n="controller.passesLabel"
        >Passes</span
      >
      <span id="stickyPasses" class="sticky-counter-value">0</span>
    </div>
    <div class="sticky-counter">
      <span class="sticky-counter-label" data-i18n="controller.setsLabel"
        >Sets</span
      >
      <span id="stickySets" class="sticky-counter-value">0</span>
    </div>
  </div>
  <div class="sticky-actions">
    <button
      id="stickyPlayPauseBtn"
      class="btn primary sticky-btn"
      onclick="togglePlayPause()"
      data-i18n="controller.start"
    >
      ▶️ Старт
    </button>
    <button
      class="btn outline sticky-btn"
      onclick="resetSession()"
      data-i18n="controller.reset"
    >
      🔄
    </button>
  </div>
</div>
```

**Step 2: Add sticky bar CSS**

In `packages/web-client/public/css/shared-components.css`, add at the end:

```css
/* === STICKY CONTROL BAR (tablet / mobile) === */
.sticky-control-bar {
  display: none; /* hidden on desktop */
}

@media (width <= 900px) {
  .sticky-control-bar {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 500;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
    background: rgb(15 23 42 / 97%);
    border-top: 1px solid #334155;
    backdrop-filter: blur(12px);
    box-shadow: 0 -4px 20px rgb(0 0 0 / 40%);
  }

  .light-theme .sticky-control-bar {
    background: rgb(255 255 255 / 97%);
    border-top-color: #e2e8f0;
    box-shadow: 0 -4px 20px rgb(0 0 0 / 15%);
  }

  /* Add bottom padding to body so sticky bar doesn't cover content */
  body {
    padding-bottom: 80px;
  }
}

.sticky-counters {
  display: flex;
  gap: 16px;
  align-items: center;
}

.sticky-counter {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
}

.sticky-counter-label {
  font-size: 10px;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sticky-counter-value {
  font-size: 20px;
  font-weight: 700;
  color: #e2e8f0;
}

.light-theme .sticky-counter-value {
  color: #1e293b;
}

.sticky-counter-value--timer {
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: center;
}

.sticky-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sticky-btn {
  padding: 10px 16px;
  font-size: 14px;
  min-height: 44px;
  white-space: nowrap;
}
```

**Step 3: Verify visually**

Run `npm run dev`, open controller in a narrow browser window (≤900px wide). The sticky bar should appear at the bottom with timer, passes, sets, and Start/Reset buttons.

**Step 4: Commit**

```bash
git add packages/web-client/public/session-controller.html \
        packages/web-client/public/css/shared-components.css
git commit -m "feat: add sticky control bar for tablet"
```

---

## Task 5: Sync Sticky Bar State

**Files:**

- Modify: `packages/web-client/public/js/controller.js`

The sticky bar needs to show live counter values and the correct play/pause button label.

**Step 1: Add sticky DOM refs to `bbCounters.initDom()`**

In `controller.js`, inside `bbCounters.initDom()`, add:

```js
this.$stickyTimer = document.getElementById("stickyTimer");
this.$stickyPasses = document.getElementById("stickyPasses");
this.$stickySets = document.getElementById("stickySets");
```

Also add the properties to the object top:

```js
$stickyTimer: null,
$stickyPasses: null,
$stickySets: null,
```

**Step 2: Update `bbCounters.render()` to sync sticky bar**

In `bbCounters.render()`, after the existing `if (this.$timer)` lines, add:

```js
if (this.$stickyTimer)
  this.$stickyTimer.textContent = this.formatTime(this.timerMs);
if (this.$stickyPasses) this.$stickyPasses.textContent = String(this.passes);
if (this.$stickySets) this.$stickySets.textContent = String(this.sets);
```

**Step 3: Sync sticky play/pause button label**

Find `updatePlayPauseButton()` in `controller.js` (~line 18 of play-pause.js, but there's also a local copy used in controller.js). In controller.js, find the function that updates `#playPauseBtn` text and `.playing` class. Add the same logic for `#stickyPlayPauseBtn`:

```js
const stickyBtn = document.getElementById("stickyPlayPauseBtn");
if (stickyBtn) {
  stickyBtn.textContent = isPlaying
    ? globalThis.i18n?.t("controller.stop") || "⏸ Стоп"
    : globalThis.i18n?.t("controller.start") || "▶️ Старт";
  stickyBtn.classList.toggle("playing", isPlaying);
}
```

Find where `updatePlayPauseButton()` is defined in controller.js (search for the function that sets `btn.textContent`). Add the sticky button update at the end of that function.

**Step 4: Verify**

Run `npm run dev` at ≤900px width. Press Start — sticky button should change to Stop. Counter values should update in real-time.

**Step 5: Commit**

```bash
git add packages/web-client/public/js/controller.js
git commit -m "feat: sync sticky bar state with counters and play/pause"
```

---

## Task 6: Apply i18n to Sticky Bar

**Files:**

- Modify: `packages/web-client/public/locales/en/common.json`
- Modify all other locales

The sticky bar HTML uses `data-i18n` attributes that reuse existing keys (`controller.timerLabel`, `controller.passesLabel`, `controller.setsLabel`, `controller.start`, `controller.reset`). These already exist — no new keys needed for the sticky bar itself.

**Step 1: Verify existing keys exist**

Run:

```bash
grep -r "timerLabel\|passesLabel\|setsLabel" packages/web-client/public/locales/en/
```

Expected: all three found in `common.json`.

**Step 2: Verify i18n applies at runtime**

On page load the existing i18n system walks `[data-i18n]` attributes. Since sticky bar uses the same keys, it gets translated automatically. No code change needed.

**Step 3: Commit if any locale files were missed in Task 3**

```bash
git add packages/web-client/public/locales/*/common.json
git commit -m "i18n: add auto-stop keys to all locales"
```

---

## Task 7: Final Smoke Test

**Step 1: Run local E2E tests**

```bash
npm run test:local
```

Expected: all 21 tests pass. The new features don't break existing behavior.

**Step 2: Manual end-to-end check**

1. Open controller at `localhost:3000/c/test` and viewer at `localhost:3000/s/test`
2. Set auto-stop to 4 passes, 0 seconds → start → confirm stops after 4 passes, sets increments to 1
3. Set auto-stop to 0 passes, 5 seconds → start → confirm stops after 5 seconds
4. Check timer runs at real-time speed (compare with phone stopwatch)
5. At viewport ≤900px: confirm sticky bar is visible at bottom and all buttons work
6. At viewport ≥1024px: confirm sticky bar is hidden

**Step 3: Commit if any fixes needed, then tag**

```bash
git add -p  # stage only related changes
git commit -m "fix: final adjustments from smoke test"
```
