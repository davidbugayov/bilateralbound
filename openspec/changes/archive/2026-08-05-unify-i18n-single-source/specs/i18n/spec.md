# Spec: i18n Single Source

## ADDED Requirements

### Requirement: Единый источник правды

`src/i18n/i18n.js` и `src/i18n/language-selector.js` MUST быть единственными редактируемыми файлами с i18n-логикой.

#### Scenario: Правка i18n-логики
- **When** разработчик вносит изменение в i18n-логику
- **Then** он редактирует только `src/i18n/i18n.js` или `src/i18n/language-selector.js`

### Requirement: Кодогенерация при сборке

При выполнении `npm run build` MUST автоматически генерироваться IIFE-версии в `public/js/i18n/`:
- `public/js/i18n/i18n.js` — генерируется из `src/i18n/i18n.js`
- `public/js/i18n/language-selector.js` — генерируется из `src/i18n/language-selector.js`

#### Scenario: Запуск сборки
- **When** выполняется `npm run build`
- **Then** `public/js/i18n/i18n.js` и `public/js/i18n/language-selector.js` перегенерируются из исходников в `src/i18n/`

### Requirement: Идентичное поведение

Сгенерированные файлы MUST быть функционально идентичны исходным. Все 8 языков работают на статических страницах (index, about, privacy, offer, breathing) и в SPA (viewer, controller).

#### Scenario: Работа языков после сборки
- **When** пользователь переключает язык на статической странице или в SPA
- **Then** сгенерированные i18n-файлы обеспечивают переключение всех 8 языков без регрессий

### Requirement: Исправление _notifyReady

`_notifyReady()` в src MUST использовать `querySelectorAll` для удаления всех `#i18n-cloak` элементов, а не только первого.

#### Scenario: Несколько элементов #i18n-cloak
- **When** на странице присутствует несколько элементов с `#i18n-cloak`
- **Then** `_notifyReady()` удаляет их все

### Requirement: lang-preload.js не затрагивается

`public/js/i18n/lang-preload.js` MUST оставаться ручным файлом и не перегенерироваться при сборке.

#### Scenario: Сборка не перезаписывает lang-preload.js
- **When** выполняется `npm run build`
- **Then** `public/js/i18n/lang-preload.js` не перегенерируется и не изменяется кодогенератором

## Acceptance

- [x] `npm run build` генерирует public/js/i18n/*.js
- [x] E2E тесты (`npm test`) проходят
- [x] Ручная проверка: смена языка на index.html применяется корректно
- [x] Ручная проверка: смена языка в viewer/controller SPA работает
