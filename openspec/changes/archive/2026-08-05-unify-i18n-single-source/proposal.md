# Proposal: Унификация i18n — единый источник правды

## Why

Логика i18n дублируется между `src/i18n/` (webpack/SPA) и `public/js/i18n/` (статические страницы), из-за чего исправления расходятся (например, баг `_notifyReady()` был исправлен только в одной копии).

## What Changes

`src/i18n/` становится единым источником правды. Новый шаг сборки `scripts/generate-i18n-iife.js` генерирует IIFE-версии в `public/js/i18n/` при `npm run build`. Фикс `_notifyReady()` (querySelectorAll) применяется в исходнике. `lang-preload.js` остаётся ручным файлом.

## Проблема

Логика i18n дублируется в двух местах:

| Файл                                  | Строк | Использование                   |
| ------------------------------------- | ----- | ------------------------------- |
| `src/i18n/i18n.js`                    | 463   | webpack → viewer/controller SPA |
| `src/i18n/language-selector.js`       | 392   | webpack → viewer/controller SPA |
| `public/js/i18n/i18n.js`              | 467   | `<script>` в статических HTML   |
| `public/js/i18n/language-selector.js` | 390   | `<script>` в статических HTML   |

Статические страницы (index, about, privacy, offer, breathing) не проходят через webpack и загружают собственную копию i18n. Это приводит к рассинхронизации исправлений.

**Уже накопленный drift**: `_notifyReady()` в `public/js/i18n/i18n.js` использует `querySelectorAll` (правильно убирает все `#i18n-cloak`), а `src/i18n/i18n.js` использует `getElementById` (убирает только первый — баг).

## Решение

`src/i18n/` становится единственным источником правды. При сборке (`npm run build`) генерируются IIFE-версии в `public/js/i18n/`:

```
src/i18n/
  ├── i18n.js              ← правим, единственный источник
  ├── language-selector.js ← правим, единственный источник
  ├── constants.js
  ├── index.js
  └── meta-i18n.js

        │ npm run build (новый шаг: generate-i18n-iife)
        ▼

public/js/i18n/
  ├── i18n.js              ← генерируется (IIFE-обёртка)
  ├── language-selector.js ← генерируется (IIFE-обёртка)
  └── lang-preload.js      ← остаётся ручным (специфичен для статики)
```

Генерация: скрипт оборачивает модуль в `(function(root){ ... })(this)` и заменяет `module.exports` на `globalThis`.

## Non-goals

- Не трогаем структуру статических HTML-страниц
- Не меняем webpack-конфигурацию
- Не добавляем новые зависимости
- Не переводим статические страницы на webpack

## Критерии успеха

1. `src/i18n/i18n.js` и `public/js/i18n/i18n.js` идентичны по логике (различаются только обёрткой)
2. `_notifyReady()` фикс (querySelectorAll) применён в обеих копиях
3. `npm run build` генерирует public/js/i18n/\*.js из src/i18n/
4. Все 8 языков работают на статических страницах и в SPA без регрессий
5. E2E тесты (`npm test`) проходят
