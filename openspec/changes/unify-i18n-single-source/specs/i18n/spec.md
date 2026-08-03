# Spec: i18n Single Source

## Requirements

### R1: Единый источник правды

`src/i18n/i18n.js` и `src/i18n/language-selector.js` — единственные редактируемые файлы с i18n-логикой.

### R2: Кодогенерация при сборке

При выполнении `npm run build` автоматически генерируются IIFE-версии в `public/js/i18n/`:
- `public/js/i18n/i18n.js` — генерируется из `src/i18n/i18n.js`
- `public/js/i18n/language-selector.js` — генерируется из `src/i18n/language-selector.js`

### R3: Идентичное поведение

Сгенерированные файлы функционально идентичны исходным. Все 8 языков работают на статических страницах (index, about, privacy, offer, breathing) и в SPA (viewer, controller).

### R4: Исправление _notifyReady

`_notifyReady()` в src использует `querySelectorAll` для удаления всех `#i18n-cloak` элементов, а не только первого.

### R5: lang-preload.js не затрагивается

`public/js/i18n/lang-preload.js` остаётся ручным файлом.

## Acceptance

- [ ] `npm run build` генерирует public/js/i18n/*.js
- [ ] E2E тесты (`npm test`) проходят
- [ ] Ручная проверка: смена языка на index.html применяется корректно
- [ ] Ручная проверка: смена языка в viewer/controller SPA работает
