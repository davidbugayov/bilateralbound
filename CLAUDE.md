# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EMDR therapy platform — therapist (controller) controls a bouncing ball via bilateral stimulation; patient (viewer) watches it in real-time. SSE is the primary transport; WebSocket is fallback.

## Code Principles

- **Write only used code**: no unused functions, variables, imports, dead code paths. Keep codebase clean and minimal.
- **Comment complex logic**: explain "why" not "what" — focus on physics sync decisions, SSE edge cases, workarounds.
- **No over-engineering**: implement only what's explicitly required. Don't add features, abstractions, or error handling for impossible scenarios.
- **No .md reports**: don't create report files unless asked. Keep responses concise.
- **Short commits**: concise commit messages, no verbose descriptions.
- **Language**: respond in the language the user writes in.

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

# Deployment
npm run deploy:dev       # Pull main + restart on dev server
npm run deploy:prod      # Pull stable + restart on prod servers
```

## Architecture

**Monorepo** with npm workspaces: `packages/server-core` (Node.js + Express) and `packages/web-client` (Vanilla JS, no framework).

### Server (`packages/server-core/server/`)

- `index.js` — entry: creates SessionManager, Express app, WebSocket server
- `network/expressApp.js` — all HTTP/SSE routes, compression (excludes `/stream` paths for SSE)
- `session/SessionManager.js` — orchestrator: physics loop (60Hz tick, 15Hz broadcast), SSE, WS, broadcast
- `session/StateBroadcaster.js` — sends events to SSE + WS clients (viewer-only, controller-only, or both)
- `session/SSEManager.js` — SSE client registry, heartbeat every 45s
- `session/SessionRepository.js` — in-memory Map, LRU eviction, MAX_SESSIONS=1000

### Frontend (`packages/web-client/public/`)

- `viewer.html` / `session-controller.html` — patient and therapist views
- `js/physics-engine.js` — shared physics (used server-side AND client-side), two modes: `_updateServerPhysics` (server/controller) and `_updateViewerPhysics` (viewer interpolation or client simulation)
- `js/sse-client.js` — SSE with auto-reconnect
- `js/controller.js` — controller UI logic (wires SSE handlers, manages state, preview physics)
- `js/renderer.js` — canvas ball rendering with `BallRenderer` (fixed-step loop, interpolation)
- `js/application/controller/` — modular controller components (viewer-status, fullscreen, sse-handlers, etc.)
- `locales/` — 8 languages (en, ru, de, es, fr, pt, ja, zh)

### Synchronization (critical path)

All push-based, NO polling:

1. Server physics at 60Hz → broadcasts `state_update` every 4th tick (15Hz) via SSE
2. Bounce events broadcast immediately (not throttled)
3. Viewer runs local physics (`clientSimulation: true`) at 60Hz, receives server commands via `applyCommand()`
4. Viewer broadcasts its state at 30Hz via `viewer_update` (only when moving)
5. Controller preview runs local physics at 60Hz with event-based drift correction on `state_update` arrival (not per-frame)
6. `bounce_sync` snaps controller preview to viewer position on wall bounce

**Key sync rule**: never correct position on every render frame (causes jitter). Only correct when new server data arrives (~15Hz) with dead zone and adaptive alpha.

### Data Flow

1. Therapist opens `/c/:id` → SSE as controller
2. Patient opens `/s/:id` → SSE as viewer, sends screen size
3. Server physics ticks at 60Hz, broadcasts state ~15/sec
4. Controller adjusts settings via `POST /api/session/:id/controller/update`
5. Viewer bounces sync back via `POST /api/session/:id/viewer/bounce`

## Key Conventions

- **i18n pattern**: `globalThis.i18n?.t('key') || 'English fallback'` — never hardcode user-facing strings
- **Module pattern**: IIFE with `globalThis.ModuleName = { ... }` export, guarded by `if (typeof globalThis.ModuleName !== 'undefined')` to prevent double-load
- **Global state**: `globalThis.__current` holds session state (sessionId, isPlaying, viewerConnected, etc.)
- **SSE endpoint**: `GET /api/session/:id/stream?role=viewer|controller` — compression middleware must exclude `/stream` paths or SSE buffers and EventSource never reaches OPEN
- **Session IDs**: auto-generated 6-char UUID prefix, or custom 3-32 chars (alphanumeric/dash/underscore)
- **E2E tests**: Puppeteer-based, 21 tests, use `domcontentloaded` (not `networkidle0` — SSE keeps network active)
- **No bundler**: vanilla JS loaded via `<script>` tags, order matters
- **Play/pause guards**: `__ignoreServerPausedUntilTs` (800ms) and `__ignoreServerDirectionUntilTs` (1500ms) prevent server state from overriding recent user actions

## Deployment

- Dev: `dev.emdrbilateral.online` (branch: `main`) — `npm run deploy:dev`
- Prod: `emdrbilateral.online` / `emdrbilateral.ru` (branch: `stable`) — `npm run deploy:prod`
- **All development happens on `main`**; prod branch `stable` is updated manually when ready
- UFW firewall: ports 22, 80, 443 (TCP), 500/udp, 4500/udp (VPN)

## VPS Server — 213.139.229.44

**OS**: Ubuntu, Linux 6.18, Node.js v22.22.0

### Systemd Services

| Service                        | Port | Path                                | Branch | Status         |
| ------------------------------ | ---- | ----------------------------------- | ------ | -------------- |
| `emdrbilateral-online.service` | 8080 | `/var/www/emdrbilateral.online`     | stable | prod (.online) |
| `emdrbilateral-ru.service`     | 8081 | `/var/www/emdrbilateral.ru`         | stable | prod (.ru)     |
| `emdrbilateral-dev.service`    | 3003 | `/var/www/dev.emdrbilateral.online` | main   | dev            |

**⚠ Important**: There is an OLD legacy service `emdrbilateral.service` (points to same codebase, PORT=8080) that **must remain disabled**. If it starts, it conflicts with `emdrbilateral-online.service` on port 8080, causing 42000+ restart loops. Fix: `systemctl stop emdrbilateral.service && systemctl disable emdrbilateral.service`.

### Nginx

- `/etc/nginx/sites-enabled/emdrbilateral` — config for .online (→ 8080) and .ru (→ 8080)
- `/etc/nginx/sites-enabled/dev.emdrbilateral.online` — config for dev (→ 3003)
- Note: the `emdrbilateral` file also has a stale dev block pointing to port 3000 — the dedicated dev file takes precedence.

### Manage services

```bash
ssh root@213.139.229.44

# EMDR services
systemctl status emdrbilateral-online.service
systemctl restart emdrbilateral-online.service
journalctl -u emdrbilateral-online -n 50 --no-pager

# Check all
systemctl list-units --type=service | grep emdr
ss -tlnp | grep node
```

## VPN — StrongSwan IKEv2

**Protocol**: IKEv2/IPsec (StrongSwan 6.0.1), for macOS and iOS clients.

```bash
# Check status (charon daemon runs independently from the service)
ipsec status          # show active connections
ipsec statusall       # verbose

# The service shows as "inactive/dead" — this is NORMAL
# Charon daemon runs as a background process after starter exits
systemctl status strongswan-starter.service

# User management: credentials stored in /etc/ipsec.secrets
# IKEv2 config: /etc/ipsec.conf or /etc/ipsec.d/
```

VPN users (9 total): Swetlana, Sergey, Yulia, David, DavidMac1, DavidMac2, Elena, DavidDeck, Bogdan.

## Clawdbot (Telegram AI Bot)

**What it is**: [Clawdbot](https://clawdbot.com) v2026.1.24-3 — personal AI assistant accessible via Telegram bot `@davidbugayov_bot`. Uses GitHub Copilot for model access.

**Workspace**: `/root/clawd/` — contains identity/soul/memory files for the bot's persona.

**Config**: `/root/.clawdbot/clawdbot.json`

- Primary model: `github-copilot/claude-haiku-4-5-20251001`
- Telegram channel: enabled, bot `@davidbugayov_bot`
- Gateway port: 18789 (loopback only)

### Service management

```bash
# User service (runs as root with linger enabled)
systemctl --user status clawdbot-gateway.service
systemctl --user restart clawdbot-gateway.service
journalctl --user -u clawdbot-gateway -n 50 --no-pager

# Check gateway is listening
ss -tlnp | grep 18789
```

### Known issues & fixes applied

**Issue 1: Service restart loop (2391+ restarts)**

- **Cause**: systemd `start operation timed out` was killing the gateway every ~82 seconds
- **Fix applied**: Added `TimeoutStartSec=infinity` to `/root/.config/systemd/user/clawdbot-gateway.service`

**Issue 2: Poor/no responses in Telegram**

- **Cause**: Was using `github-copilot/gpt-4o` model; GitHub Copilot OAuth token refreshes every 30 min (normal behavior)
- **Fix applied**: Changed primary model to `github-copilot/claude-haiku-4-5-20251001`
- If bot stops responding: `systemctl --user restart clawdbot-gateway.service` and check journalctl for auth errors

**Issue 3: Cron errors in logs**

- Non-fatal. Claude agents try to call `cron.add` with outdated API schema. Cosmetic errors, doesn't affect responses.

### If bot completely stops working

1. Check GitHub Copilot token: `cat /root/.clawdbot/credentials/github-copilot.token.json` — if expired, run `clawdbot auth add` on the server or re-run `clawdbot onboard`
2. Check logs: `journalctl --user -u clawdbot-gateway -n 100 --no-pager`
3. To switch to Anthropic API directly (better, no token expiry): add API key via `clawdbot auth add anthropic` and set model to `anthropic/claude-haiku-4-5-20251001`

## Plugin Configuration

Use plugins proactively for relevant tasks:

- **context7** — Express, SSE/EventSource, Puppeteer, Node.js APIs. Check docs first before guessing.
- **playwright** — E2E testing, browser automation. Use for `scripts/e2e/` work.
- **frontend-design** — when modifying `viewer.html`, `session-controller.html`, `index.html`. Goals: accessibility, therapeutic UX, correct i18n.
- **feature-dev** — guided feature development spanning multiple files.
- **code-simplifier** — refactoring, reducing complexity, cleaning dead code.
- **typescript-lsp** — type checking, references, navigation (useful even in JS codebase).
- **Security review** — run before merging changes to `session/`, `network/`, `js/sse-client.js`, `js/realtime-client.js`, controller API endpoints.
