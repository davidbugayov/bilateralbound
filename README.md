# 🧠 EMDR Bilateral Platform

Профессиональная платформа для EMDR-терапии с билатеральной стимуляцией в реальном времени.

[![Version](https://img.shields.io/badge/version-2.39.86-blue.svg)](https://github.com/davidbugaev/bilateral_bound)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)

## 🚀 Новое в версии 2.39.86

### ✅ Полная синхронизация Controller ↔ Viewer (E2E протестировано)

100% синхронизация между контроллером и вьювером с плавным движением:

- **🎨 Цвета**: Синхронизация цвета мяча и фона в реальном времени
- **📏 Размер мяча**: Изменение радиуса синхронизируется между устройствами
- **🎯 Направления**: Поддержка всех направлений (горизонтальное, вертикальное, диагональное)
- **⚡ Скорость**: Синхронизация скорости движения
- **🔊 Звук**: Управление звуком синхронизируется между приложениями
- **✅ E2E тестирование**: 16 тестов синхронизации через TDD

### ⚡ SSE Architecture - Снижение нагрузки на 40-60%

Архитектура на **Server-Sent Events (SSE)** с WebSocket fallback:

- **📉 Снижение нагрузки**: 40-60% меньше CPU
- **💾 Экономия памяти**: 73% (40 KB vs 150 KB на соединение)
- **🚀 Простое масштабирование**: HTTP-based, легко балансировать
- **🔄 Auto-reconnect**: Встроен в браузер
- **✅ WebSocket fallback**: Для полной обратной совместимости

## 📁 Архитектура (DDD)

```
bilateral_bound/
├── packages/
│   ├── server-core/              # Backend (Node.js + SSE/WebSocket)
│   │   └── server/
│   │       ├── index.js          # Entry point
│   │       ├── config.js         # Configuration
│   │       ├── logger.js         # Logging
│   │       ├── network/          # Infrastructure Layer
│   │       │   ├── expressApp.js # HTTP API routes
│   │       │   └── webSocketServer.js
│   │       ├── session/          # Domain Layer
│   │       │   ├── SessionManager.js    # Application Service
│   │       │   ├── SessionRepository.js # Repository Pattern
│   │       │   ├── SSEManager.js        # SSE Transport
│   │       │   ├── WebSocketManager.js  # WS Transport
│   │       │   └── StateBroadcaster.js  # Domain Service
│   │       └── utils/            # Shared utilities
│   └── web-client/               # Frontend
│       └── public/
│           ├── js/
│           │   ├── physics-engine.js    # Domain: Physics
│           │   ├── renderer.js          # Presentation
│           │   ├── sse-client.js        # Infrastructure
│           │   ├── websocket-client.js  # Infrastructure
│           │   ├── realtime-client.js   # Adapter
│           │   └── controller.js        # Application
│           └── css/
├── scripts/e2e/                  # E2E Tests
│   ├── test_sync_movement.js     # ⭐ Main sync test (16 checks)
│   ├── master_e2e_test.js        # Physics tests
│   └── test_*.js                 # Other tests
└── docs/                         # Documentation
    ├── DEPLOYMENT.md
    ├── MIGRATION_COMPLETE.md
    ├── NPM_COMMANDS.md
    └── SERVER_STRUCTURE.md
```

## 🚀 Быстрый старт

```bash
# Клонировать и установить
git clone https://github.com/davidbugaev/bilateral_bound.git
cd bilateral_bound
npm install

# Запустить dev сервер
npm run dev
```

Приложение: `http://localhost:3000`

## 🛠 Команды

### Разработка
```bash
npm run dev          # Dev server (SSE + WebSocket)
npm start            # Production server
```

### Тестирование
```bash
npm test             # Physics tests
npm run test:sync    # ⭐ Sync E2E test (local)
npm run test:sync:dev # Sync test on dev server
```

### Качество кода
```bash
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier
npm run sonar        # SonarQube analysis
```

### Деплой
```bash
npm run deploy:dev   # Deploy to dev.emdrbilateral.online
npm run deploy:prod  # Deploy to production
```

## 🌐 Окружения

| Environment | URL | Branch |
|-------------|-----|--------|
| Development | https://dev.emdrbilateral.online | `stable-enhanced` |
| Production | https://emdrbilateral.online | `stable` |

## 📖 Документация

- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Деплой на VPS
- [SERVER_STRUCTURE.md](docs/SERVER_STRUCTURE.md) - Архитектура сервера
- [NPM_COMMANDS.md](docs/NPM_COMMANDS.md) - NPM команды
- [MIGRATION_COMPLETE.md](docs/MIGRATION_COMPLETE.md) - Миграция на SSE

## 🔧 Технологии

**Backend**: Node.js, Express, SSE, WebSocket  
**Frontend**: Vanilla JS (ES6+), CSS3  
**Quality**: ESLint 9, Prettier, SonarQube  
**DevOps**: systemd, Nginx, GitHub Actions

## 📄 Лицензия

[ISC](LICENSE)

## 👤 Автор

**Bugaev David** - [@davidbugaev](https://github.com/davidbugaev)

---

<div align="center">
⚡ <b>BilateralBound v2.39.86</b> - Made with ❤️ for EMDR therapists
</div>
