## Purpose

Устраняет ошибки конфигурации Express-сервера при работе за reverse proxy (nginx): корректное определение IP клиента для rate-limiting, ограничение размера JSON-тела, устранение обхода CSRF.

## ADDED Requirements

### Requirement: Express SHALL trust reverse proxy headers

Express ДОЛЖЕН быть сконфигурирован с `app.set('trust proxy', 1)` для корректного извлечения IP клиента из заголовка `X-Forwarded-For`.

#### Scenario: Rate limit applied per real client IP

- **WHEN** два разных клиента отправляют запросы через nginx
- **THEN** каждый клиент имеет собственный бакет лимита, определяемый по `X-Forwarded-For`

#### Scenario: req.ip reflects real client IP

- **WHEN** клиент с IP 203.0.113.5 отправляет запрос через nginx
- **THEN** `req.ip` возвращает `203.0.113.5`, а не IP nginx-сервера

### Requirement: Rate limiter SHALL use real client IP

Rate-limiter ДОЛЖЕН использовать реальный IP клиента (из `X-Forwarded-For`) через кастомный `keyGenerator`, а не полагаться на `req.ip` по умолчанию при `xForwardedForHeader: false`.

#### Scenario: Rate limit key is client IP

- **WHEN** запрос поступает через nginx с заголовком `X-Forwarded-For: 198.51.100.1`
- **THEN** ключ лимита вычисляется как `198.51.100.1`

### Requirement: JSON body parser SHALL have a size limit

`express.json()` ДОЛЖЕН быть сконфигурирован с ограничением размера тела запроса (`limit: '32kb'`).

#### Scenario: Request within size limit

- **WHEN** клиент отправляет POST с телом размером 16KB
- **THEN** запрос обрабатывается нормально

#### Scenario: Request exceeds size limit

- **WHEN** клиент отправляет POST с телом размером более 32KB
- **THEN** сервер возвращает HTTP 413

### Requirement: CSRF bypass by query-string SHALL be fixed

CSRF-мидлварь ДОЛЖНА проверять `req.path` (без query-строки) вместо `req.originalUrl` для определения исключённых маршрутов.

#### Scenario: CSRF blocks request with query-string containing excluded path

- **WHEN** клиент отправляет POST на `/api/session/abc/reserve?x=/api/subscription/webhook`
- **THEN** CSRF-проверка выполняется (не обходится через query-string)

#### Scenario: CSRF allows legitimate excluded path

- **WHEN** клиент отправляет POST на `/api/subscription/webhook`
- **THEN** CSRF-проверка пропускается

### Requirement: cookieParser SHALL be loaded before CSRF cookie middleware

`cookieParser()` ДОЛЖЕН быть подключён в цепочке middleware ДО обработчика `setCsrfCookie`, чтобы `req.cookies` был доступен.

#### Scenario: CSRF cookie is set correctly on first visit

- **WHEN** клиент впервые загружает страницу
- **THEN** `setCsrfCookie` видит `req.cookies` (пустой объект), генерирует токен и устанавливает куку; последующие запросы видят установленную куку и не перезаписывают её
