# Performance & Code Quality Refactoring — Design

**Date:** 2026-03-07
**Branch:** main
**Priority:** A (Performance) → B (Code Quality)
**Scope:** Single VPS, vertical scaling only — no Redis, no horizontal scaling

---

## Problem Statement

1. Per-session `setInterval` at 60Hz does not scale — N sessions = N timers
2. `getClientInfo(ws)` and `removeClient(ws)` are O(n) across all sessions, called on every WS message
3. Double broadcast: `controller_update` / `viewer_update` WS handlers manually send `state_update` after `updateBallState()` which already calls `broadcastState()`
4. Sessions are not cleaned up promptly after both participants disconnect — physics engine and session data linger for 30–60 min
5. `TEMPORARY BYPASS VALIDATION` in SessionManager applies raw unvalidated data when validation returns empty
6. Express error handler signature is wrong — missing 4th `next` param, Express does not recognize it
7. Sound settings save/restore pattern repeated 4× in SessionManager
8. `await import('uuid')` on every HTTP request — dynamic import overhead
9. `localizeHtml()` runs regex on ~50KB HTML on every `/s/:id` and `/c/:id` request
10. ~30 commented-out `console.log` statements cluttering 3 files

---

## Design

### 1. Shared Physics Loop (SessionManager.js)

Replace per-session `setInterval` with a single `SharedPhysicsLoop`:

```
SharedPhysicsLoop runs once at 60Hz:
  for each session in sessionRepository.getAll():
    if session has no active viewers → skip
    if session.physicsEngine is null → skip
    session.physicsEngine.update(PHYSICS_DT / 1000)
    sync session.ballState from engine (once per tick)
    session.ticks++
    if session.ticks % 4 === 0:
      stateBroadcaster.broadcastState(session.id)
```

- One `setInterval` total, regardless of session count
- `getState()` called once per session per tick (not 2–3×)
- `_startPhysicsLoop`, `_schedulePhysicsUpdate`, `_ensurePhysicsLoop` all simplified or removed
- `startPhysics` / `stopPhysics` become no-ops (loop always runs, skips inactive sessions)

### 2. Immediate Resource Cleanup (SessionManager.js + SessionRepository.js)

When the last WebSocket client disconnects from a session:

```
handleWebSocketDisconnection(ws):
  role = getClientInfo(ws)
  sessionId = webSocketManager.removeClient(ws)

  // If no clients remain:
  if webSocketManager.getClients(sessionId).length === 0:
    session.physicsEngine = null   // GC can collect immediately
    session.pendingDeleteAt = Date.now() + 5 * 60 * 1000  // 5-min grace
```

The shared physics loop checks `pendingDeleteAt`:

```
  if session.pendingDeleteAt && Date.now() > session.pendingDeleteAt:
    sessionRepository.delete(session.id)
    continue
```

Grace period: 5 minutes — allows reconnection after network drops.
`cleanupExpired` remains as safety net for edge cases (max age 1h).

### 3. O(1) Client Lookup — Reverse Map (WebSocketManager.js)

Add `this._wsIndex = new Map()` mapping `ws → {sessionId, role}`:

```
addClient(sessionId, ws, role):
  session.clients.set(ws, {role, connectedAt, sessionId})
  this._wsIndex.set(ws, {sessionId, role})   // ← new

removeClient(ws):
  const info = this._wsIndex.get(ws)         // O(1)
  this._wsIndex.delete(ws)
  // ... rest of cleanup

getClientInfo(ws):
  return this._wsIndex.get(ws) || null       // O(1)
```

`SessionManager.getClientInfo(ws)` delegates to `webSocketManager.getClientInfo(ws)`.

### 4. Remove Double Broadcast (webSocketServer.js)

In `controller_update` and `viewer_update` handlers, remove the manual loop that sends `state_update`:

```js
// REMOVE this block:
const updateMessage = JSON.stringify({ type: 'state_update', ... })
for (const { client } of clients) {
  if (client !== ws && client.readyState === 1) client.send(updateMessage)
}
```

`updateBallState()` already calls `_postUpdateActions()` → `broadcastState()`.
Result: one broadcast per update instead of two.

### 5. Fix TEMPORARY BYPASS VALIDATION (SessionManager.js)

Investigate why validation returns empty for valid payloads.
Root cause: `_validateDirection` has a scoping bug — `if` block at line 68 wraps only `dirX`, but `dirY` check is outside the `if` (indentation error).

Fix the validation so it passes legitimate fields, then remove the bypass block entirely:

```js
// DELETE lines 174–181 in SessionManager.js
```

### 6. Fix Express Error Handler (expressApp.js)

```js
// BEFORE (Express ignores this as error handler):
app.use((err, req, res) => { ... })

// AFTER:
app.use((err, req, res, next) => { ... })
```

### 7. Sound Settings Helper (SessionManager.js)

Extract repeated pattern into one private method:

```js
_withSoundPreserved(session, fn) {
  const { soundEnabled, soundType } = session.ballState
  fn()
  if (soundEnabled !== undefined) session.ballState.soundEnabled = soundEnabled
  if (soundType !== undefined) session.ballState.soundType = soundType
}
```

Call sites: `bounceCallback`, `_initializePhysicsEngine`, `_updatePhysicsEngineForNewScreen`, `_startPhysicsLoop`.

### 8. Pre-import uuid (expressApp.js)

```js
// BEFORE (in middleware, runs on every request):
const { v4: uuidv4 } = await import("uuid");

// AFTER (top of file):
const { v4: uuidv4 } = require("uuid");
```

Remove `async` from the middleware function.

### 9. Cache localizeHtml per Language (expressApp.js)

Pre-render all language × page combinations at startup:

```js
// At startup, build cache:
const htmlCache = new Map();
for (const lang of SUPPORTED_LANGS) {
  const locale = locales.get(lang) || locales.get("en");
  htmlCache.set(
    `viewer_${lang}`,
    localizeHtml(cachedViewerHtml, lang, locale, viewerMetaMap),
  );
  htmlCache.set(
    `controller_${lang}`,
    localizeHtml(cachedControllerHtml, lang, locale, controllerMetaMap),
  );
  htmlCache.set(
    `index_${lang}`,
    localizeHtml(cachedIndexHtml, lang, locale, indexMetaMap),
  );
}

// In route handlers:
app.get("/s/:sessionId", (req, res) => {
  const lang = detectLanguage(req, session);
  let html = htmlCache.get(`viewer_${lang}`) || htmlCache.get("viewer_en");
  html = injectCanonicalHreflang(html, req.get("host") || "");
  res.send(html);
});
```

`injectCanonicalHreflang` remains per-request (host-dependent), but it's a simple string replace — much cheaper than the full regex localization pass.

### 10. Remove Commented Console.logs

Files affected:

- `SessionManager.js` — ~15 commented lines
- `webSocketServer.js` — ~5 commented lines
- `expressApp.js` — ~10 commented lines

---

## Files Changed

| File                                 | Changes                                                                |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `server/session/SessionManager.js`   | Shared loop, resource cleanup, bypass removal, sound helper, dead code |
| `server/session/WebSocketManager.js` | Reverse map `_wsIndex`                                                 |
| `server/network/webSocketServer.js`  | Remove double broadcast, dead code                                     |
| `server/network/expressApp.js`       | Error handler fix, uuid require, html cache, dead code                 |

---

## Testing

- Existing E2E suite (21 tests via Puppeteer) must pass: `npm run test:local`
- Manual: open session, connect viewer + controller, verify ball moves
- Manual: disconnect both, wait 5 min, verify session removed from `/health` count
- Manual: rapid reconnect after drop — verify session survives grace period
