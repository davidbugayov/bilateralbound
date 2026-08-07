## 1. Критические исправления (сервер, без изменений фронта)

- [x] 1.1 Удалить публичный `/test` роут (`static_routes_controller.js:165` — `app.use('/test', express.static(...))`) и связанный `/test/:file` handler (строки 236-269)
- [x] 1.2 Переместить `data/` директорию вне статического корня — задать `dataDir` в конструкторах `SubscriptionService` и `LinkAccessService` явно (сейчас по умолчанию `../../data` относительно `services/`, что внутри `server-core/`)
- [x] 1.3 Добавить `secret_token` в `TelegramBotService.setWebhook()` — параметр `secret_token: config.subscription.WEBHOOK_SECRET` в вызов `_call('setWebhook', ...)`
- [x] 1.4 Добавить проверку `X-Telegram-Bot-Api-Secret-Token` в webhook handler (`subscriptionController.js:281`) — до обработки `update`, через `crypto.timingSafeEqual`; вернуть 401 при несовпадении
- [x] 1.5 Исключить `test-activate` из prod-сборки — обернуть в `if (config.isDev)` вместо проверки `testMode`; либо добавить проверку `process.env.NODE_ENV !== 'production'`
- [x] 1.6 Защитить `admin/set-commands` — исключить из prod аналогично 1.5, или заменить IP-проверку на общий секретный токен
- [ ] 1.7 Проверить: `curl https://emdrbilateral.online/test/data/subscriptions.json` → 404; `curl -X POST .../api/subscription/webhook` без секретного заголовка → 401

## 2. Исправление Express за прокси (сервер)

- [x] 2.1 Добавить `app.set('trust proxy', 1)` в `setupMiddleware` (`middleware.js`) — после создания app
- [x] 2.2 Исправить `express-rate-limit`: убрать `xForwardedForHeader: false`, добавить `keyGenerator: (req) => req.ip` (после trust proxy `req.ip` будет реальным IP клиента)
- [x] 2.3 Добавить `limit: '32kb'` в `express.json()` (`middleware.js:224`)
- [x] 2.4 Исправить CSRF-обход: заменить `url.includes(...)` на `req.path === ...` или `req.path.startsWith(...)` в `csrfProtection`; использовать только `req.path` (без query-string)
- [x] 2.5 Переместить `cookieParser()` до `setCsrfCookie` в цепочке middleware (`middleware.js`: строка 221 должна быть до строки 135)
- [ ] 2.6 Проверить: `curl -X POST '...?x=/reserve'` — CSRF не должен обходиться; rate-limit считает запросы per-client-IP

## 3. WebSocket-аутентификация (сервер + фронт)

- [x] 3.1 Создать утилиту `WsTokenService` в `packages/server-core/src/services/` — `generate(sessionId, role)` и `verify(token)` с HMAC-SHA256; секрет из `config` или `crypto.randomBytes(32)` при старте
- [x] 3.2 Модифицировать `registerStaticRoutes` — при отдаче `/c/:sessionId` и `/s/:sessionId` генерировать WS-токен и встраивать в HTML: `<script>window.__WS_TOKEN__ = "<token>";</script>`
- [x] 3.3 Модифицировать `webSocketServer.js:15-39` — извлекать токен из `url.searchParams.get('token')`; верифицировать через `WsTokenService.verify()`; отклонять подключения без токена/с истёкшим токеном (код 4001)
- [x] 3.4 Убрать приём роли из query-параметра `role` — брать роль только из верифицированного токена
- [x] 3.5 Обновить фронт `websocket-client.js` — читать `window.__WS_TOKEN__`, передавать в URL подключения как `?token=...`; больше не передавать `role` в query
- [ ] 3.6 Проверить: WS-подключение без токена → отклонено; с валидным токеном viewer → нельзя слать `controller_update`; реконнект работает с тем же токеном

## 4. Авторизация подписок — доказательство владения (сервер + фронт)

- [x] 4.1 Создать утилиту `TelegramAuthService` в `packages/server-core/src/services/` — `verifyInitData(initData, botToken)` для валидации подписи Telegram Mini App initData
- [x] 4.2 Модифицировать `POST /api/link-access/:sessionId/unlock` — принимать `initData` вместо `telegramUserId`; извлекать `user.id` из проверенных данных; возвращать 400 без `initData`
- [x] 4.3 Модифицировать `POST /api/subscription/activate-by-telegram` — аналогично 4.2: `initData` вместо сырого `telegramUserId`
- [x] 4.4 Модифицировать `GET /api/subscription/status/:telegramUserId` — требовать `initData` как proof of ownership (query-параметр или заголовок); возвращать 401 без него
- [x] 4.5 Обновить фронт paywall — в `paywall-overlay.js` / связанных файлах отправлять `initData` из `window.Telegram.WebApp.initData` (доступно в Mini App) или `hash` от Login Widget
- [ ] 4.6 Проверить: чужой `initData` не разблокирует доступ; валидный `initData` с активной подпиской → успешная разблокировка

## 5. Атомарная запись файлов (сервер)

- [x] 5.1 Рефакторинг `LinkAccessService._saveToDisk()` — писать в `<filePath>.tmp`, затем `fs.renameSync(tmpPath, filePath)`
- [x] 5.2 Рефакторинг `SubscriptionService._saveToDisk()` — аналогично 5.1
- [x] 5.3 Добавить дебаунс сохранения (5 секунд) в обоих сервисах — через `setTimeout`/`clearTimeout`, чтобы множественные вызовы в короткий промежуток приводили к одной записи
- [ ] 5.4 Проверить: конкурентные вызовы `markSeen`/`setUnlocked`/`activate` не портят файл; после kill -9 данные не теряются полностью (остаётся предыдущая версия)

## 6. Верификация и мониторинг

- [ ] 6.1 Написать smoke-тесты: `/test` → 404; webhook без secret → 401; WS без токена → rejected; rate-limit per-client-IP; CSRF на query-string
- [ ] 6.2 Проверить e2e: полный цикл оплаты (Telegram Mini App → webhook → активация → разблокировка → WS-сессия)
- [ ] 6.3 Ротация скомпрометированного `telegram_payment_charge_id`: проверить логи Telegram на подозрительные refund
- [x] 6.4 Задокументировать новые env-переменные: `WEBHOOK_SECRET` (обязателен в production)
