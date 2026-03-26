# Full Architecture Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the EMDR therapy platform from monolithic files to layered architecture with DI, Pino logging, Webpack frontend bundling, and shared physics package.

**Architecture:** Server decomposed into controllers/services/repositories with dependency injection via constructors. Frontend migrated from `<script>` tags to Webpack bundles. Shared physics engine extracted to `@emdr/shared` workspace package.

**Tech Stack:** Node.js, Express, WebSocket (ws), Pino, Webpack, CommonJS

**Spec:** `docs/superpowers/specs/2026-03-16-full-refactoring-design.md`

---

## Chunk 1: Foundation (shared package, config, plugins)

### Task 1: Create branch and shared package

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/physics-engine.js`
- Modify: `package.json` (add workspace)
- Modify: `packages/web-client/public/js/physics-engine.js` (source to copy from)

- [ ] **Step 1: Create refactoring branch**

```bash
git checkout -b refactor/layered-architecture
```

- [ ] **Step 2: Create `packages/shared/package.json`**

```json
{
  "name": "@emdr/shared",
  "version": "2.39.287",
  "description": "Shared modules for EMDR therapy platform",
  "main": "physics-engine.js",
  "type": "commonjs",
  "license": "ISC"
}
```

- [ ] **Step 3: Copy physics-engine.js to shared package**

Copy `packages/web-client/public/js/physics-engine.js` to `packages/shared/physics-engine.js`.

Modify the copy: remove the IIFE/globalThis wrapper. The file currently uses a pattern like:

```js
(function () {
  "use strict";
  // ... class PhysicsEngine
  if (typeof module !== "undefined" && module.exports) {
    module.exports = PhysicsEngine;
  } else {
    globalThis.PhysicsEngine = PhysicsEngine;
  }
})();
```

Change to:

```js
"use strict";
// ... class PhysicsEngine (same code, no IIFE)
module.exports = PhysicsEngine;
```

- [ ] **Step 4: Add `packages/shared` to root workspace**

In root `package.json`, add `"packages/shared"` to the existing workspaces array (keep existing entries unchanged):

```json
"workspaces": [
  "packages/server-core",
  "packages/web-client",
  "packages/therapist-panel",
  "packages/shared"
]
```

- [ ] **Step 5: Run `npm install` to create workspace symlinks**

```bash
npm install
```

Expected: no errors, `node_modules/@emdr/shared` symlink created.

- [ ] **Step 6: Verify server can require shared package**

```bash
node -e "const PE = require('@emdr/shared/physics-engine'); console.log(typeof PE)"
```

Expected: `function`

- [ ] **Step 7: Commit**

```bash
git add packages/shared/ package.json package-lock.json
git commit -m "feat: create @emdr/shared package with physics-engine"
```

---

### Task 2: Server config (plain object, no dotenv)

**Files:**

- Create: `packages/server-core/src/config/index.js`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/server-core/src/config
```

- [ ] **Step 2: Write `src/config/index.js`**

```js
"use strict";

module.exports = {
  server: {
    PORT: process.env.NODE_PORT || process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || "development",
  },
  runtime: {
    CLIENT_SIM_ONLY:
      String(process.env.CLIENT_SIM_ONLY || "true").toLowerCase() === "true",
    DEAD_RECKON_EPS: Math.max(
      0,
      Number.parseFloat(process.env.DEAD_RECKON_EPS || "1.5") || 1.5,
    ),
  },
  cors: {
    origins: [
      "https://emdrbilateral.ru",
      "https://emdrbilateral.online",
      "http://localhost:3000",
      "http://localhost:3006",
      "http://localhost:5000",
      "http://localhost:8080",
      "https://davidbugayov.github.io",
      "https://bilateralbound.onrender.com",
    ],
  },
  logLevel: process.env.LOG_LEVEL || "info",
  isDev: (process.env.NODE_ENV || "development") !== "production",
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/server-core/src/
git commit -m "feat: add plain-object config module"
```

---

### Task 3: Pino logger plugin

**Files:**

- Create: `packages/server-core/src/plugins/logger.js`
- Create: `packages/server-core/src/plugins/index.js`

- [ ] **Step 1: Install pino**

```bash
cd packages/server-core && npm install pino && npm install --save-dev pino-pretty && cd ../..
```

- [ ] **Step 2: Write `src/plugins/logger.js`**

```js
"use strict";
const pino = require("pino");

module.exports = {
  name: "logger",
  version: "1.0.0",
  register(app, { config }) {
    const logger = pino({
      level: config.logLevel,
      transport: config.isDev
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    });

    // Compatibility method for session-scoped logging
    logger.logSession = (sessionId, msg) => {
      logger.debug({ sessionId }, msg);
    };

    // HTTP request logging middleware
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        logger.info(
          {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            ms: Date.now() - start,
          },
          "HTTP request",
        );
      });
      next();
    });

    return logger;
  },
};
```

- [ ] **Step 3: Write `src/plugins/index.js`** (logger only for now, analytics added later)

```js
"use strict";
const loggerPlugin = require("./logger");

function registerPlugins(app, config) {
  const logger = loggerPlugin.register(app, { config });

  logger.info({ plugins: [loggerPlugin.name] }, "Plugins registered");

  return { logger };
}

module.exports = { registerPlugins };
```

- [ ] **Step 4: Verify plugin loads**

```bash
node -e "
const express = require('express');
const app = express();
const config = require('./packages/server-core/src/config');
const { registerPlugins } = require('./packages/server-core/src/plugins');
const { logger } = registerPlugins(app, config);
logger.info('Plugin test OK');
"
```

Expected: Pino output with "Plugin test OK".

- [ ] **Step 5: Commit**

```bash
git add packages/server-core/src/plugins/ packages/server-core/package.json packages/server-core/package-lock.json
git commit -m "feat: add Pino logger plugin"
```

---

### Task 4: Analytics plugin + AnalyticsCollector service

**Files:**

- Create: `packages/server-core/src/services/AnalyticsCollector.js`
- Create: `packages/server-core/src/plugins/analytics.js`
- Modify: `packages/server-core/src/plugins/index.js`

- [ ] **Step 1: Create services directory**

```bash
mkdir -p packages/server-core/src/services
```

- [ ] **Step 2: Write `src/services/AnalyticsCollector.js`**

Copy the Analytics class from `packages/server-core/server/analytics.js` (lines 6-315). Changes:

- Class name: `Analytics` → `AnalyticsCollector`
- Remove the singleton export `module.exports = new Analytics()`
- Replace with `module.exports = AnalyticsCollector`
- Constructor accepts `(logger)` parameter
- Replace all internal `console.log/error` with `this.logger.info/error` (there are none currently — the class doesn't log)
- Logic unchanged

- [ ] **Step 3: Write `src/plugins/analytics.js`**

```js
"use strict";
const AnalyticsCollector = require("../services/AnalyticsCollector");

module.exports = {
  name: "analytics",
  version: "1.0.0",
  register(app, { config, logger }) {
    const analytics = new AnalyticsCollector(logger);

    // HTTP tracking middleware
    app.use((req, res, next) => {
      analytics.recordHttpRequest();
      res.on("finish", () => {
        if (res.statusCode >= 400) {
          analytics.recordHttpError(res.statusCode, req.path);
        }
      });
      next();
    });

    return analytics;
  },
};
```

- [ ] **Step 4: Update `src/plugins/index.js`**

Add analytics plugin:

```js
"use strict";
const loggerPlugin = require("./logger");
const analyticsPlugin = require("./analytics");

function registerPlugins(app, config) {
  const logger = loggerPlugin.register(app, { config });
  const analytics = analyticsPlugin.register(app, { config, logger });

  logger.info(
    { plugins: [loggerPlugin.name, analyticsPlugin.name] },
    "Plugins registered",
  );

  return { logger, analytics };
}

module.exports = { registerPlugins };
```

- [ ] **Step 5: Commit**

```bash
git add packages/server-core/src/services/AnalyticsCollector.js packages/server-core/src/plugins/
git commit -m "feat: add AnalyticsCollector service and analytics plugin"
```

---

## Chunk 2: Server repositories, services, network

### Task 5: SessionRepository (copy with minimal changes)

**Files:**

- Create: `packages/server-core/src/repositories/SessionRepository.js`

- [ ] **Step 1: Create directory**

```bash
mkdir -p packages/server-core/src/repositories
```

- [ ] **Step 2: Copy SessionRepository**

Copy from `packages/server-core/server/session/SessionRepository.js`. No logic changes. Already a clean class with SRP.

- [ ] **Step 3: Commit**

```bash
git add packages/server-core/src/repositories/
git commit -m "feat: add SessionRepository to new structure"
```

---

### Task 6: ValidationUtils (copy)

**Files:**

- Create: `packages/server-core/src/utils/validation.js`

- [ ] **Step 1: Create directory and copy**

```bash
mkdir -p packages/server-core/src/utils
```

Copy from `packages/server-core/server/utils/validation.js`. No changes.

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/utils/
git commit -m "feat: add ValidationUtils to new structure"
```

---

### Task 7: WebSocketManager (DI logger)

**Files:**

- Create: `packages/server-core/src/network/WebSocketManager.js`

- [ ] **Step 1: Create directory**

```bash
mkdir -p packages/server-core/src/network
```

- [ ] **Step 2: Write WebSocketManager with DI logger**

Copy from `packages/server-core/server/session/WebSocketManager.js`. Changes:

- Remove `const { logger } = require('../logger.js')` at top
- Constructor: `constructor(sessionRepository, logger)` — add `logger` param
- `this.logger = logger`
- All other logic unchanged

- [ ] **Step 3: Commit**

```bash
git add packages/server-core/src/network/WebSocketManager.js
git commit -m "feat: add WebSocketManager with DI logger"
```

---

### Task 8: BroadcastService

**Files:**

- Create: `packages/server-core/src/services/BroadcastService.js`

- [ ] **Step 1: Write BroadcastService**

Based on `packages/server-core/server/session/StateBroadcaster.js` + `broadcastLanguageUpdate` and `broadcastViewerAudioActivated` from SessionManager. Changes:

- Rename class: `StateBroadcaster` → `BroadcastService`
- Constructor: `constructor(sessionRepository, webSocketManager, { clientSimulationOnly, logger })`
- Remove `const { logger, DEBUG_MODE } = require('../logger.js')` — use `this.logger`
- Replace `DEBUG_MODE` checks with `this.logger.isLevelEnabled('debug')` or just use `this.logger.debug()`
- Add method `broadcastLanguageUpdate(sessionId, language)` — move from SessionManager lines 856-889
- Add method `broadcastViewerAudioActivated(sessionId, activated)` — new dedicated method replacing the 3-arg broadcastState bug
- All broadcasting logic from StateBroadcaster preserved

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/services/BroadcastService.js
git commit -m "feat: add BroadcastService (from StateBroadcaster + SessionManager broadcasts)"
```

---

### Task 9: PhysicsService

**Files:**

- Create: `packages/server-core/src/services/PhysicsService.js`

- [ ] **Step 1: Write PhysicsService**

Extract from `SessionManager.js` all physics-related methods. Source lines and target methods:

| SessionManager method                         | PhysicsService method                                  |
| --------------------------------------------- | ------------------------------------------------------ |
| `_initializePhysicsEngine` (L102-123)         | `initializeEngine(session)`                            |
| `_initPhysicsCallbacks` (L80-95)              | `_initCallbacks(session)`                              |
| `_applyPhysicsUpdates` (L195-275)             | `applyUpdates(session, updates)`                       |
| `_startSharedPhysicsLoop` (L691-757)          | `_startSharedPhysicsLoop()` (constructor)              |
| `_withSoundPreserved` (L626-632)              | `_withSoundPreserved(session, fn)`                     |
| `_updatePhysicsEngineForNewScreen` (L547-579) | `updateScreenSize(session, size, hadPrevSize)`         |
| `_initializeBallPosition` (L585-591)          | `_initializeBallPosition(session, size)`               |
| `_scaleBallPosition` (L597-617)               | `_scaleBallPosition(session, state, size, wasPlaying)` |
| `_shouldScaleBallPosition` (L649-655)         | `_shouldScaleBallPosition(session, state)`             |
| `startPhysics` (L763-766)                     | removed (no-op)                                        |
| `stopPhysics` (L780-783)                      | `stopPhysics(session)`                                 |
| `_ensurePhysicsLoop` (L771-773)               | removed (no-op)                                        |

Constructor:

```js
constructor(sessionRepository, broadcastService, webSocketManager, {
  clientSimulationOnly,
  logger,
  analytics,
});
```

**CRITICAL:** `webSocketManager` is needed because the physics loop checks `this.webSocketManager.getClients(session.id).some(({info}) => info.role === 'viewer')` to only run physics when viewers are connected. Without it, the 60Hz loop runs for all sessions including those with zero clients.

Key: `PhysicsEngine = require('@emdr/shared/physics-engine')` — use shared package.

Physics loop (inside `_startSharedPhysicsLoop`): includes `pendingDeleteAt` check with `this.repo.delete()` and `this.analytics.recordSessionEnded()`.

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/services/PhysicsService.js
git commit -m "feat: add PhysicsService (extracted from SessionManager)"
```

---

### Task 10: SessionService

**Files:**

- Create: `packages/server-core/src/services/SessionService.js`

- [ ] **Step 1: Write SessionService**

Facade class. Extract remaining business logic from SessionManager. Methods:

```js
class SessionService {
  constructor(sessionRepository, physicsService, broadcastService, { logger, analytics, apiCache }) {
    this.repo = sessionRepository
    this.physics = physicsService
    this.broadcast = broadcastService
    this.logger = logger
    this.analytics = analytics
    this.apiCache = apiCache
  }

  async createSession(ballState = {})
  findOrCreateSession(sessionId, ballState = {})
  getSession(sessionId)
  getSessionCount()
  updateBallState(sessionId, updates)        // validation + delegates to physics
  setViewerScreenSize(sessionId, screenSize) // validation + delegates to physics
  setLanguage(sessionId, language)           // validation + delegates to broadcast
  cleanupExpiredSessions()
  handleWebSocketConnection(ws, sessionId, role)
  handleWebSocketDisconnection(ws)
  getClientInfo(ws)                          // delegates to webSocketManager via physics? No — needs webSocketManager

  // Private
  _shouldUpdateState(session, updates)
  _getThrottleDelay(updates)
  _postUpdateActions(session, updates)
}
```

**Important DI detail:** SessionService needs `webSocketManager` for `handleWebSocketConnection/Disconnection` and `getClientInfo`. Add it to constructor:

```js
constructor(
  sessionRepository,
  physicsService,
  broadcastService,
  webSocketManager,
  { logger, analytics, apiCache },
);
```

Source mapping from SessionManager:

- `createSession` (L44-49)
- `findOrCreateSession` (L58-74)
- `getSession` (L130-132)
- `updateBallState` (L140-161) — calls `this.physics.applyUpdates()`
- `_shouldUpdateState` (L167-179)
- `_getThrottleDelay` (L292-309)
- `_postUpdateActions` (L277-287) — calls `this.broadcast.broadcastState()`
- `setViewerScreenSize` (L508-530) — calls `this.physics.updateScreenSize()`
- `setLanguage` (L828-849) — calls `this.broadcast.broadcastLanguageUpdate()`
- `handleWebSocketConnection` (L317-348) — complex, uses broadcast + physics
- `handleWebSocketDisconnection` (L425-453)
- `cleanupExpiredSessions` (L789-803)
- `getSessionCount` (L809-811)
- `getClientInfo` (L818-820) — delegates to `this.wsManager.getClientInfo(ws)`
- `_handleInitialStateBroadcast` (L354-364) — routes to viewer or controller initial state
- `_handleControllerInitialState` (L370-381) — sends initial state to controller
- `_broadcastInitialStateToController` (L387-397)
- `_broadcastControllerConnectionIfNeeded` (L403-407)
- `_isViewerScreenSizeSet` (L413-419)
- `_storePreviousScreenSize` (L536-541)
- `_setDirectionNormalizationTimeout` (L661-663)
- `_sendInitialStateToControllers` (L669-685)

**All** private helpers from SessionManager that relate to WS connection handling and screen size management go into SessionService.

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/services/SessionService.js
git commit -m "feat: add SessionService facade (extracted from SessionManager)"
```

---

### Task 11: LocalizationService

**Files:**

- Create: `packages/server-core/src/services/LocalizationService.js`

- [ ] **Step 1: Write LocalizationService**

Extract from `expressApp.js`:

- `SUPPORTED_LANGS` constant (L77)
- `loadLocales(publicPath)` (L83-94)
- `getLocaleValue(locale, key)` (L99-101)
- `detectLanguage(req, session)` (L106-120)
- `localizeHtml(html, lang, locale, metaMap)` (L127-162)
- `injectCanonicalHreflang(html, host)` (L170-234)
- HTML cache building (L419-453)
- Meta maps: `viewerMetaMap`, `controllerMetaMap`, `indexMetaMap` (L362-417)

Constructor:

```js
constructor(config, logger) {
  this.config = config
  this.logger = logger
  this._htmlCache = new Map()
  // Load and cache at construction time
  this._init()
}
```

Public API:

```js
getLocalizedHtml(type, req, session); // type = 'viewer' | 'controller' | 'index'
detectLanguage(req, session);
```

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/services/LocalizationService.js
git commit -m "feat: add LocalizationService (extracted from expressApp i18n logic)"
```

---

## Chunk 3: Server controllers, network, entry point

### Task 12: Middleware

**Files:**

- Create: `packages/server-core/src/network/middleware.js`

- [ ] **Step 1: Write middleware.js**

Extract from `expressApp.js`:

```js
"use strict";
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const express = require("express");
const { v4: uuidv4 } = require("uuid");

function requestId(req, res, next) {
  req.id = req.headers["x-request-id"] || uuidv4();
  res.setHeader("X-Request-Id", req.id);
  next();
}

function requireSession(sessionService) {
  return (req, res, next) => {
    const { sessionId } = req.params;
    const session = sessionService.getSession(sessionId);
    if (!session) {
      return res
        .status(404)
        .json({ error: "Session not found", requestId: req.id });
    }
    req.session = session;
    next();
  };
}

function setNoCacheHeaders(res) {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function setupMiddleware(app, config) {
  app.use(requestId);
  // Helmet (from expressApp L253-288)
  // CORS (from expressApp L304-319)
  // Compression (from expressApp L321-325)
  // JSON parser
  // Rate limiting (non-dev only, from expressApp L290-302)
}

module.exports = { setupMiddleware, requireSession, setNoCacheHeaders };
```

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/network/middleware.js
git commit -m "feat: add middleware module (extracted from expressApp)"
```

---

### Task 13: sessionController

**Files:**

- Create: `packages/server-core/src/controllers/sessionController.js`

- [ ] **Step 1: Create controllers directory**

```bash
mkdir -p packages/server-core/src/controllers
```

- [ ] **Step 2: Write sessionController.js**

Endpoints (from expressApp.js):

- `POST /api/session` (L686-699)
- `POST /api/session/:id/reserve` (L701-723)
- `GET /api/session/:id` (L724-738)
- `GET /api/session/:id/state` (L739-778) — with apiCache
- `POST /api/session/:id/controller/connect` (L779-794)
- `POST /api/session/:id/controller/update` (L797-815)
- `POST /api/session/:id/language` (L917-939)
- `GET /health` (L466-474)
- `GET /api/analytics` (L477-489) — localhost-only guard

```js
function registerSessionRoutes(
  app,
  sessionService,
  apiCache,
  analytics,
  { requireSession, logger },
) {
  // ... routes
}
module.exports = { registerSessionRoutes };
```

- [ ] **Step 3: Commit**

```bash
git add packages/server-core/src/controllers/sessionController.js
git commit -m "feat: add sessionController (session CRUD, state, health, analytics)"
```

---

### Task 14: viewerController

**Files:**

- Create: `packages/server-core/src/controllers/viewerController.js`

- [ ] **Step 1: Write viewerController.js**

Endpoints (from expressApp.js):

- `POST /api/session/:id/viewer/connect` (L880-898)
- `POST /api/session/:id/viewer/update` (L816-828)
- `POST /api/session/:id/viewer/bounce` (L852-879) — needs webSocketManager for direct WS send
- `POST /api/session/:id/viewer/screen-size` (L899-916)
- `POST /api/session/:id/viewer/audio-activated` (L831-851) — uses broadcastService

```js
function registerViewerRoutes(
  app,
  sessionService,
  webSocketManager,
  broadcastService,
  { requireSession, logger },
) {
  // ... routes
}
module.exports = { registerViewerRoutes };
```

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/controllers/viewerController.js
git commit -m "feat: add viewerController (viewer endpoints)"
```

---

### Task 15: seoController

**Files:**

- Create: `packages/server-core/src/controllers/seoController.js`

- [ ] **Step 1: Write seoController.js**

Endpoints (from expressApp.js):

- `GET /robots.txt` (L492-573)
- `GET /sitemap.xml` (L576-615)
- `GET /rss.xml` (L656-685)

```js
function registerSeoRoutes(app) {
  // ... routes (self-contained, no deps except req/res)
}
module.exports = { registerSeoRoutes };
```

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/controllers/seoController.js
git commit -m "feat: add seoController (robots, sitemap, rss)"
```

---

### Task 16: staticController

**Files:**

- Create: `packages/server-core/src/controllers/staticController.js`

- [ ] **Step 1: Write staticController.js**

From expressApp.js:

- `GET /` — localized index.html (L456-463)
- `GET /s/:sessionId` — localized viewer.html (L941-949)
- `GET /c/:sessionId` — localized controller.html (L950-959)
- `GET /panel/:sessionId` — React SPA (L961-965)
- `GET /test/:file` — test files with path traversal guard (L966-1005)
- Static directories setup (L617-653)
- 404 handler (L1007-1011)
- Error handler (L1013-1021)

```js
function registerStaticRoutes(
  app,
  sessionService,
  localizationService,
  { setNoCacheHeaders, logger },
) {
  // ... routes
}
module.exports = { registerStaticRoutes };
```

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/controllers/staticController.js
git commit -m "feat: add staticController (HTML serving, static files, panel, 404)"
```

---

### Task 17: webSocketServer

**Files:**

- Create: `packages/server-core/src/network/webSocketServer.js`

- [ ] **Step 1: Write webSocketServer.js**

Based on `packages/server-core/server/network/webSocketServer.js`. Changes:

- Function signature: `setupWebSocketServer(server, sessionService, webSocketManager, broadcastService, analytics, logger)`
- Remove `require('../logger.js')` and `require('../analytics.js')` — use injected deps
- Message handlers use `sessionService` methods instead of `sessionManager.sessionRepository.findById()` directly
- For handlers that need raw WS access (like `request_state_sync`, `controller_connected`, `viewer_connected`, `bounce`), use `webSocketManager.getClients()`
- `viewer_audio_activated` handler uses `broadcastService.broadcastViewerAudioActivated()`
- All message types from spec preserved: `request_state_sync`, `controller_connected`, `viewer_connected`, `viewer_audio_activated`, `controller_update`, `bounce`, `viewer_screen_size`, `language`, `viewer_update`, `heartbeat`

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/network/webSocketServer.js
git commit -m "feat: add webSocketServer with DI (all message handlers preserved)"
```

---

### Task 18: Entry point (index.js) — DI assembly

**Files:**

- Create: `packages/server-core/src/index.js`
- Modify: `packages/server-core/package.json` (change main)

- [ ] **Step 1: Write `src/index.js`**

Complete DI assembly as described in spec. Key order:

```js
"use strict";
const http = require("node:http");
const express = require("express");
const config = require("./config");
const { registerPlugins } = require("./plugins");
const SessionRepository = require("./repositories/SessionRepository");
const WebSocketManager = require("./network/WebSocketManager");
const BroadcastService = require("./services/BroadcastService");
const PhysicsService = require("./services/PhysicsService");
const SessionService = require("./services/SessionService");
const LocalizationService = require("./services/LocalizationService");
const {
  setupMiddleware,
  requireSession,
  setNoCacheHeaders,
} = require("./network/middleware");
const { setupWebSocketServer } = require("./network/webSocketServer");
const { registerSessionRoutes } = require("./controllers/sessionController");
const { registerViewerRoutes } = require("./controllers/viewerController");
const { registerSeoRoutes } = require("./controllers/seoController");
const { registerStaticRoutes } = require("./controllers/staticController");

// 1. App + Plugins
const app = express();
const { logger, analytics } = registerPlugins(app, config);

// 2. Repositories
const sessionRepository = new SessionRepository();

// 3. Network
const webSocketManager = new WebSocketManager(sessionRepository, logger);

// 4. Services
const apiCache = new Map();
const broadcastService = new BroadcastService(
  sessionRepository,
  webSocketManager,
  {
    clientSimulationOnly: config.runtime.CLIENT_SIM_ONLY,
    logger,
  },
);
const physicsService = new PhysicsService(
  sessionRepository,
  broadcastService,
  webSocketManager,
  {
    clientSimulationOnly: config.runtime.CLIENT_SIM_ONLY,
    logger,
    analytics,
  },
);
const sessionService = new SessionService(
  sessionRepository,
  physicsService,
  broadcastService,
  webSocketManager,
  { logger, analytics, apiCache },
);
const localizationService = new LocalizationService(config, logger);

// 5. HTTP
const mw = { requireSession: requireSession(sessionService), logger };
setupMiddleware(app, config);
registerSessionRoutes(app, sessionService, apiCache, analytics, mw);
registerViewerRoutes(
  app,
  sessionService,
  webSocketManager,
  broadcastService,
  mw,
);
registerSeoRoutes(app);
registerStaticRoutes(app, sessionService, localizationService, {
  setNoCacheHeaders,
  logger,
});

// 6. Server + WebSocket
const server = http.createServer(app);
const { heartbeatInterval } = setupWebSocketServer(
  server,
  sessionService,
  webSocketManager,
  broadcastService,
  analytics,
  logger,
);

// 7. Start
const PORT = config.server.PORT;
server.on("error", (err) => {
  /* EADDRINUSE handling from current index.js */
});
server.listen(PORT, () => logger.info("Server started"));

// 8. Cleanup intervals
const cleanupIntervals = [
  setInterval(() => sessionService.cleanupExpiredSessions(), 60000),
  setInterval(() => {
    /* apiCache cleanup from current index.js L43-61 */
  }, 30000),
];

// 9. Graceful shutdown
function gracefulShutdown() {
  logger.info("Shutting down gracefully...");
  clearInterval(heartbeatInterval);
  for (const interval of cleanupIntervals) clearInterval(interval);
  setTimeout(() => process.exit(0), 3000).unref();
  server.closeAllConnections();
  server.close(() => {
    logger.info("Server stopped.");
    process.exit(0);
  });
}
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
```

- [ ] **Step 2: Update `packages/server-core/package.json`**

Change `"main"` and scripts:

```json
{
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  }
}
```

- [ ] **Step 3: Verify server starts**

```bash
npm run dev
```

Expected: Pino log "Server started", no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server-core/src/index.js packages/server-core/package.json
git commit -m "feat: add new entry point with full DI assembly"
```

---

### Task 19: Smoke test server

- [ ] **Step 1: Start server and test basic endpoints**

```bash
npm run dev &
sleep 2
curl -s http://localhost:3000/health | head -1
curl -s -X POST http://localhost:3000/api/session | head -1
curl -s http://localhost:3000/ | head -5
kill %1
```

Expected: health returns `{"status":"ok",...}`, session returns `{"sessionId":"..."}`, index returns HTML.

- [ ] **Step 2: Run E2E tests**

```bash
npm run test:local
```

Expected: all 22 tests pass.

- [ ] **Step 3: Fix any issues found**

If tests fail, fix the failing code and re-run.

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A && git commit -m "fix: resolve issues found in E2E smoke test"
```

---

## Chunk 4: Frontend Webpack migration

### Task 21: Configure Webpack

**Files:**

- Modify: `packages/web-client/webpack.config.js`
- Modify: `packages/web-client/package.json`

- [ ] **Step 1: Install webpack dependencies**

```bash
cd packages/web-client && npm install --save-dev webpack webpack-cli && cd ../..
```

- [ ] **Step 2: Write webpack.config.js**

```js
const path = require("path");

module.exports = {
  mode: "development",
  entry: {
    viewer: "./src/viewer.js",
    controller: "./src/controller.js",
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "public", "dist"),
  },
  resolve: {
    modules: [
      path.resolve(__dirname, "src"),
      path.resolve(__dirname, "..", "..", "node_modules"),
      "node_modules",
    ],
  },
  devtool: "source-map",
};
```

- [ ] **Step 3: Add build script to package.json**

```json
{
  "scripts": {
    "build": "webpack --mode production",
    "build:dev": "webpack --mode development",
    "watch": "webpack --watch --mode development"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/webpack.config.js packages/web-client/package.json
git commit -m "feat: configure Webpack with viewer and controller entry points"
```

---

### Task 22: Migrate frontend JS to src/ with CommonJS modules

**Files:**

- Create: `packages/web-client/src/` (all JS files moved from `public/js/`)

- [ ] **Step 1: Create src directory structure**

```bash
mkdir -p packages/web-client/src/{core,domain,network,rendering,audio,ui/notifications,i18n,application/controller}
```

- [ ] **Step 2: Migrate each file from public/js/ to src/**

For each file:

1. Copy to corresponding `src/` location
2. Remove IIFE wrapper and `globalThis.ModuleName = { ... }` export pattern
3. Replace with `module.exports = { ... }` or `module.exports = ClassName`
4. Remove `if (typeof globalThis.X !== 'undefined')` guards
5. Add `require()` for all dependencies that were previously loaded via `<script>` order
6. Preserve any `globalThis.__current` or `globalThis.i18n` assignments (these must stay global)

File mapping:

```
public/js/core/debug-logger.js      → src/core/debug-logger.js
public/js/common.js                  → src/common.js
public/js/config.js                  → src/config.js
public/js/domain/session-state.js    → src/domain/session-state.js
public/js/domain/direction.js        → src/domain/direction.js
public/js/domain/counters.js         → src/domain/counters.js
public/js/audio/audio-manager.js     → src/audio/audio-manager.js
public/js/physics-engine.js          → DELETED (use @emdr/shared)
public/js/renderer.js                → src/rendering/renderer.js
public/js/websocket-client.js        → src/network/websocket-client.js
public/js/realtime-client.js         → src/network/realtime-client.js
public/js/shared-components.js       → src/ui/shared-components.js
public/js/new-features.js            → src/ui/new-features.js
public/js/ui/index.js                → src/ui/index.js
public/js/ui/notifications/notification-system.js → src/ui/notifications/notification-system.js
public/js/ui/theme-preload.js        → stays in public/js/ (needs to run before bundle)
public/js/i18n/lang-preload.js       → stays in public/js/ (needs to run before bundle)
public/js/i18n/i18n.js               → src/i18n/i18n.js
public/js/i18n/index.js              → src/i18n/index.js
public/js/i18n/language-selector.js  → src/i18n/language-selector.js
public/js/i18n/meta-i18n.js          → src/i18n/meta-i18n.js
public/js/constants/i18n-constants.js → src/i18n/constants.js
public/js/controller.js              → src/controller.js (entry point)
public/js/application/controller/*.js → src/application/controller/*.js
```

**CRITICAL:** `theme-preload.js` and `lang-preload.js` stay as inline `<script>` tags to prevent FOUC — they are NOT bundled.

- [ ] **Step 3: Commit migrated files**

```bash
git add packages/web-client/src/
git commit -m "feat: migrate frontend JS to src/ with CommonJS modules"
```

---

### Task 23: Create entry points (viewer.js, controller.js)

**Files:**

- Create: `packages/web-client/src/viewer.js`
- Modify: `packages/web-client/src/controller.js` (already moved, now becomes entry)

- [ ] **Step 1: Write `src/viewer.js` entry point**

This file must:

1. Initialize `globalThis.__current` FIRST
2. Require all viewer dependencies in correct order
3. Move inline script content from `viewer.html` (lines 163-500+) into this file
4. Set up DOMContentLoaded handler

```js
"use strict";
// Initialize global state first
if (!globalThis.__current) globalThis.__current = {};

// Require dependencies
const DebugLogger = require("./core/debug-logger");
const Common = require("./common");
const PhysicsEngine = require("@emdr/shared/physics-engine");
const BallRenderer = require("./rendering/renderer");
const WebSocketClient = require("./network/websocket-client");
const RealtimeClient = require("./network/realtime-client");
const SharedComponents = require("./ui/shared-components");
const AudioManager = require("./audio/audio-manager");
const I18n = require("./i18n/i18n");
const LanguageSelector = require("./i18n/language-selector");

// ... all inline viewer logic from viewer.html <script> block
```

- [ ] **Step 2: Update `src/controller.js` as entry point**

Same pattern — initialize globals, require deps, move any inline logic from `session-controller.html`.

The current `public/js/controller.js` already contains the main controller logic. It needs:

1. Add requires for all dependencies at the top
2. Remove globalThis export
3. Ensure `globalThis.__current` initialization

- [ ] **Step 3: Build bundles**

```bash
cd packages/web-client && npm run build:dev && cd ../..
```

Expected: `public/dist/viewer.bundle.js` and `public/dist/controller.bundle.js` created.

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/src/viewer.js packages/web-client/src/controller.js
git commit -m "feat: create Webpack entry points for viewer and controller"
```

---

### Task 24: Update HTML files to use bundles

**Files:**

- Modify: `packages/web-client/public/viewer.html`
- Modify: `packages/web-client/public/session-controller.html`

- [ ] **Step 1: Update viewer.html**

Replace all `<script>` tags (lines 146-500+) with:

```html
<!-- Pre-loaders (NOT bundled — must run before bundle to prevent FOUC) -->
<script src="/js/i18n/lang-preload.js"></script>
<script src="/js/ui/theme-preload.js"></script>

<!-- ... existing <head> content ... -->

<!-- Single bundle (replaces 12+ script tags) -->
<script src="/dist/viewer.bundle.js" defer></script>
```

Remove:

- All `<script src="/js/...">` tags (except lang-preload and theme-preload)
- All `<script>` inline blocks (logic moved to `src/viewer.js`)
- All `<link rel="preload" href="/js/..." as="script">` tags

- [ ] **Step 2: Update session-controller.html**

Same pattern — replace all script tags with single bundle:

```html
<script src="/dist/controller.bundle.js" defer></script>
```

Keep `lang-preload.js` and `theme-preload.js` as inline scripts in `<head>`.

- [ ] **Step 3: Build and verify in browser**

```bash
cd packages/web-client && npm run build:dev && cd ../..
npm run dev
```

Open `http://localhost:3000/c/test123` and `http://localhost:3000/s/test123` in browser. Verify:

- No console errors
- Ball renders and moves
- Controller can start/stop
- WebSocket connects

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/public/viewer.html packages/web-client/public/session-controller.html
git commit -m "feat: replace script tags with Webpack bundles in HTML"
```

---

### Task 25: Verify @emdr/shared imports in Webpack bundles

**Files:**

- Verify: all frontend `require('@emdr/shared/physics-engine')` resolve correctly

- [ ] **Step 1: Search for physics-engine requires in src/**

```bash
grep -rn "require.*physics-engine" packages/web-client/src/
```

All should point to `@emdr/shared/physics-engine`. Fix any that don't.

- [ ] **Step 2: Build bundles and verify no errors**

```bash
cd packages/web-client && npm run build:dev && cd ../..
```

Expected: successful build, no "Module not found" errors. If Webpack can't resolve `@emdr/shared`, add a resolve alias:

```js
// In webpack.config.js
resolve: {
  alias: {
    '@emdr/shared': path.resolve(__dirname, '..', 'shared')
  }
}
```

- [ ] **Step 3: Commit if changed**

```bash
git add -A && git commit -m "fix: ensure @emdr/shared resolves in Webpack"
```

---

### Task 26: Update server static file serving

**Files:**

- Modify: `packages/server-core/src/controllers/staticController.js`

- [ ] **Step 1: Add `/dist` to static directories**

In staticController.js, add `'dist'` to the static directories list:

```js
const staticDirectories = ["css", "js", "dist", "emdr-therapy", "panel"];
```

Note: `/js` stays temporarily for `lang-preload.js` and `theme-preload.js`.

- [ ] **Step 2: Commit**

```bash
git add packages/server-core/src/controllers/staticController.js
git commit -m "feat: serve /dist directory for Webpack bundles"
```

---

### Task 27: Clean up old frontend JS

- [ ] **Step 1: Delete migrated files from public/js/**

Delete everything from `public/js/` EXCEPT:

- `i18n/lang-preload.js` (stays — loaded before bundle)
- `ui/theme-preload.js` (stays — loaded before bundle)

```bash
# Keep only preload files
cd packages/web-client/public/js
# Delete all except the two preload files
find . -name "*.js" ! -path "./i18n/lang-preload.js" ! -path "./ui/theme-preload.js" -delete
# Clean empty directories
find . -type d -empty -delete
cd ../../../..
```

- [ ] **Step 2: Verify everything works**

```bash
npm run dev
```

Test in browser — both viewer and controller should work.

- [ ] **Step 3: Run E2E tests**

```bash
npm run test:local
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old public/js/ files (migrated to src/ + Webpack)"
```

---

## Chunk 5: Final cleanup and verification

### Task 28: Update root package.json scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install concurrently and update dev script**

```bash
npm install --save-dev concurrently
```

Update root `package.json` scripts:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"cd packages/web-client && npm run watch\"",
    "build": "cd packages/web-client && npm run build",
    "build:dev": "cd packages/web-client && npm run build:dev",
    "prestart": "cd packages/web-client && npm run build"
  }
}
```

This runs nodemon and webpack watch concurrently — frontend changes rebuild automatically.

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: update root scripts for Webpack build step"
```

---

### Task 29: Full E2E verification

- [ ] **Step 1: Start fresh server**

```bash
npm run dev
```

- [ ] **Step 2: Run full E2E test suite**

```bash
npm run test:local
```

Expected: all 22 tests pass.

- [ ] **Step 3: Manual verification checklist**

Open browser:

- [ ] `http://localhost:3000/` — landing page loads, i18n works
- [ ] `http://localhost:3000/c/test` — controller loads, can set speed/color/direction
- [ ] `http://localhost:3000/s/test` — viewer loads, ball renders
- [ ] Press Play on controller → ball moves on viewer
- [ ] Press Pause → ball returns to center smoothly
- [ ] Change language on controller → viewer updates
- [ ] `http://localhost:3000/health` — returns JSON
- [ ] WebSocket reconnection works (kill/restart server)

- [ ] **Step 4: Run linter**

```bash
npm run lint
npm run lint:css
```

Fix any issues.

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "refactor: full architecture refactoring complete"
```

---

### Task 30: Remove old server directory

- [ ] **Step 1: Verify no code references old server/ path**

```bash
grep -rn "server/index\|server/config\|server/logger\|server/analytics\|server/session\|server/network\|server/utils" packages/server-core/src/ packages/server-core/package.json
```

Expected: no matches (all references should point to src/).

- [ ] **Step 2: Delete `packages/server-core/server/`**

```bash
rm -rf packages/server-core/server/
```

- [ ] **Step 3: Run E2E tests**

```bash
npm run test:local
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old server/ directory (replaced by src/)"
```

---

### Task 31: Remove dotenv dependency

**Files:**

- Modify: `packages/server-core/package.json`

- [ ] **Step 1: Uninstall dotenv**

```bash
cd packages/server-core && npm uninstall dotenv && cd ../..
```

- [ ] **Step 2: Verify server starts without dotenv**

```bash
npm run dev
```

- [ ] **Step 3: Commit**

```bash
git add packages/server-core/package.json packages/server-core/package-lock.json
git commit -m "chore: remove dotenv dependency (not needed)"
```
