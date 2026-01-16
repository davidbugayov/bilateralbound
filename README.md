# Bilateral Bound (EMDR) - Профессиональная платформа двусторонней стимуляции

**Профессиональное веб-приложение для EMDR терапии с чистой архитектурой, поддержкой нескольких языков и звуковыми тиками.**

## 🎯 Ключевые функции

✅ **Модульная архитектура (DDD)** - Domain-Driven Design с чистым разделением слоёв  
✅ **Dependency Injection** - полная инверсия зависимостей для тестируемости  
✅ **Мультиязычность** - поддержка 8+ языков (en, ru, es, fr, de, pt, ja, zh)  
✅ **Звуковые тики** - синхронизированная аудиостимуляция для EMDR процесса  
✅ **HTTP-only синхронизация** - лёгкие REST запросы для настроек, локальная физика на клиенте
✅ **Code Quality** - устранены Code Smells (65→0) и дублирование (3045→<500 строк)
✅ **⚡ Оптимизированная загрузка** - preload для JS, dns-prefetch, время загрузки < 1s

## 🚀 Статус Проекта

**🟢 Stable / Production Ready**

**Последнее обновление:** 16.01.2026  
**Версия:** 2.38.20-637e8db

**Ключевые возможности:**
- ✅ **Управление из viewer** - Space для паузы/старта на viewer
- ✅ **Таймауты сессий** - автоочистка (1ч макс, 15мин при отключении, 30мин неактивности)
- ✅ **Двусторонняя синхронизация** - команды от viewer и controller синхронизируются через сервер
- ✅ **Оптимизированная загрузка** - время загрузки < 1s
- ✅ **Мультиязычность** - 8+ языков
- ✅ **Звуковые тики** - аудиостимуляция для EMDR
- ✅ **IPv6 поддержка** - корректная работа rate limiter с IPv6 адресами

---

## 🌐 Деплой и Окружения

### Production
- **URL:** https://bilateralbound.onrender.com/
- **Статус:** ✅ Stable
- **Ветка:** `main`

### Development  
- **URL:** https://dev.emdrbilateral.online
- **SSH:** `ssh root@213.139.229.44`
- **Директория:** `/var/www/emdrbilateral-dev`
- **Ветка:** `stable-enhanced`
- **PM2 Process:** `dev.emdrbilateral.online`

#### Быстрый деплой на dev:
```bash
ssh root@213.139.229.44

# Обновить код
cd /var/www/emdrbilateral-dev
git fetch origin stable-enhanced
git pull origin stable-enhanced

# Перезапустить приложение
pm2 restart dev.emdrbilateral.online

# Проверить статус
pm2 status
pm2 logs dev.emdrbilateral.online --lines 30
```

#### Полный список PM2 процессов:
- `emdrbilateral.online` - Production (prod)
- `emdrbilateral.ru` - Production RU
- `dev.emdrbilateral.online` - Development

---

## ⚠️ Очистка Browser Cache

**Если мяч не движется** - очистите кеш!  
**Chrome/Edge:** DevTools (F12) → правый клик Reload → "Empty Cache and Hard Reload"  
**Incognito:** `Ctrl+Shift+N` (Win) / `Cmd+Shift+N` (Mac)

---

## 🏗️ Архитектура

**Подробнее:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

```
┌─────────────────────────────────────────────────┐
│         Presentation (HTTP/WebSocket)           │
├─────────────────────────────────────────────────┤
│         Application (Services)                  │
├─────────────────────────────────────────────────┤
│         Domain (Entities & Value Objects)       │
├─────────────────────────────────────────────────┤
│         Infrastructure (Repos & Cache)          │
└─────────────────────────────────────────────────┘
```

### Принципы SOLID ✅

- **Single Responsibility** - каждый класс имеет одну ответственность
- **Dependency Inversion** - зависимости через DI контейнер
- **Interface Segregation** - ICacheProvider, IRepository
- **Open/Closed** - расширяемость без модификации

## 📚 Документация

- 📘 [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) - Полное описание архитектуры
- 🚀 [**QUICKSTART.md**](docs/QUICKSTART.md) - Быстрый старт для разработчиков
- ✅ [**COMPLETION_CHECKLIST.md**](docs/COMPLETION_CHECKLIST.md) - Checklist завершения
- 📋 [**CHANGES_LOG.md**](docs/CHANGES_LOG.md) - Список изменённых файлов


## 📊 Code Quality

**Статус анализа (04.01.2026):**
- ✅ **ESLint**: 0 ошибок, 0 варнингов (на 500+ файлов)
- ✅ **Jest**: 22/22 тестов пройдено
- ✅ **SonarQube**: готов к анализу (`sonar-scanner`)

```bash
# Локальный анализ кода
npm run lint          # ESLint проверка
npm run lint:fix      # Автоисправление
npm test              # Jest тесты (server-core)

# SonarQube анализ (требует локального SonarQube)
sonar-scanner -Dsonar.host.url=http://localhost:9000 -Dsonar.login=admin
```

## 🧪 Тестирование

### ⭐ Master E2E Test (Рекомендуется)
```bash
# ОДИН стабильный тест для ВСЕХ функций
npm run e2e:master                  # Локальный сервер
npm run e2e:master:dev              # Dev production (dev.emdrbilateral.online)
npm run e2e:master:production       # Production (bilateralbound.onrender.com)
```

**Master E2E Test проверяет:**
- ✅ Session creation & API health
- ✅ SSE connection establishment
- ✅ Ball movement & physics engine
- ✅ Pause/Resume functionality
- ✅ Settings synchronization (colors, sound)
- ✅ Session persistence

**Результат:** 7/7 тестов = Production Ready! 🎉

### Дополнительные специализированные тесты
```bash
npm run e2e:movement-sync       # Тест синхронизации дв��жения
npm run e2e:sse-bounce          # SSE viewer_bounce (без polling)
npm run e2e:sse-bounce:dev      # SSE на dev.emdrbilateral.online
```

### Быстрый health-check локального сервера
```bash
bash scripts/check_server.sh
```

**Результаты последнего те��тирования (13.01.2026):**
- ✅ All 22 unit tests passing
- ✅ Master E2E Test: 7/7 passed ⭐
- ✅ Physics engine determinism verified
- ✅ Ball movement and synchronization working correctly
- ✅ SSE streaming optimized with connection pooling
- ✅ Settings sync validated (colors, sound, pause)
- ✅ **Dev-сервер (dev.emdrbilateral.online):**
  - ✅ API работает корректно (START/STOP/Settings)
  - ✅ Версия: v2.44.88-ee5ad88
  - ✅ Команды START/STOP выполняются успешно
  - ✅ Настройки (speed) применяются мгновенно
  - ✅ Мяч центрируется и начинает движение корректно

**Тестовая сессия для проверки:**
```
Viewer:     https://dev.emdrbilateral.online/s/c318e0?debug=1
Controller: https://dev.emdrbilateral.online/c/c318e0?debug=1
```

**Новое (11.01.2026):** E2E тест для проверки SSE push событий `viewer_bounce`
- Проверяет что НЕТ polling к `/api/session/:id/side`
- Подтверждает что события приходят через SSE
- Защита от регрессии к polling архитектуре
- Добавлен простой тест синхронности: `scripts/e2e/test_dev_sync_simple.js`

---

## 🔧 Критическая Логика и Синхронизация

### 🎯 Архитектура Оптимизированной Синхронизации (Zero Polling)

С 04.01.2026 архитектура — **HTTP REST API + Server-Sent Events** с максимальной оптимизацией нагрузки.

### ⚡ Минимальная нагрузка на бэкенд:

| Событие | Частота | Нагрузка на сервер |
|---------|---------|-------------------|
| **SSE keep-alive** | 1 раз в 45 секунд | Минимальная (пустой пинг) |
| **Bounce** | ~1 раз в 2-5 секунд | Только при ударе о стену |
| **Settings** | По требованию | Только при изменении пользователем |
| **Commands** | По требованию | Только start/stop/center |

**Итого:** ~0.02 запроса/секунду в idle, ~0.3-0.5 запроса/секунду в активном режиме

### 🔄 Режим транспорта: HTTP + SSE

**Принцип работы:**
- **Локальный расчет движения:** Движение мяча вычисляется локально на клиенте (Controller и Viewer независимо). Оба знают скорость и направление.
- **Мягкая синхронизация (Soft Sync):** Синхронизация происходит **только при ударе мяча о стену (bounce)**.
  - Viewer отправляет отчет об ударе (`POST /bounce`) с точными координатами и направлением.
  - Controller получает это событие через SSE и плавно (через интерполяцию) подстраивает положение своего мяча под Viewer.
  - Это гарантирует, что мяч всегда находится "посередине" (синхронно) в обеих точках без постоянного сетевого трафика.
- **Поведение в паузе:** Когда движение остановлено (`paused: true`), мяч **всегда** автоматически возвращается в центр экрана.
- **Синхронизация настроек:** Изменения цвета, радиуса, скорости передаются мгновенно через **SSE push**.
- **Синхронизация сторон:** Текущая сторона удара для preview доступна через лёгкий polling.

**Почему SSE:**
- Мгновенная доставка настроек (colorBall, radius, speed) - 0ms задержка.
- Односторонний push от сервера к Viewer - минимальная нагрузка.
- Автоматический reconnect при разрыве соединения.
- Простота реализации - стандартный EventSource API.
- Нет необходимости в polling для настроек.

**REST API endpoints:**
- `PATCH /api/session/:id/settings` - атомарное обновление настроек (эмитит SSE событие).
- `POST /api/session/:id/command` - команды (start/stop/returnToCenter, эмитит SSE событие).
- `POST /api/session/:id/bounce` - отчёт о стороне и координатах от Viewer (триггер мягкой синхронизации).
- `GET /api/session/:id/side` - лёгкий polling стороны для preview.
- `GET /api/session/:id/events` - **SSE endpoint** для Viewer/Controller (real-time push).

---

## 🐛 Диагностика и Debug режим

### ✅ Проверка синхронности движения (Viewer ↔ Controller)

**Тестовая сессия для ручной проверки**: https://dev.emdrbilateral.online/s/b140c6?debug=1

**🎉 ПОСЛЕДНИЕ ИСПРАВЛЕНИЯ (11.01.2026)**:
- ✅ **Soft Sync по удару** - Controller теперь плавно подстраивается под Viewer только в моменты bounce.
- ✅ **Центрирование в паузе** - При команде stop мяч автоматически встает в центр.
- ✅ **Координаты в Bounce** - Сервер теперь принимает и транслирует `x, y` при ударе для точной синхронизации.
- ✅ **viewerConnected, controllerConnected** - возвращаются в GET /api/session/:id.
- ✅ **viewerScreenSize** - правильно сохраняется и возвращается: `{width: 1920, height: 1080}`.
- ✅ **Смена параметров** - Изменение скорости, размера, цвета и звука работает в реальном времени.

**Как проверить плавное и синхронное движение:**

1. **Откройте Viewer и Controller в двух окнах**:
   ```
   Viewer:     https://dev.emdrbilateral.online/s/<sessionId>?debug=1&debug-cat=movement,bounce
   Controller: https://dev.emdrbilateral.online/c/<sessionId>?debug=1&debug-cat=command,sync
   ```

2. **На Controller нажмите кнопку Play/Pause** (или пробел)

3. **Проверьте в консоли Viewer**:
   ```
   [CMD] START command
   [NET] ✅ Command executed: start { applied: true }
   [MOVE] Ball position update { x: 965.5, y: 543.5, vx: 1500, vy: 0 }
   [MOVE] Ball position update { x: 990.3, y: 543.5, vx: 1500, vy: 0 }
   ```

4. **Признаки правильной работы**:
   - ✅ Мяч начинает движение **сразу** после нажатия Play (< 100ms задержка)
   - ✅ Позиция меняется плавно (нет скачков > 50px за кадр)
   - ✅ На Controller preview тоже двигается синхронно
   - ✅ При ударе о стену видно `[BOUNCE] Wall hit: right` и направление меняется

5. **Признаки проблем**:
   - ❌ Мяч не начинает движение после Play
   - ❌ Позиция скачет (jitter): `x: 500 → x: 800` за один кадр
   - ❌ Controller preview замер или отстаёт > 500ms
   - ❌ После bounce направление не меняется

**Автоматический E2E тест**:
```bash
npm run test:movement-sync
# или напрямую:
BASE_URL=https://dev.emdrbilateral.online node scripts/e2e/test_movement_sync.js
```

**Результат последней проверки (05.01.2026)**:
- ✅ API работает корректно (start command → paused: false, vx: 1500)
- ✅ SSE события доставляются мгновенно (< 5ms)
- ✅ Мяч центрируется при создании сессии (x: 960, y: 540)
- ✅ Движение запускается сразу после команды start
- 🔬 E2E тест в разработке (Puppeteer physics engine access)

---

### 🎯 Новая система детального логирования (v2.45.0+)

**Включите подробное логирование добавив `?debug=1` к URL для полного понимания работы синхронизации!**

#### Быстрый старт:

```bash
# Viewer с полным debug
https://dev.emdrbilateral.online/s/<sessionId>?debug=1

# Controller с полным debug
https://dev.emdrbilateral.online/c/<sessionId>?debug=1

# Только логи движения и bounce (для отладки синхронизации)
https://dev.emdrbilateral.online/s/<sessionId>?debug=1&debug-cat=movement,bounce

# Только SSE и network (для отладки задержек)
https://dev.emdrbilateral.online/s/<sessionId>?debug=1&debug-cat=sse,network
```

---

### 📊 Доступные категории логирования

| Категория | Описание | Когда использовать |
|-----------|----------|-------------------|
| **`sync`** | Синхронизация состояний (SSE, polling) | Проверка общей синхронизации |
| **`sse`** | Server-Sent Events (real-time push) | Отладка real-time уведомлений |
| **`network`** | HTTP запросы (PATCH, POST, GET) | Проверка сетевых запросов |
| **`physics`** | Физический движок | Отладка расчётов физики |
| **`state`** | Управление состоянием | Отслеживание изменений state |
| **`command`** | Команды управления (start/stop/center) | Проверка команд |
| **`movement`** | 🔥 Движение мяча (позиция, скорость) | **Отладка проблем с движением** |
| **`bounce`** | 🔥 Столкновения со стенами (синхронизация) | **Отладка синхронизации по краям** |

---

### 🔥 Специальные сценарии отладки

#### 1. **Проблема: Мяч движется рывками (jitter)**

```bash
# Включите логи движения и физики
?debug=1&debug-cat=movement,physics

# Что искать в консоли:
[MOVE] Ball position: { x: 960, y: 540, vx: 300, vy: 200 }
[PHYSICS] Update: dt=16.67ms, speed=360.55
```

**Признаки проблемы:**
- Резкие скачки позиции (x/y меняются >50px за кадр)
- Нестабильный dt (время между кадрами)
- Конфликт скоростей между Viewer и Controller

#### 2. **Проблема: Мяч не синхронизируется по краям экрана**

```bash
# Включите логи bounce и sync
?debug=1&debug-cat=bounce,sync

# Что искать в консоли (VIEWER):
[BOUNCE] Wall hit: right { side: "right", dirX: -1, dirY: 0.5, x: 1900, y: 540 }
[BOUNCE] POST /bounce → Server { side: "right", dirX: -1, dirY: 0.5 }
[BOUNCE] ✅ Bounce synced

# Что искать в консоли (CONTROLLER):
[BOUNCE] 📥 Received from Viewer: right { side: "right", dirX: -1, dirY: 0.5 }
```

**Признаки проблемы:**
- На Viewer отправляется bounce, но Controller не получает
- Задержка между отправкой и получением >200ms
- Разные направления (dirX/dirY) на Viewer и Controller

#### 3. **Проблема: Настройки (скорость, цвет) не применяются**

```bash
# Включите логи SSE, network и command
?debug=1&debug-cat=sse,network,command

# Что искать в консоли (CONTROLLER):
[CMD] safeSend: speed { speed: 200 }
[NET] PATCH /settings { speed: 200 }
[NET] ✅ Settings patched { applied: true, seq: 1767600216637 }

# Что искать в консоли (VIEWER):
[SSE] 📡 Settings changed (SSE) { speed: 200, timestamp: 1767600216638 }
[SYNC] ✅ Settings applied { speed: 200 }
```

**Признаки проблемы:**
- SSE событие не приходит на Viewer
- Settings patched, но SYNC не видит изменений
- Задержка между PATCH и SSE >50ms

#### 4. **Проблема: Команды Start/Stop не работают**

```bash
# Включите логи command и network
?debug=1&debug-cat=command,network

# Что искать в консоли (CONTROLLER):
[CMD] START command
[NET] POST /command (action: start, seq: 1)
[NET] ✅ Command executed: start { applied: true }

# Что искать в консоли (VIEWER):
[SSE] 📡 Command received (SSE) { command: "start" }
```

---

### 📈 Пример полного лога синхронизации

#### Сценарий: Controller изменяет скорость, Viewer получает и применяет

**Controller Console:**
```
[DEBUG MODE ENABLED]
📊 Enabled categories: sync, sse, network, command

[CMD] safeSend: speed { speed: 150 }
[CMD] Sending: speed { speed: 150 }
[NET] PATCH /settings { speed: 150 }
[NET] ✅ Settings patched { applied: true, seq: 1767600300123, settings: { speed: 150 } }
```

**Viewer Console:**
```
[DEBUG MODE ENABLED]
📊 Enabled categories: sync, sse, network

[SSE] Connecting to SSE endpoint { url: "/api/session/abc123/events" }
[SSE] ✅ SSE Connected { sessionId: "abc123", timestamp: 1767600280456 }

# Через 20 секунд Controller меняет скорость
[SSE] 📡 Settings changed (SSE) { speed: 150, timestamp: 1767600300124 }
[SYNC] ✅ Settings applied { speed: 150 }
[PHYSICS] Speed updated: 150
```

**Задержка синхронизации:** 1ms (мгновенно!) ✅

---

### 🎯 Пример логов движения мяча

#### Включить: `?debug=1&debug-cat=movement,bounce`

**Viewer Console (движение и столкновение):**
```
[MOVE] Ball position update { x: 960.5, y: 540.2, vx: 300, vy: 200, speed: 360.55 }
[MOVE] Ball position update { x: 965.5, y: 543.5, vx: 300, vy: 200, speed: 360.55 }
[MOVE] Ball position update { x: 970.5, y: 546.8, vx: 300, vy: 200, speed: 360.55 }
...
# Мяч достигает правой стены
[BOUNCE] Wall hit: right { side: "right", dirX: -1, dirY: 0.5, x: 1900, y: 650 }
[BOUNCE] POST /bounce → Server { side: "right", dirX: -1, dirY: 0.5, timestamp: 1767600305789 }
[BOUNCE] ✅ Bounce synced { side: "right" }
[MOVE] Ball position update { x: 1895.5, y: 653.3, vx: -300, vy: 200, speed: 360.55 }
```

**Controller Console (получение bounce для синхронизации preview):**
```
# Polling каждые 200ms
[BOUNCE] 📥 Received from Viewer: right { side: "right", dirX: -1, dirY: 0.5, timestamp: 1767600305789 }
[SYNC] Preview bounce applied { side: "right" }
```

---

### ⚙️ Расширенные настройки

#### Фильтрация только критичных логов:
```bash
# Только ошибки и warnings (всегда включены, даже без ?debug=1)
# Автоматически отображаются в консоли

# Минимум логов - только синхронизация
?debug=1&debug-cat=sync

# Средний уровень - sync + network
?debug=1&debug-cat=sync,network

# Полный мониторин�� движения
?debug=1&debug-cat=movement,bounce,physics

# ВСЁ (по умолчанию)
?debug=1
```

#### Legacy режим (обратная совместимость):
```bash
# Старый bbdebug параметр также работает
?bbdebug=1

# Выводит упрощённые логи:
viewer.in.summary - входящие сообщения
viewer.dup - дедупликация
controller.send.* - исходящие команды
```

---

### 🚨 Типичные проблемы и решения

| Проблема | Категории логов | Что искать |
|----------|----------------|-----------|
| Мяч дергается | `movement,physics` | Скачки позиции >50px, нестабильный dt |
| Не синхронизируется на краях | `bounce,sync` | Отсутствие `📥 Received from Viewer` на Controller |
| Цвет не меняется | `sse,network` | Отсутствие `Settings changed (SSE)` на Viewer |
| Start/Stop не работает | `command,sse` | Отсутствие `Command received (SSE)` |
| Большая задержка | `network,sse` | Разница timestamp между PATCH и SSE >100ms |

---

### 💡 Советы по отладке

1. **Всегда начинайте с `?debug=1`** - полная картина
2. **Используйте фильтры** - уменьшите шум в консоли
3. **Сравнивайте timestamp** - проверяйте задержки
4. **Проверяйте оба клиента** - откройте Controller и Viewer с debug
5. **Следите за цветами**:
   - 🟦 SYNC (голубой) - синхронизация
   - 🟠 SSE (оранжевый) - real-time события
   - 🟢 NET (зелёный) - сетевые запросы
   - 🟣 PHYSICS (фиолетовый) - физика
   - 🔵 MOVE (cyan) - движение
   - 🟣 BOUNCE (magenta) - столкновения
   - 🔴 CMD (розовый) - команды

---

### Debug режим для диагностики (Legacy)

Для подробного логирования событий синхронизации добавьте параметр `bbdebug=1`:

Примеры:
- Viewer: `/s/<sessionId>?bbdebug=1`
- Controller: `/c/<sessionId>?bbdebug=1`

В консоли браузера вы увидите:
- `viewer.in.summary` - входящие сообщения от сервера
- `viewer.dup` - дедупликация повторяющихся состояний
- `controller.send.*` - исходящие команды управления

### Быстрая диагностика проблем синхронизации

1) **Включи debug режим**: открой Viewer и Controller с `?bbdebug=1`
   - Viewer: `/s/<sessionId>?bbdebug=1`
   - Controller: `/c/<sessionId>?bbdebug=1`

2) **Проверь инвариант "Viewer — источник истины":**
   - Viewer управляет физикой и позицией мяча
   - Controller отправляет только настройки (speed, colors, pause)
   - Если Controller пытается «править» позицию напрямую — это источник проблем

3) **Проверь фоновый режим**: отправь вкладку Controller в background
   - Ожидаемое: сервер логирует `controller_throttled` и включает server-side physics
   - Viewer продолжает получать плавные обновления с backend

4) **Смотри на 3 класса событий**:
   - Команды управления: `Start/Stop/Settings` (критические, должны доходить гарантированно)
   - Поток состояния: `viewer_state_update` (можно дедуплицировать)
   - Server-side physics: когда Controller в background

### Рекомендации по стабильной синхронизации

- **Фиксируйте «источник истины».** Viewer — источник истины для физики/позиции; Controller отправляет только настройки.
- **Отделяйте команды управления от стрима состояния.** Команды `Start/Stop/Settings` — критические, `viewer_state_update` — поток данных.
- **Делайте команды идемпотентными.** `setSpeed=50` вместо `increaseSpeed`, чтобы повторная отправка была безопасна.
- **Используйте дедупликацию.** Для состояний держите `seq`/`timestamp` и правило отбрасывания старых дубликатов.
- **Логируйте критические события.** `controller_throttled`, `server-side physics started/stopped` — это важные переходы состояний.
- **Разводите доменную логику и транспорт.** Транспорт (WebSocket) — в `network/`, правила валидации — в сервисах.
- **В монорепо не дублируйте протокол.** Форматы сообщений, нормализация координат (Protocol v2) — в `packages/shared`.
- **Тестируйте контракт, а не реализацию.** Корректная дедупликация по `seq`, поведение при server-side physics, нормализация координат.

---

## 🔐 VPN Сервер (Beget VPS)

### 📚 Документация

- **Быстрый старт:** [docs/BEGET_QUICK_START.md](docs/BEGET_QUICK_START.md)
- **Полная документация:** [docs/BEGET_VPN_SETUP.md](docs/BEGET_VPN_SETUP.md)
- **Автоматический скрипт:** [scripts/beget-vpn-auto-setup.sh](scripts/beget-vpn-auto-setup.sh)

### ⚡ Быстрая установка

```bash
# 1. Доступ к серверу через панель Beget: https://cp.beget.com
#    VPS → Управление → Консоль

# 2. Скопировать скрипт на сервер
scp scripts/beget-vpn-auto-setup.sh root@213.139.229.44:~/

# 3. Запустить автоматическую настройку
ssh root@213.139.229.44
chmod +x ~/beget-vpn-auto-setup.sh
sudo ~/beget-vpn-auto-setup.sh
```

### 🔐 VPN Пользователи

Только эти 9 пользователей имеют доступ:

| Пользователь | Пароль | Примечание |
|---|---|---|
| Swetlana | qs819GCAur | |
| Sergey | 6jEA5K8m1b | |
| Yulia | LmbPhkGd4q | |
| David | c4RrhQu7xi | Телефон |
| DavidMac1 | EmjXM4cttx | Mac 1 |
| DavidMac2 | o3GCWWeq7r | Mac 2 |
| Elena | EF8oHBnYBz | |
| DavidDeck | c2KxINLtB5 | Desktop |
| Bogdan | DKCFQHsgkP | |

### 🆘 Решение проблем

**SSH не работает:**
```bash
# Через консоль Beget (cp.beget.com → VPS → Консоль)
fail2ban-client unban --all
systemctl restart sshd
```

**VPN не подключается:**
```bash
systemctl restart strongswan-starter
journalctl -u strongswan-starter -n 50
```

**Нет интернета через VPN:**
```bash
IFACE=$(ip route | grep default | awk '{print $5}')
iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o $IFACE -j MASQUERADE
netfilter-persistent save
```

