## Context

Сервер Express работает за nginx reverse proxy, обслуживая три домена-инстанса (dev, emdrbilateral.online, emdrbilateral.ru). Платформа использует Telegram Stars для монетизации — подписки хранятся в JSON-файлах на диске. Авторизация доступа к сессиям основана на браузерной куке `bb_lk` с «первым визитом бесплатно», WebSocket использует query-параметры для идентификации сессии и роли.

См. `proposal.md` — полный список изменений.

## Goals / Non-Goals

**Goals:**
- Закрыть 3 критические уязвимости (утечка `/test`, подделка вебхука, обход localhost-защиты)
- Устранить 4 уязвимости высокого уровня (IDOR, WS без auth, клиентский paywall, ошибки Express)
- Сохранить обратную совместимость для легитимных клиентов где возможно

**Non-Goals:**
- Полная переработка архитектуры (переход на БД, микросервисы) — вне скоупа
- Перенос на общий персистентный слой между инстансами — deferred
- Ужесточение CSP — отдельная задача
- Изменение физической модели dead-reckoning — НЕ трогаем

## Decisions

### 1. Webhook authentication: secret_token в setWebhook + проверка заголовка

**Выбор**: Использовать стандартный механизм Telegram — параметр `secret_token` при регистрации вебхука и проверка заголовка `X-Telegram-Bot-Api-Secret-Token` на стороне сервера.

**Альтернативы**:
- *IP-whitelist*: ненадёжно, IP Telegram могут меняться
- *Подпись тела запроса*: избыточно для нашего случая, Telegram сам рекомендует secret_token

**Реализация**:
- `TelegramBotService.setWebhook()`: добавить `secret_token: config.subscription.WEBHOOK_SECRET`
- `subscriptionController.js` webhook handler: перед обработкой `update` проверить `req.headers['x-telegram-bot-api-secret-token'] === WEBHOOK_SECRET` (через `crypto.timingSafeEqual`)
- Требуется ре-регистрация вебхука при деплое (setWebhook вызывается при старте)

### 2. WebSocket authentication: HMAC-подписанные токены

**Выбор**: Генерировать короткоживущий токен при отдаче HTML страницы, встраивать в HTML как `window.__WS_TOKEN__`. При подключении клиент передаёт `?token=...`. Сервер верифицирует HMAC и извлекает `sessionId` + `role`.

**Формат токена**: `<sessionId>.<role>.<expiresAt>.<hmac>`, где HMAC = HMAC-SHA256(sessionId.role.expiresAt, SECRET).

**Альтернативы**:
- *JWT*: избыточно, требует библиотеку; HMAC с одним секретом проще
- *Server-side token store*: добавляет состояние, сложнее для мультиинстанс

**Влияние на фронт**: `websocket-client.js` должен читать `window.__WS_TOKEN__` и добавлять в URL подключения. Обратная совместимость: сервер сначала проверяет токен, если его нет — отклоняет (breaking change для старого фронта).

### 3. IDOR fix: Telegram initData verification

**Выбор**: Принимать `initData` строку от Telegram Mini App (или `hash` от Login Widget), валидировать подпись через HMAC-SHA256 с `WebAppData` secret key. Извлекать `user.id` из проверенных данных и использовать как `telegramUserId`.

**Альтернативы**:
- *Telegram Login Widget*: только для браузера, требует отдельный flow
- *Одноразовые коды через бота*: UX хуже, требует round-trip

**Компромисс**: На первый этап — проверка `initData` для Mini App (основной сценарий). Для веб-версии — временно разрешить передачу `hash` от Login Widget с валидацией через `bot_token`.

### 4. Localhost endpoints: удаление из prod

**Выбор**: Полностью исключить `test-activate` и `admin/set-commands` из prod-сборки через проверку `NODE_ENV`. В dev-окружении они остаются.

**Альтернативы**:
- *Shared secret token*: требует управления секретами, overhead
- *nginx internal location*: не решает проблему прямого доступа к порту

### 5. Atomic writes: tmp + rename

**Выбор**: В `LinkAccessService._saveToDisk()` и `SubscriptionService._saveToDisk()` писать сначала во временный файл (`<path>.tmp`), затем атомарно переименовывать через `fs.renameSync`. Добавить дебаунс (сохранять не чаще раза в 5 секунд).

**Альтернативы**:
- *Асинхронный writeFile*: решает блокировку event loop, но не атомарность
- *SQLite*: overkill для текущего масштаба, см. deferred improvements

## Risks / Trade-offs

- **[Breaking] WebSocket токены**: старые клиенты без поддержки токенов не смогут подключиться → решается одновременным деплоем сервера и фронта
- **[Breaking] Изменение API unlock/activate**: ломает текущий фронт paywall → фронт должен быть обновлён для отправки `initData`
- **[Operational] Ре-регистрация вебхука**: после деплоя с `secret_token` старые подписки через вебхук без токена перестанут работать → setWebhook вызывается при старте автоматически
- **[Data loss risk] Ротация charge_id**: если токен скомпрометирован, злоумышленник мог инициировать refund → необходима проверка логов Telegram на предмет несанкционированных возвратов

## Migration Plan

1. **Deploy server**: новый код с secret_token, удалённым /test, исправленным CSRF
2. **Verify webhook**: проверить логи — Telegram должен слать запросы с новым заголовком
3. **Deploy frontend**: обновлённый фронт с поддержкой WS-токенов и initData
4. **Monitor**: отслеживать 401 на вебхуке, отклонённые WS-подключения
5. **Rollback**: откат сервера на предыдущую версию; вебхук нужно ре-регистрировать без secret_token

## Open Questions

1. **Доступен ли Mini App initData на веб-версии?** Если нет — для web нужно реализовать отдельный flow через Telegram Login Widget.
2. **Нужен ли test-activate в production?** Если да — альтернативный механизм защиты (shared secret вместо IP-check).
3. **Срок жизни WS-токена**: 24 часа предложены как компромисс между безопасностью и удобством. Нужно ли короче?
