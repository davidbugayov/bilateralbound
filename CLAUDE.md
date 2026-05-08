# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EMDR BilateralBound — web-платформа для EMDR-терапии. Терапевт (controller) управляет движением шара через bilateral stimulation; пациент (viewer) наблюдает в реальном времени через WebSocket.
Дополнительно: Telegram бот (@emdrbilateral_bot) для подписок через Telegram Stars.

## Language

Отвечай на русском (предпочтительный язык пользователя). Code comments in English. UI strings via i18n, never hardcoded.

## Code Principles

- **Write only used code**: no unused functions, variables, imports, dead code paths.
- **Comment "why" not "what"**: explain physics sync decisions, WebSocket edge cases, workarounds.
- **No over-engineering**: implement only what's explicitly required. Don't add features, abstractions, or error handling for impossible scenarios.
- **No .md reports**: don't create report files unless asked.
- **Short commits**: concise commit messages, no verbose descriptions.

## Local Setup

**Prerequisites**: Node.js v22+

```bash
npm install        # installs all workspace packages (root)
npm run dev        # starts dev server on port 3000
```

No `.env` file required — all config is in-process or via URL params.

## Commands

```bash
# Development
npm run dev              # Start dev server (concurrently server + webpack watch)
npm start                # Build + start production server

# Testing
npm test                 # E2E tests against dev.emdrbilateral.online
npm run test:local       # E2E tests against localhost:3000
npm run test:dev         # E2E tests against dev server
npm run test:sync        # Sync param tests against dev
npm run test:sync:local  # Sync param tests against localhost
npm run test:bad-internet # Bad Internet simulation test

# Linting & Formatting
npm run lint             # ESLint (flat config)
npm run lint:fix         # ESLint with auto-fix
npm run lint:css         # Stylelint for CSS
npm run format           # Prettier

# Deployment (requires DEPLOY_PASSWORD env var)
npm run deploy:dev       # Pull main, build, restart dev server
npm run deploy:prod      # Pull stable, build, restart prod (.online + .ru)
npm run deploy:dev:logs  # Show dev service logs
npm run deploy:prod:logs # Show prod service logs
npm run deploy:dev:status  # Dev service status
npm run deploy:prod:status # Prod service status
```

## Architecture

**Monorepo** with npm workspaces:
- `packages/server-core` — Node.js + Express server
- `packages/web-client` — Vanilla JS client (no framework), webpack build
- `packages/shared` — shared physics engine used by both server and client

### Server (`packages/server-core/src/`)

- `index.js` — entry: creates Express app, WebSocket server, Telegram bot
- `network/webSocketServer.js` — WebSocket server, message routing, heartbeat
- `network/WebSocketManager.js` — WS client registry per session
- `network/middleware.js` — CSRF, rate limiting, CORS
- `services/SessionService.js` — session lifecycle facade (create, update, cleanup)
- `services/PhysicsService.js` — server-side 60Hz physics loop, 15Hz broadcasts
- `services/BroadcastService.js` — sends events to WS clients; delta compression
- `services/SubscriptionService.js` — Telegram Stars subscription management
- `services/TelegramBotService.js` — Telegram Bot API client (sendInvoice, webhook)
- `services/LocalizationService.js` — multi-language detection
- `services/AnalyticsCollector.js` — usage analytics
- `services/bot-translations.js` — bot message translations (8 languages)
- `repositories/SessionRepository.js` — in-memory Map, LRU eviction, MAX_SESSIONS=1000
- `controllers/sessionController.js` — REST API handlers
- `controllers/subscriptionController.js` — webhook + subscription routes
- `controllers/viewerController.js` — viewer state endpoints
- `controllers/seoController.js` — SEO meta tags
- `controllers/static_routes_controller.js` — static file routes
- `plugins/` — logger, analytics plugins
- `utils/validation.js` — input validation

### Frontend (`packages/web-client/src/`)

- `viewer.js` — patient view: local physics, WebSocket sync, audio
- `controller.js` — therapist view: preview physics, settings, WebSocket
- `rendering/renderer.js` — `BallRenderer`: canvas rendering, interpolation, letterboxing
- `network/websocket-client.js` — WebSocket client, auto-reconnect, heartbeat
- `network/realtime-client.js` — transport wrapper (WebSocket)
- `application/controller/` — modular controller components (event-handlers, fullscreen, play-pause, preview-manager, ui-controls, ui-sync, viewer-status)
- `domain/` — counters, direction, session-state
- `audio/audio-manager.js` — sound effects (bounce, beep, click)
- `ui/` — controller-settings, error-overlay, shared-components, success-toast, notifications
- `i18n/` — internationalization (constants, i18n, language-selector)
- `core/debug-logger.js` — debug logging

Shared: `packages/shared/physics-engine.js` — deterministic 60Hz fixed-step physics, `isViewer` flag switches between server mode and client-simulation mode.

### Synchronization (critical path)

**Event-based, no position relay:**

1. Server physics runs at 60Hz; broadcasts `state_update` at 15Hz containing **only changed parameters** (speed, dirX, dirY, paused, radius, colorBall, colorBg) — no x/y/vx/vy.
2. Viewer and controller preview both run local physics at 60Hz with `clientSimulation: true`. They stay in sync deterministically: same params + same `worldWidth/worldHeight` + `FIXED_DT=1/60` = identical trajectory.
3. On `play`: both sides start from center simultaneously.
4. Bounce events: viewer detects locally → sends `bounce` to server → server relays `bounce_sync` to controller with **direction only** (no x/y).
5. `initial_state` on connect includes x/y for first-frame alignment; goes stale after 1.5s.

**Why no position relay:** server x/y in periodic updates triggered spring-damper drift correction that fought local physics → visible jitter on both controller preview and viewer.

**Key rule:** Never correct position on every render frame (causes jitter). Only correct on fresh server events.

### Data Flow

1. Therapist opens `/c/:id` → WebSocket as controller
2. Patient opens `/s/:id` → WebSocket as viewer, sends screen size
3. Server physics ticks at 60Hz, broadcasts parameter-only state ~15/sec
4. Controller adjusts settings via `POST /api/session/:id/controller/update`
5. Viewer bounces detected locally → `bounce` event → `bounce_sync` (direction only) to controller

## Key Conventions

- **i18n pattern**: `globalThis.i18n?.t('key') || 'English fallback'` — never hardcode user-facing strings
- **Module pattern**: IIFE with `globalThis.ModuleName = { ... }` export, guarded by `if (typeof globalThis.ModuleName !== 'undefined')` to prevent double-load
- **Global state**: `globalThis.__current` holds session state (sessionId, isPlaying, viewerConnected, etc.)
- **WebSocket endpoint**: `ws://host/?sessionId=:id&role=viewer|controller` — auto-reconnect, heartbeat every 25s
- **Session IDs**: auto-generated 6-char UUID prefix, or custom 3-32 chars (alphanumeric/dash/underscore)
- **E2E tests**: Puppeteer-based, use `domcontentloaded` (not `networkidle0`)
- **Webpack bundle**: client source in `src/`, compiled to `dist/`. Run `npm run build` after any client change before deploying.
- **Play/pause guards**: `__ignoreServerPausedUntilTs` (800ms) and `__ignoreServerDirectionUntilTs` (1500ms) prevent server state from overriding recent user actions
- **Viewer pause animation**: `seekingCenter` state triggers 400ms ease-out return-to-center when paused; ball does NOT snap immediately
- **`returnToCenter: true`** in controller/update API: snaps server ball to center immediately, broadcasts `{ paused: true }` — viewer then animates to center

## Sensitive Files — Do Not Touch Without Explicit Instruction

- `packages/shared/physics-engine.js` — deterministic physics; changes break viewer/controller sync
- `packages/server-core/src/network/webSocketServer.js` — WS message routing
- `packages/server-core/src/services/BroadcastService.js` — delta compression, event relay
- `packages/web-client/src/network/websocket-client.js` — reconnect logic
- `packages/web-client/src/viewer.js` — patient-facing; therapeutic UX matters

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEPLOY_PASSWORD` | For deploy | Password for SSH deploy |
| `STARS_BOT_TOKEN` | For subs | Telegram bot token for @emdrbilateral_bot |
| `STARS_PROVIDER_TOKEN` | Optional | Telegram Stars provider token (usually empty for XTR) |

## Deployment

**Setup**: Set `DEPLOY_PASSWORD` env var before deploying.

- Dev: `npm run deploy:dev` — pulls `main` branch, builds, restarts
- Prod: `npm run deploy:prod` — pulls `stable` branch from both .online and .ru, builds, restarts
- Logs: `npm run deploy:dev:logs` or `npm run deploy:prod:logs`
- Status: `npm run deploy:dev:status` or `npm run deploy:prod:status`

**All development on `main`**; prod branch `stable` updated manually when ready.

## VPS Server — 90.156.254.190

**OS**: Ubuntu, Linux 6.18, Node.js v22.22.0, RAM 4GB

### Systemd Services

| Service                        | Port | Path                                | Branch | Status         |
| ------------------------------ | ---- | ----------------------------------- | ------ | -------------- |
| `emdrbilateral-online.service` | 8080 | `/var/www/emdrbilateral.online`     | stable | prod (.online) |
| `emdrbilateral-ru.service`     | 8081 | `/var/www/emdrbilateral.ru`         | stable | prod (.ru)     |
| `emdrbilateral-dev.service`    | 3003 | `/var/www/dev.emdrbilateral.online` | main   | dev            |

**⚠ Important**: `emdrbilateral.service` (legacy) has been **permanently deleted**. If it reappears — delete it again. It caused 42000+ restart loops by conflicting with `emdrbilateral-online.service` on port 8080.

### Nginx

- `/etc/nginx/sites-enabled/emdrbilateral` — .online (→ 8080) and .ru (→ 8081)
- `/etc/nginx/sites-enabled/dev.emdrbilateral.online` — dev (→ 3003)

### Manage Services

```bash
ssh root@90.156.254.190

systemctl status emdrbilateral-online.service
systemctl restart emdrbilateral-online.service
journalctl -u emdrbilateral-online -n 50 --no-pager

systemctl list-units --type=service | grep emdr
ss -tlnp | grep node
```

### VPN — StrongSwan IKEv2

**Protocol**: IKEv2/IPsec (StrongSwan 6.0.1), macOS and iOS clients.
VPN users (9): Swetlana, Sergey, Yulia, David, DavidMac1, DavidMac2, Elena, DavidDeck, Bogdan.

**⚠ After VPS reboot**: iptables NAT rules are lost. Restore:
```bash
iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -j MASQUERADE
iptables -A FORWARD -s 10.10.10.0/24 -j ACCEPT
iptables -A FORWARD -d 10.10.10.0/24 -j ACCEPT
```

## Playwright Testing

Use Playwright MCP server for browser automation and E2E testing.

```
playwright_navigate url="http://localhost:3000/c/test123"
playwright_click selector="#playPauseBtn"
playwright_screenshot name="after-play"
playwright_console_logs type="error"
playwright_evaluate script="window.physicsEngine?.ball"
playwright_get_visible_text selector="#viewerStatus"
playwright_resize width=1280 height=800
```

Key tools: `playwright_navigate`, `playwright_click`, `playwright_fill`, `playwright_screenshot`, `playwright_console_logs`, `playwright_evaluate`, `playwright_get_visible_text`, `playwright_get_visible_html`, `playwright_resize`, `playwright_expect_response`.
