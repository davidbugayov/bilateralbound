# Full Architecture Refactoring — Design Spec

**Date:** 2026-03-16
**Status:** Approved
**Approach:** Big Bang (branch-based, full rewrite)

## Decisions

| Question             | Answer                                                    |
| -------------------- | --------------------------------------------------------- |
| Scope                | Full: server + frontend + shared                          |
| Language             | JavaScript, CommonJS                                      |
| Frontend bundling    | Webpack (2 entry points)                                  |
| Unit tests           | No                                                        |
| Logger               | Pino (plugin)                                             |
| Physics engine       | Separate `packages/shared`                                |
| Plugin system        | Light (logger, analytics only)                            |
| Structure            | Adaptive (no empty layers)                                |
| Refactoring approach | Big Bang in separate branch                               |
| dotenv               | Dropped — not needed (CLAUDE.md: "No .env file required") |

## Post-refactoring (separate phase)

- Extended analytics: retention, session funnel, feature usage, hourly activity, duration buckets
- Telegram reporting via clawdbot gateway (`localhost:18789`) to `@davidbugayov_bot`
- New `TelegramReporter` service
- Endpoint `GET /api/stats/report` for manual trigger

---

## New Project Structure

```
packages/
├── shared/                              # NEW package
│   ├── package.json                     # @emdr/shared
│   └── physics-engine.js               # moved from web-client/public/js/
│
├── server-core/
│   ├── package.json
│   └── src/                             # NEW (replaces server/)
│       ├── index.js                     # entry point, DI assembly
│       ├── config/
│       │   └── index.js                 # all process.env access, plain object (NO dotenv)
│       ├── plugins/
│       │   ├── index.js                 # registerPlugins(app, config)
│       │   ├── logger.js               # Pino { name, version, register }
│       │   └── analytics.js            # Analytics { name, version, register }
│       ├── controllers/
│       │   ├── sessionController.js    # session CRUD, state, health, analytics endpoint
│       │   ├── viewerController.js     # viewer endpoints (incl. audio-activated)
│       │   ├── seoController.js        # robots.txt, sitemap.xml, rss.xml
│       │   └── staticController.js     # HTML serving with i18n, static, panel, 404/error
│       ├── services/
│       │   ├── SessionService.js       # session business logic (~200 lines)
│       │   ├── PhysicsService.js       # physics loop, engine management (~250 lines)
│       │   ├── BroadcastService.js     # WS state broadcasting (~250 lines)
│       │   ├── LocalizationService.js  # i18n, HTML cache, meta tags (~120 lines)
│       │   └── AnalyticsCollector.js   # analytics data collection (from analytics.js)
│       ├── repositories/
│       │   └── SessionRepository.js    # in-memory Map, LRU (logic unchanged)
│       ├── network/
│       │   ├── middleware.js           # requestId, requireSession, setupMiddleware
│       │   ├── webSocketServer.js      # WS setup + message handlers
│       │   └── WebSocketManager.js     # WS client management
│       └── utils/
│           └── validation.js           # validation (logic unchanged)
│
├── web-client/
│   ├── package.json
│   ├── webpack.config.js               # updated: 2 entries (viewer, controller)
│   ├── public/
│   │   ├── index.html
│   │   ├── viewer.html                 # <script src="/dist/viewer.bundle.js">
│   │   ├── session-controller.html     # <script src="/dist/controller.bundle.js">
│   │   ├── css/                        # unchanged
│   │   └── locales/                    # unchanged
│   └── src/                            # NEW (JS moved from public/js/)
│       ├── viewer.js                   # entry point for viewer
│       ├── controller.js               # entry point for controller
│       ├── common.js
│       ├── config.js
│       ├── core/
│       │   └── debug-logger.js
│       ├── domain/
│       │   ├── counters.js
│       │   ├── direction.js
│       │   └── session-state.js
│       ├── network/
│       │   ├── websocket-client.js
│       │   └── realtime-client.js
│       ├── rendering/
│       │   └── renderer.js
│       ├── ui/
│       │   ├── index.js
│       │   ├── shared-components.js
│       │   ├── new-features.js
│       │   ├── notifications/
│       │   │   └── notification-system.js
│       │   └── theme-preload.js
│       ├── audio/
│       │   └── audio-manager.js
│       ├── i18n/
│       │   ├── i18n.js
│       │   ├── index.js
│       │   ├── lang-preload.js
│       │   ├── language-selector.js
│       │   └── meta-i18n.js
│       └── application/
│           └── controller/
│               ├── event-handlers.js
│               ├── fullscreen.js
│               ├── play-pause.js
│               ├── preview-manager.js
│               ├── ui-controls.js
│               ├── ui-sync.js
│               └── viewer-status.js
```

---

## Dependency Injection

All dependencies assembled in `src/index.js`:

```
config (plain object, NO dotenv)
  └─> registerPlugins(app, config) → { logger, analytics }
        └─> SessionRepository()
              └─> WebSocketManager(sessionRepository, logger)
                    └─> BroadcastService(sessionRepository, webSocketManager, { clientSimulationOnly, logger })
                          └─> PhysicsService(sessionRepository, broadcastService, webSocketManager, { clientSimulationOnly, logger, analytics })
                                └─> SessionService(sessionRepository, physicsService, broadcastService, webSocketManager, { logger, analytics, apiCache })
                                      └─> Controllers get sessionService + other deps
                                      └─> webSocketServer gets sessionService + webSocketManager + broadcastService + logger
```

**apiCache**: `Map` created in `index.js`, injected into `SessionService` (for cache invalidation on state updates) and into `sessionController` (for `/api/session/:id/state` read cache with 50ms TTL).

No class creates its own dependencies. Everything injected via constructors.

---

## SessionManager Decomposition

| Current (SessionManager 893 lines)                                                                                                                                                                   | New                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `createSession`, `findOrCreateSession`, `getSession`, `updateBallState`, `setViewerScreenSize`, `setLanguage`, `handleWebSocketConnection`, `handleWebSocketDisconnection`, `cleanupExpiredSessions` | **SessionService** (~200 lines) — facade for controllers |
| `_initializePhysicsEngine`, `_initPhysicsCallbacks`, `_applyPhysicsUpdates`, `_startSharedPhysicsLoop`, `_withSoundPreserved`, `_updatePhysicsEngineForNewScreen`, `startPhysics`, `stopPhysics`     | **PhysicsService** (~250 lines) — physics loop + engines |
| `broadcastControllerConnection`, `broadcastViewerConnection`, `broadcastLanguageUpdate` + all of StateBroadcaster                                                                                    | **BroadcastService** (~250 lines) — all WS broadcasting  |

### BroadcastService API (explicit)

```js
class BroadcastService {
  broadcastState(sessionId, options)                    // state_update to all clients
  broadcastInitialState(sessionId, client, state)       // initial_state to one client
  broadcastViewerStatus(sessionId)                      // viewer_status to all
  broadcastControllerConnection(sessionId, isConnected) // controller_connected/disconnected to viewers
  broadcastViewerConnection(sessionId, isConnected, screenSize) // viewer_status to controllers
  broadcastLanguageUpdate(sessionId, language)           // language_updated to all clients
  broadcastViewerAudioActivated(sessionId, activated)    // viewer_audio_activated to controllers
}
```

**Note:** Current code has a bug where `broadcastState()` is called with 3 positional args for `viewer_audio_activated` (expressApp.js line 840). The correct pattern is to use the dedicated `broadcastViewerAudioActivated()` method instead.

---

## expressApp.js Decomposition

| Current (expressApp.js 1026 lines)                                              | New                                   |
| ------------------------------------------------------------------------------- | ------------------------------------- |
| Session API routes (POST/GET /api/session/...)                                  | **sessionController.js** (~100 lines) |
| Viewer API routes (POST /api/session/:id/viewer/...)                            | **viewerController.js** (~70 lines)   |
| robots.txt, sitemap.xml, rss.xml                                                | **seoController.js** (~120 lines)     |
| HTML serving, static files, panel, 404/error handlers                           | **staticController.js** (~70 lines)   |
| helmet, cors, compression, rate-limit, requestId                                | **middleware.js** (~50 lines)         |
| loadLocales, detectLanguage, localizeHtml, injectCanonicalHreflang, \_htmlCache | **LocalizationService** (~120 lines)  |

### Complete endpoint mapping

**sessionController.js:**

```
POST   /api/session                          → createSession
POST   /api/session/:id/reserve              → reserveSession
GET    /api/session/:id                      → getSession
GET    /api/session/:id/state                → getState (with apiCache)
POST   /api/session/:id/controller/connect   → controllerConnect
POST   /api/session/:id/controller/update    → controllerUpdate
POST   /api/session/:id/language             → setLanguage
GET    /health                               → healthCheck
GET    /api/analytics                        → getAnalytics (localhost-only IP guard)
```

**viewerController.js:**

```
POST   /api/session/:id/viewer/connect           → viewerConnect
POST   /api/session/:id/viewer/update            → viewerUpdate
POST   /api/session/:id/viewer/bounce            → bounceSync
POST   /api/session/:id/viewer/screen-size       → screenSize
POST   /api/session/:id/viewer/audio-activated   → audioActivated
```

**seoController.js:**

```
GET    /robots.txt     → dynamic per domain
GET    /sitemap.xml    → dynamic per domain
GET    /rss.xml        → RSS feed
```

**staticController.js:**

```
GET    /              → index.html (localized)
GET    /s/:sessionId  → viewer.html (localized)
GET    /c/:sessionId  → session-controller.html (localized)
GET    /panel/:id     → therapist panel SPA (React)
GET    /test/:file    → test files (with path traversal guard)
       static dirs    → css, js, emdr-therapy, panel (immutable cache)
       catch-all      → other static files
       404 handler
       error handler
```

---

## WebSocket Message Handlers

The new `webSocketServer.js` receives: `sessionService`, `webSocketManager`, `broadcastService`, `logger`.

Complete handler mapping (all preserved from current code):

| Message Type             | Role       | Handler                                                         |
| ------------------------ | ---------- | --------------------------------------------------------------- |
| `request_state_sync`     | any        | `sessionService.getSession()` → send `initial_state`            |
| `controller_connected`   | controller | broadcast to other clients via `webSocketManager`               |
| `viewer_connected`       | viewer     | broadcast to other clients via `webSocketManager`               |
| `viewer_audio_activated` | viewer     | store on session, forward to controllers via `broadcastService` |
| `controller_update`      | controller | `sessionService.updateBallState()`                              |
| `bounce`                 | viewer     | forward `bounce_sync` to controllers via `webSocketManager`     |
| `viewer_screen_size`     | viewer     | `sessionService.setViewerScreenSize()`                          |
| `language`               | any        | `sessionService.setLanguage()`                                  |
| `viewer_update`          | viewer     | `sessionService.updateBallState()`                              |
| `heartbeat`              | any        | ignored (no-op)                                                 |

**DI note:** `webSocketServer.js` needs direct access to both `sessionService` (for business operations) and `webSocketManager` (for targeted message sending to specific roles). This is intentional — the WS handler is a network layer that needs to route messages, not pure business logic.

---

## Plugin System

Light plugin system — only for extensible infrastructure (logger, analytics).

Interface:

```js
{
  name: String,
  version: String,
  register(app, options) → instance
}
```

Plugins:

- **logger** — Pino with pino-pretty (dev), `logSession()` compat method, HTTP request logging middleware
- **analytics** — AnalyticsCollector instance + HTTP tracking middleware

Registration: `plugins/index.js` → `registerPlugins(app, config)` returns `{ logger, analytics }`.

Express middleware (helmet, cors, etc.) stays as middleware — NOT wrapped in plugins.

---

## Frontend Migration

### Webpack Config

Two entry points:

- `src/viewer.js` → `public/dist/viewer.bundle.js`
- `src/controller.js` → `public/dist/controller.bundle.js`

### Module Migration

| Before                                           | After                       |
| ------------------------------------------------ | --------------------------- |
| `globalThis.ModuleName = { ... }` (IIFE)         | `module.exports = { ... }`  |
| `if (typeof globalThis.X !== 'undefined')` guard | removed                     |
| `<script>` tag ordering                          | `require()` in entry points |
| 15-20+ script tags per HTML                      | 1 bundle per HTML           |

### Preserved

- `globalThis.__current` — session state (used everywhere)
- `globalThis.i18n` — must remain global for HTML access
- CSS, HTML markup, locales unchanged
- `physics-engine.js` → `require('@emdr/shared/physics-engine')`

### Inline script handling (CRITICAL for 60Hz physics sync)

Current HTML files (`viewer.html`, `session-controller.html`) contain inline `<script>` blocks that initialize `globalThis.__current` and other state before module scripts run. With Webpack:

1. **Move all inline initialization into bundle entry points** (`src/viewer.js`, `src/controller.js`)
2. Entry points initialize `globalThis.__current` FIRST, before requiring any modules that read it
3. HTML files retain ONLY the single `<script src="/dist/...bundle.js">` tag — no inline scripts
4. Exception: `i18n/lang-preload.js` and `ui/theme-preload.js` may remain as inline scripts if they must execute before bundle loads (FOUC prevention). If so, they stay as `<script>` tags BEFORE the bundle tag.

---

## Shared Package

```json
{
  "name": "@emdr/shared",
  "version": "2.39.287",
  "main": "physics-engine.js"
}
```

Consumers:

- Server: `require('@emdr/shared/physics-engine')` (workspace symlink)
- Client: `require('@emdr/shared/physics-engine')` (Webpack resolves via workspace)

---

## Config

Plain object, all `process.env` access centralized. **No dotenv** — not needed per CLAUDE.md.

**Breaking change:** current code uses `config.getServerConfig().PORT` → new code uses `config.server.PORT`. All call sites must be updated.

```js
module.exports = {
  server: { PORT, NODE_ENV },
  runtime: { CLIENT_SIM_ONLY, DEAD_RECKON_EPS },
  cors: { origins: [...] },
  logLevel: 'info' | 'debug',
  isDev: Boolean
}
```

---

## New Dependencies

- `pino` (production)
- `pino-pretty` (dev)

**Removed dependency:** `dotenv` (not needed)

---

## What Does NOT Change

- Business logic — no algorithms rewritten
- WebSocket protocol — all message types preserved
- HTTP API — all endpoints, paths, response formats preserved
- CSS, HTML markup, locales
- E2E tests
- Deploy scripts (paths updated in package.json)

---

## Implementation Order

1. Create `packages/shared`, move physics-engine
2. Server: config → plugins → repositories → services → controllers → network → index.js
3. Frontend: configure Webpack → move JS to `src/` → replace script tags
4. Update package.json scripts, paths
5. E2E test run

## Files to Delete After Migration

- `packages/server-core/server/` (entire directory)
- `packages/web-client/public/js/` (entire directory — code moved to `src/`)
