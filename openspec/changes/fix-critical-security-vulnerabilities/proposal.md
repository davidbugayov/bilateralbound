## Why

Security audit выявил три критические уязвимости (публичная выдача платёжных данных и исходников, обход paywall через подделку вебхука, неработающая localhost-защита за nginx) и четыре уязвимости высокого уровня (IDOR в подписках, WebSocket без авторизации, чисто клиентский paywall, ошибки конфигурации Express). Платформа обрабатывает реальные платежи Telegram Stars — компрометация charge-токенов и обход paywall угрожают монетизации и безопасности пользовательских данных.

## What Changes

- **Удалить публичную выдачу `/test`** — весь каталог `server-core` (включая `data/subscriptions.json` с реальными платёжными токенами) был доступен публично
- **Добавить аутентификацию Telegram-вебхука** — проверка `X-Telegram-Bot-Api-Secret-Token` через `secret_token` в `setWebhook`; ранее `WEBHOOK_SECRET` был объявлен в конфиге, но нигде не использовался
- **Убрать/защитить localhost-only эндпоинты** — `test-activate` и `admin/set-commands` полагались на `req.socket.remoteAddress`, который за nginx всегда `127.0.0.1`
- **Ужесточить авторизацию подписок** — эндпоинты `unlock`, `activate-by-telegram`, `status/:telegramUserId` требуют доказательства владения Telegram-аккаунтом вместо сырого `telegramUserId`
- **Добавить аутентификацию WebSocket** — роль и право подключения валидируются через короткоживущий session-токен, выдаваемый при легитимной отдаче страницы
- **Исправить конфигурацию Express за прокси** — `trust proxy`, `express-rate-limit` с `keyGenerator` по реальному IP клиента, лимит на `express.json()`
- **Исправить CSRF-мидлварь** — matching по `req.path` вместо подстроки URL, `cookieParser` до `setCsrfCookie`
- **Атомарная запись в файлы** — `LinkAccessService` и `SubscriptionService` используют `tmp+rename` вместо синхронной перезаписи

## Capabilities

### New Capabilities
- `webhook-authentication`: Telegram-вебхук аутентифицирует входящие запросы через проверку секретного заголовка, установленного при регистрации вебхука
- `websocket-authentication`: WebSocket-подключения аутентифицируются через короткоживущий токен, выданный сервером при отдаче HTML-страницы; роль (controller/viewer) проверяется по токену
- `subscription-authorization`: Эндпоинты управления подписками (`unlock`, `activate-by-telegram`, `status/:telegramUserId`) требуют доказательства владения Telegram-аккаунтом через проверку initData/Login Widget
- `server-hardening`: Сервер Express корректно работает за reverse proxy (trust proxy, rate-limit по реальному IP клиента), имеет лимит на размер JSON-тела, CSRF-защита без обхода по query-string
- `data-access-control`: Платёжные данные и исходный код сервера не отдаются через статические роуты; `data/` директория находится вне статического корня

### Modified Capabilities
<!-- Нет — существующие спецификации controller и i18n не затрагиваются изменениями требований -->

## Impact

- **Affected code**: `static_routes_controller.js`, `subscriptionController.js`, `TelegramBotService.js`, `webSocketServer.js`, `middleware.js`, `index.js`, `config/index.js`, `LinkAccessService.js`, `SubscriptionService.js`
- **Breaking**: `/test` и `/test/:file` роуты удаляются; `test-activate` исключается из прод-сборки; WebSocket-клиенты должны обновиться для поддержки токенов
- **API changes**: эндпоинты `unlock`, `activate-by-telegram` требуют дополнительное поле для верификации; `status/:telegramUserId` требует авторизацию
- **Infrastructure**: требуется повторная регистрация вебхука через `setWebhook` с `secret_token`
- **Risk**: данные `subscriptions.json` считаются скомпрометированными — необходима ротация `telegram_payment_charge_id`
