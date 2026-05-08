# 🧠 EMDR Bilateral Platform

Профессиональная платформа для EMDR-терапии с билатеральной стимуляцией в реальном времени.

[![Version](https://img.shields.io/badge/version-2.39.553-blue.svg)](https://github.com/davidbugaev/bilateral_bound)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)

## Обзор

Терапевт (controller) управляет движением шара через bilateral stimulation; пациент (viewer) наблюдает в реальном времени через WebSocket. Движение шара синхронизируется детерминированно — оба клиента запускают одинаковую физику локально, сервер передаёт только параметры (скорость, направление, цвет).

Дополнительно: Telegram бот (@emdrbilateral_bot) для подписок через Telegram Stars (75 Stars / 30 дней).

## 📡 Архитектура синхронизации

```
┌─────────────┐   WebSocket    ┌─────────────┐   WebSocket    ┌─────────────┐
│   Viewer    │ ◄───────────► │   Server    │ ◄───────────► │ Controller  │
│  (пациент)  │   state_update │  (Node.js)  │  bounce_sync  │  (терапевт) │
└─────────────┘   + bounce     └─────────────┘   (direction)  └─────────────┘
```

**Ключевой принцип**: обе стороны запускают детерминированную физику на 60Hz локально. Сервер транслирует только изменившиеся параметры (speed, direction, radius, colors, paused) 15 раз/сек. Отскоки синхронизируются через WebSocket события.

## 📁 Структура проекта

```
bilateral_bound/
├── packages/
│   ├── server-core/              # Backend (Node.js + Express + WebSocket)
│   │   └── src/
│   │       ├── controllers/      # REST API handlers
│   │       ├── network/          # WebSocket server, middleware
│   │       ├── services/         # Session, Physics, Broadcast, Subscription, Telegram bot
│   │       └── repositories/     # In-memory session storage (LRU)
│   ├── web-client/               # Frontend (Vanilla JS + webpack)
│   │   ├── src/                  # Исходники (viewer, controller, renderer, network)
│   │   └── public/               # Статика (HTML, CSS, locales, Service Worker)
│   └── shared/                   # Shared physics engine (детерминированный)
├── scripts/e2e/                  # E2E тесты (Puppeteer)
└── docs/                         # Документация
```

## 🚀 Быстрый старт

```bash
# Предварительные требования: Node.js v22+
git clone https://github.com/davidbugaev/bilateral_bound.git
cd bilateral_bound
npm install

# Запустить dev сервер (сервер + webpack watch одновременно)
npm run dev
```

Приложение: `http://localhost:3000`

## 🛠 Основные команды

```bash
npm run dev              # Dev сервер (hot-reload)
npm start                # Production сборка + запуск
npm test                 # E2E тесты
npm run lint             # ESLint
npm run format           # Prettier

# Деплой (требуется DEPLOY_PASSWORD)
npm run deploy:dev       # На dev.emdrbilateral.online
npm run deploy:prod      # На emdrbilateral.online + emdrbilateral.ru
```

## 🌐 Окружения

| Environment | URL                              | Branch   | Service                     | Port |
| ----------- | -------------------------------- | -------- | --------------------------- | ---- |
| Development | https://dev.emdrbilateral.online | `main`   | `emdrbilateral-dev`         | 3003 |
| Production  | https://emdrbilateral.online     | `stable` | `emdrbilateral-online`      | 8080 |
| Production  | https://emdrbilateral.ru         | `stable` | `emdrbilateral-ru`          | 8081 |

## Telegram Bot / Подписки

- **Бот**: [@emdrbilateral_bot](https://t.me/emdrbilateral_bot)
- **Платежи**: Telegram Stars (валюта XTR)
- **Цена**: 75 Stars за 30 дней подписки
- **Переменные**: `STARS_BOT_TOKEN` (обязательно), `STARS_PROVIDER_TOKEN` (опционально, для XTR обычно пустой)

## 🔧 Технологии

**Backend**: Node.js, Express, WebSocket (ws)
**Frontend**: Vanilla JS (ES6+), webpack, Canvas API, CSS3, Service Worker
**i18n**: 8 языков (EN, RU, DE, ES, FR, PT, JA, ZH)
**Quality**: ESLint 9, Stylelint, Prettier, E2E (Puppeteer)
**DevOps**: systemd, Nginx, Let's Encrypt, GitHub
**Payments**: Telegram Stars (XTR)
**VPN**: StrongSwan IKEv2/IPsec

## 📄 Лицензия

[ISC](LICENSE)

## 👤 Автор

**Bugaev David** — [@davidbugaev](https://github.com/davidbugaev)

---

<div align="center">
⚡ <b>BilateralBound v2.39.553</b> — Made with ❤️ for EMDR therapists
</div>
