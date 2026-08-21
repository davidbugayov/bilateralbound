# controller Specification

## Purpose

TBD - created by archiving change decompose-controller-js. Update Purpose after archive.

## Requirements

### Requirement: Подключение существующих модулей

Все 5 неиспользуемых модулей из `application/controller/` MUST быть подключены в controller.js через их `init(deps)` интерфейс:

- `viewer-status.js` — подключён
- `ui-controls.js` — подключён
- `play-pause.js` — подключён
- `ui-sync.js` — подключён
- `fullscreen.js` — подключён

#### Scenario: Инициализация модулей

- **When** controller.js загружается
- **Then** все 5 модулей инициализируются через их `init(deps)` интерфейс и становятся доступны для вызова

### Requirement: Удаление дубликатов

Функции, дублирующие логику модулей, MUST быть удалены из controller.js.

#### Scenario: Отсутствие дублирующих определений

- **When** в controller.js ищется функция, реализованная в подключённом модуле
- **Then** она не определена инлайн в controller.js, а вызывается из модуля

### Requirement: Идентичное поведение

Все функции controller.js MUST работать без регрессий:

- Управление сессией (создание, подключение)
- Play/pause и смена направления
- Preview и fullscreen preview
- Настройки (speed, size, color, sound)
- Статус вьювера
- Уведомления и ошибки

#### Scenario: Полный цикл сессии

- **When** пользователь проходит цикл create → play → change settings → pause → fullscreen
- **Then** все функции работают без регрессий

### Requirement: Размер файла

controller.js MUST быть меньше 2000 строк после декомпозиции.

#### Scenario: Проверка размера

- **When** завершена декомпозиция
- **Then** controller.js содержит менее 2000 строк

### Requirement: ESLint

`npm run lint` MUST не добавлять новых ошибок относительно состояния до декомпозиции.

#### Scenario: Проверка линтера

- **When** выполняется `npm run lint`
- **Then** не появляется новых ошибок относительно состояния до декомпозиции
