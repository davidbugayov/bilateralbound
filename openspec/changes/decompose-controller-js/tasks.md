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

## 2-5. Остальные модули: require + init + частичная замена

- [x] `require` всех 6 модулей добавлены
- [x] `_PlayPause.init()` — самодостаточный модуль (без DI)
- [x] `_UIControls.init(...)` — переданы callbacks: updateSpeed, setBallColor, etc.
- [x] `_UISync.init(...)` — переданы deps: components, updatePlayPauseButton, etc.
- [x] `_Fullscreen` — require, lazy init (нужен canvas)
- [x] play-pause: заменены `updatePlayPauseButton()`, `syncFsPlayPauseButton()`, `_schedulePlayPauseAnimations()` → модуль; удалены дубликаты определений
- [x] play-pause: `_setPlayPauseState` синхронизирует `_PlayPause.setIsPlaying()` с `isPlaying`
- [ ] Полная замена `_setPlayPauseState`/`togglePlayPause` (модуль не имеет viewer screen size guard)
- [ ] Полная замена call sites для ui-controls.js
- [ ] Полная замена call sites для ui-sync.js
- [ ] Полная замена call sites для fullscreen.js

Note: Модули больше не «мёртвый код» — импортируются и инициализируются. play-pause частично заменён.

## 6. Финализация

- [ ] Проверить: controller.js < 2000 строк (сейчас 2592, -104 строки)
- [x] `npm run build` проходит
- [x] Все 6 модулей импортируются и инициализируются
- [x] play-pause: 4 дублирующих функции удалены, call sites заменены
- [ ] Полная миграция ui-controls/ui-sync/fullscreen call sites — требует отдельных сессий
