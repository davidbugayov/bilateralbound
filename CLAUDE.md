# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EMDR therapy platform — therapist (controller) controls a bouncing ball via bilateral stimulation; patient (viewer) watches it in real-time. SSE is the primary transport; WebSocket is fallback.

## Commands

```bash
# Development
npm run dev              # Start dev server (nodemon, port 3000)
npm start                # Start production server

# Testing
npm test                 # E2E tests against dev.emdrbilateral.online
npm run test:local       # E2E tests against localhost:3000
npm run test:dev         # E2E tests against dev server

# Linting & Formatting
npm run lint             # ESLint (flat config)
npm run lint:fix         # ESLint with auto-fix
npm run lint:css         # Stylelint for CSS
npm run format           # Prettier
```

## Architecture

**Monorepo** with npm workspaces: `packages/server-core` (Node.js + Express) and `packages/web-client` (Vanilla JS, no framework).

### Server (`packages/server-core/server/`)
- `index.js` — entry: creates SessionManager, Express app, WebSocket server
- `network/expressApp.js` — all HTTP/SSE routes, compression (excludes `/stream` paths for SSE)
- `session/SessionManager.js` — orchestrator: physics loop, SSE, WS, broadcast
- `session/StateBroadcaster.js` — sends events to SSE + WS clients (viewer-only, controller-only, or both)
- `session/SSEManager.js` — SSE client registry, heartbeat every 45s
- `session/SessionRepository.js` — in-memory Map, LRU eviction, MAX_SESSIONS=1000

### Frontend (`packages/web-client/public/`)
- `viewer.html` / `session-controller.html` — patient and therapist views
- `js/physics-engine.js` — shared physics (used server-side AND client-side)
- `js/sse-client.js` — SSE with auto-reconnect
- `js/controller.js` — controller UI logic (wires SSE handlers, manages state)
- `js/renderer.js` — canvas ball rendering
- `js/application/controller/` — modular controller components (viewer-status, fullscreen, sse-handlers, etc.)
- `locales/` — 8 languages (en, ru, de, es, fr, pt, ja, zh)

### Data Flow
1. Therapist opens `/c/:id` → SSE as controller
2. Patient opens `/s/:id` → SSE as viewer, sends screen size
3. Server physics ticks at 60Hz, broadcasts state ~15/sec
4. Controller adjusts settings via `POST /api/session/:id/controller/update`
5. Viewer bounces sync back via `POST /api/session/:id/viewer/bounce`

## Key Conventions

- **i18n pattern**: `globalThis.i18n?.t('key') || 'English fallback'` — never hardcode user-facing strings in Russian or any language
- **Module pattern**: IIFE with `globalThis.ModuleName = { ... }` export, guarded by `if (typeof globalThis.ModuleName !== 'undefined')` to prevent double-load
- **Global state**: `globalThis.__current` holds session state (sessionId, isPlaying, viewerConnected, etc.)
- **SSE endpoint**: `GET /api/session/:id/stream?role=viewer|controller` — compression middleware must exclude `/stream` paths or SSE buffers and EventSource never reaches OPEN
- **Session IDs**: auto-generated 6-char UUID prefix, or custom 3-32 chars (alphanumeric/dash/underscore)
- **E2E tests**: Puppeteer-based, 21 tests, use `domcontentloaded` (not `networkidle0` — SSE keeps network active)
- **No bundler for frontend**: vanilla JS loaded via `<script>` tags, order matters

## Deployment

- Dev: `dev.emdrbilateral.online` (branch: `main`) — `npm run deploy:dev`
- Prod: `emdrbilateral.online` / `emdrbilateral.ru` (branch: `stable`) — `npm run deploy:prod`
- systemd services on `213.139.229.44`: `emdrbilateral-dev`, `emdrbilateral-online`, `emdrbilateral-ru`
- **All development happens on `main`**; prod branch `stable` is updated manually when ready
