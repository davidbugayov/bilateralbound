# .clinerules — Rules for Claude Code

## Project

**EMDR BilateralBound** — web-платформа для EMDR-терапии. Терапевт (controller) управляет движением шара через bilateral stimulation; пациент (viewer) наблюдает в реальном времени через WebSocket.
Дополнительно: Telegram бот (@emdrbilateral_bot) для подписок через Telegram Stars.

## Language

- Отвечай на русском (предпочтительный язык пользователя)
- Code comments in English
- UI strings via i18n, never hardcoded

## Code Principles

1. **Write only used code** — no unused functions, variables, imports, dead code paths
2. **No over-engineering** — implement only what's explicitly required
3. **Comment "why" not "what"** — explain physics sync decisions, WebSocket edge cases, workarounds
4. **No .md reports** — don't create report files unless asked
5. **Short commits** — concise commit messages

## Local Setup

**Prerequisites**: Node.js v22+

```bash
npm install   # installs all workspace packages
npm run dev   # starts dev server on port 3000
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

**Monorepo** with npm workspaces: `packages/server-core` (Node.js + Express), `packages/web-client` (Vanilla JS, webpack), `packages/shared` (physics engine). Run `npm install` from the repo root — workspace symlinks handle cross-package dependencies automatically.

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

### Frontend (`packages/web-client/`)

Source in `src/`, webpack builds to `dist/`:

- `src/viewer.js` — patient view: local physics, WebSocket sync, audio
- `src/controller.js` — therapist view: preview physics, settings, WebSocket
- `src/rendering/renderer.js` — `BallRenderer`: canvas rendering, interpolation, letterboxing
- `src/network/websocket-client.js` — WebSocket client, auto-reconnect, heartbeat
- `src/network/realtime-client.js` — transport wrapper (WebSocket)
- `src/application/controller/` — modular controller components (event-handlers, fullscreen, play-pause, preview-manager, ui-controls, ui-sync, viewer-status)
- `src/domain/` — counters, direction, session-state
- `src/audio/audio-manager.js` — sound effects (bounce, beep, click)
- `src/ui/` — controller-settings, error-overlay, shared-components, success-toast, notifications
- `src/i18n/` — internationalization (constants, i18n, language-selector)
- `src/core/debug-logger.js` — debug logging

Shared: `packages/shared/physics-engine.js` — deterministic 60Hz fixed-step physics, `isViewer` flag switches between server mode and client-simulation mode.

### Synchronization (critical path)

**Event-based, no position relay:**

1. Server physics runs at 60Hz; broadcasts `state_update` at 15Hz containing **only changed parameters** (speed, dirX, dirY, paused, radius, colorBall, colorBg) — no x/y/vx/vy.
2. Viewer and controller preview both run local physics at 60Hz with `clientSimulation: true`. They stay in sync deterministically: same params + same `worldWidth/worldHeight` + `FIXED_DT=1/60` = identical trajectory.
3. On `play`: both sides start from center simultaneously.
4. Bounce events: viewer detects locally → sends `bounce` to server → server relays `bounce_sync` to controller with **direction only** (no x/y).
5. `initial_state` on connect includes x/y for first-frame alignment; goes stale after 1.5s.

**Key rule:** Never correct position on every render frame (causes jitter). Only correct on fresh server events.

### Data Flow

1. Therapist opens `/c/:id` → WebSocket as controller
2. Patient opens `/s/:id` → WebSocket as viewer, sends screen size
3. Server physics ticks at 60Hz, broadcasts parameter-only state ~15/sec
4. Controller adjusts settings via `POST /api/session/:id/controller/update`
5. Viewer bounces detected locally → `bounce` event → `bounce_sync` (direction only) to controller

### Subscription / Telegram Bot

- Бот: @emdrbilateral_bot
- Платежи: Telegram Stars (валюта XTR)
- Webhook endpoint: `POST /api/subscription/webhook`
- Команды бота: /start, /status, /renew, /cancel, /autorenew
- 75 Stars за 30 дней подписки
- Подписка привязывается к telegramUserId, customId линкуется к пользователю

## Key Conventions

- **i18n pattern**: `(() => { const v = globalThis.i18n?.t('key'); return v && v !== 'key' ? v : 'English fallback'; })()` — never hardcode user-facing strings. ⚠️ `t()` returns the key when missing, so `||` fallback is broken.
- **Module pattern**: IIFE with `globalThis.ModuleName = { ... }` export, guarded by `if (typeof globalThis.ModuleName !== 'undefined')` to prevent double-load
- **Global state**: `globalThis.__current` holds session state (sessionId, isPlaying, viewerConnected, etc.)
- **WebSocket endpoint**: `ws://host/?sessionId=:id&role=viewer|controller` — auto-reconnect, heartbeat every 25s
- **Session IDs**: auto-generated 6-char UUID prefix, or custom 3-32 chars (alphanumeric/dash/underscore)
- **E2E tests**: Puppeteer-based, use `domcontentloaded` (not `networkidle0`)
- **Webpack bundle**: client source in `src/`, compiled to `dist/`. Run `npm run build` after any client change before deploying.
- **Play/pause guards**: `__ignoreServerPausedUntilTs` (800ms) and `__ignoreServerDirectionUntilTs` (1500ms) prevent server state from overriding recent user actions
- **Viewer pause animation**: `seekingCenter` state triggers 400ms ease-out return-to-center when paused; ball does NOT snap immediately. `updatePhysicsFromState` fallback in `viewer.html` ensures animation starts even on redundant pause commands.
- **`returnToCenter: true`** in `POST /api/session/:id/controller/update`: skips deceleration, snaps server ball to center immediately, broadcasts `{ paused: true }` — viewer then animates to center

## Deployment

**Setup**: Set `DEPLOY_PASSWORD` env var before deploying:

```bash
export DEPLOY_PASSWORD='password_here'
# Or create .env file (it's in .gitignore):
cp .env.example .env
# Edit .env and add DEPLOY_PASSWORD
```

**Deploy**:

- Dev: `npm run deploy:dev` — pulls `main` branch, builds, restarts
- Prod: `npm run deploy:prod` — pulls `stable` branch from both .online and .ru, builds, restarts
- Logs: `npm run deploy:dev:logs` or `npm run deploy:prod:logs`
- Status: `npm run deploy:dev:status` or `npm run deploy:prod:status`

**All development on `main`**; prod branch `stable` updated manually when ready. UFW: ports 22, 80, 443 (TCP), 500/udp, 4500/udp (VPN)

## VPS Server — 90.156.254.190

**OS**: Ubuntu, Linux 6.18, Node.js v22.22.0, RAM 4GB

### Systemd Services

| Service                        | Port | Path                                | Branch | Status         |
| ------------------------------ | ---- | ----------------------------------- | ------ | -------------- |
| `emdrbilateral-online.service` | 8080 | `/var/www/emdrbilateral.online`     | stable | prod (.online) |
| `emdrbilateral-ru.service`     | 8081 | `/var/www/emdrbilateral.ru`         | stable | prod (.ru)     |
| `emdrbilateral-dev.service`    | 3003 | `/var/www/dev.emdrbilateral.online` | main   | dev            |

**⚠ Important**: `emdrbilateral.service` (legacy) has been **permanently deleted** (`rm /etc/systemd/system/emdrbilateral.service`). If it somehow reappears — delete it again. It caused 42000+ restart loops by conflicting with `emdrbilateral-online.service` on port 8080.

### Nginx

- `/etc/nginx/sites-enabled/emdrbilateral` — .online (→ 8080) and .ru (→ 8081)
- `/etc/nginx/sites-enabled/dev.emdrbilateral.online` — dev (→ 3003)

### Manage services

```bash
ssh -o StrictHostKeyChecking=no root@90.156.254.190

systemctl status emdrbilateral-online.service
systemctl restart emdrbilateral-online.service
journalctl -u emdrbilateral-online -n 50 --no-pager

systemctl list-units --type=service | grep emdr
ss -tlnp | grep node
```

## VPN — StrongSwan IKEv2

**Protocol**: IKEv2/IPsec (StrongSwan 6.0.1), macOS and iOS clients.

```bash
ipsec status       # active connections
ipsec statusall    # verbose

# strongswan-starter.service shows "inactive/dead" — NORMAL
# charon runs as background process

# User creds: /etc/ipsec.secrets
# Config: /etc/ipsec.conf or /etc/ipsec.d/
```

VPN users (9): Swetlana, Sergey, Yulia, David, DavidMac1, DavidMac2, Elena, DavidDeck, Bogdan.

**⚠ After VPS reboot**: iptables NAT rules are lost. Restore:

```bash
iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -j MASQUERADE
iptables -A FORWARD -s 10.10.10.0/24 -j ACCEPT
iptables -A FORWARD -d 10.10.10.0/24 -j ACCEPT
# Rules are also saved to /etc/iptables.rules and auto-restored via
# /etc/networkd-dispatcher/routable.d/50-iptables-restore
```

## Analytics — Yandex.Metrica

**Token**: `YM_ID = 104698530` (counter ID)

**Architecture**: two scripts in `<head>` with `defer`:
- `public/js/ui/cookie-consent.js` — consent banner, loads ym on accept
- `public/js/analytics/metrika-events.js` — event bus → ym(`reachGoal`)

**Event bus**:
```js
globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_started'))
globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'speed' } }))
```

**Cookie consent flow** (`localStorage` key `bb_cookie_consent`): `accepted` → ym loads; `null` → banner, queue; `declined` → discard.

**Queue** (metrika-events.js): `pendingEvents[]` (max 200), flushed on `bb_cookie_consent_accepted`, cleared on `declined`.

**Metrika goals** — see CLAUDE.md for full event table. All dispatched as `CustomEvent` from app modules.

**CSP** (`middleware.js`): allows `https://mc.yandex.ru`, `https://mc.yandex.com`, `wss://mc.yandex.com`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEPLOY_PASSWORD` | For deploy | Password for SSH deploy |
| `STARS_BOT_TOKEN` | For subs | Telegram bot token for @emdrbilateral_bot |
| `STARS_PROVIDER_TOKEN` | Optional | Telegram Stars provider token (usually empty for XTR) |

## Playwright Testing

Use Playwright MCP server for browser automation and E2E testing. Available tools:

### Navigation & Pages
- `playwright_navigate` — open URL in browser (chromium/firefox/webkit)
- `playwright_go_back` / `playwright_go_forward` — browser history
- `playwright_close` — close browser

### Interaction
- `playwright_click` — click element by CSS selector
- `playwright_fill` — fill input field
- `playwright_select` — select dropdown option
- `playwright_hover` — hover over element
- `playwright_press_key` — press keyboard key (Enter, Tab, etc.)
- `playwright_upload_file` — upload file to input[type=file]
- `playwright_drag` — drag element to target

### Assertions & Inspection
- `playwright_get_visible_text` — get page text content
- `playwright_get_visible_html` — get page HTML
- `playwright_screenshot` — capture screenshot (base64 or PNG file)
- `playwright_console_logs` — retrieve browser console logs

### Network & API
- `playwright_get` / `playwright_post` / `playwright_put` / `playwright_patch` / `playwright_delete` — HTTP requests from browser context
- `playwright_expect_response` + `playwright_assert_response` — wait for and validate HTTP responses

### Advanced
- `playwright_evaluate` — execute JavaScript in page context
- `playwright_resize` — resize viewport (supports device presets: iPhone, iPad, etc.)
- `playwright_custom_user_agent` — set custom User-Agent
- `playwright_save_as_pdf` — save page as PDF

### Code Generation
- `start_codegen_session` — record Playwright actions
- `end_codegen_session` — generate test file from recorded actions
- `get_codegen_session` — view session info
- `clear_codegen_session` — discard session

### Usage Example
```
# Open controller page
playwright_navigate url="http://localhost:3000/c/test123"

# Click start button
playwright_click selector="#playPauseBtn"

# Take screenshot
playwright_screenshot name="controller-started"

# Check console for errors
playwright_console_logs type="error"
```

## Plugin Configuration

Use plugins proactively for relevant tasks:

- **context7** — Express, WebSocket, Puppeteer, Node.js APIs. Check docs first before guessing.
- **playwright** — E2E testing, browser automation. Use for `scripts/e2e/` work and manual browser testing.
- **frontend-design** — when modifying `viewer.html`, `session-controller.html`, `index.html`. Goals: accessibility, therapeutic UX, correct i18n.
- **feature-dev** — guided feature development spanning multiple files.
- **code-simplifier** — refactoring, reducing complexity, cleaning dead code.
- **typescript-lsp** — type checking, references, navigation (useful even in JS codebase).
- **Security review** — run before merging changes to `session/`, `network/`, `js/websocket-client.js`, `js/realtime-client.js`, controller API endpoints.

## File Operations

- Prefer `replace_in_file` for small edits
- Use `write_to_file` for new files or major rewrites
- Always wait for confirmation after each tool use

## Sensitive Files

Do not modify without explicit instruction:
- `packages/shared/physics-engine.js` — deterministic physics; changes break viewer/controller sync
- `packages/server-core/src/network/webSocketServer.js` — WS message routing
- `packages/server-core/src/services/BroadcastService.js` — delta compression, event relay
- `packages/web-client/src/network/websocket-client.js` — client reconnection logic
- `packages/web-client/src/viewer.js` — patient-facing; therapeutic UX matters
- `.env` files
