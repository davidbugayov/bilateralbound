# Tasks: Унификация i18n

## 1. Починить `_notifyReady()` в src/i18n/i18n.js

- [x] Заменить `getElementById('i18n-cloak')` → `querySelectorAll('#i18n-cloak').forEach(el => el.remove())` в `src/i18n/i18n.js`
- [x] Проверить: `npm run build && npm run test:local`

## 2. Создать скрипт кодогенерации

- [x] Создать `scripts/generate-i18n-iife.js`
- [x] Логика: читать `src/i18n/i18n.js`, обернуть в `(function(root) { ... })(this)`, заменить `module.exports = I18n` на `root.I18n = I18n`, убрать `require(...)`
- [x] Аналогично для `src/i18n/language-selector.js`
- [x] Писать результат в `packages/web-client/public/js/i18n/`
- [x] Проверить: diff между старыми и сгенерированными файлами — разница должна быть только в исправлениях

## 3. Интегрировать в сборку

- [x] Добавить вызов `node scripts/generate-i18n-iife.js` в `npm run build` (перед webpack)
- [x] Проверить: `npm run build` проходит без ошибок

## 4. Верификация

- [x] `npm run test:local` — E2E тесты
- [x] Ручная проверка: index.html, about.html, breathing.html — переключение языков работает
- [x] Ручная проверка: viewer + controller SPA — переключение языков работает
- [x] ESLint: `npm run lint` без новых ошибок (60 pre-existing errors, 0 new)

## 5. Документирование

- [x] Обновить CLAUDE.md: убрать упоминание про две копии i18n, добавить информацию о кодогенерации
