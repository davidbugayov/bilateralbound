## Purpose

Обеспечивает проверку подлинности входящих запросов от Telegram Bot API на эндпоинт вебхука — только Telegram может активировать подписки через платёжную систему Stars.

## ADDED Requirements

### Requirement: Telegram webhook requests SHALL be authenticated

Система ДОЛЖНА проверять секретный токен в каждом входящем запросе на `/api/subscription/webhook`. Запросы без корректного токена ДОЛЖНЫ отклоняться с HTTP 401.

#### Scenario: Webhook receives valid secret token

- **WHEN** Telegram отправляет POST на `/api/subscription/webhook` с заголовком `X-Telegram-Bot-Api-Secret-Token`, совпадающим с `WEBHOOK_SECRET`
- **THEN** запрос обрабатывается как легитимное обновление от Telegram, возвращается HTTP 200

#### Scenario: Webhook receives invalid secret token

- **WHEN** произвольный клиент отправляет POST на `/api/subscription/webhook` без заголовка `X-Telegram-Bot-Api-Secret-Token` или с некорректным значением
- **THEN** система возвращает HTTP 401 и не обрабатывает тело запроса

#### Scenario: Webhook receives mismatched secret token

- **WHEN** запрос содержит заголовок `X-Telegram-Bot-Api-Secret-Token`, но его значение не совпадает с `WEBHOOK_SECRET`
- **THEN** система возвращает HTTP 401; сравнение ДОЛЖНО выполняться через constant-time сравнение

### Requirement: Webhook registration SHALL include secret token

При регистрации вебхука через Telegram Bot API (`setWebhook`) система ДОЛЖНА передавать параметр `secret_token` со значением, равным `WEBHOOK_SECRET` из конфигурации.

#### Scenario: Webhook registered with secret token

- **WHEN** сервер запускается и вызывает `TelegramBotService.setWebhook()`
- **THEN** в запросе к Telegram API присутствует поле `secret_token` со значением из `config.subscription.WEBHOOK_SECRET`

#### Scenario: Webhook secret token is empty or undefined

- **WHEN** `WEBHOOK_SECRET` не задан в переменных окружения
- **THEN** система логирует предупреждение и ДОЛЖНА либо сгенерировать случайный токен при запуске, либо отказаться от приёма вебхуков
