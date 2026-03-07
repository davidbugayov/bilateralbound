# Performance & Code Quality Refactoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize the server for a single weak VPS — single shared physics loop, O(1) WS lookups, prompt resource cleanup, and eliminate bugs/dead code.

**Architecture:** Replace N per-session `setInterval`s with one shared 60Hz loop in SessionManager. Add reverse map in WebSocketManager for O(1) `ws → session` lookup. Free PhysicsEngine immediately when all clients disconnect; delete session after 5-min grace period.

**Tech Stack:** Node.js, ws library, Express. No unit test framework — validation via E2E Puppeteer tests (`npm run test:local`, 21 tests).

**Design doc:** `docs/plans/2026-03-07-performance-refactoring-design.md`

---

### Task 1: Remove dead commented-out console.logs

**Files:**
- Modify: `packages/server-core/server/session/SessionManager.js`
- Modify: `packages/server-core/server/network/webSocketServer.js`
- Modify: `packages/server-core/server/network/expressApp.js`

**Step 1: Delete all commented console.logs in SessionManager.js**

Find and remove every line that is only a comment containing `console.log`. These are lines like:
```js
// console.log(`[SessionManager] 📥 Received updates ...`)
// console.log(`[SessionManager] ❌ Session not found ...`)
// this._handleReturnToCenter(session, validatedUpdates) // TODO: ...
```
There are ~15 such lines in SessionManager.js. Delete them entirely (do not uncomment).

Also remove these lines — they are empty debug hooks with no implementation:
```js
// SessionManager.js:286-288
if (session.physicsEngine && !session.ballState.paused) {
  // Force update instruction? No, engine does it.
  // Just ensure synchronization logic is logging correctly
  // console.log(`[SessionManager] Check velocities ...`)
}
```
The entire `if` block at lines 283–288 is dead (empty body). Remove it.

**Step 2: Delete all commented console.logs in webSocketServer.js**

Remove lines like:
```js
// console.log(`🔊 [Server] Получено viewer_audio_activated ...`)
// console.log(`✅ [Server] Сохранено viewerAudioActivated ...`)
// console.log(`📤 [Server] Отправляем контроллерам: ...`)
// console.log('📤 [Server] Отправляю сообщение контроллеру')
```

**Step 3: Delete all commented console.logs in expressApp.js**

Remove lines like:
```js
// console.log(`[EXPRESS] 📥 Controller update payload ...`)
// console.log('[EXPRESS] ⚠️  Received EMPTY payload ...')
```
Also remove the dead empty-payload check (it does nothing):
```js
// DELETE these 3 lines in /api/session/:sessionId/controller/update handler:
if (Object.keys(updates).length === 0) {
  // console.log('[EXPRESS] ⚠️  Received EMPTY payload from controller! ...')
}
```

**Step 4: Run E2E tests**
```bash
npm run test:local
```
Expected: 21 tests pass. No functional change was made.

**Step 5: Commit**
```bash
git add packages/server-core/server/session/SessionManager.js \
        packages/server-core/server/network/webSocketServer.js \
        packages/server-core/server/network/expressApp.js
git commit -m "refactor: remove ~30 dead commented console.logs"
```

---

### Task 2: Fix uuid import + Express error handler signature

**Files:**
- Modify: `packages/server-core/server/network/expressApp.js`

**Step 1: Move uuid to top-level require**

At the top of `expressApp.js`, after the existing `require` statements, add:
```js
const { v4: uuidv4 } = require('uuid')
```

Then find the request-ID middleware (around line 201):
```js
app.use(async (req, res, next) => {
  try {
    const { v4: uuidv4 } = await import('uuid')
    req.id = req.headers['x-request-id'] || uuidv4()
    res.setHeader('X-Request-Id', req.id)
    next()
  } catch (error) {
    next(error)
  }
})
```

Replace the entire block with:
```js
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4()
  res.setHeader('X-Request-Id', req.id)
  next()
})
```

**Step 2: Fix the Express error handler**

Find the centralized error handler near the bottom of `setupExpressApp` (after the 404 handler):
```js
app.use((err, req, res) => {
```

Change to:
```js
app.use((err, req, res, next) => {
```

Express requires exactly 4 parameters to treat a middleware as an error handler. Without `next`, it's treated as a regular 3-arg middleware and never receives thrown errors.

**Step 3: Run E2E tests**
```bash
npm run test:local
```
Expected: 21 pass.

**Step 4: Commit**
```bash
git add packages/server-core/server/network/expressApp.js
git commit -m "fix: pre-require uuid, fix Express error handler signature (4 args)"
```

---

### Task 3: Fix validation bug + remove TEMPORARY BYPASS

**Files:**
- Modify: `packages/server-core/server/utils/validation.js`
- Modify: `packages/server-core/server/session/SessionManager.js`

**Step 1: Fix _validateDirection scoping bug in validation.js**

Current code (lines 67–77 in validation.js):
```js
static _validateDirection(updates, validated) {
  if (updates.dirX !== undefined || updates.dirY !== undefined)
    if (this._isValidDirectionValue(updates.dirX)) {
      validated.dirX = updates.dirX
    }
  if (this._isValidDirectionValue(updates.dirY)) {   // ← BUG: outside outer if
    validated.dirY = updates.dirY
  }
}
```

The `dirY` validation is outside the outer `if` block (missing braces). Rewrite with explicit braces:
```js
static _validateDirection(updates, validated) {
  if (updates.dirX !== undefined && this._isValidDirectionValue(updates.dirX)) {
    validated.dirX = updates.dirX
  }
  if (updates.dirY !== undefined && this._isValidDirectionValue(updates.dirY)) {
    validated.dirY = updates.dirY
  }
}
```

**Step 2: Also validate `stopping` field in validateBallStateUpdates**

`stopping` is a boolean sent in some state updates. Add it to `_validateCommands`:
```js
static _validateCommands(updates, validated) {
  if (updates.reset === true) validated.reset = true
  if (updates.resume === true) validated.paused = false
  if (updates.pause === true) validated.paused = true
  if (updates.returnToCenter === true) validated.returnToCenter = true
  if (typeof updates.stopping === 'boolean') validated.stopping = updates.stopping  // ← add
}
```

**Step 3: Remove TEMPORARY BYPASS VALIDATION from SessionManager.js**

Find and delete lines 174–181 (the bypass block):
```js
// DELETE THIS ENTIRE BLOCK:
// TEMPORARY BYPASS VALIDATION
if (
  Object.keys(validatedUpdates).length === 0 &&
  Object.keys(updates).length > 0
) {
  // console.log('[SessionManager] ⚠️ VALIDATION FAILED but bypassing...')
  return this._applyValidatedUpdates(session, updates)
}
```

After deletion, the flow should be:
```js
const validatedUpdates = ValidationUtils.validateBallStateUpdates(updates)

if (Object.keys(validatedUpdates).length === 0) {
  this.logger.logSession(sessionId, '[VALIDATION] No valid fields in update, ignoring')
  return false
}

return this._applyValidatedUpdates(session, validatedUpdates)
```

**Step 4: Run E2E tests**
```bash
npm run test:local
```
Expected: 21 pass. If any test fails related to ball state updates, add the missing field type to `validateBallStateUpdates`.

**Step 5: Commit**
```bash
git add packages/server-core/server/utils/validation.js \
        packages/server-core/server/session/SessionManager.js
git commit -m "fix: correct _validateDirection braces, validate stopping, remove bypass"
```

---

### Task 4: Sound settings helper — _withSoundPreserved

**Files:**
- Modify: `packages/server-core/server/session/SessionManager.js`

**Step 1: Add the helper method**

Add this private method to `SessionManager` class (place it near other private helpers, e.g., after `_setDefaultBallState`):

```js
/**
 * Preserves soundEnabled/soundType across a ballState mutation (Object.assign from physics engine
 * overwrites these fields since PhysicsEngine doesn't track sound state).
 * @param {Object} session
 * @param {Function} fn - mutation to execute
 * @private
 */
_withSoundPreserved(session, fn) {
  const { soundEnabled, soundType } = session.ballState
  fn()
  if (soundEnabled !== undefined) session.ballState.soundEnabled = soundEnabled
  if (soundType !== undefined) session.ballState.soundType = soundType
}
```

**Step 2: Replace the 4 call sites**

**Call site 1 — `_initPhysicsCallbacks` (bounceCallback):**

Before:
```js
session.physicsEngine.bounceCallback = () => {
  try {
    const soundEnabled = session.ballState.soundEnabled
    const soundType = session.ballState.soundType
    Object.assign(session.ballState, session.physicsEngine.getState())
    if (soundEnabled !== undefined) session.ballState.soundEnabled = soundEnabled
    if (soundType !== undefined) session.ballState.soundType = soundType
    this.stateBroadcaster.broadcastState(session.id)
  } catch (err) { ... }
}
```

After:
```js
session.physicsEngine.bounceCallback = () => {
  try {
    this._withSoundPreserved(session, () => {
      Object.assign(session.ballState, session.physicsEngine.getState())
    })
    this.stateBroadcaster.broadcastState(session.id)
  } catch (err) {
    logger.error(`Bounce state broadcast error for session ${session.id}:`, err)
  }
}
```

**Call site 2 — `_initializePhysicsEngine`:**

Before:
```js
const soundSettings = {}
if (session.ballState.soundEnabled !== undefined) soundSettings.soundEnabled = session.ballState.soundEnabled
if (session.ballState.soundType !== undefined) soundSettings.soundType = session.ballState.soundType
Object.assign(session.ballState, engineState)
if (Object.keys(soundSettings).length > 0) Object.assign(session.ballState, soundSettings)
```

After:
```js
this._withSoundPreserved(session, () => {
  Object.assign(session.ballState, engineState)
})
```

**Call site 3 — `_updatePhysicsEngineForNewScreen`:**

Before:
```js
const soundEnabled = session.ballState.soundEnabled
const soundType = session.ballState.soundType
const userDirX = session.ballState.dirX
const userDirY = session.ballState.dirY
Object.assign(session.ballState, session.physicsEngine.getState())
if (soundEnabled !== undefined) session.ballState.soundEnabled = soundEnabled
if (soundType !== undefined) session.ballState.soundType = soundType
if (userDirX !== undefined && userDirY !== undefined) {
  session.ballState.dirX = userDirX
  session.ballState.dirY = userDirY
}
```

After:
```js
const { dirX: userDirX, dirY: userDirY } = session.ballState
this._withSoundPreserved(session, () => {
  Object.assign(session.ballState, session.physicsEngine.getState())
})
if (userDirX !== undefined && userDirY !== undefined) {
  session.ballState.dirX = userDirX
  session.ballState.dirY = userDirY
}
```

**Call site 4 — `_startPhysicsLoop` (the setInterval body):**

Before:
```js
const userDirX = session.ballState.dirX
const userDirY = session.ballState.dirY
const soundEnabled = session.ballState.soundEnabled
const soundType = session.ballState.soundType
session.physicsEngine.update(PHYSICS_DT / 1000)
Object.assign(session.ballState, session.physicsEngine.getState())
if (userDirX !== undefined && userDirY !== undefined) { session.ballState.dirX = userDirX; session.ballState.dirY = userDirY }
if (soundEnabled !== undefined) session.ballState.soundEnabled = soundEnabled
if (soundType !== undefined) session.ballState.soundType = soundType
```

After:
```js
const { dirX: userDirX, dirY: userDirY } = session.ballState
this._withSoundPreserved(session, () => {
  session.physicsEngine.update(PHYSICS_DT / 1000)
  Object.assign(session.ballState, session.physicsEngine.getState())
})
if (userDirX !== undefined && userDirY !== undefined) {
  session.ballState.dirX = userDirX
  session.ballState.dirY = userDirY
}
```

**Step 3: Run E2E tests**
```bash
npm run test:local
```
Expected: 21 pass. Sound settings refactor must not change behavior.

**Step 4: Commit**
```bash
git add packages/server-core/server/session/SessionManager.js
git commit -m "refactor: extract _withSoundPreserved helper, remove 4x repeated pattern"
```

---

### Task 5: O(1) client lookup — reverse map in WebSocketManager

**Files:**
- Modify: `packages/server-core/server/session/WebSocketManager.js`
- Modify: `packages/server-core/server/session/SessionManager.js`

**Step 1: Add _wsIndex to WebSocketManager**

In the constructor:
```js
constructor(sessionRepository) {
  this.sessionRepository = sessionRepository
  this.logger = logger
  this._wsIndex = new Map() // reverse map: ws → {sessionId, role}
}
```

**Step 2: Write to _wsIndex in addClient**

```js
addClient(sessionId, ws, role) {
  const session = this.sessionRepository.findById(sessionId)
  if (!session) return false

  session.clients.set(ws, { role, connectedAt: Date.now(), sessionId })
  this._wsIndex.set(ws, { sessionId, role })  // ← add this line

  // ... rest unchanged
}
```

**Step 3: Read from _wsIndex in removeClient**

Replace the current O(n) loop entirely:
```js
removeClient(ws) {
  const entry = this._wsIndex.get(ws)   // O(1)
  if (!entry) return null

  this._wsIndex.delete(ws)
  const { sessionId, role } = entry
  const session = this.sessionRepository.findById(sessionId)
  if (!session) return sessionId

  session.clients.delete(ws)
  this._updateConnectionStatus(session, role)
  this.logger.logSession(sessionId, `${role} disconnected via WebSocket`)

  if (!session.controllerConnected || !session.viewerConnected) {
    session.partialDisconnectTime = Date.now()
    this.logger.logSession(sessionId, 'Partial disconnect detected - 15 min timeout started')
  }

  return sessionId
}
```

**Step 4: Add getClientInfo method to WebSocketManager**

```js
/**
 * Returns {sessionId, role} for a WS connection in O(1).
 * @param {WebSocket} ws
 * @returns {{sessionId: string, role: string}|null}
 */
getClientInfo(ws) {
  return this._wsIndex.get(ws) || null
}
```

**Step 5: Replace getClientInfo in SessionManager with delegation**

Find `getClientInfo` in `SessionManager.js` (the O(n) loop across all sessions):
```js
getClientInfo(ws) {
  for (const session of this.sessionRepository.getAll()) {
    if (session.clients.has(ws)) {
      const clientInfo = session.clients.get(ws)
      return { sessionId: clientInfo.sessionId, role: clientInfo.role }
    }
  }
  return null
}
```

Replace entirely with:
```js
getClientInfo(ws) {
  return this.webSocketManager.getClientInfo(ws)
}
```

**Step 6: Run E2E tests**
```bash
npm run test:local
```
Expected: 21 pass.

**Step 7: Commit**
```bash
git add packages/server-core/server/session/WebSocketManager.js \
        packages/server-core/server/session/SessionManager.js
git commit -m "perf: O(1) WS client lookup via reverse map in WebSocketManager"
```

---

### Task 6: Remove double broadcast in webSocketServer

**Files:**
- Modify: `packages/server-core/server/network/webSocketServer.js`

**Background:** `updateBallState()` already calls `_postUpdateActions()` which calls `stateBroadcaster.broadcastState()`. The handlers below also manually build and send a `state_update` message — causing every update to be sent twice to every client.

**Step 1: Remove manual broadcast from controller_update handler**

Find the `controller_update` handler in `messageHandlers`. It currently looks like:
```js
controller_update: (data, { sessionId, role }) => {
  if (role === 'controller') {
    sessionManager.updateBallState(sessionId, data.payload)

    // DELETE EVERYTHING BELOW THIS LINE until closing }
    const clients = sessionManager.webSocketManager.getClients(sessionId)
    const session = sessionManager.sessionRepository.findById(sessionId)
    if (session) {
      const updateMessage = JSON.stringify({
        type: 'state_update',
        payload: {
          ...session.ballState,
          viewerConnected: session.viewerConnected,
          controllerConnected: session.controllerConnected,
          viewerScreenSize: session.viewerScreenSize
        },
        timestamp: Date.now()
      })
      for (const { client } of clients) {
        if (client !== ws && client.readyState === 1) {
          try { client.send(updateMessage) } catch (error) { ... }
        }
      }
    }
  }
},
```

After deletion:
```js
controller_update: (data, { sessionId, role }) => {
  if (role === 'controller') {
    sessionManager.updateBallState(sessionId, data.payload)
  }
},
```

**Step 2: Remove manual broadcast from viewer_update handler**

Same pattern — `viewer_update` handler. Remove the manual loop, keep only:
```js
viewer_update: (data, { sessionId, role }) => {
  if (role === 'viewer') {
    sessionManager.updateBallState(sessionId, data.payload)
  }
},
```

**Step 3: Run E2E tests**
```bash
npm run test:local
```
Expected: 21 pass. State still reaches all clients — via `broadcastState()` inside `updateBallState`.

**Step 4: Commit**
```bash
git add packages/server-core/server/network/webSocketServer.js
git commit -m "fix: remove double broadcast in controller_update and viewer_update handlers"
```

---

### Task 7: Cache localizeHtml per language at startup

**Files:**
- Modify: `packages/server-core/server/network/expressApp.js`

**Step 1: Build HTML cache at startup**

Find where `cachedViewerHtml`, `cachedControllerHtml`, `cachedIndexHtml` are loaded (around line 315). After those declarations, add the cache build:

```js
// Pre-render localized HTML for all languages at startup (avoids regex per request)
const _htmlCache = new Map()
for (const lang of SUPPORTED_LANGS) {
  const locale = locales.get(lang) || locales.get('en')
  _htmlCache.set(`viewer_${lang}`, localizeHtml(cachedViewerHtml, lang, locale, viewerMetaMap))
  _htmlCache.set(`controller_${lang}`, localizeHtml(cachedControllerHtml, lang, locale, controllerMetaMap))
  _htmlCache.set(`index_${lang}`, localizeHtml(cachedIndexHtml, lang, locale, indexMetaMap))
}
```

**Step 2: Update route handlers to use cache**

Replace the `app.get('/')` handler:
```js
app.get('/', (req, res) => {
  const lang = detectLanguage(req, null)
  let html = _htmlCache.get(`index_${lang}`) || _htmlCache.get('index_en')
  html = injectCanonicalHreflang(html, req.get('host') || '')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  setNoCacheHeaders(res)
  res.send(html)
})
```

Replace `app.get('/s/:sessionId')`:
```js
app.get('/s/:sessionId', (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId)
  const lang = detectLanguage(req, session)
  let html = _htmlCache.get(`viewer_${lang}`) || _htmlCache.get('viewer_en')
  html = injectCanonicalHreflang(html, req.get('host') || '')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  setNoCacheHeaders(res)
  res.send(html)
})
```

Replace `app.get('/c/:sessionId')`:
```js
app.get('/c/:sessionId', (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId)
  const lang = detectLanguage(req, session)
  let html = _htmlCache.get(`controller_${lang}`) || _htmlCache.get('controller_en')
  html = injectCanonicalHreflang(html, req.get('host') || '')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  setNoCacheHeaders(res)
  res.send(html)
})
```

**Step 3: Run E2E tests**
```bash
npm run test:local
```
Expected: 21 pass.

**Step 4: Manual spot check**

```bash
# Start dev server
npm run dev
# In another terminal:
curl -s http://localhost:3000/ | grep '<title'
curl -s 'http://localhost:3000/?lang=ru' | grep '<title'
curl -s 'http://localhost:3000/?lang=de' | grep '<title'
```
Expected: each returns correct localized `<title>` tag.

**Step 5: Commit**
```bash
git add packages/server-core/server/network/expressApp.js
git commit -m "perf: pre-render localized HTML at startup, serve from cache per language"
```

---

### Task 8: Immediate resource cleanup on disconnect

**Files:**
- Modify: `packages/server-core/server/session/SessionManager.js`

**Background:** When the last WS client disconnects, the PhysicsEngine should be freed immediately (null it for GC). The session object should be deleted after a 5-minute grace period (allowing reconnection). The shared physics loop (Task 9) will check `pendingDeleteAt` each tick.

**Step 1: Modify handleWebSocketDisconnection**

Find `handleWebSocketDisconnection`:
```js
handleWebSocketDisconnection(ws) {
  const clientInfo = this.getClientInfo(ws)
  const sessionId = this.webSocketManager.removeClient(ws)
  if (sessionId) {
    this._schedulePhysicsUpdate(sessionId)
    this.stateBroadcaster.broadcastViewerStatus(sessionId)
  }
  if (clientInfo?.role === 'controller') {
    this.broadcastControllerConnection(sessionId, false)
  }
}
```

Replace with:
```js
handleWebSocketDisconnection(ws) {
  const clientInfo = this.getClientInfo(ws)
  const sessionId = this.webSocketManager.removeClient(ws)

  if (sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (session) {
      const remaining = this.webSocketManager.getClients(sessionId)
      if (remaining.length === 0) {
        // No clients left — free physics engine immediately, schedule session deletion
        session.physicsEngine = null
        session.pendingDeleteAt = Date.now() + 5 * 60 * 1000
        this.logger.logSession(sessionId, 'All clients disconnected — physics freed, session pending delete in 5 min')
      }
    }
    this.stateBroadcaster.broadcastViewerStatus(sessionId)
  }

  if (clientInfo?.role === 'controller') {
    this.broadcastControllerConnection(sessionId, false)
  }
}
```

**Step 2: Clear pendingDeleteAt and restore physics on reconnect**

Find `handleWebSocketConnection`. After `this.webSocketManager.addClient(...)` succeeds, add:
```js
const session = this.sessionRepository.findById(sessionId)
if (session) {
  session.lastActivity = Date.now()
  session.pendingDeleteAt = null  // cancel pending deletion

  // Restore physics engine if it was freed
  if (!session.physicsEngine) {
    this._initializePhysicsEngine(session)
    this.logger.logSession(sessionId, 'Physics engine restored on reconnect')
  }

  this._handleInitialStateBroadcast(sessionId, ws, role, session)
}
```

Remove the old separate `if (session)` block that was already there (merge them).

**Step 3: Run E2E tests**
```bash
npm run test:local
```
Expected: 21 pass.

**Step 4: Manual test — session cleanup**

```bash
npm run dev
# Open /c/test123 and /s/test123 in browser, then close both tabs
# Wait a few seconds, then:
curl http://localhost:3000/health
# Note session count, wait 5+ minutes
curl http://localhost:3000/health
# Session count should decrease by 1
```

**Step 5: Commit**
```bash
git add packages/server-core/server/session/SessionManager.js
git commit -m "perf: free PhysicsEngine on last disconnect, delete session after 5-min grace"
```

---

### Task 9: Single shared physics loop

**Files:**
- Modify: `packages/server-core/server/session/SessionManager.js`

**Background:** Replace per-session `setInterval` with one shared loop that iterates all sessions each tick. This is the most complex change — read carefully before implementing.

**Step 1: Add _startSharedPhysicsLoop to SessionManager**

Add this method to the `SessionManager` class:

```js
/**
 * Starts the single shared 60Hz physics loop that serves all sessions.
 * Called once in the constructor. Replaces per-session setIntervals.
 */
_startSharedPhysicsLoop() {
  if (this._sharedPhysicsLoop) return

  const PHYSICS_TICK_RATE = 60
  const PHYSICS_DT = 1000 / PHYSICS_TICK_RATE

  this._sharedPhysicsLoop = setInterval(() => {
    if (this.clientSimulationOnly) return

    for (const session of this.sessionRepository.sessions.values()) {
      // Pending deletion — remove and skip
      if (session.pendingDeleteAt && Date.now() > session.pendingDeleteAt) {
        this.sessionRepository.delete(session.id)
        analytics.recordSessionEnded(session.id)
        this.logger.logSession(session.id, 'Session deleted after grace period')
        continue
      }

      // No physics engine (freed on disconnect) — skip
      if (!session.physicsEngine) continue

      // Only run physics when viewers are connected
      const hasViewers = this.webSocketManager.getClients(session.id)
        .some(({ info }) => info.role === 'viewer')
      if (!hasViewers) continue

      try {
        const { dirX: userDirX, dirY: userDirY } = session.ballState
        this._withSoundPreserved(session, () => {
          session.physicsEngine.update(PHYSICS_DT / 1000)
          Object.assign(session.ballState, session.physicsEngine.getState())
        })
        if (userDirX !== undefined && userDirY !== undefined) {
          session.ballState.dirX = userDirX
          session.ballState.dirY = userDirY
        }

        if (!session.ticks) session.ticks = 0
        session.ticks++

        if (session.ticks % 4 === 0) {
          session.lastStateUpdate = Date.now()
          this.stateBroadcaster.broadcastState(session.id)
        }
      } catch (error) {
        this.logger.error(`Shared physics loop error for session ${session.id}: ${error.message}`)
      }
    }
  }, PHYSICS_DT)
}
```

**Step 2: Call it in the constructor**

In the `constructor`, after all assignments, add:
```js
this._startSharedPhysicsLoop()
```

**Step 3: Remove the old per-session loop methods**

Delete these methods entirely from `SessionManager`:
- `_startPhysicsLoop(sessionId, session)` — the big `setInterval` method
- `_schedulePhysicsUpdate(sessionId)` — calls `_startPhysicsLoop`
- `_ensurePhysicsLoop(sessionId)` — calls `_startPhysicsLoop`

**Step 4: Simplify startPhysics and stopPhysics**

`startPhysics` was called by `_initializePhysicsEngine`. With the shared loop, it's a no-op:
```js
startPhysics(sessionId) {
  // Physics handled by shared loop in _startSharedPhysicsLoop
}
```

`stopPhysics` is called by `cleanupExpiredSessions`. With shared loop, just null the engine:
```js
stopPhysics(sessionId) {
  const session = this.sessionRepository.findById(sessionId)
  if (session) session.physicsEngine = null
}
```

**Step 5: Remove session.mainLoop references**

- In `SessionRepository._createInternal`, remove `mainLoop: null` from the session object
- Search for `session.mainLoop` anywhere else and remove

**Step 6: Fix _handleWebSocketDisconnection — remove _schedulePhysicsUpdate call**

In `handleWebSocketDisconnection`, we already removed the `_schedulePhysicsUpdate` call in Task 8. Verify it's not there. If it is, remove it now.

**Step 7: Remove _isViewerScreenSizeSet usage of _schedulePhysicsUpdate**

Search for any remaining calls to `_schedulePhysicsUpdate` or `_ensurePhysicsLoop` in the file. If found, remove them — the shared loop handles everything.

**Step 8: Run E2E tests**
```bash
npm run test:local
```
Expected: 21 pass.

**Step 9: Manual smoke test**

```bash
npm run dev
```
Open `http://localhost:3000/c/smoke1` (controller) and `http://localhost:3000/s/smoke1` (viewer) in two browser tabs. Press play — ball should move smoothly. Check server logs for no errors.

**Step 10: Commit**
```bash
git add packages/server-core/server/session/SessionManager.js \
        packages/server-core/server/session/SessionRepository.js
git commit -m "perf: single shared 60Hz physics loop replaces per-session setIntervals"
```

---

### Task 10: Final verification

**Step 1: Run full E2E test suite**
```bash
npm run test:local
```
Expected: all 21 tests pass.

**Step 2: Run linter**
```bash
npm run lint
```
Fix any lint errors before continuing.

**Step 3: Check /health endpoint**
```bash
npm run dev &
sleep 3
curl http://localhost:3000/health
```
Expected: `{"status":"ok", ...}` with no errors in dev server output.

**Step 4: Deploy to dev server**
```bash
npm run deploy:dev
```
Verify dev.emdrbilateral.online is responsive after deploy.
