## Purpose

Гарантирует, что операции разблокировки доступа, активации подписки и просмотра статуса подписки доступны только владельцу Telegram-аккаунта — через проверку доказательства владения (Telegram Login Widget или Mini App initData).

## ADDED Requirements

### Requirement: Unlock endpoint SHALL verify Telegram account ownership

Эндпоинт `POST /api/link-access/:sessionId/unlock` ДОЛЖЕН принимать доказательство владения Telegram-аккаунтом (подписанные `initData` или `hash` от Login Widget) вместо сырого `telegramUserId`.

#### Scenario: Unlock with valid initData

- **WHEN** клиент отправляет POST с корректно подписанными `initData` от Telegram Mini App, где `user.id` соответствует активному подписчику
- **THEN** сервер проверяет подпись, извлекает `user.id`, и разблокирует доступ для браузера

#### Scenario: Unlock with forged initData

- **WHEN** клиент отправляет POST с подделанными `initData` (некорректная подпись)
- **THEN** сервер возвращает HTTP 403 и НЕ разблокирует доступ

#### Scenario: Unlock with raw telegramUserId (legacy)

- **WHEN** клиент отправляет POST только с `telegramUserId` без `initData`/`hash`
- **THEN** сервер возвращает HTTP 400 с указанием, что требуется доказательство владения аккаунтом

### Requirement: Activate-by-telegram endpoint SHALL verify Telegram account ownership

Эндпоинт `POST /api/subscription/activate-by-telegram` ДОЛЖЕН принимать доказательство владения вместо сырого `telegramUserId`.

#### Scenario: Activate with valid proof

- **WHEN** клиент отправляет POST с подписанными данными от Telegram, где `user.id` имеет активную подписку
- **THEN** сервер проверяет подпись и линкует `customId` к этому пользователю

#### Scenario: Activate with mismatched proof

- **WHEN** клиент отправляет POST с `initData`, где `user.id` не соответствует переданному `telegramUserId`
- **THEN** сервер возвращает HTTP 403

### Requirement: Subscription status endpoint SHALL require authorization

Эндпоинт `GET /api/subscription/status/:telegramUserId` ДОЛЖЕН требовать подтверждение, что запрашивающий является владельцем аккаунта или авторизованным администратором.

#### Scenario: Owner requests own status

- **WHEN** клиент отправляет GET с валидным токеном или подписанными данными, подтверждающими владение `telegramUserId`
- **THEN** сервер возвращает полный статус подписки

#### Scenario: Unauthorized status request

- **WHEN** клиент отправляет GET без доказательства владения
- **THEN** сервер возвращает HTTP 401
