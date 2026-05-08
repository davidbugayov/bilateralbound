# KILOCODE.md

## Project Context

EMDR BilateralBound — web platform for EMDR therapy. Therapist (controller) manages bilateral ball movement via WebSocket; patient (viewer) observes in real time.

Source baseline:
- [`CLAUDE.md`](CLAUDE.md)
- [`.clinerules`](.clinerules)

Conflict priority:
1. [`CLAUDE.md`](CLAUDE.md)
2. [`.clinerules`](.clinerules)
3. Local clarifications in this file

## Language & Style

- Respond in the language of the user. For this project, Russian is preferred in user communication.
- Code comments must be in English.
- User-facing UI strings must go through i18n (`globalThis.i18n?.t('key') || 'English fallback'`).
- Never hardcode localized strings directly in UI.

## Hard Rules

1. Write only used code. No unused functions, imports, variables, or dead paths.
2. No over-engineering. Implement only explicitly required behavior.
3. Comment why, not what, especially around sync, physics, and WebSocket edge cases.
4. Do not create markdown reports unless explicitly requested.
5. Keep commits short and precise.

## Architecture Guardrails

- Monorepo workspace: `packages/server-core` (Node.js + Express), `packages/web-client` (Vanilla JS, webpack), `packages/shared` (physics engine).
- Real-time transport is **WebSocket** only (no SSE, no REST polling).
- **Deterministic sync**: both viewer and controller run local physics at 60Hz with identical params (speed, dirX, dirY, paused, radius, colorBall, colorBg) → identical trajectory without position relay.
- Server broadcasts parameter-only state at 15Hz using delta compression.
- **Never relay position per-frame** — causes spring-damper jitter. Correct only on fresh server events.
- Bounce events: viewer detects locally → sends `bounce` (direction only) → server relays `bounce_sync` to controller.
- Play/pause guards: `__ignoreServerPausedUntilTs` (800ms) and `__ignoreServerDirectionUntilTs` (1500ms) prevent server overriding recent user actions.
- Viewer pause animation: `seekingCenter` state with 400ms ease-out return-to-center.
- `returnToCenter: true` in controller update: skips deceleration, snaps server ball to center, viewer animates to center.

## Subscription / Telegram Bot

- Bot: `@emdrbilateral_bot`
- Payments: Telegram Stars (XTR currency, no provider_token needed)
- Price: 75 Stars / 30 days
- Webhook endpoint: `POST /api/subscription/webhook`
- Commands: /start, /status, /renew, /cancel, /autorenew
- Subscriptions tied to `telegramUserId`; custom IDs linked to users
- 8 languages supported via `bot-translations.js`

## Conventions

- i18n usage pattern: `globalThis.i18n?.t('key') || 'English fallback'`.
- Module export pattern in browser scripts: IIFE guarded by `if (typeof globalThis.ModuleName !== 'undefined')` to prevent double-load.
- Global state via `globalThis.__current` (sessionId, isPlaying, viewerConnected, etc.).
- WebSocket endpoint: `ws://host/?sessionId=:id&role=viewer|controller` — auto-reconnect, heartbeat every 25s.
- Session IDs: auto-generated 6-char UUID prefix, or custom 3-32 chars (alphanumeric/dash/underscore).
- E2E tests: Puppeteer-based, use `domcontentloaded` (not `networkidle0`).

## Sensitive Files

Do not modify without explicit instruction:
- `packages/shared/physics-engine.js` — deterministic physics; changes break viewer/controller sync
- `packages/server-core/src/network/webSocketServer.js` — WS message routing
- `packages/server-core/src/services/BroadcastService.js` — delta compression, event relay
- `packages/web-client/src/network/websocket-client.js` — client reconnection logic
- `packages/web-client/src/viewer.js` — patient-facing; therapeutic UX matters
- `.env` files

## Validation Checklist

- All key rule blocks from [`CLAUDE.md`](CLAUDE.md) are represented.
- Project-specific constraints from [`.clinerules`](.clinerules) are represented where not conflicting.
- Conflict resolution follows declared priority with [`CLAUDE.md`](CLAUDE.md) winning.
