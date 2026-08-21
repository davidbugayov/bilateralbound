# Design: Декомпозиция controller.js

## Context

Текущее состояние:

```
controller.js (2696 строк, 70+ функций)
  │
  ├── require('./application/controller/preview-manager') ← единственный
  │
  └── Дублирует функции из 5 неподключённых модулей:
      ├── fullscreen.js      (open/close/resize fullscreen)
      ├── play-pause.js      (toggle, update button)
      ├── ui-controls.js     (init components, set enabled)
      ├── ui-sync.js         (sync UI with state)
      └── viewer-status.js   (status UI, link, audio indicators)
```

Модули используют DI-паттерн: `init(deps)` принимает объект с зависимостями (другие функции из controller.js), что позволяет избежать циклических зависимостей.

Все модули имеют guard от двойной загрузки: `if (typeof globalThis.ModuleName !== 'undefined') return`.

## Goals / Non-Goals

**Goals:**

- Подключить 5 существующих модулей через `init(deps)`
- Удалить дублирующие функции из controller.js
- Сохранить обратную совместимость: все вызовы функций должны работать как раньше

**Non-Goals:**

- Не меняем структуру модулей (DI, exports)
- Не добавляем event bus или другие абстракции
- Не трогаем preview-manager.js (уже подключён)
- Не рефакторим оставшиеся 1700 строк controller.js дальше текущего плана

## Decisions

### 1. Порядок подключения: от простого к сложному

Каждый модуль подключается отдельным коммитом. Порядок выбран так, чтобы минимизировать каскадные изменения:

```
1. viewer-status.js  ← чистый DI, 4 функции, зависит от 3 функций из controller.js
2. ui-controls.js    ← 2 функции, уже глобально ссылается на globalThis.components
3. play-pause.js     ← 2 функции, зависит от глобального __current.isPlaying
4. ui-sync.js        ← 1 функция, но вызывает 8 под-функций (самая сильная связность)
5. fullscreen.js     ← 3 функции, зависит от canvas/рендерера (самый сложный)
```

### 2. Стратегия wiring: module-level переменная + init(deps)

Для каждого модуля в controller.js:

```javascript
// Было (инлайн):
function updateViewerStatusUI() {
  /* ... 37 строк ... */
}

// Стало (через модуль):
const _ViewerStatus = require("./application/controller/viewer-status");
_ViewerStatus.init({
  hideWaitingForViewer,
  updatePreviewSize,
  setControlsEnabled,
  updateConnectionStatus,
});
// Использование: _ViewerStatus.updateStatusUI()
```

Это сохраняет существующий паттерн `_PreviewManager`.

### 3. Обработка обратных вызовов из модулей

Модуль `fullscreen.js` имеет колбэки, которые модуль дёргает из controller.js (`getPreviewPhysicsEngine`, `centerBallInViewer`, `setDirection`, `togglePlayPause`, и т.д.). При подключении эти колбэки передаются через `initFullscreen(canvas, callbacks)` — уже реализовано в модуле.

### 4. Не трогаем `updateDirectionButtons`, `getDirectionInfo`, `updateDirectionDisplay`

Эти функции остаются в controller.js — они не дублируются в модулях и логически связаны с направлением (специфичная логика).

## Risks / Trade-offs

- **DI цепочка может сломаться если функция-зависимость удалена раньше времени** → Каждый шаг коммитится отдельно, E2E тесты после каждого шага
- **Модули ссылаются на globalThis** → Это существующий паттерн, не меняем
- **fullscreen.js зависит от canvas/рендерера** → Самый сложный шаг, делается последним, требует ручного тестирования preview

## Migration Plan

На каждый модуль — отдельный коммит:

1. `require` модуля в controller.js
2. Вызов `init(deps)` с передачей нужных функций
3. Замена вызовов инлайн-функций на модульные (по всему controller.js)
4. Удаление инлайн-определений
5. `npm run build && npm run test:local`
6. Коммит

**Rollback**: каждый коммит обратим независимо (revert одного коммита).

## Open Questions

- Нужно ли сохранять старые имена функций как алиасы для обратной совместимости? (Предположительно нет — всё внутри одного файла, глобальный API не меняется)
