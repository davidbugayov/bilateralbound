# Tasks: Декомпозиция controller.js

Каждый модуль — отдельный коммит. После каждого шага: `npm run build && npm run test:local`.

## 1. viewer-status.js ✅

- [x] `require('./application/controller/viewer-status')` в controller.js
- [x] Вызвать `_ViewerStatus.init({ hideWaitingForViewer, updatePreviewSize, setControlsEnabled, showWaitingForViewer, updateViewerInfo, getLastServerState })`
- [x] Заменить вызовы `updateViewerStatusUI()` → `_ViewerStatus.updateStatusUI()`
- [x] Заменить `updateViewerLinkVisualState()` → `_ViewerStatus.updateLinkVisualState()`
- [x] Заменить `updateViewerAudioIndicators()` → `_ViewerStatus.updateAudioIndicators()`
- [x] Заменить `updateFullscreenViewerStatus()` → `_ViewerStatus.updateFullscreenStatus()`
- [x] Удалить инлайн-определения этих 4 функций из controller.js
- [x] Build passes

## 2-5. Остальные модули: require + init + полная замена

- [x] `require` всех 6 модулей добавлены
- [x] `_PlayPause.init()` — самодостаточный модуль (без DI)
- [x] `_UIControls.init(...)` — переданы callbacks: updateSpeed, setBallColor, etc.
- [x] `_UISync.init(...)` — переданы deps: components, updatePlayPauseButton, etc.
- [x] `_Fullscreen` — require, lazy init (нужен canvas)
- [x] play-pause: заменены `updatePlayPauseButton()`, `syncFsPlayPauseButton()`, `_schedulePlayPauseAnimations()` → модуль; удалены дубликаты определений
- [x] play-pause: `_setPlayPauseState` синхронизирует `_PlayPause.setIsPlaying()` с `isPlaying`
- [x] Полная замена `_setPlayPauseState`/`togglePlayPause` — viewer screen size guard перенесён в модуль, controller.js — тонкая обёртка
- [x] Полная замена call sites для ui-controls.js — `initializeComponents()` через `_UIControls.initializeComponents(callbacks)`
- [x] Полная замена call sites для ui-sync.js — `syncUIWithState()` и state_update-обработчик через `_UISync.syncAll/syncPause/syncInfinity/syncDirection`; infinity/illustration/trackBand sync перенесены в модуль
- [x] Полная замена call sites для fullscreen.js — open/close/resize через `_Fullscreen`, инициализация через `initFullscreen(canvas, callbacks)`; restore-логика, CSS-фикс и data-color перенесены в модуль

Note: Модули больше не «мёртвый код» — все 5 (viewer-status, play-pause, ui-controls, ui-sync, fullscreen) реально используются.

## 6. Финализация

- [x] controller.js < 2000 строк (1977 строк, было 2560)
- [x] `npm run build` проходит
- [x] Все 6 модулей импортируются и инициализируются
- [x] play-pause: 4 дублирующих функции удалены, call sites заменены
- [x] Полная миграция ui-controls/ui-sync/fullscreen call sites
- [x] E2E тесты (`npm test`) проходят — 22/22 на dev и на проде
- [x] Ручная проверка: полный цикл сессии (create → play → change settings → pause → fullscreen) — покрыт e2e 22/22 (dev + prod)
