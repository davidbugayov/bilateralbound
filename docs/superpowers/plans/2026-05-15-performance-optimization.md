# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce page load payload by ~50%, eliminate canvas stuttering, fix all lint errors, remove dead code — without breaking viewer/controller physics sync.

**Architecture:** Build pipeline (CSS minification + self-hosted fonts + conditional source maps), runtime canvas fix (ResizeObserver replaces per-frame clientWidth reads), CSS compositor hints, JS lint fixes, dead code removal.

**Tech Stack:** webpack 5, clean-css-cli, @fontsource-variable/inter, ESLint, Stylelint, Prettier

---

## Hard Boundaries — NEVER touch these files

- `packages/shared/physics-engine.js`
- `packages/server-core/src/network/webSocketServer.js`
- `packages/server-core/src/services/BroadcastService.js`
- `packages/web-client/src/network/websocket-client.js`
- `packages/web-client/src/viewer.js`

---

## File Map

| File | Change |
|---|---|
| `packages/web-client/package.json` | add clean-css-cli dep, minify:css script |
| `package.json` | chain minify:css into root build |
| `packages/web-client/webpack.config.js` | conditional devtool |
| `packages/web-client/public/css/common.css` | add @font-face Inter variable font |
| `packages/web-client/public/css/main-page.css` | remove @import Google Fonts |
| `packages/web-client/public/index.html` | remove Google Fonts link/preconnect |
| `packages/web-client/public/session-controller.html` | remove Google Fonts link/preconnect |
| `packages/web-client/src/rendering/renderer.js` | ResizeObserver, fix duplicate fixedStepMs |
| `packages/web-client/public/css/viewer.css` | canvas compositor hints |
| `packages/web-client/public/css/controller.css` | preview canvas compositor hints |
| `packages/web-client/public/js/main-page.js` | lint fixes (var→let/const) |
| `packages/web-client/public/js/ui/cookie-consent.js` | lint fixes (var→let/const) |
| `packages/server-core/src/controllers/subscriptionController.js` | lint fixes |
| `packages/server-core/src/index.js` | lint fixes |
| `packages/server-core/src/services/bot-translations.js` | lint fixes |
| `scripts/e2e/test-subscription-http.js` | lint fixes (quotes, unused vars) |
| `packages/web-client/public/css/*.css` | CSS lint:fix (prettier formatting) |

---

## Task 1: CSS Minification Build Step

**Context:** The server already applies gzip compression (level 6) to all static files, so 63KB CSS → ~10KB over the wire. CSS source-level minification still helps: smaller source = faster CSS parsing and smaller gzip output. Strategy: minify in-place as part of `npm run build` (production deploy runs build). Developers work with readable source CSS. After running build locally, restore with `git checkout packages/web-client/public/css/`.

**Files:**
- Modify: `packages/web-client/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Install clean-css-cli in web-client**

```bash
cd packages/web-client && npm install --save-dev clean-css-cli
```

Expected: `clean-css-cli` appears in `packages/web-client/package.json` devDependencies.

- [ ] **Step 2: Add minify:css script to web-client package.json**

In `packages/web-client/package.json`, add to `"scripts"`:

```json
"minify:css": "for f in public/css/*.css; do npx cleancss -O1 -o \"$f\" \"$f\"; done"
```

This overwrites each CSS file in-place with its minified version. Source CSS is restored with `git checkout public/css/` for dev work.

- [ ] **Step 3: Add minify:css to root build script**

In root `package.json`, change:

```json
"build": "npm run build --workspace=packages/web-client"
```

to:

```json
"build": "npm run build --workspace=packages/web-client && npm run minify:css --workspace=packages/web-client"
```

- [ ] **Step 4: Test CSS minification**

```bash
npm run build
wc -c packages/web-client/public/css/*.css
```

Expected: `main-page.css` drops from ~63KB to ~40KB or less. Then restore sources:

```bash
git checkout packages/web-client/public/css/
```

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/package.json package.json package-lock.json
git commit -m "build: add CSS minification to production build"
```

---

## Task 2: Self-Hosted Google Fonts

**Files:**
- Modify: `packages/web-client/public/css/common.css`
- Modify: `packages/web-client/public/css/main-page.css`
- Modify: `packages/web-client/public/index.html`
- Modify: `packages/web-client/public/session-controller.html`

- [ ] **Step 1: Install Inter variable font package**

```bash
cd packages/web-client && npm install --save-dev @fontsource-variable/inter
```

- [ ] **Step 2: Find and copy font files to public/fonts/**

```bash
mkdir -p packages/web-client/public/fonts
ls packages/web-client/node_modules/@fontsource-variable/inter/files/
```

Expected output includes files like:
- `inter-latin-wght-normal.woff2`
- `inter-cyrillic-wght-normal.woff2`

Copy them:

```bash
cp packages/web-client/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2 packages/web-client/public/fonts/inter-var.woff2
cp packages/web-client/node_modules/@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2 packages/web-client/public/fonts/inter-var-cyrillic.woff2
```

If the filenames differ slightly in the `ls` output, adjust the `cp` source paths to match what's actually there. The target paths (`inter-var.woff2`, `inter-var-cyrillic.woff2`) stay the same.

- [ ] **Step 3: Add @font-face to common.css**

At the top of `packages/web-client/public/css/common.css`, add:

```css
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/inter-var.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/inter-var-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
```

- [ ] **Step 4: Remove @import from main-page.css**

In `packages/web-client/public/css/main-page.css`, remove line 3:

```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap");
```

Delete this line entirely.

- [ ] **Step 5: Remove Google Fonts from index.html**

In `packages/web-client/public/index.html`, remove these 3 lines (lines ~41-43):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
```

- [ ] **Step 6: Remove Google Fonts from session-controller.html**

In `packages/web-client/public/session-controller.html`, remove the 3 lines (around lines ~135-139):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap&subset=cyrillic,cyrillic-ext,latin"
  rel="stylesheet"
/>
```

- [ ] **Step 7: Verify fonts load correctly**

```bash
npm run dev
```

Open `http://localhost:3000` in browser. Check that Inter font renders (check DevTools Network tab — no requests to `fonts.googleapis.com` or `fonts.gstatic.com`). Text should look identical to before.

- [ ] **Step 8: Commit**

```bash
git add packages/web-client/public/css/common.css \
        packages/web-client/public/css/main-page.css \
        packages/web-client/public/index.html \
        packages/web-client/public/session-controller.html \
        packages/web-client/public/fonts/ \
        packages/web-client/package.json \
        packages/web-client/node_modules/.package-lock.json
git commit -m "feat: self-host Inter font, remove Google Fonts CDN dependency"
```

---

## Task 3: Webpack Conditional Source Maps

**Files:**
- Modify: `packages/web-client/webpack.config.js`

- [ ] **Step 1: Make devtool conditional**

Replace current webpack.config.js content with:

```js
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: {
    viewer: './src/viewer.js',
    controller: './src/controller.js',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'public', 'dist'),
  },
  resolve: {
    modules: [
      path.resolve(__dirname, 'src'),
      path.resolve(__dirname, '..', '..', 'node_modules'),
      'node_modules',
    ],
    alias: {
      '@emdr/shared': path.resolve(__dirname, '..', 'shared'),
    },
  },
  devtool: isProd ? false : 'source-map',
};
```

- [ ] **Step 2: Update build script to set NODE_ENV**

In `packages/web-client/package.json`, change:

```json
"build": "webpack --mode production"
```

to:

```json
"build": "NODE_ENV=production webpack --mode production"
```

- [ ] **Step 3: Test production build has no source maps**

```bash
npm run build --workspace=packages/web-client
ls -la packages/web-client/public/dist/
```

Expected: NO `.map` files in the output.

- [ ] **Step 4: Test dev build still has source maps**

```bash
npm run build:dev --workspace=packages/web-client
ls -la packages/web-client/public/dist/
```

Expected: `.map` files present.

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/webpack.config.js packages/web-client/package.json
git commit -m "build: disable source maps in production webpack build"
```

---

## Task 4: renderer.js — ResizeObserver + Fix Duplicate Assignment

**Files:**
- Modify: `packages/web-client/src/rendering/renderer.js`

**Context:** Currently `clientWidth`/`clientHeight` are read on every RAF frame (lines 94-95), causing forced layout recalculation 60x/second. Replace with ResizeObserver that sets a dirty flag. Also fix duplicate `this.fixedStepMs` assignment (lines 27-28).

- [ ] **Step 1: Remove duplicate fixedStepMs assignment**

In `renderer.js`, find lines 27-28:

```js
this.fixedStepMs = 1000 / 60
this.fixedStepMs = 1000 / 60
```

Remove the duplicate. Keep only one:

```js
this.fixedStepMs = 1000 / 60
```

- [ ] **Step 2: Add _pendingResize flag to constructor**

In the constructor, after `this.animationFrameId = null` (line 21), add:

```js
this._pendingResize = false
this._resizeObserver = null
```

- [ ] **Step 3: Set up ResizeObserver in start()**

Replace the `start()` method (currently lines 55-62) with:

```js
start() {
  if (this.animationFrameId) {
    this.stop()
  }
  this._resizeObserver = new ResizeObserver(() => {
    this._pendingResize = true
  })
  this._resizeObserver.observe(this.canvas)
  this.lastTime = performance.now()
  this.renderLoop = this.renderLoop.bind(this)
  this.renderLoop(performance.now())
}
```

- [ ] **Step 4: Tear down ResizeObserver in stop()**

Replace the `stop()` method (currently lines 64-70) with:

```js
stop() {
  if (this.animationFrameId) {
    cancelAnimationFrame(this.animationFrameId)
    this.animationFrameId = null
  }
  if (this._resizeObserver) {
    this._resizeObserver.disconnect()
    this._resizeObserver = null
  }
}
```

- [ ] **Step 5: Replace clientWidth/clientHeight check in renderLoop()**

Replace the block at lines 94-107:

```js
const clientW = this.canvas.clientWidth
const clientH = this.canvas.clientHeight
if (
  (clientW && clientW !== this.canvas.width) ||
  (clientH && clientH !== this.canvas.height)
) {
  this.resize(
    clientW || this.canvas.width,
    clientH || this.canvas.height
  )
  this.lastTime = currentTime
  this.animationFrameId = requestAnimationFrame(this.renderLoop)
  return
}
```

With:

```js
if (this._pendingResize) {
  this._pendingResize = false
  const clientW = this.canvas.clientWidth
  const clientH = this.canvas.clientHeight
  if (
    (clientW && clientW !== this.canvas.width) ||
    (clientH && clientH !== this.canvas.height)
  ) {
    this.resize(
      clientW || this.canvas.width,
      clientH || this.canvas.height
    )
    this.lastTime = currentTime
    this.animationFrameId = requestAnimationFrame(this.renderLoop)
    return
  }
}
```

- [ ] **Step 6: Build and test**

```bash
npm run build --workspace=packages/web-client
npm run dev
```

Open `http://localhost:3000/c/test123` (controller) and `http://localhost:3000/s/test123` (viewer) simultaneously.
- Verify: ball moves identically on both pages
- Verify: resizing the browser window still correctly resizes the canvas
- Verify: no console errors
- Test play/pause — physics must continue in sync

- [ ] **Step 7: Commit**

```bash
git add packages/web-client/src/rendering/renderer.js
git commit -m "perf: use ResizeObserver in renderer, fix duplicate fixedStepMs"
```

---

## Task 5: CSS Compositor Hints

**Files:**
- Modify: `packages/web-client/public/css/viewer.css`
- Modify: `packages/web-client/public/css/controller.css`

- [ ] **Step 1: Add hints to .viewer-canvas**

In `packages/web-client/public/css/viewer.css`, find `.viewer-canvas` rule (line 19) and add:

```css
.viewer-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: auto;
  will-change: transform;
  contain: layout style;
}
```

- [ ] **Step 2: Add hints to preview canvas in controller.css**

In `packages/web-client/public/css/controller.css`, find `.fullscreen-canvas` (line 378) and add `will-change: transform; contain: layout style;` to the existing rule.

Also find `.preview-canvas-wrapper` (line 2397) and add `contain: layout style;`.

- [ ] **Step 3: Verify no visual regressions**

```bash
npm run dev
```

Open controller and viewer. Check: ball renders correctly, fullscreen works, preview canvas scales properly. No visual artifacts.

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/public/css/viewer.css packages/web-client/public/css/controller.css
git commit -m "perf: add will-change and contain hints to canvas elements"
```

---

## Task 6: JS Lint Fixes

**Files:**
- Modify: `packages/web-client/public/js/main-page.js`
- Modify: `packages/web-client/public/js/ui/cookie-consent.js`
- Modify: `packages/server-core/src/controllers/subscriptionController.js`
- Modify: `packages/server-core/src/index.js`
- Modify: `packages/server-core/src/services/bot-translations.js`
- Modify: `scripts/e2e/test-subscription-http.js`

- [ ] **Step 1: Run auto-fix**

```bash
npm run lint:fix
```

Expected: 36 errors auto-fixed (var→let/const, formatting). Some files will be modified automatically.

- [ ] **Step 2: Run lint again to see remaining errors**

```bash
npm run lint 2>&1
```

Expected output shows only the non-auto-fixable issues (typically unused vars in test scripts, quote style).

- [ ] **Step 3: Fix remaining errors manually**

In `scripts/e2e/test-subscription-http.js`:

Find line ~247 and ~251 — change double quotes to single quotes per ESLint `@stylistic/quotes` rule:

```js
// Change: "something"
// To: 'something'
```

Find line ~166 — `TOKEN_2` is assigned but never used. Either remove the assignment or prefix with `_` if intentional: `const _TOKEN_2 = ...`

Find line ~51 — unused `e` in catch block. Change `catch (e)` to `catch` (ES2019 optional catch binding) or `catch (_e)`.

Same fix for `scripts/e2e/test-subscription-unit.js` line ~29.

- [ ] **Step 4: Verify lint passes**

```bash
npm run lint 2>&1
```

Expected: `0 problems` or only warnings (no errors).

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/public/js/main-page.js \
        packages/web-client/public/js/ui/cookie-consent.js \
        packages/server-core/src/controllers/subscriptionController.js \
        packages/server-core/src/index.js \
        packages/server-core/src/services/bot-translations.js \
        scripts/e2e/test-subscription-http.js \
        scripts/e2e/test-subscription-unit.js
git commit -m "fix: resolve all JS lint errors (var→const/let, quotes, unused vars)"
```

---

## Task 7: CSS Lint Fixes

**Files:**
- Modify: `packages/web-client/public/css/*.css`

- [ ] **Step 1: Run CSS lint auto-fix**

```bash
npm run lint:css:fix
```

Expected: ~41 of 69 CSS errors auto-fixed (prettier formatting, shorthand values).

- [ ] **Step 2: Run CSS lint to see remaining errors**

```bash
npm run lint:css 2>&1 | head -40
```

Remaining errors are likely:
- `property-no-vendor-prefix` for `-webkit-backdrop-filter`, `-webkit-mask`, `-webkit-mask-composite`
- `font-family-name-quotes` in shared-components.css

- [ ] **Step 3: Fix vendor prefix warnings**

For `-webkit-backdrop-filter` in CSS files: these are needed for Safari compatibility. Add a stylelint ignore comment on the line above:

```css
/* stylelint-disable-next-line property-no-vendor-prefix */
-webkit-backdrop-filter: blur(8px);
backdrop-filter: blur(8px);
```

Same for `-webkit-mask` and `-webkit-mask-composite` occurrences.

- [ ] **Step 4: Fix font-family-name-quotes in shared-components.css**

In `packages/web-client/public/css/shared-components.css` line 13, change:

```css
font-family: 'Figtree', sans-serif;
```

to:

```css
font-family: Figtree, sans-serif;
```

(Remove quotes from font names that don't need them per stylelint `font-family-name-quotes` rule. Single-word font names don't require quotes.)

- [ ] **Step 5: Verify CSS lint passes**

```bash
npm run lint:css 2>&1
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/public/css/
git commit -m "fix: resolve all CSS lint errors (formatting, vendor prefixes, font quotes)"
```

---

## Task 8: Modern JS Patterns in public/js files

**Files:**
- Modify: `packages/web-client/public/js/main-page.js`
- Modify: `packages/web-client/public/js/ui/cookie-consent.js`

**Context:** After Task 6 fixed var→const/let, apply optional chaining and nullish coalescing where applicable.

- [ ] **Step 1: Apply optional chaining in main-page.js**

Search for patterns like `a && a.b` or `x !== null && x !== undefined ? x : y` and replace:

```bash
# Find candidates
grep -n "\&\& \w" packages/web-client/public/js/main-page.js | head -20
```

For each: replace `obj && obj.method()` with `obj?.method()`, replace `x != null ? x : def` with `x ?? def`.

Example patterns to fix:
```js
// Before
if (globalThis.__current && globalThis.__current.sessionId) { ... }
// After
if (globalThis.__current?.sessionId) { ... }

// Before
const val = x !== null && x !== undefined ? x : 'default'
// After
const val = x ?? 'default'
```

Only change patterns where the intent is clearly the same (nullish check, not falsy check).

- [ ] **Step 2: Run lint and build to verify**

```bash
npm run lint && npm run build --workspace=packages/web-client
```

Expected: no errors, build succeeds.

- [ ] **Step 3: Test main page**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify page loads, session creation works, no console errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/public/js/main-page.js packages/web-client/public/js/ui/cookie-consent.js
git commit -m "refactor: apply optional chaining and nullish coalescing in public JS"
```

---

## Task 9: Dead Code Removal

**Files:** All non-sensitive JS files in `packages/web-client/src/` and `packages/web-client/public/js/`

- [ ] **Step 1: Find unused exports in src/**

```bash
# Find functions defined but potentially unused
grep -rn "^function \|^const \w* = function\|^const \w* = (" packages/web-client/src/ --include="*.js" | grep -v "node_modules" | head -30
```

- [ ] **Step 2: Find unused variables reported by lint**

```bash
npm run lint 2>&1 | grep "no-unused-vars"
```

Remove any variables/functions that are flagged as unused and are not part of public API (not exported, not used in HTML templates).

- [ ] **Step 3: Check for commented-out code blocks**

```bash
grep -rn "// *\(const\|let\|var\|function\|return\)" packages/web-client/src/ packages/web-client/public/js/ --include="*.js" | grep -v "node_modules" | head -20
```

Remove commented-out code blocks (not explanatory comments).

- [ ] **Step 4: Run full build and test**

```bash
npm run build
npm run dev
```

Open controller + viewer simultaneously:
- Play/pause ball
- Change speed, color, direction
- Verify sync between pages
- Check console for errors

- [ ] **Step 5: Run E2E tests**

```bash
npm run test:local
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "refactor: remove dead code from non-sensitive JS files"
```

---

## Final Verification

- [ ] Run `npm run lint` — 0 errors
- [ ] Run `npm run lint:css` — 0 errors
- [ ] Run `npm run build` — builds successfully, no source maps in output
- [ ] Check bundle sizes: `wc -c packages/web-client/public/dist/*.js packages/web-client/public/css/*.css`
- [ ] Verify Google Fonts not in network requests (DevTools → Network → filter "google")
- [ ] Open `/c/test` and `/s/test` simultaneously — ball syncs between controller and viewer
- [ ] Run `npm run test:local` — all E2E tests pass
