# Controller Layout Redesign — Design

**Date:** 2026-03-05
**Status:** Approved

## Problem

Therapist interface (`session-controller.html`) scatters timer, pass/set counters, and action buttons (Reset, Start BLS) across different sections. At narrow viewport widths (350–450px, e.g. when Zoom is open side-by-side), critical controls are not simultaneously visible without scrolling.

The sticky-control-bar (bottom panel) was added as a workaround but is not visible to some users and adds complexity.

## Goal

- Timer + passes/sets + Reset + Start button always visible together without scrolling
- Desktop: two-column layout (settings left, preview+controls right)
- Narrow (≤768px): single column, right block first (controls top), settings below
- Remove sticky-control-bar entirely
- Refactor duplicate CSS and clean dead code

## Reference

bilateralstimulation.io layout: settings left, preview + start button right, timer below preview.

## Layout Design

### Desktop (≥769px): two-column grid

```
┌──────────────────────────┬──────────────────────────────┐
│ left-col                 │ right-col (sticky top:20px)  │
│                          │                              │
│ Session: ABC123          │ Preview canvas               │
│ Link for client [copy]   │                              │
│                          │ 0:00  Passes: 0  Sets: 0     │
│ Appearance               │ [Reset]                      │
│ Ball color: ● ● ● ●      │                              │
│ Background: ● ● ● ●      │ [ ▶ START BLS ]  (large)    │
│ Size: x1 x2 x3           │                              │
│                          │ Auto-stop: [0] passes [0] s  │
│ Direction                │                              │
│ [↔][↕][↖↘][↙↗][🎲]     │ Sound + Hotkeys              │
│                          │                              │
│ Speed [slider]           │                              │
│                          │                              │
│ Presets                  │                              │
└──────────────────────────┴──────────────────────────────┘
```

### Mobile (≤768px): single column, right block first

1. right-col (order: -1): preview → timer/passes/sets/reset → Start button → autostop
2. left-col: session link → appearance → direction → speed → presets

## HTML Changes (`session-controller.html`)

Wrap existing sections into two div containers:

```html
<main class="wrap">
  <div class="controller-left-col">
    <!-- session info + link -->
    <!-- appearance: colors, bg, size -->
    <!-- direction -->
    <!-- speed -->
    <!-- presets -->
  </div>
  <div class="controller-right-col">
    <!-- preview canvas (#previewWrap) -->
    <!-- counters: timer/passes/sets + reset (#bbCounters) -->
    <!-- play/pause button (#playPauseBtn) — promoted here -->
    <!-- autostop row -->
    <!-- sound settings -->
    <!-- hotkeys -->
  </div>
</main>
```

Remove `#stickyControlBar` div entirely from HTML.

## CSS Changes

### `css/shared-components.css`

- Add `.controller-left-col` / `.controller-right-col` grid containers
- `.wrap` on controller page: `grid-template-columns: 1fr 1.1fr; gap: 24px`
- `.controller-right-col`: `position: sticky; top: 20px; align-self: start`
- `#playPauseBtn` in right col: `width: 100%; font-size: 18px; min-height: 56px`
- Remove all `.sticky-control-bar`, `.sticky-counter*`, `.sticky-actions`, `.sticky-btn` rules
- Remove `body { padding-bottom: 80px }` from `@media (width <= 900px)` block

### `css/controller.css`

- Remove duplicate `.viewer-audio-indicator` block (defined twice with identical rules)
- Remove duplicate `.viewer-sound-playing-indicator` block (defined twice)
- Style right column preview + controls panel

### Responsive

- `@media (width <= 768px)`: `.wrap` → `grid-template-columns: 1fr`, `.controller-right-col` → `order: -1`
- `@media (width <= 480px)`: tighter padding, smaller preview canvas height

## Refactoring

1. **Remove sticky-control-bar** — HTML + all CSS (approx. 80 lines CSS, 50 lines HTML)
2. **Deduplicate CSS in controller.css** — `.viewer-audio-indicator` declared twice, `.viewer-sound-playing-indicator` declared twice
3. **Flatten counters markup** — `#bbCounters` stays but moves to right col, no structural change needed
4. **Clean `actions-grid` CSS** — currently 3-column (1.2fr 0.9fr 0.9fr) but only 2 buttons used there; simplify to 2-column or remove the class when buttons move to right col

## Files to Modify

| File | Change |
|------|--------|
| `packages/web-client/public/session-controller.html` | Wrap sections in left/right cols, remove sticky bar HTML |
| `packages/web-client/public/css/shared-components.css` | Add two-col grid, remove sticky-bar CSS |
| `packages/web-client/public/css/controller.css` | Remove duplicate rules, style right col |

## Out of Scope

- No changes to `viewer.html`
- No changes to JS logic (IDs stay the same)
- No changes to i18n keys
- No fullscreen overlay changes
