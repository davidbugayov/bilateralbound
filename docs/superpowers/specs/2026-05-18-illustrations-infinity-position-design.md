# Design: Illustrations, Infinity Movement, Vertical Position

**Date:** 2026-05-18  
**Status:** Approved

## Summary

Three new therapist-facing features for the controller panel, all synced to the viewer in real time:

1. **Emoji Illustrations** — therapist picks an emoji that renders on top of the ball
2. **Infinity Movement** — lemniscate (figure-8) path as a new direction mode
3. **Vertical Position** — constrains ball oscillation to top/center/bottom band

---

## Feature 1: Emoji Illustrations

### Rendering

- Approach: **canvas emoji text** (`ctx.fillText`) on top of the existing gradient circle
- Emoji rendered at ~62% of ball radius as font size, centered at ball (x, y)
- When no emoji is selected, ball renders exactly as today (gradient circle)
- Cache invalidation: invalidate `BallRenderer._cached` when `ballEmoji` changes

### New State Field

```js
ballEmoji: string | null  // e.g. "🦁", null = no illustration
```

- Added to `session.ballState` in `SessionRepository`
- Added to `BroadcastService._addChangedFields` fieldsToCheck array
- Validated in server: string, max 2 chars, or null

### Controller UI

New "Иллюстрация" section in `session-controller.html`, placed after the ball color section.

Structure:
- Tab strip: Животные / Спорт / Эмодзи
- Grid of emoji buttons (36×36px, 8px border-radius)
- First button: ✕ (clear / no illustration)
- Active state: blue border + glow (Magic UI-inspired)
- Custom row: text input (emoji) + "Применить" button

Curated sets:
- **Животные** (15): 🦁 🐻 🦊 🐱 🐧 🐼 🦄 🐢 🐝 🐯 🐘 🐮 🐰 🐵 🦅
- **Спорт** (12): ⚽ 🏀 🎾 🏈 ⚾ 🎱 🏐 🥎 🏓 🎯 🏒 ⛳
- **Эмодзи** (15): 😀 😎 🤩 😍 🥳 😴 🤔 😱 🔥 ⭐ 💎 ❤️ ✨ 🌈 🎵

Custom input: single emoji (max 2 chars to support compound emoji); applied on button click.

### Data Flow

1. Therapist selects emoji → `setIllustration(emoji)` → `safeSend(WS_MSG.controllerUpdate, { ballEmoji: emoji })`
2. Server stores in `ballState.ballEmoji`, broadcasts delta
3. Viewer receives `state_update` with `ballEmoji` → updates local state → `renderBall` draws emoji on top

### i18n

New keys:
- `controller.illustration` — section label
- `controller.illustrationAnimals` — tab
- `controller.illustrationSport` — tab  
- `controller.illustrationEmoji` — tab
- `controller.illustrationCustom` — input placeholder
- `controller.illustrationApply` — button label

---

## Feature 2: Infinity (Lemniscate) Movement

### Path Formula

Bernoulli lemniscate parametric form, scaled to world dimensions:

```
x(t) = cx + (W/2 * scale) * cos(t) / (1 + sin²(t))
y(t) = cy + (H/2 * scale) * sin(t) * cos(t) / (1 + sin²(t))
```

Where:
- `cx = worldWidth / 2`, `cy = worldHeight / 2`
- `scale = 0.75` (leaves margin from edges)
- `t` advances by `speed * FIXED_DT * 0.04` per physics step

When `dirX === 0 && dirY === 0 && infinity === true`, physics engine uses parametric path instead of bounce.

### Physics Engine Changes (`packages/shared/physics-engine.js`)

New field in ball state: `infinity: boolean`

In `_updateBall()` (or equivalent step function):
```js
if (this.ball.infinity) {
  this._stepInfinityPath()
  return
}
// existing bounce logic
```

`_stepInfinityPath()`:
- Advances `this._infinityT += speed_factor * FIXED_DT`
- Computes (x, y) from lemniscate formula
- Sets `this.ball.x`, `this.ball.y` directly (no velocity)
- No bounce events emitted (no wall collision)

### New State Field

```js
infinity: boolean  // true = lemniscate mode
```

- Added to `session.ballState`
- Mutually exclusive with standard `dirX`/`dirY` bounce: when `infinity=true`, server physics uses lemniscate path
- Added to `BroadcastService` fieldsToCheck
- `dirX`, `dirY` ignored when `infinity=true`

### Controller UI

New button added to the direction grid (5th slot):

```html
<button class="dir-btn infinity-btn" data-dir="infinity">
  <span>∞</span>
  <span>Бесконечность <span class="badge-new">new</span></span>
</button>
```

Shimmer animation on the button (CSS `@keyframes shimmer`).

Selecting infinity → `setDirection('infinity')` → sends `{ infinity: true, dirX: 0, dirY: 0 }` to server.
Selecting any other direction → sends `{ infinity: false, dirX: ..., dirY: ... }`.

### Sync

- **No position relay** — same rule as bounce mode. Both server and viewer run `_stepInfinityPath()` locally with the same `_infinityT` advancement rate (`speed * FIXED_DT * 0.04`).
- `_infinityT` resets to `0` on `play` event on both sides, keeping them phase-locked.
- Viewer: when `infinity=true`, skips `clientSimulation` bounce logic and runs lemniscate formula instead.
- No `x`/`y` in delta broadcasts (same as existing architecture). No drift because the path is purely deterministic given `t`.

---

## Feature 3: Vertical Position

### Concept

Constrains the ball's vertical oscillation to one of three bands:

| Mode | Y center | Y range |
|------|----------|---------|
| `top` | 25% of worldHeight | 0 – 50% |
| `center` | 50% of worldHeight | 0 – 100% (default, unchanged) |
| `bottom` | 75% of worldHeight | 50 – 100% |

### Physics Engine Changes

New options field: `trackBand: 'top' | 'center' | 'bottom'`

In bounce physics:
```js
const yMin = this.options.trackBand === 'bottom' ? worldHeight * 0.5 : 0
const yMax = this.options.trackBand === 'top' ? worldHeight * 0.5 : worldHeight
```

Ball starts at `cy = (yMin + yMax) / 2` on play/reset.

### New State Field

```js
trackBand: 'top' | 'center' | 'bottom'  // default: 'center'
```

- Added to `session.ballState`
- Added to `BroadcastService` fieldsToCheck
- Viewer receives `trackBand` → updates local physics options → ball bounces in correct band

### Controller UI

New "Позиция" section below the direction grid:

Three buttons: Сверху / По центру / Снизу  
Active state: blue border  
Clicking → `setTrackBand(band)` → `safeSend(WS_MSG.controllerUpdate, { trackBand: band })`

### i18n

New keys:
- `controller.position` — section label
- `controller.positionTop` — button label
- `controller.positionCenter` — button label
- `controller.positionBottom` — button label

---

## Shared: Broadcast & Server Changes

### `BroadcastService._addChangedFields` — new fields

```js
const fieldsToCheck = [
  // existing...
  'ballEmoji',
  'infinity',
  'trackBand',
]
```

### `SessionRepository` — default ballState

```js
ballEmoji: null,
infinity: false,
trackBand: 'center',
```

### `validation.js`

- `ballEmoji`: string (0–2 chars) or null
- `infinity`: boolean
- `trackBand`: one of `['top', 'center', 'bottom']`

---

## Files to Change

| File | Change |
|------|--------|
| `packages/shared/physics-engine.js` | `_stepInfinityPath()`, `trackBand` y-bounds |
| `packages/web-client/src/rendering/renderer.js` | draw emoji in `renderBall()` |
| `packages/web-client/src/controller.js` | `setIllustration()`, `setTrackBand()`, update `setDirection()` |
| `packages/web-client/src/application/controller/ui-controls.js` | illustration section init, position section init |
| `packages/web-client/src/viewer.js` | handle `ballEmoji`, `infinity`, `trackBand` in state updates |
| `packages/server-core/src/services/BroadcastService.js` | add 3 new fields to delta |
| `packages/server-core/src/repositories/SessionRepository.js` | default ballState |
| `packages/server-core/src/utils/validation.js` | validate new fields |
| `packages/web-client/public/session-controller.html` | new UI sections |
| `packages/web-client/public/css/controller.css` | illustration grid, position buttons styles |
| `packages/web-client/public/locales/*/common.json` | new i18n keys (8 locales) |

---

## Out of Scope

- Locking position "bottom" as premium (keep all free for now)
- Custom SVG assets
- Emoji preview on viewer side in the settings panel
