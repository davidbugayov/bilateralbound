# Spec: Controller.js Decomposition

## Requirements

### R1: Подключение существующих модулей

Все 5 неиспользуемых модулей из `application/controller/` подключены в controller.js через их `init(deps)` интерфейс:

- `viewer-status.js` — подключён
- `ui-controls.js` — подключён
- `play-pause.js` — подключён
- `ui-sync.js` — подключён
- `fullscreen.js` — подключён

### R2: Удаление дубликатов

Функции, дублирующие логику модулей, удалены из controller.js.

### R3: Идентичное поведение

Все функции controller.js работают без регрессий:
- Управление сессией (создание, подключение)
- Play/pause и смена направления
- Preview и fullscreen preview
- Настройки (speed, size, color, sound)
- Статус вьювера
- Уведомления и ошибки

### R4: Размер файла

controller.js < 2000 строк после декомпозиции.

### R5: ESLint

`npm run lint` без новых ошибок.

## Acceptance

- [ ] controller.js < 2000 строк
- [ ] Все 5 модулей импортируются и используются
- [ ] E2E тесты (`npm test`) проходят
- [ ] Ручная проверка: полный цикл сессии (create → play → change settings → pause → fullscreen)
- [ ] `npm run lint` без ошибок
