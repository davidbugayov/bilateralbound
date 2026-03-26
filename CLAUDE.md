# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EMDR therapy platform — therapist (controller) controls a bouncing ball via bilateral stimulation; patient (viewer) watches it in real-time. WebSocket is the sole transport.

## Code Principles

- **Write only used code**: no unused functions, variables, imports, dead code paths. Keep codebase clean and minimal.
- **Comment complex logic**: explain "why" not "what" — focus on physics sync decisions, WebSocket edge cases, workarounds.
- **No over-engineering**: implement only what's explicitly required. Don't add features, abstractions, or error handling for impossible scenarios.
- **No .md reports**: don't create report files unless asked. Keep responses concise.
- **Short commits**: concise commit messages, no verbose descriptions.
- **Language**: respond in the language the user writes in.

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

# Deployment (requires DEPLOY_PASSWORD env var)
npm run deploy:dev       # Pull main, build, restart dev server
npm run deploy:prod      # Pull stable, build, restart prod (.online + .ru)
npm run deploy:dev:logs  # Show dev service logs
npm run deploy:prod:logs # Show prod service logs
```

## Architecture

**Monorepo** with npm workspaces: `packages/server-core` (Node.js + Express) and `packages/web-client` (Vanilla JS, no framework). Run `npm install` from the repo root — workspace symlinks handle cross-package dependencies automatically.

### Server (`packages/server-core/server/`)

- `index.js` — entry: creates SessionManager, Express app, WebSocket server
- `network/expressApp.js` — all HTTP routes, compression
- `network/webSocketServer.js` — WebSocket server, message routing, heartbeat
- `session/SessionManager.js` — orchestrator: physics loop (60Hz tick, 15Hz broadcast), WS, broadcast
- `session/StateBroadcaster.js` — sends events to WS clients (viewer-only, controller-only, or both)
- `session/SessionRepository.js` — in-memory Map, LRU eviction, MAX_SESSIONS=1000

### Frontend (`packages/web-client/public/`)

- `viewer.html` / `session-controller.html` — patient and therapist views
- `js/physics-engine.js` — shared physics (used server-side AND client-side), two modes: `_updateServerPhysics` (server/controller) and `_updateViewerPhysics` (viewer interpolation or client simulation)
- `js/websocket-client.js` — WebSocket client with auto-reconnect
- `js/realtime-client.js` — transport wrapper (WebSocket)
- `js/controller.js` — controller UI logic (wires event handlers, manages state, preview physics)
- `js/renderer.js` — canvas ball rendering with `BallRenderer` (fixed-step loop, interpolation)
- `js/application/controller/` — modular controller components (viewer-status, fullscreen, event-handlers, etc.)
- `locales/` — 8 languages (en, ru, de, es, fr, pt, ja, zh)

### Synchronization (critical path)

All push-based, NO polling:

1. Server physics at 60Hz → broadcasts `state_update` every 12th tick (5Hz) via WebSocket for drift correction; bounce events and API updates broadcast immediately
2. Bounce events broadcast immediately (not throttled)
3. Viewer runs local physics (`clientSimulation: true`) at 60Hz, receives server commands via `applyCommand()`
4. Viewer broadcasts its state at 30Hz via `viewer_update` (only when moving)
5. Controller preview runs local physics at 60Hz with event-based drift correction on `state_update` arrival (not per-frame)
6. `bounce_sync` snaps controller preview to viewer position on wall bounce

**Key sync rule**: never correct position on every render frame (causes jitter). Only correct when new server data arrives (~15Hz) with dead zone and adaptive alpha.

### Data Flow

1. Therapist opens `/c/:id` → WebSocket as controller
2. Patient opens `/s/:id` → WebSocket as viewer, sends screen size
3. Server physics ticks at 60Hz, broadcasts state ~15/sec
4. Controller adjusts settings via `POST /api/session/:id/controller/update`
5. Viewer bounces sync back via `POST /api/session/:id/viewer/bounce`

## Key Conventions

- **i18n pattern**: `globalThis.i18n?.t('key') || 'English fallback'` — never hardcode user-facing strings
- **Module pattern**: IIFE with `globalThis.ModuleName = { ... }` export, guarded by `if (typeof globalThis.ModuleName !== 'undefined')` to prevent double-load
- **Global state**: `globalThis.__current` holds session state (sessionId, isPlaying, viewerConnected, etc.)
- **WebSocket endpoint**: `ws://host/?sessionId=:id&role=viewer|controller` — auto-reconnect, heartbeat every 30s
- **Session IDs**: auto-generated 6-char UUID prefix, or custom 3-32 chars (alphanumeric/dash/underscore)
- **E2E tests**: Puppeteer-based, 22 tests, use `domcontentloaded` (not `networkidle0`)
- **No bundler**: vanilla JS loaded via `<script>` tags, order matters
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

## VPS Server — 213.139.229.44

**OS**: Ubuntu, Linux 6.18, Node.js v22.22.0, RAM 4GB

### Systemd Services

| Service                        | Port | Path                                | Branch | Status         |
| ------------------------------ | ---- | ----------------------------------- | ------ | -------------- |
| `emdrbilateral-online.service` | 8080 | `/var/www/emdrbilateral.online`     | stable | prod (.online) |
| `emdrbilateral-ru.service`     | 8081 | `/var/www/emdrbilateral.ru`         | stable | prod (.ru)     |
| `emdrbilateral-dev.service`    | 3003 | `/var/www/dev.emdrbilateral.online` | main   | dev            |

**⚠ Important**: `emdrbilateral.service` (legacy) has been **permanently deleted** (`rm /etc/systemd/system/emdrbilateral.service`). If it somehow reappears — delete it again. It caused 42000+ restart loops by conflicting with `emdrbilateral-online.service` on port 8080.

### Nginx

- `/etc/nginx/sites-enabled/emdrbilateral` — .online (→ 8080) and .ru (→ 8080)
- `/etc/nginx/sites-enabled/dev.emdrbilateral.online` — dev (→ 3003)

### Manage services

```bash
ssh root@213.139.229.44

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

## Clawdbot (Telegram AI Bot)

**Package**: clawdbot v2026.1.24-3 (`npm install -g clawdbot`)
**Bot**: `@davidbugayov_bot` (Telegram user ID: `108472191`)
**Workspace**: `/root/clawd/`
**Config**: `/root/.clawdbot/clawdbot.json`

- Active model: `github-copilot/claude-haiku-4.5`
- Fallback model: `anthropic/claude-haiku-4-5-20251001`
- Telegram token: in `channels.telegram.botToken`
- Gateway port: 18789 (loopback)
- Gateway token: `7aaa37bf489d859ce678dd7baa0d33fc492449df5bbce6bc`

### Architecture (critical — why systemd needs special handling)

`clawdbot` uses a **double-fork** on startup: parent spawns child with extra env vars, child runs the actual gateway, parent exits. This breaks naive `Type=simple` systemd services.

**Fix**: Use `CLAWDBOT_NO_RESPAWN=1` env var — skips the fork, runs gateway directly in foreground.

**Startup script**: `/usr/local/bin/clawdbot-gw.sh`

```bash
#!/bin/bash
cd /root
OLD_PID=$(ss -tlnp 2>/dev/null | grep ":18789 " | grep -oP "(?<=pid=)\d+" | head -1)
[ -n "$OLD_PID" ] && { kill -TERM "$OLD_PID" 2>/dev/null; sleep 2; }
rm -f /tmp/clawdbot-0/*.lock 2>/dev/null
exec env CLAWDBOT_NO_RESPAWN=1 /usr/bin/node /usr/lib/node_modules/clawdbot/dist/entry.js gateway run --force --verbose
```

### Service management

```bash
# Systemd user service (auto-starts on boot, linger enabled)
systemctl --user status clawdbot-gateway.service
systemctl --user restart clawdbot-gateway.service
journalctl --user -u clawdbot-gateway -n 50 --no-pager

ss -tlnp | grep 18789
```

### Switch model

```bash
# Shortcut — set MODEL and restart:
MODEL="anthropic/claude-sonnet-4-6"   # change to desired model
python3 -c "import json; f='/root/.clawdbot/clawdbot.json'; cfg=json.load(open(f)); cfg['agents']['defaults']['model']['primary']='$MODEL'; json.dump(cfg,open(f,'w'),indent=2); print('model set to', '$MODEL')"
systemctl --user restart clawdbot-gateway.service
```

**Available models** (clawdbot v2026.1.24-3):

| Model ID                           | Provider       | Notes               |
| ---------------------------------- | -------------- | ------------------- |
| `github-copilot/claude-haiku-4.5`  | GitHub Copilot | free ← используется |
| `github-copilot/claude-sonnet-4.6` | GitHub Copilot | free                |
| `github-copilot/claude-opus-4.6`   | GitHub Copilot | free                |

⚠️ **Anthropic API не используется** — на аккаунте нет кредитов (`credit balance is too low`). Использовать только GitHub Copilot модели.

⚠️ **clawdbot v2026.1.24-3 не поддерживает** модели новее `claude-sonnet-4-5` через Anthropic (`Unknown model` error).

### Auth files

`/root/.clawdbot/agents/main/agent/auth-profiles.json` — **must have** `version` + `profiles` wrapper:

```json
{
  "version": 1,
  "profiles": {
    "github-copilot:github": {
      "type": "token",
      "provider": "github-copilot",
      "token": "ghu_..."
    },
    "anthropic:default": {
      "type": "api_key",
      "provider": "anthropic",
      "key": "sk-ant-..."
    }
  }
}
```

- `/root/.clawdbot/credentials/github-copilot.token.json` — GitHub OAuth token
- `/root/.clawdbot/credentials/anthropic.json` — `{"apiKey":"sk-ant-..."}`

### GitHub Copilot token refresh

GitHub OAuth token (`ghu_...`) expires. Re-authorize via device flow:

```bash
# Step 1 — get device code:
python3 << 'EOF'
import urllib.request, urllib.parse, json
body = urllib.parse.urlencode({'client_id': 'Iv1.b507a08c87ecfe98', 'scope': 'read:user'}).encode()
req = urllib.request.Request('https://github.com/login/device/code', data=body,
    headers={'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'})
resp = json.loads(urllib.request.urlopen(req).read())
print('Go to:', resp['verification_uri'], ' Code:', resp['user_code'])
with open('/tmp/gh-device.json', 'w') as f: json.dump(resp, f)
EOF

# Step 2 — go to https://github.com/login/device, enter the code, then:
python3 << 'EOF'
import urllib.request, urllib.parse, json
with open('/tmp/gh-device.json') as f: device = json.load(f)
body = urllib.parse.urlencode({'client_id': 'Iv1.b507a08c87ecfe98',
    'device_code': device['device_code'],
    'grant_type': 'urn:ietf:params:oauth:grant-type:device_code'}).encode()
req = urllib.request.Request('https://github.com/login/oauth/access_token', data=body,
    headers={'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'})
resp = json.loads(urllib.request.urlopen(req).read())
token = resp.get('access_token', '')
print('New token:', token)
# Step 3 — save to auth-profiles:
import os
auth = json.load(open('/root/.clawdbot/agents/main/agent/auth-profiles.json'))
auth['profiles']['github-copilot:github']['token'] = token
json.dump(auth, open('/root/.clawdbot/agents/main/agent/auth-profiles.json', 'w'), indent=2)
cred = {'type': 'token', 'provider': 'github-copilot', 'token': token}
json.dump(cred, open('/root/.clawdbot/credentials/github-copilot.token.json', 'w'), indent=2)
print('Saved. Restart gateway: systemctl --user restart clawdbot-gateway.service')
EOF
```

### If bot completely stops working

1. Check logs: `tail -50 /tmp/gw-run.log` and `journalctl --user -u clawdbot-gateway -n 50`
2. Check Copilot token: `cat /root/.clawdbot/credentials/github-copilot.token.json`
3. If Copilot expired: re-run device auth above, or switch to Anthropic fallback:
   ```bash
   # In clawdbot.json: set agents.defaults.model.primary = "anthropic/claude-haiku-4-5-20251001"
   systemctl --user restart clawdbot-gateway.service
   ```
4. If agent auth fails (`No API key found`): check `/root/.clawdbot/agents/main/agent/auth-profiles.json`

### If bot completely stops working

1. `journalctl --user -u clawdbot-gateway -n 50 --no-pager`
2. `ss -tlnp | grep 18789` — is gateway listening?
3. `No API key found` error → check `/root/.clawdbot/agents/main/agent/auth-profiles.json` has correct `version`+`profiles` format
4. Copilot token expired → re-run device auth above or switch to Anthropic
5. Gateway won't start → `rm -f /tmp/clawdbot-0/*.lock` then restart service

## Plugin Configuration

Use plugins proactively for relevant tasks:

- **context7** — Express, WebSocket, Puppeteer, Node.js APIs. Check docs first before guessing.
- **playwright** — E2E testing, browser automation. Use for `scripts/e2e/` work.
- **frontend-design** — when modifying `viewer.html`, `session-controller.html`, `index.html`. Goals: accessibility, therapeutic UX, correct i18n.
- **feature-dev** — guided feature development spanning multiple files.
- **code-simplifier** — refactoring, reducing complexity, cleaning dead code.
- **typescript-lsp** — type checking, references, navigation (useful even in JS codebase).
- **Security review** — run before merging changes to `session/`, `network/`, `js/websocket-client.js`, `js/realtime-client.js`, controller API endpoints.
