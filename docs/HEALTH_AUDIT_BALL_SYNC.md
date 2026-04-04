# Health Audit: Синхронное движение мяча (Controller ↔ Viewer)

**Дата:** 2026-04-04
**Область:** Синхронизация позиции мяча между контроллером (терапевт) и вьювером (пациент)

---

## 1. Архитектура синхронизации

```
Controller (clientSimulation: true)  ←→  Server (60Hz tick, 15Hz broadcast)  ←→  Viewer (clientSimulation: true)
```

**Модель:** Оба клиента запускают идентичную локальную физику (PhysicsEngine) с одинаковыми параметрами. Сервер тикает 60Hz, рассылает `state_update` ~15Hz (каждый 4-й тик) для drift correction. Bounce events передаются мгновенно.

### Ключевые файлы
| Файл | Роль |
|------|------|
| `packages/server-core/src/services/PhysicsService.js` | Серверная оркестрация физики |
| `packages/shared/physics-engine.js` | Общий движок (client + server) |
| `packages/shared/smoothing-utils.js` | Адаптивное сглаживание |
| `packages/server-core/src/network/webSocketServer.js` | WS маршрутизация |
| `packages/web-client/src/network/websocket-client.js` | WS клиент |
| `packages/web-client/src/controller.js` | Логика контроллера |
| `packages/web-client/src/viewer.js` | Логика вьювера |

---

## 2. Оценка компонентов

### 2.1 Серверная физика (PhysicsService.js)

| Параметр | Статус | Значение |
|----------|--------|----------|
| Tick rate | ✅ | 60Hz (16.67ms) |
| Broadcast rate | ✅ | 15Hz (every 4th tick) |
| Delta compression | ✅ | Только изменённые поля |
| Shared loop | ✅ | Один setInterval на все сессии |
| Viewer guard | ✅ | Физика только при подключённом viewer |

**Замечания:** Архитектурно корректна. Shared loop предотвращает N таймеров.

### 2.2 PhysicsEngine (shared/physics-engine.js)

| Компонент | Статус | Значение |
|-----------|--------|----------|
| Spring-damper drift correction | ✅ | Stiffness=3, Damping=2 |
| Adaptive threshold | ⚠️ | 60px + speedPercent * 0.5 |
| Wall proximity skip | ✅ | Не борется с bounce у стен |
| Drift check interval | ✅ | 50ms |
| Max correction clamp | ✅ | Adaptive 5-15px |
| Seeking center animation | ✅ | 400ms ease-out (quadratic) |
| Smooth stop | ✅ | Cubic ease-out 600ms |
| Axis lock | ✅ | Горизонталь/вертикаль/диагональ |

### 2.3 WebSocket Transport

| Компонент | Статус | Значение |
|-----------|--------|----------|
| Reconnect | ✅ | 50 попыток, backoff x1.5 |
| Message coalescing | ✅ | 16ms buffer (~60fps) |
| Heartbeat | ✅ | 25s interval |
| RTT/Jitter tracking | ✅ | 20-sample rolling average |
| net_metrics event | ✅ | Adaptive smoothing trigger |

---

## 3. Найденные проблемы

### КРИТИЧЕСКИЕ

#### P0: Base drift threshold слишком велик для низких скоростей
**Файл:** `packages/shared/physics-engine.js:1253-1255`

```javascript
const baseThreshold = this.options.smoothing.driftThresholdPx || 60
const speedPercent = this.ball.speed || 30
const adaptiveThreshold = baseThreshold + speedPercent * 0.5
```

**Проблема:** На скорости 10% порог = 60 + 5 = **65px**. При ширине экрана 1920px это ~3.4% — визуально заметно. Мяч отклоняется до 65px от серверной позиции прежде чем система начнёт коррекцию.

**Рекомендация:** Уменьшить `baseThreshold` до **40px** и использовать `Math.max(60, baseThreshold + speedPercent * 0.3)` для более мягкой зависимости от скорости.

#### P0: Spring-damper использует фиксированный dt=1/60
**Файл:** `packages/shared/physics-engine.js:1286`

```javascript
const dt = 1 / 60 // Assume 60fps for stable correction
```

**Проблема:** При 120Hz мониторе коррекция вдвое медленнее ожидаемой. При скрытой вкладке (~10fps) — коррекция рывками. `maxCorrection` clamp 15px на 60fps = 900px/sec, но на 10fps = 150px/sec — недостаточно для catch-up.

**Рекомендация:** Использовать реальный `deltaTime` из render loop:
```javascript
const dt = Math.min(1/30, lastFrameTime / 1000) // cap at 30fps equivalent
```

### ВЫСОКИЕ

#### P1: Bounce sync — позиция через spring, direction мгновенно
**Файл:** `packages/web-client/src/controller.js:535-576`

**Проблема:** Позиция корректируется плавно через spring-damper (100-200ms), direction обновляется мгновенно. Мяч летит в правильном направлении из неправильной позиции, создавая визуальный артефакт.

**Рекомендация:** При `bounce_sync` с drift > 50px — мгновенный snap позиции + direction. Spring использовать только для drift < 50px где он незаметен.

#### P1: Нет bounce_ack от сервера к viewer
**Файл:** `packages/server-core/src/network/webSocketServer.js:152-176`

**Проблема:** Viewer отправляет `bounce` на сервер → сервер пересылает `bounce_sync` контроллеру. Но viewer НЕ получает подтверждения. Если сервер обработал bounce на кадр раньше (сервер 60Hz vs клиент ~60Hz но с разной фазой) — позиции рассинхронизируются.

**Рекомендация:** Сервер должен отправлять `bounce_ack` обратно viewer с серверной позицией bounce для drift correction:
```javascript
ws.send(JSON.stringify({
  type: 'bounce_ack',
  payload: { x: serverX, y: serverY, dirX, dirY, side, ts: Date.now() }
}))
```

#### P1: Smooth-utils параметры не применяются в drift correction
**Файл:** `packages/shared/smoothing-utils.js:149-159` + `physics-engine.js:1290-1291`

**Проблема:** `applyAdaptiveSmoothing` вызывает `physicsEngine.updateJitter()` и `setSmoothingOptions()`, но `_applyDriftCorrection()` использует жёсткие `stiffness=3, damping=2`, полностью игнорируя адаптивные значения из конфига.

**Рекомендация:** В `_applyDriftCorrection`:
```javascript
const sm = this.options.smoothing || {}
const stiffness = sm.stiffness || 3
const damping = sm.damping || 2
```

### СРЕДНИЕ

#### P2: Нет механизма обнаружения permanent desync

**Проблема:** Если drift > 200px сохраняется более 5 секунд (например при RTT 200ms+), spring-damper с maxCorrection 15px/кадр не может нагнать. Система не предпринимает радикальных мер.

**Рекомендация:** Добавить `desyncDetector`:
```javascript
if (drift > 150 && driftDurationMs > 3000) {
  // Hard snap — телепортируем к серверной позиции
  this.ball.x = this._lastServerPos.x
  this.ball.y = this._lastServerPos.y
  this._springState.active = false
}
```

#### P2: Coalescing может терять paused при быстрой смене скорости

**Файл:** `packages/web-client/src/network/websocket-client.js:144-165`

За 16ms coalesce буфер хранит только последний payload. Если контроллер изменил `speed` → `paused` → `speed` за 16ms, viewer получит только последнее `speed`. Промежуточное `paused` теряется.

**Рекомендация:** Для критичных полей (`paused`, `stopped`) использовать отдельный priority path или mergить payloads.

#### P2: `__ignoreServerPausedUntilTs` не обновляется при returnToCenter

**Файл:** `packages/web-client/src/controller.js:696-705`

При `returnToCenter: true` сервер возвращает `{paused: true}`. Timestamp guard не устанавливается, серверное `paused` применится мгновенно, прерывая анимацию `seekingCenter`.

### НИЗКИЕ

| # | Проблема | Файл |
|---|----------|------|
| P3 | Stale threshold 1500ms — 7.5 broadcast циклов избыточности | physics-engine.js:1223 |
| P3 | Нет синхронизации direction mode (horizontal/vertical/diagonal) при переключении | controller.js + viewer.js |
| P3 | Physics loop на скрытой вкладке: render throttle до 10fps, но physics 60Hz — wasted CPU | controller.js:753-757 |

---

## 4. Итоговая оценка

| Категория | Оценка | Комментарий |
|-----------|--------|-------------|
| Серверная физика | ⭐⭐⭐⭐⭐ | Архитектурно корректна |
| Клиентская симуляция | ⭐⭐⭐⭐ | Хорошо, но фиксированный dt |
| Drift correction | ⭐⭐⭐⭐ | Адаптивный порог, велик baseThreshold |
| Bounce sync | ⭐⭐⭐ | Работает, но нет ack + jitter при больших drift |
| WebSocket transport | ⭐⭐⭐⭐ | Robust reconnect + coalescing + metrics |
| Smooth stop / Pause | ⭐⭐⭐⭐⭐ | Cubic ease-out + seeking center |
| Desync recovery | ⭐⭐ | Нет hard recovery механизма |
| **Общее** | **⭐⭐⭐⭐ (4/5)** | |

---

## 5. План исправлений (по приоритету)

| # | Change | Files | Effort | Impact |
|---|--------|-------|--------|--------|
| 1 | Уменьшить baseThreshold 60→40px | physics-engine.js | 5min | High |
| 2 | Real dt в _applyDriftCorrection | physics-engine.js | 15min | High |
| 3 | Применить adaptive stiffness/damping из config | physics-engine.js | 10min | Medium |
| 4 | Bounce ack сервер→viewer | webSocketServer.js + viewer.js | 30min | High |
| 5 | DesyncDetector hard snap | physics-engine.js | 20min | Medium |
| 6 | Bounce sync >50px: instant snap | controller.js | 15min | Medium |
| 7 | ignoreServerPaused при returnToCenter | controller.js | 5min | Low |
| 8 | Coalescing: merge paused+speed | websocket-client.js | 30min | Low |

---

## 6. Поток данных (для справки)

### Play
1. Therapist нажимает Play на контроллере
2. Контроллер: `POST /api/session/:id/controller/update` → `{paused: false, dirX, dirY, speed}`
3. Сервер: `PhysicsService.applyUpdates()` → обновляет ballState + PhysicsEngine
4. Сервер: 60Hz physics loop тикает, каждые 4 тика → `broadcastState()` (15Hz)
5. Viewer получает `state_update` → `applyCommand()` → локальная физика 60Hz
6. Controller preview получает `state_update` → drift correction через spring-damper

### Bounce
1. Viewer: PhysicsEngine обнаруживает bounce → `bounceCallback` → `onBounce()`
2. Viewer: `wsClient.send('bounce', {side, x, y, dirX, dirY})`
3. Сервер: пересылает `bounce_sync` только контроллеру
4. Controller: `bounce_sync` handler → spring correction позиции + мгновенный direction

### Pause
1. Therapist нажимает Pause
2. Контроллер: `POST /api/session/:id/controller/update` → `{paused: true}`
3. Сервер: если не clientSimulationOnly → `startStopping()` (smooth deceleration)
4. Сервер: broadcast `{paused: true}` → viewer `setPaused(true)` → `seekingCenter` animation
5. Viewer: 400ms ease-out к центру

### Return to Center
1. Контроллер: `{paused: true, returnToCenter: true}`
2. Сервер: `physicsEngine.returnToCenter()` → мгновенный snap к центру + pause
3. Broadcast `{paused: true, x: centerX, y: centerY}`
4. Viewer: `setPaused(true)` → `seekingCenter` (если не в центре) → 400ms animation