# Controller Layout Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign session-controller.html to a two-column layout (settings left, preview+controls right) that is always usable at 350–900px widths without scrolling to find the Start button or timer.

**Architecture:** Wrap existing sections in `.controller-left-col` / `.controller-right-col` divs inside `<main class="wrap controller-layout">`. Right column is sticky and contains preview, timer/counters, and the Start button. Left column contains session link, appearance, direction, speed, presets. Remove sticky-control-bar entirely.

**Tech Stack:** Vanilla HTML/CSS, no JS changes needed (element IDs stay the same).

---

## Pre-flight

Read these files before touching anything:
- `packages/web-client/public/session-controller.html`
- `packages/web-client/public/css/shared-components.css` (lines 2337–2580 — counters, sticky bar)
- `packages/web-client/public/css/controller.css`

Run existing tests to confirm green baseline:
```bash
npm run test:local
```
Expected: all 21 tests pass.

---

### Task 1: Remove sticky-control-bar from HTML

**Files:**
- Modify: `packages/web-client/public/session-controller.html`

**Step 1: Delete the entire sticky-control-bar div**

Find and remove this entire block (lines ~894–941):
```html
<div
  aria-label="Session controls"
  class="sticky-control-bar"
  id="stickyControlBar"
  role="toolbar"
>
  ...
</div>
```
Delete from `<div aria-label="Session controls"` to the closing `</div>`.

**Step 2: Verify no broken references**

The sticky bar's counter IDs (`stickyTimer`, `stickyPasses`, `stickySets`, `stickyPlayPauseBtn`) are synced from JS. Search for them:
```bash
grep -r "stickyTimer\|stickyPasses\|stickySets\|stickyPlayPauseBtn" packages/
```
Expected output: matches only in JS files under `packages/web-client/public/js/`. Those references will silently no-op when the elements don't exist (querySelector returns null) — this is safe.

**Step 3: Commit**
```bash
git add packages/web-client/public/session-controller.html
git commit -m "feat: remove sticky-control-bar from controller HTML"
```

---

### Task 2: Restructure HTML — wrap into left/right columns

**Files:**
- Modify: `packages/web-client/public/session-controller.html`

The goal is to produce this structure inside `<main class="wrap controller-layout">`:

```
<main class="wrap controller-layout">
  <!-- fullscreen overlay stays outside columns -->
  <div id="previewOverlay" ...>...</div>

  <div class="controller-left-col">
    <!-- 1. Session info + link (WITHOUT #bbCounters) -->
    <!-- 2. Appearance section (colors, bg, size) -->
    <!-- 3. Direction + Speed section -->
    <!-- 4. Presets section (part of settings) -->
  </div>

  <div class="controller-right-col">
    <!-- 1. Preview aside (#previewWrap) -->
    <!-- 2. #bbCounters (timer/passes/sets + reset btn) -->
    <!-- 3. Play/pause button + reset session button -->
    <!-- 4. Autostop row -->
    <!-- 5. Sound + hotkeys (rest of settings section) -->
  </div>
</main>
```

**Step 1: Add `controller-layout` class to `<main>`**

Change:
```html
<main class="wrap">
```
To:
```html
<main class="wrap controller-layout">
```

**Step 2: Move `#previewOverlay` before the columns**

`#previewOverlay` is a fullscreen overlay with `position: fixed`. It doesn't participate in layout, but move it to be the FIRST child of `<main>` so it's outside the column divs. It should appear before both column divs.

**Step 3: Wrap left-column sections**

Wrap these existing sections inside `<div class="controller-left-col">`:
1. The first `<section class="control-section" aria-labelledby="session-heading">` — but **remove** `#bbCounters` from it (it will move to right col). The session section should only contain: `<h3>`, `<p id="sessionInfo">`, and `.link-group`.
2. The `<section aria-labelledby="appearance-heading">` (colors, bg, size)
3. From `<section aria-labelledby="main-controls-heading">` — keep only Direction and Speed content (see Step 5)

Wrap with:
```html
<div class="controller-left-col">
  <!-- session section (link only) -->
  <!-- appearance section -->
  <!-- direction + speed section (restructured) -->
  <!-- presets card (moved from settings) -->
</div>
```

**Step 4: Wrap right-column content**

Create `<div class="controller-right-col">` containing in this order:
1. `<aside id="previewWrap" ...>` (the preview canvas — currently has class `hidden`, JS will show it)
2. `<div id="bbCounters" class="counters-container">` (extracted from session section)
3. A new `<div class="right-col-actions">` containing:
   - `<button id="playPauseBtn" class="btn primary right-col-start-btn" onclick="togglePlayPause()" data-i18n="controller.start">▶️ Старт</button>`
   - `<button class="btn outline right-col-reset-btn" onclick="resetSession()" data-i18n="controller.reset">🔄 Сброс</button>`
4. `<div class="autostop-row" id="autoStopRow">` (extracted from main-controls section)
5. Sound card + hotkeys card (from settings section)

**Step 5: Restructure the main-controls section for left column**

The current `<section aria-labelledby="main-controls-heading">` has:
- "Действия" card: playPauseBtn, resetSession btn, autostop → these move to right col
- Direction card: stays in left col
- Speed card: stays in left col

After extracting play/pause + autostop to right col, the section in left col becomes just Direction + Speed:

```html
<section class="control-section" aria-labelledby="main-controls-heading">
  <h3 id="main-controls-heading" data-i18n="controller.mainControlsHeading">
    🎮 Управление и направление
  </h3>
  <div class="controls-grid desktop-controls-grid">
    <div class="controls-card">
      <!-- Direction content only (no actions-grid, no autostop) -->
      <p class="controls-title" style="margin-top: 0">
        <span data-i18n="controller.directionTitle">Direction</span>
        <span class="direction-display" id="currentDirectionDisplay" style="margin-left: 8px; font-size: 1.2em">↔️</span>
      </p>
      <div class="direction-row">
        <fieldset class="segmented" id="directionSegmented">
          <!-- all seg-btn buttons stay as-is -->
        </fieldset>
      </div>
    </div>
    <div class="controls-card">
      <p class="controls-title" data-i18n="controller.speedTitle">Скорость</p>
      <div id="speedControl"></div>
    </div>
  </div>
</section>
```

**Step 6: Move presets card from settings section to left col**

Find `<div class="controls-card">` containing `<div id="presetControls"></div>` inside the settings section. Move it into `controller-left-col` (after the direction+speed section). Keep the settings section in right col for sound + hotkeys only.

**Step 7: Verify HTML is valid**

Check all `id` attributes remain exactly once:
- `playPauseBtn` — must appear exactly once (now in right-col-actions)
- `bbCounters`, `bbTimer`, `bbPasses`, `bbSets`, `bbResetBtn` — in right col
- `previewWrap`, `preview` — in right col
- `directionSegmented`, `speedControl` — in left col
- `soundEnabledCheckbox`, `soundTypeSelect`, `controllerMonitorCheckbox` — in right col (sound card)
- `presetControls` — in left col

**Step 8: Commit**
```bash
git add packages/web-client/public/session-controller.html
git commit -m "feat: restructure controller HTML into left/right columns"
```

---

### Task 3: Add two-column CSS

**Files:**
- Modify: `packages/web-client/public/css/controller.css`

**Step 1: Add controller layout rules to `controller.css`**

Add at the end of `controller.css`:

```css
/* ===== TWO-COLUMN CONTROLLER LAYOUT ===== */

/* Override .wrap grid for controller page */
.controller-layout {
  grid-template-columns: 1fr 1.1fr;
  gap: 24px;
  align-items: start;
}

/* fullscreen overlay is position:fixed — doesn't participate in grid,
   but it's a grid child; make it take no space */
.controller-layout > #previewOverlay {
  display: contents;
}

/* actually #previewOverlay already has position:fixed so it auto-removes from flow.
   Use grid-column span to ensure it doesn't create a phantom grid cell */
#previewOverlay {
  grid-column: 1 / -1;
  display: none; /* hidden by default; JS adds .active class */
}

#previewOverlay.hidden {
  display: none;
}

.controller-left-col,
.controller-right-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0; /* prevent grid blowout */
}

/* Right column sticks while user scrolls left col */
.controller-right-col {
  position: sticky;
  top: 80px; /* clear the fixed header (back btn height ~50px + margin) */
  align-self: start;
}

/* Preview takes full width of right column */
.controller-right-col #previewWrap {
  position: static; /* override floating-preview sticky positioning */
  top: auto;
}

/* Counters in right col: horizontal row */
.controller-right-col .counters-container {
  margin-top: 0;
}

/* Action buttons: Start (full width, large) + Reset (compact) */
.right-col-actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: stretch;
}

.right-col-start-btn {
  font-size: 18px !important;
  font-weight: 700 !important;
  min-height: 56px !important;
  padding: 14px 24px !important;
}

.right-col-reset-btn {
  min-height: 56px;
  padding: 14px 16px;
  font-size: 18px;
}

/* ===== RESPONSIVE ===== */

/* Tablet: below 900px — single column, right col goes first */
@media (width <= 900px) {
  .controller-layout {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .controller-right-col {
    position: static;
    order: -1; /* right col appears BEFORE left col on mobile */
  }
}

/* Narrow: below 480px — tighten spacing */
@media (width <= 480px) {
  .right-col-start-btn {
    font-size: 16px !important;
    min-height: 50px !important;
  }

  .controller-right-col .counters-container {
    flex-wrap: nowrap;
    gap: 8px;
  }
}
```

**Step 2: Handle the `#previewOverlay` grid issue**

`#previewOverlay` is `position: fixed` so it's taken out of flow, but it's still a grid child and creates a grid area. Fix by adding to controller.css (already in step 1 — verify it's there).

**Step 3: Verify preview canvas is shown**

`#previewWrap` has class `hidden` in HTML — JS calls `previewWrap.classList.remove('hidden')` when viewer connects. This is unchanged. The CSS change only removes `position: sticky` override.

Check in `packages/web-client/public/js/application/controller/preview-manager.js` that preview show/hide logic uses `#previewWrap` — it should be fine since we only changed positioning, not the element or its ID.

**Step 4: Commit**
```bash
git add packages/web-client/public/css/controller.css
git commit -m "feat: add two-column CSS layout for controller page"
```

---

### Task 4: Remove sticky-control-bar CSS + deduplicate controller.css

**Files:**
- Modify: `packages/web-client/public/css/shared-components.css`
- Modify: `packages/web-client/public/css/controller.css`

**Step 1: Remove sticky-control-bar CSS from shared-components.css**

Find and delete the entire block (around lines 2496–2580):
```css
/* === STICKY CONTROL BAR (tablet / mobile) === */
.sticky-control-bar {
  display: none;
}

@media (width <= 900px) {
  .sticky-control-bar { ... }
  .light-theme .sticky-control-bar { ... }
  body { padding-bottom: 80px; }  /* ← DELETE ONLY THIS RULE from this block */
}

.sticky-counters { ... }
.sticky-counter { ... }
.sticky-counter-label { ... }
.sticky-counter-value { ... }
.light-theme .sticky-counter-value { ... }
.sticky-counter-value--timer { ... }
.sticky-actions { ... }
.sticky-btn { ... }
```

**IMPORTANT:** Inside the `@media (width <= 900px)` block there are other rules besides sticky-bar. Only delete:
- `.sticky-control-bar { ... }` rule
- `.light-theme .sticky-control-bar { ... }` rule
- `body { padding-bottom: 80px; }` comment + rule

Keep all other rules in that media block (`.back-btn`, `.theme-toggle-container`, etc.).

Then delete the standalone rules outside the media query:
- `.sticky-counters`, `.sticky-counter`, `.sticky-counter-label`, `.sticky-counter-value`, `.light-theme .sticky-counter-value`, `.sticky-counter-value--timer`, `.sticky-actions`, `.sticky-btn`

**Step 2: Deduplicate viewer-audio-indicator in controller.css**

In `controller.css`, `.viewer-audio-indicator` is declared TWICE (lines ~476 and ~593). The second declaration has slightly different padding (8px vs 6px). Keep the second (more complete) one, delete the first block:

Delete lines ~476–507:
```css
/* Viewer Audio Indicators */
.viewer-audio-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  margin-top: 8px;
  border-radius: 6px;
  font-size: 0.85rem;
  background: rgb(234 179 8 / 15%);
  border: 1px solid rgb(234 179 8 / 30%);
  color: #fbbf24;
}

.viewer-audio-indicator.hidden { display: none; }
.viewer-audio-indicator.warning { ... }
.viewer-audio-indicator.ready { ... }
.viewer-audio-indicator .icon { ... }
```

And delete `.viewer-sound-playing-indicator` first block (lines ~509–550):
```css
/* Viewer Sound Playing Indicator */
.viewer-sound-playing-indicator { ... }
.viewer-sound-playing-indicator.hidden { display: none; }
.viewer-sound-playing-indicator.active { ... animation: soundPulse... }
.viewer-sound-playing-indicator .icon { ... }
@keyframes soundPulse { ... }
```

Keep the SECOND occurrence of each (lines ~593+) which is more complete.

**Step 3: Verify no regressions with lint**
```bash
npm run lint:css
```
Expected: 0 errors.

**Step 4: Commit**
```bash
git add packages/web-client/public/css/shared-components.css
git add packages/web-client/public/css/controller.css
git commit -m "refactor: remove sticky-control-bar CSS, deduplicate controller.css rules"
```

---

### Task 5: Visual QA

**Step 1: Start dev server**
```bash
npm run dev
```

**Step 2: Open controller page in browser**

Navigate to `http://localhost:3000/c/test123`

Verify at full width (≥1000px):
- [ ] Two columns visible: left (session link + appearance + direction + speed) | right (preview + timer + counters + Start button)
- [ ] "START BLS" button is large (≥56px height), full-width in right col
- [ ] Timer (0:00), Passes, Sets visible in right col
- [ ] Reset button visible next to Start
- [ ] Preview canvas visible (may show "Waiting for viewer")
- [ ] No horizontal scroll

**Step 3: Resize to 450px width**

Verify:
- [ ] Single column layout
- [ ] Right col content appears FIRST (preview → timer → Start button)
- [ ] Left col content appears BELOW (link → appearance → direction → speed)
- [ ] Start button and timer visible simultaneously without scrolling
- [ ] No sticky bar at bottom

**Step 4: Resize to 380px width**

Verify:
- [ ] Everything still usable
- [ ] Start button not truncated

**Step 5: Test light theme**
Toggle to light theme and repeat checks.

**Step 6: Run E2E tests**
```bash
npm run test:local
```
Expected: all 21 tests pass. (Tests don't test layout, but verify no JS is broken by HTML restructure.)

**Step 7: Final commit if any CSS tweaks made**
```bash
git add -A
git commit -m "fix: layout QA tweaks"
```

---

## Done Criteria

- [ ] No sticky-control-bar in HTML or CSS
- [ ] Two-column desktop layout: Start button + timer always visible in right col
- [ ] Single-column mobile: right col first, so Start + timer visible at top
- [ ] Duplicate CSS rules removed from controller.css
- [ ] `npm run lint:css` passes
- [ ] All 21 E2E tests pass
