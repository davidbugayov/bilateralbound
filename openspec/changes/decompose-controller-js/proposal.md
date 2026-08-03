# Proposal: Декомпозиция controller.js

## Проблема

`packages/web-client/src/controller.js` — 2696 строк, 70+ функций. Это самый большой файл в проекте.

Хуже того: в `application/controller/` уже лежат 6 извлечённых модулей (1371 строка суммарно), но **5 из них не используются** — controller.js содержит те же функции инлайн:

| Модуль | Строк | Импортируется? | Дублирует функции в controller.js |
|--------|-------|----------------|----------------------------------|
| `preview-manager.js` | 380 | ✅ Да | — |
| `fullscreen.js` | 389 | ❌ Нет | `openPreviewFullscreen`, `closePreviewFullscreen`, `resizePreviewFullscreen` |
| `play-pause.js` | 152 | ❌ Нет | `togglePlayPause`, `updatePlayPauseButton` |
| `ui-controls.js` | 202 | ❌ Нет | `initializeComponents`, `setControlsEnabled` |
| `ui-sync.js` | 134 | ❌ Нет | `syncUIWithState` |
| `viewer-status.js` | 114 | ❌ Нет | `updateViewerStatusUI`, `updateViewerLinkVisualState`, `updateViewerAudioIndicators` |

**991 строка мёртвого кода + дублирования**. Рефакторинг был начат (модули написаны качественно, с DI-паттерном `init(deps)`), но wiring в controller.js не доделан.

## Решение

Доделать рефакторинг: подключить 5 неиспользуемых модулей через их `init(deps)` интерфейс и удалить дублирующие функции из controller.js.

Шаги (от простого к сложному):
1. **viewer-status.js** — 4 функции, чистый DI
2. **ui-controls.js** — 2 функции, уже ссылается на `globalThis.components`
3. **play-pause.js** — 2 функции, зависит от глобального состояния
4. **ui-sync.js** — 1 функция + подфункции
5. **fullscreen.js** — 3 функции, зависит от canvas/рендерера

Ожидаемый результат: controller.js уменьшается с 2696 → ~1700 строк.

## Non-goals

- Не переписываем существующие модули (они уже написаны)
- Не меняем публичный API controller.js
- Не трогаем physics-engine.js (sensitive file)
- Не добавляем новые абстракции

## Критерии успеха

1. Все 5 модулей подключены через `init(deps)` в controller.js
2. Дублирующие функции удалены из controller.js
3. controller.js < 2000 строк
4. Все функции controller.js работают без регрессий
5. E2E тесты (`npm test`) проходят
6. ESLint без ошибок
