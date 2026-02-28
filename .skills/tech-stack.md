# Tech Stack & Dependencies

## Core Platform

- **Runtime**: Node.js >= 16.0.0
- **Package Manager**: npm >= 8.0.0
- **Architecture**: Monorepo (Workspaces)

## Server Core (`packages/server-core`)

- **Framework**: Express v5
- **Real-time Communication**:
  - **Primary**: Server-Sent Events (SSE) for state broadcasting (One-way Server->Client)
  - **Secondary**: WebSocket (ws) for legacy/fallback and potential bi-directional needs
- **Security**: Helmet, CORS, Express Rate Limit
- **Utils**: UUID for session tracking, dotenv for config

## Web Client (`packages/web-client`)

- **Type**: Vanilla JS (No framework)
- **Modularity**: ES Modules
- **Bundler**: Webpack
- **Communication**:
  - `sse-client.js` (EventSource)
  - `websocket-client.js` (WebSocket)
  - `realtime-client.js` (Unified Adapter)
- **Styling**: Vanilla CSS, Theme variables

## Testing & Quality

- **E2E**: Custom Node.js scripts in `scripts/e2e/`
- **Linting**: ESLint
- **Code Quality**: SonarQube Scanner
- **Formatting**: Prettier
