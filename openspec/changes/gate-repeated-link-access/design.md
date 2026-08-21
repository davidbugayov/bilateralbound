# Design: Gate Repeated Link Access

## Context

См. proposal.md — Why. Текущее поведение: GET `/c/:sessionId` и `/s/:sessionId` в `static_routes_controller.js` безусловно отдают HTML (controller/viewer) через `localizationService.getLocalizedHtml`. Подписка проверяется только в `POST /api/session/:sessionId/reserve` (`subscriptionService.isCustomIdAllowed`). Подписка привязана к Telegram User ID (`_subscriptions`), сессии — in-memory LRU.

Ограничения текущей архитектуры:

- Нет логина и пользовательских аккаунтов на web-клиенте — идентификация только через cookie/браузер.
- Подписка — Telegram ID, привязка customId ↔ telegramUserId в `SubscriptionService._customIdIndex`.
- i18n single-source: строки в `src/i18n/i18n.js`, при сборке генерируются IIFE в `public/js/i18n/`.
- CSRF: double-submit cookie (`csrfToken`), JS использует `globalThis.csrfFetch`.
- Ответы `/c/`, `/s/` уже идут с no-cache заголовками (`setNoCacheHeaders`).

## Goals / Non-Goals

**Goals:**

- Первый вход по ссылке с браузера — бесплатный, дальше повторный вход без подписки — paywall.
- Проверка подписки по Telegram User ID на paywall-странице, разблокировка закрепляется за браузером.
- Владелец ссылки (активная подписка по customId) не видит paywall.
- Работает одинаково для `/c/` и `/s/` (одна ссылка = один бесплатный доступ).

**Non-Goals:**

- Не добавляем полноценные аккаунты/логин.
- Не делаем проверку по IP (выбрано cookie) и по счётчику подключений сессии.
- Не защищаем от удаления cookie (это осознанный компромисс, см. Risks).
- Не меняем механизм оплаты (Telegram Stars через бота остаётся как есть).

## Decisions

### D1: Cookie-метка браузера — случайный ID, состояние на сервере

Сервер при первом входе выдаёт cookie `bb_lk` (link-access) со случайным opaque-значением (uuid). Сервер хранит `Map<browserId, Map<sessionId, {firstSeenAt, unlockedAt, unlockedUntil}>>` в новом сервисе `LinkAccessService` (по образцу `SubscriptionService`: in-memory + JSON-персистенция в `data/`).

Почему не «весь статус в cookie»: статус «оплачено до даты» легко подделать/переписать клиенту; серверное состояние надёжнее и позволяет перепроверять истечение подписки. Почему не localStorage: сервер должен видеть метку на GET `/c/` и `/s/` (первый запрос — сервер решает, что отдать), а localStorage недоступен на сервере.

Cookie: `HttpOnly` не нужен (JS не читает), но `SameSite=Lax`, `Secure` в проде (по аналогии с `csrfToken` в middleware), `Max-Age` = 1 год. Название: `bb_lk`.

### D2: Разделение «первый вход» и «повторный вход» на уровне GET

Логика в `static_routes_controller.js` для `/c/:sessionId` и `/s/:sessionId`:

```
session = sessionService.getSession(id)
if (!session) → текущее поведение (404), cookie не выдаём
if isCustomIdAllowed(id)  // владелец ссылки, подписка активна
    → отдаём контент (пропуск paywall)
browserId = req.cookies.bb_lk
if (!browserId)
    → выдаём cookie bb_lk, отдаём контент (первый вход), записываем firstSeenAt
state = linkAccessService.get(browserId, id)
if (!state || state.unlockedUntil < now)   // первый вход или оплата истекла
    → записываем firstSeenAt, отдаём контент (первый вход)
else
    → paywall-страница
```

Важно: «повторный вход» = есть запись `state` с непротухшей оплатой → контент; есть запись без оплаты → paywall. Первый вход = нет записи.

### D3: Paywall — отдельная HTML-страница с JS

Новая статическая страница `public/paywall.html` (по образцу `breathing.html`/`about.html`), отдаётся через `localizationService.getStaticLocalizedHtml('paywall.html', req)` с no-cache. Содержит:

- Кнопку на бота @emdrbilateral_bot (`https://t.me/emdrbilateral_bot`) — оплата 75⭐.
- Форму ввода Telegram User ID + подсказку `/myid` в боте.
- JS: находит sessionId из `location.pathname` (`/c/` → controller, `/s/` → viewer), при сабмите делает POST на разблокировку, при успехе `location.reload()`.

Все строки — через i18n (`data-i18n` + `src/i18n/i18n.js`), добавляем новые ключи `paywall.*` во все 8 языков. Кодогенерация IIFE — существующий скрипт `scripts/generate-i18n-iife.js`.

### D4: Эндпоинт разблокировки

`POST /api/link-access/:sessionId/unlock`, тело `{ telegramUserId }`:

1. Валидация: `sessionId` — строка (существующая сессия не обязательна для проверки подписки, но лучше проверить формат), `telegramUserId` — число.
2. `subscriptionService.isActive(telegramUserId)` — если нет, `402 { error, i18nKey: 'paywall.invalidId' }`.
3. Если есть — `linkAccessService.setUnlocked(req.cookies.bb_lk, sessionId, expiresAt)` (достаём `expiresAt` через `getStatus(telegramUserId)`), отвечаем `{ success: true }`.
4. CSRF: маршрут под double-submit (не в whitelist), клиент использует `csrfFetch`.

Примечание: `bb_lk` уже есть у браузера (paywall показывается только при повторном входе, т.е. cookie выдана). Если cookie нет (крайний случай) — создаём и выдаём, затем разблокируем.

### D5: Проверка владельца ссылки имеет приоритет

`isCustomIdAllowed(sessionId)` уже делает: `_customIdIndex.get(sessionId)` → `isActive(telegramUserId)`. Именно эта проверка пропускает paywall для владельца. Тестовый режим (`__test_`) также проходит (существующее поведение — не ломаем e2e-тесты).

### D6: Персистенция LinkAccessService

По образцу `SubscriptionService`: `data/link-access.json`. Хранить только нужное: `{ browserId: { sessionId: { firstSeenAt, unlockedUntil } } }`. При загрузке — отбрасывать записи с истёкшим `unlockedUntil` и старые `firstSeenAt` (например, > 30 дней) для контроля размера файла. Запись при изменении (не на каждый GET).

## Risks / Trade-offs

- **Удаление cookie = снова бесплатно** → Осознанный компромисс без логина. Смягчение: cookie живёт 1 год, большинство пользователей не чистит cookie. Фиксируем в README/offer как ограничение бесплатной модели.
- **Один браузер = один бесплатный доступ на ссылку**: если терапевт и пациент на одном устройстве (общий ПК), второй увидит paywall → Смягчение: владелец ссылки с подпиской не блокируется (D5); в UI paywall явно объясняет, как проверить подписку.
- **Разрастание `data/link-access.json`** → Очистка устаревших записей при загрузке и периодически (D6).
- **Сервис-воркер может кэшировать HTML** → Проверить обработку `/c/` и `/s/` в sw; если кэширует — исключить эти пути (no-cache уже стоит на HTTP-уровне, но SW может обойти).
- **Смена языка/повторный редирект после разблокировки** → После успешного unlock JS делает `location.reload()` — сервер сам отдаст контент или paywall (если истекла).
- **Race: параллельные запросы того же браузера** (вкладки) → Операции идемпотентны (get/set по ключу), гонка безвредна.
- **Новые i18n-ключи в 8 языках** → Качество перевода проверить вручную; отсутствующие ключи фолбэчат на исходный текст (проверить механизм фолбэка i18n).

## Migration Plan

1. Реализация на сервере: `LinkAccessService` + middleware/роуты → раскатывается без изменения клиента (paywall будет отдаваться как HTML).
2. Добавление `paywall.html` + i18n-ключей + JS разблокировки → клиентская часть.
3. Роллбэк: убрать проверки из `static_routes_controller.js` — вернётся текущее поведение; данные `link-access.json` можно оставить (безвредны) или удалить.
4. E2E: существующие тесты (`scripts/e2e/e2e_test.js`, `test-sync-params.js`) используют случайные сессии или `__test_`-ID — не должны ломаться; добавить проверку paywall вручную на dev-стенде.

## Open Questions

- Нужно ли показывать paywall при первом входе, если у ссылки уже истекла подписка владельца? (Сейчас: да — paywall, т.к. `isCustomIdAllowed` вернёт false. Это соответствует сценарию «Владелец без подписки».)
- Формат Telegram User ID: числовой (как в API Telegram). UI-валидация `^\d{5,}$`.
