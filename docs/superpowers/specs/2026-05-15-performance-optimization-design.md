# Performance Optimization Design

**Date:** 2026-05-15
**Scope:** Loading speed + runtime performance (canvas/RAF stuttering + dead code removal)
**Branch:** dev

## Problem

- Webpack runs in `development` mode → JS bundles not minified (controller 118KB, viewer 91KB)
- CSS 186KB unminified across 6 files
- Google Fonts loaded from external CDN (extra DNS + request on every page load)
- Canvas stuttering / animation jitter on both mobile and desktop
- Accumulated dead code in non-sensitive JS files

## Goals

1. Reduce initial load payload by 50–65%
2. Eliminate RAF stuttering on controller preview and viewer
3. Remove dead code from non-sensitive files
4. Zero regressions in viewer/controller physics sync

## Hard Boundaries — Do Not Touch

These files are critical path for physics sync and therapeutic UX:

- `packages/shared/physics-engine.js`
- `packages/server-core/src/network/webSocketServer.js`
- `packages/server-core/src/services/BroadcastService.js`
- `packages/web-client/src/network/websocket-client.js`
- `packages/web-client/src/viewer.js`

## Section 1: Build Pipeline

### 1.1 Webpack Production Mode

Change `webpack.config.js` mode from `development` to `production`.

Effects:
- Terser minification: JS bundles shrink ~60% (controller ~40KB, viewer ~30KB)
- Tree-shaking: unused exports removed automatically
- Disable source maps in production (current `.map` files are 424KB + 309KB — larger than the bundles themselves)

```js
// webpack.config.js
mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
devtool: process.env.NODE_ENV === 'production' ? false : 'source-map',
```

Build scripts must set `NODE_ENV=production` for prod builds.

### 1.2 CSS Minification

Add `css-minimizer-webpack-plugin` to webpack config to minify CSS files on build.
Expected: 186KB → ~120KB.

### 1.3 Self-Hosted Google Fonts

Remove external `fonts.googleapis.com` / `fonts.gstatic.com` requests from all HTML files (`index.html`, `session-controller.html`, `offer.html`).

Download Inter font subset (weights 300–800) and host under `/public/fonts/`.
Add `@font-face` with `font-display: swap` in `common.css`.

Benefits: eliminates external DNS lookup, removes render-blocking third-party request, works offline.

**Files:** `webpack.config.js`, `index.html`, `session-controller.html`, `offer.html`, `common.css`

## Section 2: Runtime — Canvas & RAF

### 2.1 DOM Query Caching in `renderer.js`

Audit `renderer.js` (519 lines) for `document.getElementById` / `querySelector` calls inside the render loop. Cache all DOM references at initialization time.

### 2.2 RAF Timestamp Fix (stuttering)

Use the `timestamp` parameter from `requestAnimationFrame(timestamp)` for delta-time calculation. Add guard: skip frame if `delta < 1ms` (prevents double-fire artifacts). Ensure no layout thrashing (interleaved DOM reads and writes inside the same RAF callback).

### 2.3 CSS Performance Hints

Add to canvas wrapper:
```css
contain: layout style;
will-change: transform;
```

This isolates layout recalculations and promotes the canvas to its own compositor layer, reducing repaint cost.

**Files:** `packages/web-client/src/rendering/renderer.js`, `packages/web-client/public/css/viewer.css`, `packages/web-client/public/css/controller.css`

## Section 3: Modern JS Patterns

Target files: `common.js`, `audio-manager.js`, controller application modules (`event-handlers.js`, `fullscreen.js`, `play-pause.js`, `preview-manager.js`, `ui-controls.js`, `ui-sync.js`, `viewer-status.js`), `ui/` modules, `i18n/` modules, `domain/` modules.

Changes:
- `var` → `const`/`let`
- Optional chaining: `a && a.b && a.b.c` → `a?.b?.c`
- Nullish coalescing: `x != null ? x : def` → `x ?? def`
- Destructuring in function parameters where objects are passed
- Cache repeated `globalThis.__current` reads in local variables at function top

## Section 4: Dead Code Removal

Run static analysis + manual grep across all non-sensitive files:
- Unused functions (defined but never called)
- Unused variables and imports
- Commented-out code blocks
- Unreachable branches

Webpack tree-shaking in production mode handles unused exports automatically.
Manual removal targets: source files before bundling.

**Files:** all non-sensitive `.js` files in `packages/web-client/src/`

## Section 5: Lint Fixes

Run `npm run lint` and `npm run lint:css` across all non-sensitive files.
Fix all auto-fixable issues with `npm run lint:fix`.
Manually resolve remaining lint warnings/errors in non-sensitive files.

**Files:** all non-sensitive `.js` and `.css` files
**Do not run lint:fix on sensitive files** — changes there require explicit review.

## Testing Plan

After each section:
1. `npm run build` — verify build succeeds
2. `npm run dev` — start dev server
3. Manual test: open `/c/test` (controller) and `/s/test` (viewer) simultaneously, verify ball moves identically on both
4. Test play/pause/settings changes — no sync regression
5. Check browser console for errors
6. Mobile test: open on iOS Safari and Android Chrome

## Expected Outcomes

| Change | Expected Impact |
|---|---|
| Webpack production | JS -60%, tree-shaking active |
| CSS minification | CSS -35% |
| Self-hosted fonts | -1 external DNS/request per load |
| Canvas DOM caching | reduced layout thrashing |
| RAF timestamp fix | eliminates stuttering |
| Modern JS patterns | cleaner, marginally faster parse |
| Dead code removal | smaller source, less parse time |
