# 🧠 EMDR Bilateral Platform

Профессиональная платформа для EMDR-терапии с билатеральной стимуляцией в реальном времени.

[![Version](https://img.shields.io/badge/version-2.39.125-blue.svg)](https://github.com/davidbugaev/bilateral_bound)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)

## 🚀 Новое в версии 2.39.125

### ✅ Bounce Sync - Синхронизация при отскоке

- **🎯 Точная синхронизация**: Позиция мяча синхронизируется при каждом ударе о стену
- **📡 SSE transport**: Viewer отправляет позицию → Server → Controller preview
- **⚡ Мгновенная коррекция**: Preview контроллера точно следует за viewer

### 🌍 Полная мультиязычность (i18n)

- **8 языков**: EN, RU, DE, ES, FR, PT, JA, ZH
- **100% покрытие**: Все элементы UI локализованы
- **Авто-определение**: Язык браузера определяется автоматически
- **Без мерцания**: Загрузка языка до отображения контента

### ⚡ Оптимизации производительности

- **Service Worker**: Offline кэширование статических файлов
- **Lazy loading audio**: Звуки загружаются при первом включении
- **LRU сессии**: O(1) удаление старых сессий (MAX_SESSIONS=1000)
- **Gzip компрессия**: Сжатие HTTP ответов

### ✅ E2E тесты: 18/18

- Синхронизация viewer ↔ controller
- Переключение языков
- SSE соединение
- Физический движок

## 📡 Архитектура синхронизации (SSE)

```
┌─────────────┐     SSE      ┌─────────────┐     SSE      ┌─────────────┐
│   Viewer    │ ◄──────────► │   Server    │ ◄──────────► │ Controller  │
│  (клиент)   │   bounce     │  (Node.js)  │  bounce_sync │  (терапевт) │
└─────────────┘              └─────────────┘              └─────────────┘
      │                            │                            │
      │  POST /viewer/bounce       │                            │
      │  {x, y, side, dir}         │                            │
      │ ─────────────────────────► │                            │
      │                            │  SSE: bounce_sync          │
      │                            │  {x, y, side, dir}         │
      │                            │ ──────────────────────────►│
      │                            │                            │
      │                            │  Preview синхронизируется  │
```

**Транспорт**: SSE по умолчанию, WebSocket как fallback

## 📁 Структура проекта

```
bilateral_bound/
├── packages/
│   ├── server-core/              # Backend (Node.js + SSE)
│   │   └── server/
│   │       ├── network/          # Express + SSE endpoints
│   │       ├── session/          # SessionManager, SSEManager
│   │       └── utils/            # Валидация, логирование
│   └── web-client/               # Frontend
│       └── public/
│           ├── js/
│           │   ├── physics-engine.js   # Физика мяча
│           │   ├── sse-client.js       # SSE клиент
│           │   ├── i18n/               # Локализация
│           │   └── controller.js       # Контроллер
│           ├── locales/                # 8 языков
│           └── sw.js                   # Service Worker
├── scripts/e2e/                  # E2E тесты (18 тестов)
└── docs/                         # Документация
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

```bash
npm run dev          # Dev server
npm start            # Production server
npm run e2e          # E2E тесты (18 тестов)
npm run lint         # ESLint
npm run deploy:dev   # Deploy to dev
```

## 🌐 Окружения

| Environment | URL | Branch |
|-------------|-----|--------|
| Development | https://dev.emdrbilateral.online | `main` |
| Production | https://emdrbilateral.online | `stable` |

## 🔧 Технологии

**Backend**: Node.js, Express, SSE (primary), WebSocket (fallback)  
**Frontend**: Vanilla JS (ES6+), CSS3, Service Worker  
**i18n**: 8 языков, lazy loading  
**Quality**: ESLint 9, E2E tests (Puppeteer)  
**DevOps**: PM2, Nginx, GitHub

## 📄 Лицензия

[ISC](LICENSE)

## 👤 Автор

**Bugaev David** - [@davidbugaev](https://github.com/davidbugaev)

---

<div align="center">
⚡ <b>BilateralBound v2.39.125</b> - Made with ❤️ for EMDR therapists
</div>
