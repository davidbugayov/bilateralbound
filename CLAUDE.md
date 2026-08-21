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

# Ship (push + deploy in one command)
npm run ship:dev          # git push origin main + deploy to dev
npm run ship:prod         # git push origin main + deploy to prod

# Deploy only (without push)
npm run deploy:dev        # Pull main, build, restart dev server
npm run deploy:prod       # Pull stable, build, restart prod (.online + .ru)
npm run deploy:dev:logs   # Show dev service logs
npm run deploy:prod:logs  # Show prod service logs
npm run deploy:dev:status # Dev service status
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
- `services/TelegramAuthService.js` — Telegram init data verification (HMAC, timing-safe)
- `services/WsTokenService.js` — HMAC-signed WS token generation/verification
- `services/LinkAccessService.js` — permanent link access gating (free trial + subscription)
- `services/LocalizationService.js` — multi-language detection, HTML localization
- `services/AnalyticsCollector.js` — usage analytics
- `services/bot-translations.js` — bot message translations (8 languages)
- `repositories/SessionRepository.js` — in-memory Map, LRU eviction, MAX_SESSIONS=1000
- `config/index.js` — server config (CORS origins dev/prod, ports, Telegram, runtime)
- `controllers/sessionController.js` — REST API handlers
- `controllers/subscriptionController.js` — webhook + subscription routes
- `controllers/viewerController.js` — viewer state endpoints
- `controllers/seoController.js` — dynamic robots.txt, sitemap.xml, RSS, llms.txt
- `controllers/static_routes_controller.js` — static file routes, HTML serving
- `plugins/` — logger, analytics plugins
- `utils/validation.js` — input validation (ball state, bounce, session ID, screen size)

### Frontend (`packages/web-client/src/`)

- `viewer.js` — patient view: local physics, WebSocket sync, audio
- `controller.js` — therapist view: preview physics, settings, WebSocket
- `rendering/renderer.js` — `BallRenderer`: canvas rendering, interpolation, letterboxing
- `network/websocket-client.js` — WebSocket client, auto-reconnect, heartbeat
- `network/realtime-client.js` — transport wrapper (WebSocket)
- `application/controller/` — modular controller components (fullscreen, play-pause, ui-controls, ui-sync, viewer-status, notifications, settings, direction-ui, brainspotting-drag)
- `domain/` — counters, direction, session-state
- `audio/audio-manager.js` — sound effects (bounce, beep, click)
- `ui/` — controller-settings, error-overlay, shared-components, success-toast, notifications
- `i18n/` — internationalization (constants, i18n, language-selector)
- `network/csrf.js` — CSRF fetch wrapper (`csrfFetch`)
  - **i18n codegen**: `src/i18n/` is the single source of truth. `npm run build` runs `scripts/generate-i18n-iife.js` to generate IIFE-wrapped copies into `public/js/i18n/` for static HTML pages. Never edit `public/js/i18n/i18n.js` or `language-selector.js` directly — edit in `src/i18n/` and rebuild.
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

- **i18n pattern**: `(() => { const v = globalThis.i18n?.t('key'); return v && v !== 'key' ? v : 'English fallback'; })()` — never hardcode user-facing strings. ⚠️ `t()` returns the key itself when missing, so `||` fallback fails (key is truthy). Always check `v !== key`.
- **Module pattern**: IIFE with `globalThis.ModuleName = { ... }` export, guarded by `if (typeof globalThis.ModuleName !== 'undefined')` to prevent double-load
- **Global state**: `globalThis.__current` holds session state (sessionId, isPlaying, viewerConnected, etc.)
- **WebSocket endpoint**: `ws://host/?sessionId=:id&role=viewer|controller` — auto-reconnect, heartbeat every 25s
- **Session IDs**: auto-generated 6-char UUID prefix, or custom 3-32 chars (alphanumeric/dash/underscore)
- **E2E tests**: Puppeteer-based, use `domcontentloaded` (not `networkidle0`)
- **Webpack bundle**: client source in `src/`, compiled to `dist/`. Run `npm run build` after any client change before deploying.
- **Play/pause guards**: `__ignoreServerPausedUntilTs` (800ms) and `__ignoreServerDirectionUntilTs` (1500ms) prevent server state from overriding recent user actions
- **Viewer pause animation**: `seekingCenter` state triggers 1.2s ease-in-out cubic return-to-center when paused; ball does NOT snap immediately. Viewer strips x/y from `paused:true` state updates to prevent teleport.
- **`returnToCenter: true`** in controller/update API: snaps server ball to center immediately, broadcasts `{ paused: true }` — viewer then animates to center

## Sensitive Files — Do Not Touch Without Explicit Instruction

- `packages/shared/physics-engine.js` — deterministic physics; changes break viewer/controller sync
- `packages/server-core/src/network/webSocketServer.js` — WS message routing
- `packages/server-core/src/services/BroadcastService.js` — delta compression, event relay
- `packages/web-client/src/network/websocket-client.js` — reconnect logic
- `packages/web-client/src/viewer.js` — patient-facing; therapeutic UX matters

## Analytics — Yandex.Metrica

**Token**: `YM_ID = 104698530` (counter ID)

**Architecture** — two scripts loaded in `<head>` with `defer`:

| Script | Path | Role |
|--------|------|------|
| `cookie-consent.js` | `public/js/ui/cookie-consent.js` | Consent banner, loads ym tag on accept |
| `metrika-events.js` | `public/js/analytics/metrika-events.js` | Listens for `bb_metrika_*` events, calls `ym()` |

**Event bus pattern**: app code dispatches `CustomEvent` — metrika-events.js listens and translates to `ym(YM_ID, 'reachGoal', ...)`:

```js
globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_started'))
globalThis.dispatchEvent(new CustomEvent('bb_metrika_settings_changed', { detail: { setting: 'speed' } }))
globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_duration', { detail: { seconds: 120 } }))
```

**Cookie consent flow**:
- Consent stored in `localStorage` key `bb_cookie_consent` (`'accepted'` / `'declined'` / `null`)
- `accepted` → ym loads immediately (creates shim, injects async tag)
- `null` → banner shown after 500ms; ym NOT loaded; events queued in `metrika-events.js`
- `declined` → ym never loads; queue discarded

**Queue mechanism** (`metrika-events.js`):
- Events before consent go to `pendingEvents[]` (max 200)
- On `bb_cookie_consent_accepted` → `flushQueue()` drains to ym
- On `bb_cookie_consent_declined` → queue cleared, `queueFlushed = true` (stop collecting)
- `globalThis.MetrikaEvents.getPendingCount()` — inspect queue size for debugging

**Metrika events** dispatched from app:

| CustomEvent | Goal name | Source | Dispatched? |
|-------------|-----------|--------|-------------|
| `bb_metrika_session_created` | `session_created` | `main-page.js:83` — при нажатии «Start Session» | ✅ |
| `bb_metrika_session_started` | `session_started` | `play-pause.js:97` — play pressed | ✅ |
| `bb_metrika_session_stopped` | `session_stopped` | `play-pause.js:102` — pause pressed | ✅ |
| `bb_metrika_session_duration` | `session_duration` | `play-pause.js:103` — detail.seconds | ✅ |
| `bb_metrika_viewer_connected` | `viewer_connected` | `viewer.js:907` — WS open | ✅ |
| `bb_metrika_viewer_disconnected` | `viewer_disconnected` | `viewer.js:920` — WS close | ✅ |
| `bb_metrika_ws_reconnect` | `ws_reconnect` | `websocket-client.js:238` — reconnection | ✅ |
| `bb_metrika_breathing_started` | `breathing_started` | `breathing.html:610` — detail.minutes | ✅ |
| `bb_metrika_settings_changed` | `settings_changed` | `controller.js` (7 triggers): speed, direction, ballColor, ballSize, soundEnabled, soundType, bgColor — each with detail.setting and detail.value | ✅ |
| `bb_metrika_permanent_link_created` | `permanent_link_created` | `main-page.js:213` — detail.clientId | ✅ |
| `bb_metrika_subscribe_clicked` | `subscribe_clicked` | `main-page.js:371` — subscribe button | ✅ |

**NOT dispatched anywhere (dead entries in eventMap):** none — all 15 events have dispatch sites.

**New events** (v2.39.711+):

| CustomEvent | Goal name | Source | Notes |
|-------------|-----------|--------|-------|
| `bb_metrika_ws_error` | `ws_error` | `viewer.js:929` — WS error handler | detail.message |
| `bb_metrika_feature_used` | `feature_used` | `fullscreen.js:78` (fullscreen), `controller.js:1543` (infinity), `common.js:217` (theme) | detail.feature, detail.action |
| `bb_metrika_viewer_error` | `viewer_error` | `viewer.js:37` — `showError()` | detail.message |
| `bb_metrika_sync_drift` | `sync_drift` | `viewer.js:94`, `controller.js:102` — sync monitor | detail.driftPx, detail.jitterMs, detail.role |
| `bb_metrika_session_ready` | `session_ready` | `controller.js:461` — viewer+controller both connected | Funnel: session_created → session_ready → session_started |

**`page_view` hit:** Sent automatically on `bb_cookie_consent_accepted` with screen/viewport dimensions — covers first visit before ym loads.

**`cookie_declined` pixel:** Sent via `<img>` beacon in `cookie-consent.js:97-99` — works even without ym loaded.

**Server-side analytics** (`services/AnalyticsCollector.js` → persisted to `/tmp/emdr-analytics-{port}.json`):

| Method | Where called | What it tracks |
|--------|-------------|----------------|
| `recordSessionCreated` | `SessionService:74` | Total sessions, timestamps for today/week/month |
| `recordSessionEnded` | `SessionService:220`, `PhysicsService:294` | Session duration (cleanup/grace period) |
| `recordViewerConnected` | `webSocketServer:42` | Viewer connection count + pair detection |
| `recordControllerConnected` | `webSocketServer:44` | Controller connection count + pair detection |
| `recordViewerDisconnected` | WebSocket close handler | Decrements current viewer count |
| `recordControllerDisconnected` | WebSocket close handler | Decrements current controller count |
| `recordHttpRequest` | `analytics.js` plugin middleware | Total HTTP requests |
| `recordHttpError` | `analytics.js` plugin middleware | 4xx/5xx errors + top paths |
| `recordSessionError` | `webSocketServer:254`, `PhysicsService:72` | WS errors, physics errors |
| `recordPhysicsTick` | `PhysicsService:286` | Tick jitter (last 120 intervals) |
| `recordLanguage` | `SessionService:197` | Language distribution |
| `updatePeak` | `SessionService:75`, `sessionController:34` | Peak concurrent sessions |
| `getStats` | `sessionController:35` | Aggregated report (localhost-only endpoint) |

**CSP** (`middleware.js`): Allows `https://mc.yandex.ru`, `https://mc.yandex.com`, `wss://mc.yandex.com`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEPLOY_PASSWORD` | No | Not required (SSH key auth used) |
| `STARS_BOT_TOKEN` | For subs | Telegram bot token for @emdrbilateral_bot |
| `STARS_PROVIDER_TOKEN` | Optional | Telegram Stars provider token (usually empty for XTR) |

## Deployment

**Setup**: SSH key `~/.ssh/id_rsa_emdr` must be added to server.

**One-command ship** (push + deploy):
- `npm run ship:dev` — `git push origin main` + deploy to dev
- `npm run ship:prod` — `git push origin main` + deploy to prod

**Deploy only** (without push):
- Dev: `npm run deploy:dev` — pulls `main` branch, builds, restarts
- Prod: `npm run deploy:prod` — pulls `stable` branch from both .online and .ru, builds, restarts
- Logs: `npm run deploy:dev:logs` or `npm run deploy:prod:logs`
- Status: `npm run deploy:dev:status` or `npm run deploy:prod:status`

**Typical workflow — dev:**
```bash
git add <files>
git commit -m "fix: ..."     # pre-commit hook auto-increments version
npm run ship:dev             # push + deploy to dev
```

**Typical workflow — prod:**
```bash
git checkout stable && git merge main   # merge main into stable
git push origin stable                  # push stable branch
npm run ship:prod                       # push + deploy both .online and .ru
```

**All development on `main`**; prod branch `stable` updated manually when ready.

## VPS Server — 144.31.68.9 (u1host)

**Хостинг**: u1host (vm1156528, DE-Promo), **OS**: Ubuntu 24.04, **RAM**: ~1GB
**Домен**: emdrbilateral.online → 144.31.68.9 (также emdrbilateral.ru)
**SSH**: `ssh -i ~/.ssh/id_rsa_emdr root@144.31.68.9` (ключ `~/.ssh/id_rsa_emdr`)
**Резервный сервер (старый)**: 90.156.254.190 (Beget) — может быть выключен

### Systemd Services

| Service                        | Port | Path                                | Branch | Status         |
| ------------------------------ | ---- | ----------------------------------- | ------ | -------------- |
| `emdrbilateral-online.service` | 8080 | `/var/www/emdrbilateral.online`     | stable | prod (.online) |
| `emdrbilateral-ru.service`     | 8081 | `/var/www/emdrbilateral.ru`         | stable | prod (.ru)     |
| `emdrbilateral-dev.service`    | 3003 | `/var/www/dev.emdrbilateral.online` | main   | dev            |

### Nginx

- `/etc/nginx/sites-enabled/emdrbilateral` — .online (→ 8080), .ru (→ 8081), VLESS WebSocket (/ws-vless → Xray)
- `/etc/nginx/sites-enabled/dev.emdrbilateral.online` — dev (→ 3003)

### Manage Services

```bash
ssh -i ~/.ssh/id_rsa_emdr root@144.31.68.9

systemctl status emdrbilateral-online.service
systemctl restart emdrbilateral-online.service
journalctl -u emdrbilateral-online -n 50 --no-pager

systemctl list-units --type=service | grep emdr
ss -tlnp | grep node
```

### VPN — StrongSwan IKEv2 + VLESS/Xray

**StrongSwan IKEv2** (Wi-Fi клиенты): порты 500/4500, конфиг скопирован с бегета.
**VLESS/Xray** (мобильная сеть): WebSocket через nginx на порту 443, маскировка под кинопоиск.

VPN пользователи (14): David, DavidMac1, DavidMac2, DavidDeck, Elena_mir, Elena, Nika, Svetlana, Sergey, Yulia, Bogdan, Natalia, Olga, Swetlana.

**VLESS client config** (v2rayNG Android):
```
vless://379224bf-e0da-4083-b073-e9b5eca87707@emdrbilateral.online:443?encryption=none&security=tls&sni=emdrbilateral.online&type=ws&host=emdrbilateral.online&path=%2Fws-vless&fp=chrome#EMDR%20(VLESS)
```

**⚠ After VPS reboot**: iptables NAT rules may be lost. Restore:
```bash
iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -j MASQUERADE
iptables -A FORWARD -s 10.10.10.0/24 -j ACCEPT
iptables -A FORWARD -d 10.10.10.0/24 -j ACCEPT
```

**VPN configs**: `/etc/ipsec.conf`, `/etc/ipsec.secrets`, `/usr/local/etc/xray/config.json`
**VPN check**: `ipsec status`, `systemctl status xray`, `grep charon /var/log/syslog | tail -20`

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
