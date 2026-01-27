# 🧠 EMDR Bilateral Platform

Профессиональная платформа для EMDR-терапии с билатеральной стимуляцией в реальном времени.

[![Version](https://img.shields.io/badge/version-2.40.0-blue.svg)](https://github.com/davidbugaev/bilateral_bound)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)

## 🚀 Новое в версии 2.40.0

### ⚡ Миграция на SSE - Снижение нагрузки на 40-60%

Проект успешно мигрирован с WebSocket на **Server-Sent Events (SSE)** с сохранением всей функциональности:

- **📉 Снижение нагрузки на сервер**: 40-60%
- **💾 Экономия памяти**: 73% (40 KB vs 150 KB на соединение)
- **🚀 Упрощенное масштабирование**: Обычный HTTP, легче балансировать
- **🔄 Автоматический reconnect**: Встроен в браузер
- **✅ Обратная совместимость**: WebSocket продолжает работать

📖 **[Полная документация миграции](docs/MIGRATION_COMPLETE.md)**

## 🌟 Возможности

- **Билатеральная стимуляция**: Визуальная, аудиальная и тактильная стимуляция
- **Режим реального времени**: SSE (по умолчанию) + WebSocket fallback
- **Раздельные интерфейсы**: Контроллер для терапевта, вьювер для клиента
- **Адаптивный дизайн**: Работает на десктопах, планшетах и смартфонах
- **PWA поддержка**: Установка как приложение на устройство
- **Многоязычность**: Русский и английский интерфейсы

## 🚀 Быстрый старт

### Требования

- Node.js >= 16.0.0
- npm >= 8.0.0

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/davidbugaev/bilateral_bound.git
cd bilateral_bound

# Установить зависимости
npm install

# Запустить сервер разработки
npm run dev
```

Приложение будет доступно по адресу `http://localhost:3000`

## 📁 Структура проекта

```
bilateral_bound/
├── packages/
│   ├── server-core/          # Backend сервер (Node.js + SSE + WebSocket)
│   │   └── server/
│   │       ├── index.js      # Точка входа
│   │       ├── network/      # SSE, WebSocket и Express
│   │       ├── session/      # Управление сессиями
│   │       │   ├── SSEManager.js        # NEW: SSE менеджер
│   │       │   ├── WebSocketManager.js  # WebSocket менеджер
│   │       │   └── StateBroadcaster.js  # Unified broadcaster
│   │       └── utils/        # Утилиты
│   └── web-client/           # Frontend клиент
│       └── public/
│           ├── index.html            # Главная страница
│           ├── session-controller.html  # Интерфейс терапевта
│           ├── viewer.html           # Интерфейс клиента
│           ├── js/           # JavaScript модули
│           │   ├── sse-client.js        # NEW: SSE клиент
│           │   ├── realtime-client.js   # NEW: Universal adapter
│           │   └── websocket-client.js  # WebSocket клиент (fallback)
│           └── css/          # Стили
├── scripts/                  # Скрипты деплоя и тестирования
│   └── load-test-sse.js      # NEW: Тест нагрузки SSE
└── docs/                     # Документация
    ├── SSE_MIGRATION_GUIDE.md     # NEW: Руководство по SSE
    ├── SSE_MIGRATION_ANALYSIS.md  # NEW: Анализ производительности
    └── MIGRATION_COMPLETE.md      # NEW: Итоги миграции
```

## 🛠 Доступные команды

### Разработка

```bash
npm run dev          # Запуск dev сервера (SSE + WebSocket)
npm start            # Запуск production сервера
npm test             # Запуск E2E тестов
```

### Тестирование нагрузки

```bash
npm run test:load:sse:10     # Тест с 10 сессиями (20 клиентов)
npm run test:load:sse:50     # Тест с 50 сессиями (100 клиентов)
npm run test:load:sse:100    # Тест с 100 сессиями (200 клиентов)
```

### Качество кода

```bash
npm run lint         # Проверка ESLint
npm run lint:fix     # Автоисправление ESLint
npm run lint:css     # Проверка стилей
npm run format       # Форматирование Prettier
npm run sonar        # Анализ SonarQube
```

### Деплой

```bash
npm run deploy:dev           # Деплой на dev.emdrbilateral.online
npm run deploy:prod          # Деплой на продакшн
npm run vps:ssh              # SSH на сервер
```

## 🌐 Окружения

### Development
- **URL**: https://dev.emdrbilateral.online
- **Ветка**: `stable-enhanced`
- **Автообновление** при push

### Production
- **URL**: https://emdrbilateral.online (международная версия)
- **URL**: https://emdrbilateral.ru (российская версия)
- **Ветка**: `stable`

## 📖 Документация

Полная документация доступна в папке [`docs/`](docs/):

- [Структура серверов](docs/SERVER_STRUCTURE.md) - Конфигурация окружений и деплой
- [VPN и подключение](docs/VPN_TROUBLESHOOTING.md) - Настройка VPN доступа
- [NPM команды](docs/NPM_COMMANDS.md) - Справочник по командам

## 🧪 Тестирование

```bash
# E2E тесты
npm test

# Тестирование API
npm run test:session
```

## 🔧 Технологии

### Backend
- **Node.js** - Серверная платформа
- **Express** - HTTP сервер
- **WebSocket (ws)** - Realtime коммуникация
- **UUID** - Генерация уникальных ID

### Frontend
- **Vanilla JavaScript** (ES6+) - Без фреймворков для максимальной производительности
- **CSS3** - Современные стили с CSS переменными
- **WebSocket API** - Клиентская часть realtime
- **LocalStorage** - Хранение настроек

### DevOps
- **systemd** - Управление сервисами на VPS
- **Nginx** - Reverse proxy и SSL
- **GitHub** - Контроль версий

### Качество кода
- **ESLint 9** - JavaScript линтер (последняя версия)
- **Stylelint** - CSS линтер
- **Prettier** - Форматтер кода
- **SonarQube** - Статический анализ и метрики
- **Husky** - Git hooks для автоматизации

## 🔍 Анализ кода с SonarQube

Проект интегрирован с SonarQube для контроля качества:

```bash
# Запустить SonarQube (Docker)
docker run -d --name sonarqube -p 9000:9000 -p 9092:9092 sonarqube:latest

# Запустить анализ
npm run sonar

# Открыть результаты
open http://localhost:9000
```

## 🤝 Вклад в проект

Приветствуются pull requests. Для крупных изменений сначала откройте issue для обсуждения.

### Workflow

1. Fork проекта
2. Создайте feature ветку (`git checkout -b feature/AmazingFeature`)
3. Commit изменений (`git commit -m 'feat: добавлена новая возможность'`)
4. Push в ветку (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📄 Лицензия

[ISC](LICENSE)

## 👤 Автор

**Bugaev David**

- GitHub: [@davidbugaev](https://github.com/davidbugaev)

---

<div align="center">

⚡ **BilateralBound v2.39.0**

Made with ❤️ for EMDR therapists

</div>
