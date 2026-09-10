# AGENTS.md

## Project

EMDR BilateralBound — web-платформа для EMDR-терапии.
Monorepo с npm workspaces: `packages/server-core`, `packages/web-client`, `packages/shared`.

## Prerequisites

Node.js v22+ (see `.nvmrc`). Install via nvm: `nvm install && nvm use`.

## Setup

```bash
npm install        # install all workspace deps
npm run dev        # dev server on port 3000
```

## Commands

```bash
npm run lint              # ESLint (flat config)
npm run lint:fix          # ESLint auto-fix
npm run lint:css         # Stylelint
npm run format           # Prettier
npm test                 # E2E tests
npm run test:local       # E2E against localhost:3000
npm run test:unit        # Unit tests
npm run build            # Production build
```

## Architecture

- `packages/server-core` — Node.js + Express + WebSocket server
- `packages/web-client` — Vanilla JS client, webpack build
- `packages/shared` — shared deterministic physics engine

## Conventions

- Ответы на русском. Code comments in English.
- i18n: edit `src/i18n/`, never edit `public/js/i18n/` directly (codegen).
- Don't touch `packages/shared/physics-engine.js`, WS routing, broadcast, reconnect logic without explicit instruction.
