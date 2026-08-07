## Purpose

Гарантирует, что платёжные данные, исходный код и конфигурация сервера не отдаются публично через статические маршруты Express.

## ADDED Requirements

### Requirement: Test static route SHALL NOT expose server source or data

Публичный маршрут `/test` НЕ ДОЛЖЕН раздавать содержимое каталога `server-core`. Платёжные данные (`data/subscriptions.json`), исходный код и конфигурация ДОЛЖНЫ быть недоступны через HTTP.

#### Scenario: Access to data directory via /test is denied

- **WHEN** клиент запрашивает `GET /test/data/subscriptions.json`
- **THEN** сервер возвращает HTTP 404

#### Scenario: Access to server source via /test is denied

- **WHEN** клиент запрашивает `GET /test/src/config/index.js`
- **THEN** сервер возвращает HTTP 404

### Requirement: Data directory SHALL be outside static root

Директория `data/` (содержащая `subscriptions.json`, `link-access.json`) ДОЛЖНА физически находиться вне любого статического корня, доступного через `express.static`.

#### Scenario: Data files not reachable via any static route

- **WHEN** клиент делает любой HTTP-запрос к URL, который мог бы разрешиться в файл внутри `packages/server-core/data/`
- **THEN** сервер не отдаёт содержимое файла; возвращается 404 или 403

### Requirement: Whitelist-based static file serving SHALL be used

Если функциональность раздачи тестовых/демонстрационных файлов необходима, она ДОЛЖНА быть ограничена конкретным whitelisted-каталогом (например, `packages/server-core/test/`), который гарантированно не содержит чувствительных данных.

#### Scenario: Test file from whitelisted directory is served

- **WHEN** клиент запрашивает `GET /test/demo.html`, где `demo.html` находится в whitelisted-каталоге `packages/server-core/test/`
- **THEN** сервер отдаёт файл

#### Scenario: File outside whitelisted directory is denied

- **WHEN** клиент запрашивает файл, находящийся вне разрешённого каталога (через `..` или иной путь)
- **THEN** сервер возвращает HTTP 403 или 404
