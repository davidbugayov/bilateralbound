## Purpose

Обеспечивает аутентификацию WebSocket-подключений через короткоживущие токены, выдаваемые сервером при легитимной отдаче HTML-страницы. Роль клиента (controller/viewer) верифицируется сервером, а не принимается от клиента.

## ADDED Requirements

### Requirement: WebSocket connections SHALL require a valid session token

Каждое WebSocket-подключение ДОЛЖНО предъявлять короткоживущий токен, выданный сервером. Подключения без токена или с истёкшим/некорректным токеном ДОЛЖНЫ отклоняться.

#### Scenario: Client connects with valid token

- **WHEN** клиент открывает WebSocket с query-параметром `token=<valid-session-token>`
- **THEN** сервер принимает подключение, извлекает `sessionId` и `role` из токена, и разрешает коммуникацию

#### Scenario: Client connects without token

- **WHEN** клиент открывает WebSocket без query-параметра `token`
- **THEN** сервер закрывает подключение с кодом 4001 (Unauthorized)

#### Scenario: Client connects with expired token

- **WHEN** клиент открывает WebSocket с токеном, время жизни которого истекло
- **THEN** сервер закрывает подключение с кодом 4001 (Unauthorized)

#### Scenario: Client connects with tampered token

- **WHEN** клиент открывает WebSocket с подделанным или некорректно подписанным токеном
- **THEN** сервер отклоняет подключение; проверка целостности токена (HMAC) не проходит

### Requirement: Session tokens SHALL be issued at page load

Сервер ДОЛЖЕН генерировать короткоживущий токен (время жизни не более 24 часов) при отдаче HTML-страниц контроллера (`/c/:sessionId`) и вьювера (`/s/:sessionId`). Токен ДОЛЖЕН содержать `sessionId` и `role`, быть подписанным (HMAC-SHA256).

#### Scenario: Controller page load issues token

- **WHEN** клиент запрашивает `/c/:sessionId`
- **THEN** сервер генерирует токен, содержащий `sessionId` и `role=controller`, и встраивает его в HTML (например, в data-атрибут или JavaScript-переменную)

#### Scenario: Viewer page load issues token

- **WHEN** клиент запрашивает `/s/:sessionId`
- **THEN** сервер генерирует токен, содержащий `sessionId` и `role=viewer`, и встраивает его в HTML

### Requirement: Role SHALL NOT be controllable by client

Роль (`controller` или `viewer`) ДОЛЖНА определяться исключительно сервером на основе выданного токена. Клиент НЕ ДОЛЖЕН иметь возможность изменить свою роль через query-параметр.

#### Scenario: Client attempts to override role

- **WHEN** клиент подключается с валидным токеном для `role=viewer`, но также передаёт `role=controller` в query-параметре
- **THEN** сервер игнорирует query-параметр и назначает роль из токена (`viewer`)
