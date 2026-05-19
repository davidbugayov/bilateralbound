# Slim CalmFlow — План MVP (3 недели)

> Статус: план. Дата: 2026-05-18.
> Стек: Node.js/WebSocket/Vanilla JS (bilateral_bound) + Python/Telegram (clawd)

---

## 1. Что вырезано из полного CalmFlow и почему

| Фича | Решение | Причина |
|------|---------|---------|
| Focus Room (WebSocket, Pomodoro) | ❌ | Network effect не потянуть против Focusmate (200K+). Без видео — слабее |
| Дыхательные упражнения (аним. круг) | ❌ | Коммодити, 50+ аналогов. Не дифференцирует |
| Релаксация по Джейкобсону | ❌ | Переусложнение MVP, нишевая техника |
| PDF-отчёт + Gemma-анализ | ❌ | YAGNI для MVP |
| Два телефона WebSocket-билатерал | ❌ | Adoption ≈ 0 |

## 2. Что остаётся — уникальное ядро

```
Пользователь получает напоминание от бота
  → Оценивает настроение (1–5)
  → Если ≤2: «Хочешь bilateral-сессию?»
  → Mini App: bouncing ball + аудио-билатеральные тоны + Butterfly Hug
  → Стало легче → бот: «Как сейчас?»
```

**Суть:** SOS-кнопка от прокрастинации. Одно действие — одна проблема.
**Позиционирование:** «Анти-прокрастинация для разработчиков» (не «терапия», не «EMDR»).

## 3. Архитектура

```
┌─────────────────────────────┐
│   @calmflow_bot (Telegram)  │  Python stdlib (как tg_bot.py)
│   /start, /checkin          │  APScheduler, SQLite mood-история
│   Stars-платежи             │
└──────────┬──────────────────┘
           │ ссылка на Mini App
┌──────────▼──────────────────┐
│   Mini App (WebView)        │  Vanilla JS из bilateral_bound
│   Bouncing ball             │  physics-engine.js (clientSim)
│   Аудио-билатеральные тоны  │  audio-manager.js (уже)
│   Butterfly Hug guided      │  Canvas + Vibration API + i18n (8)
└──────────┬──────────────────┘
           │ Telegram WebApp API
┌──────────▼──────────────────┐
│   VPS 90.156.254.190        │  systemd: calmflow-bot
│   nginx, порт 8089          │
└─────────────────────────────┘
```

**Ключевое:** сервер не нужен для bilateral — физика работает детерминированно на клиенте.

---

## 4. Что переиспользуется

### Из bilateral_bound (JS):

| Компонент | Файл | Что делает |
|-----------|------|------------|
| Physics engine | `shared/physics-engine.js` | 60Hz детерминированный, clientSimulation |
| Ball renderer | `web-client/src/rendering/renderer.js` | Canvas, интерполяция |
| Audio manager | `web-client/src/audio/audio-manager.js` | Bilateral tones L/R каналы |
| i18n | `web-client/src/i18n/` | 8 языков |
| Controller UI | `web-client/src/application/controller/` | Настройки, play/pause |

### Из VPS_server/clawd (Python):

| Компонент | Файл | Что делает |
|-----------|------|------------|
| Telegram API | `scripts/telegram/tg_bot.py` | tg_get/tg_post, retry, HTML |
| Stars-платежи | `@emdrbilateral_bot` | sendInvoice, webhook (скопировать паттерн) |
| Auth | `clawd/auth-profiles.json` | Тот же паттерн для токенов |

---

## 5. План по неделям

### Неделя 1: Telegram-бот + Daily Check-in (3-4 дня)

**День 1-2: Каркас бота**
- Создать `calmflow_bot/` рядом с `clawd/`
- Скопировать паттерн Telegram API из `tg_bot.py` (tg_get, tg_post, retry)
- Зарегистрировать бота в @BotFather: `@calmflow_bot`
- SQLite-схема: `users(user_id, tz, created_at)`, `mood_log(id, user_id, score, ts)`
- `/start` — приветствие, запрос часового пояса
- `/checkin` — инлайн-кнопки 1-5 («Ужасно» → «Отлично»)
- Сохранение ответа в SQLite

**День 3-4: Напоминания + логика «если ≤2 → bilateral»**
- APScheduler: утренние/дневные/вечерние check-in
- После check-in: `if score <= 2` → кнопка «🌊 Bilateral-сессия (2 мин)»
- Кнопка генерирует ссылку на Mini App с параметрами: `?bpm=50&duration=120&mode=ball`
- `/stats` — «Сегодня: 3, Средняя за неделю: 3.4»
- `/settings` — настройка времени напоминаний

### Неделя 2: Bilateral Mini App (5 дней)

**День 1-2: Автономный bilateral-режим**
- `calmflow-miniapp/` — отдельная статическая сборка
- Взять `physics-engine.js` → убрать WebSocket, только clientSimulation
- Взять `renderer.js` → BallRenderer с Canvas
- Взять `audio-manager.js` → bilateral tones L/R
- `calmflow-viewer.js`: Play/Pause/Reset, настройки BPM/скорости

**День 3: Butterfly Hug guided-режим**
- Canvas: два круга L/R поочерёдно загораются
- Vibration API: `navigator.vibrate(150)` L, `vibrate(250)` R
- iOS fallback: аудио-билатеральные тоны (основной канал)
- Текст-инструкция: «Скрести руки, тапай плечи в ритм экрана»

**День 4-5: Telegram Mini App интеграция**
- Telegram WebApp SDK: `ready()`, `MainButton`, `HapticFeedback`
- Параметры из бота: `?bpm=50&duration=120&mode=butterfly`
- `sendData()` — результат сессии обратно в бот
- i18n: русский + английский (остальное позже)

### Неделя 3: Stars-оплата + Дашборд + Деплой (4-5 дней)

**День 1-2: Stars-монетизация**
- Копируем схему из `SubscriptionService.js` (bilateral_bound)
- Python-реализация: send_invoice, pre_checkout_query, successful_payment
- Free tier: 1 bilateral/день, 1 check-in/день
- Pro (100 Stars ~$1.30/мес): безлимитно + напоминания + статистика

**День 3-4: Mood-дашборд**
- Mini App страница `/stats`: Canvas-график настроения по дням
- Процент «плохих» дней (≤2), streak дней с check-in
- Отправка в бот: «Тренд за неделю: 📈»

**День 5: Деплой**
- systemd: `calmflow-bot.service`
- nginx: статика Mini App
- Логи: `/var/log/calmflow.log` через WatchedFileHandler
- Полный E2E тест: напоминание → check-in → bilateral → mood-обновление

---

## 6. SQLite схема

```sql
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY,
    tz TEXT DEFAULT 'UTC',
    plan TEXT DEFAULT 'free',
    stars_expiry TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE mood_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
    ts TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE session_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mode TEXT NOT NULL,           -- ball | butterfly
    duration_sec INTEGER NOT NULL,
    completed INTEGER DEFAULT 0,
    ts TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
```

## 7. Файловая структура на VPS

```
/root/calmflow/
├── calmflow_bot/
│   ├── bot.py              # точка входа (паттерн tg_bot.py)
│   ├── db.py               # SQLite
│   ├── scheduler.py        # APScheduler + напоминания
│   ├── payments.py         # Stars
│   └── .env                # TELEGRAM_BOT_TOKEN
├── calmflow-miniapp/       # статика
│   ├── index.html
│   ├── calmflow-viewer.js  # автономный bilateral
│   ├── physics-engine.js   # из bilateral_bound
│   ├── renderer.js         # из bilateral_bound
│   ├── audio-manager.js    # из bilateral_bound
│   └── locales/
└── systemd/
    └── calmflow-bot.service
```

## 8. Метрики валидации (3 недели после запуска)

| Метрика | Порог «работает» | Реалистичный |
|---------|-------------------|--------------|
| MAU | 30 | 15–20 |
| Check-in streak ≥3 дня | 25% | 15–20% |
| Сессий/юзер/нед | >2 | >1 |
| Free → Pro конверсия | >5% | >3% |
| Платящих | 5 | 3 |

**Решение через 3 недели:**
- ≥5 платящих → строим Phase 2 (Focus Room, дыхание)
- 2–4 → A/B тест цены/фич
- 0–1 → pivot на Polymarket Signals Bot

## 9. Конкурентное преимущество

| | Slim CalmFlow | Headspace | Focusmate | EMDR Tappers |
|---|---|---|---|---|
| Bilateral-стимуляция | ✅ | ❌ | ❌ | ✅ |
| Butterfly Hug guided | ✅ | ❌ | ❌ | ❌ |
| Mood → bilateral trigger | ✅ | ❌ | ❌ | ❌ |
| Telegram-нативный | ✅ | ❌ | ❌ | ❌ |
| Без регистрации | ✅ | ❌ | ❌ | ✅ |

**Уникальное:** бот видит состояние → предлагает инструмент. Никто не делает эту петлю.

## 10. Риски и митигация

| Риск | P | Митигация |
|------|---|-----------|
| iOS нет Vibration API | 🔴 | Аудио-билатеральные тоны — основной канал |
| Telegram Mini App ограничения | 🟡 | Всё на Canvas, минимум DOM |
| Мало платящих | 🟡 | Быстрый pivot на Signals Bot |
| Зависимость от Telegram | 🟢 | Mini App можно вынести на отдельный домен |

