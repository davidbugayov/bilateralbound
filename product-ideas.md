# CalmFlow — Продуктовый документ

> Версия: май 2026. Статус: валидация идеи.
> Стек: Node.js / WebSocket / Kotlin / Python / Telegram Bot + Stars.

---

## Проблема

Разработчики, дизайнеры и фрилансеры застревают в цикле:

```
Открыл задачу → тревога → зависание в TG/Reddit/YouTube
→ 2 часа потеряно → чувство вины → ещё тревога → повтор
```

Существующие инструменты решают только одну сторону:

| Продукт | Что решает | Что игнорирует |
|---|---|---|
| Focusmate | Прокрастинацию (видео-коворкинг) | Эмоциональную причину |
| Headspace | Тревогу (медитация) | Продуктивность |
| Todoist / Notion | Задачи | Состояние человека |

**CalmFlow = единственный продукт, который работает с причиной (тревога) и следствием (прокрастинация) одновременно.**

---

## Целевой пользователь

**Первичный:** разработчик или дизайнер, 22–35 лет, работает удалённо или фрилансит.
- Знает, что надо делать, но не может начать
- Выгорает раз в 2–3 месяца
- Уже пробовал Pomodoro, todoist, notion — не прижилось
- Английский на уровне продукта — читает

**Вторичный:** любой "знаниевый работник" с нерегулярной нагрузкой.

---

## Продукт: CalmFlow

### Четыре инструмента в одном флоу

```
[1. Напоминания]  →  [2. Daily Check-in]  →  [3. Сессия]  →  [4. Focus Room]
   Умный планер       Telegram-бот            Bilateral +      WebSocket
   (APScheduler)      (Python, готово)        Дыхание +        (Node.js, готово)
                                              Тактил (haptic)
```

### Пользовательский сценарий

```
08:30  Бот: "🌬️ Утреннее дыхание — 5 мин. Начать?"
       → Открывается breathing session (анимированный круг, вибрация-ритм)

09:00  Бот: "Как настрой? 1–5"
       Пользователь: "2"
       Бот: "Тяжело. Хочешь 2-минутную bilateral перед работой?"
       → Mini App: bilateral + тактильный режим (butterfly hug)

После сессии (спокойнее):
       Бот: "Войди в Focus Room — сейчас там 7 человек"
       → Pomodoro 25 мин, синхронный таймер, нет видео, нет звука

13:00  Бот: "☀️ Дневная пауза. Как настрой?"
       → Если ≤2: SOS-кнопка → быстрая 2-мин сессия

19:00  Вечерний check-in: "Что сделал? Как чувствуешь?"

22:00  Бот: "💤 Релаксация по Джейкобсону перед сном"
       → Guided аудио (8 мышечных групп) + вибро-ритм

Пятница: PDF-отчёт — лучшие часы, паттерны энергии, streak фокус-сессий
```

---

## Архитектура

```
┌──────────────────────┐
│   Telegram Bot       │  умные напоминания (APScheduler)
│   (Python)           │  check-in, триггеры, Stars-оплата
└──────────┬───────────┘
           │ ссылка на Mini App / Web
┌──────────▼───────────┐
│   Web / Mini App     │  bilateral + дыхание + haptic
│   (Vanilla JS)       │  focus room (WebSocket)
│   Node.js backend    │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│   Dashboard          │  mood chart, energy паттерны, Gemma-анализ
│   (Web, простой UI)  │
└──────────────────────┘
```

**Готовый код, который переиспользуется:**
- `bilateral_bound/packages/shared` — детерминированный physics engine (60Hz, bilateral)
- `bilateral_bound/packages/server-core` — WebSocket сервер, сессии, синхронизация
- `bilateral_bound/packages/web-client` — Canvas рендеринг, Service Worker, i18n (8 языков)
- `VPS_server/clawd/` — Python Telegram Bot с платежами Stars

---

## Тактильная стимуляция (Haptic Bilateral)

Один телефон — один мотор, истинного L/R нет. Работающие подходы:

### Подход A — Butterfly Hug + вибро-ритм (MVP, рекомендован)

Телефон задаёт ритм, пользователь скрещивает руки и тапает плечи поочерёдно.

```
Экран:   [◀ L]  →  пауза  →  [R ▶]  →  пауза  →  ...
Вибро:   buzz(150ms) → тишина(350ms) → buzz(150ms) → ...
```

Это Butterfly Hug — стандартная техника self-administered EMDR, клинически валидирована.

**Web / Telegram Mini App (Android Chrome):**
```javascript
function startBilateralHaptic(bpm = 50) {
  const half = 60000 / bpm / 2;
  let side = 0;
  return setInterval(() => {
    navigator.vibrate(side % 2 === 0 ? 150 : 250); // L=короткий, R=длинный
    side++;
  }, half);
}
```

**iOS:** `navigator.vibrate()` не поддерживается — fallback на аудио (билатеральные тоны в наушниках, уже есть в bilateral_bound).

### Подход B — Нативный Android (точнее, лучший UX)

Разные амплитуды вибрации = разное тактильное ощущение для L и R.

```kotlin
fun playBeat(isLeft: Boolean) {
    val vibrator = getSystemService(Vibrator::class.java)
    val effect = VibrationEffect.createOneShot(
        if (isLeft) 150L else 250L,   // длительность
        if (isLeft) 255 else 128      // амплитуда: полная / половина
    )
    vibrator.vibrate(effect)
}

fun startBilateral(bpm: Int = 50) = scope.launch {
    val half = 60_000L / bpm / 2
    var left = true
    while (isActive) {
        playBeat(left)
        delay(half)
        left = !left
    }
}
```

### Подход C — Два телефона по WebSocket (уникально, фаза 2)

Каждый телефон вибрирует только за свою сторону. Синхронизация через существующий WebSocket-сервер.

```javascript
// Сервер шлёт { side: 'L' } / { side: 'R' } поочерёдно
socket.on('beat', ({ side }) => {
  if (side === myAssignedSide) navigator.vibrate(200);
});
```

---

## Умные напоминания

Расписание задаётся пользователем через `/settings`. Бот уважает часовой пояс.

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

async def send_reminder(user_id: int, kind: str):
    texts = {
        'morning_breath': "🌬️ Утреннее дыхание — 5 мин когерентного дыхания\nГотов?",
        'checkin_day':    "☀️ Как настрой? Оцени 1–5",
        'checkin_eve':    "🌙 Вечерний check-in — 3 вопроса, 30 сек",
        'sleep_relax':    "💤 Релаксация по Джейкобсону перед сном",
    }
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("Начать →", callback_data=f"session_{kind}"),
        InlineKeyboardButton("Позже +30 мин", callback_data=f"snooze_{kind}"),
    ]])
    await bot.send_message(user_id, texts[kind], reply_markup=keyboard)

# Пример расписания пользователя
def setup_user_schedule(user_id: int, tz: str):
    scheduler.add_job(send_reminder, 'cron', hour=8,  minute=30,
                      args=[user_id, 'morning_breath'], timezone=tz)
    scheduler.add_job(send_reminder, 'cron', hour=13, minute=0,
                      args=[user_id, 'checkin_day'],   timezone=tz)
    scheduler.add_job(send_reminder, 'cron', hour=19, minute=0,
                      args=[user_id, 'checkin_eve'],   timezone=tz)
    scheduler.add_job(send_reminder, 'cron', hour=22, minute=0,
                      args=[user_id, 'sleep_relax'],   timezone=tz)
```

---

## Протоколы из доказательной базы

Фичи, основанные на рекомендациях клинического психолога:

| Протокол | Реализация | Режим |
|---|---|---|
| Когерентное дыхание (5 мин, 2×/день) | Анимированный круг "вдох 5с / выдох 5с" + вибро-пульс в ритм | Web + Android |
| Bilateral стимуляция (EMDR) | Bouncing ball (уже есть) + Butterfly Hug тактильный | Web + Android |
| Релаксация по Джейкобсону | 8 шагов, guided TTS-аудио + вибро-сигнал на каждую группу | Web + Android |
| SOS-контейнер (острая тревога) | Кнопка на главном экране → 90-сек bilateral без настроек | Web + Android |

**Позиционирование:** "Инструменты, которые рекомендуют психологи — без записи к психологу."

---

## Конкурентный анализ

| | CalmFlow | Focusmate | Headspace | Forest | EMDR Tappers |
|---|---|---|---|---|---|
| Body doubling | ✅ (без видео) | ✅ (с видео) | ❌ | ❌ | ❌ |
| EMDR / bilateral | ✅ | ❌ | ❌ | ❌ | ✅ |
| Тактильный (haptic) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Умные напоминания | ✅ | ❌ | ✅ | ✅ | ❌ |
| Daily mood tracking | ✅ | ❌ | ✅ | ❌ | ❌ |
| Когерентное дыхание | ✅ | ❌ | ✅ | ❌ | ❌ |
| Telegram-нативный | ✅ | ❌ | ❌ | ❌ | ❌ |
| Без регистрации | ✅ | ❌ | ❌ | ❌ | ✅ |
| Бесплатный вход | ✅ | ✅ | ❌ | ✅ | ✅ |

**Ключевой gap:** никто не комбинирует эмоциональную регуляцию + тактильный bilateral + accountability коворкинг + умные напоминания в одном продукте.

---

## Монетизация

| Уровень | Цена | Что включает |
|---|---|---|
| Free | $0 | 1 bilateral сессия/день, 1 breathing/день, 3 focus room сессии/нед |
| Pro | $5/мес или 250 Stars (~$3.30) | Всё без лимитов + напоминания + дашборд + PDF-отчёт + Gemma-анализ |

**Целевая метрика:** 200 Pro-пользователей = $1,000/мес — точка валидации.

---

## MVP — план 5 недель

| Неделя | Задача | Источник кода |
|---|---|---|
| **1** | Telegram-бот: check-in утро/вечер, APScheduler напоминания, SQLite | `clawd/` |
| **2** | Bilateral Mini App + Butterfly Hug тактильный режим | `bilateral_bound/web-client` + Web Vibration API |
| **3** | Breathing session: анимированный круг + вибро-ритм в ритм дыхания | новый модуль поверх Canvas |
| **4** | Focus Room: WebSocket-комната, Pomodoro-таймер синхронный | `bilateral_bound/server-core` |
| **5** | Дашборд: mood-график, PDF-отчёт, Stars-оплата | новый UI + Gemma |

**Деплой:** на существующий VPS (90.156.254.190), новый systemd-сервис `calmflow.service`.

---

## Стратегия запуска (без бюджета)

1. **Неделя 1–2 (тихий запуск):** 10 знакомых разработчиков/дизайнеров
2. **Неделя 3–4 (сообщество):**
   - ADHD Dev communities (EN)
   - Dev / design RU-каналы
   - Indie Hackers, Product Hunt Ship
3. **Месяц 2:** 50+ активных → публикация на Product Hunt
4. **Месяц 3:** retention >30% → SEO / ads

**Правило:** не тратить на маркетинг пока нет 10 платящих из своего окружения.

---

## Метрики валидации

| Метрика | Порог "идея работает" |
|---|---|
| DAU/MAU ratio | > 20% |
| Check-in streak | > 3 дней у 30% юзеров |
| Сессий на юзера / нед | > 3 |
| Конверсия Free → Pro | > 5% |
| Платящих пользователей | 10 за первый месяц |

---

## Резервные идеи (если CalmFlow не взлетит за 2 месяца)

| Идея | MVP-время | Почему проще |
|---|---|---|
| **Signals Bot** (Polymarket-сигналы) | 1–2 нед | Алго уже работает, 77.2% WR |
| **EMDR Telegram Mini App** | 2 нед | emdrbilateral.online → Mini App |
| **Micro-Journal Bot** | 1 нед | Самый простой, Stars-монетизация |

---

## Источники

- [Mental Health Apps Market — MarketsandMarkets](https://www.prnewswire.com/news-releases/mental-health-apps-market-worth-22-73-billion-by-2030--marketsandmarkets-302698061.html)
- [Body Doubling Apps 2026 — Pledgd](https://www.pledgd.com/blog/body-doubling-apps)
- [Telegram Mini Apps Monetization 2026 — Merge](https://merge.rocks/blog/telegram-mini-apps-2026-monetization-guide-how-to-earn-from-telegram-mini-apps)
- [EMDR Tappers — Bilateral Stimulation App](https://www.emdrtappers.com/)
- [BluLateral — Bluetooth EMDR](https://www.blulateral.com/)
- [Focusmate — Virtual Body Doubling](https://www.focusmate.com/)
- [Prediction Markets 2026 — Trade Ideas](https://www.trade-ideas.com/2026/04/29/prediction-markets-kalshi-polymarket/)
