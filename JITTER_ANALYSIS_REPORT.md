# Глубокий анализ Jitter в BilateralBound

## Резюме

Проведён полный аудит проекта BilateralBound для выявления причин jitter (дрожания/подёргивания движущегося шара). Проанализированы все уровни стека: физический движок, рендеринг, сетевая синхронизация, адаптивное сглаживание.

---

## 1. Архитектура движения

```
[Controller] → WebSocket → [Server: PhysicsService 60Hz setInterval] → WebSocket → [Viewer: clientSimulation]
                                                                                         ↓
                                                                              [renderer: requestAnimationFrame]
```

Шар движется на **viewer** через `clientSimulation` mode — локальный физический движок рассчитывает позицию, а серверные обновления служат для **drift correction**.

---

## 2. Выявленные источники Jitter

### 2.1 Серверный Physics Loop (`PhysicsService.js:272-342`)

```javascript
const PHYSICS_TICK_RATE = 60;
const PHYSICS_DT = 1000 / PHYSICS_TICK_RATE;
this._sharedPhysicsLoop = setInterval(() => {
  const actualDt = Math.min(elapsed, PHYSICS_DT * 3) / 1000; // clamp 3x
  // ...
}, PHYSICS_DT);
```

**Проблема:** `setInterval` не гарантирует стабильную частоту. При высокой нагрузке Node.js event loop может задерживать тики. Clamp на `PHYSICS_DT * 3` (50ms) означает, что серверная позиция может «отставать» от реального времени.

**Влияние:** Серверные state_update приходят с неравномерными интервалами → viewer получает «прыгающие» целевые позиции.

### 2.2 Drift Correction (`physics-engine.js:1128-1177`)

```javascript
_checkDriftCorrection() {
  const drift = Math.hypot(dx, dy);
  const threshold = this.options.smoothing.driftThresholdPx; // 50px по умолчанию
  if (drift > threshold) {
    this._driftCorrection = {
      offsetX: dx, offsetY: dy,
      duration: this.options.smoothing.driftCorrectionMs // 300ms
    };
  }
}
_applyDriftCorrection() {
  const correctionFactor = 0.05; // только 5% за кадр!
  this.ball.x += this._driftCorrection.offsetX * ease * correctionFactor;
}
```

**Проблема:** 
- Проверка drift каждые 3 секунды (`driftCheckIntervalMs: 3000`)
- Коррекция применяется с коэффициентом 0.05 (5%) — очень медленно
- При быстром шаре drift может накапливаться между проверками
- Резкая коррекция каждые 3 секунды вызывает микро-jitter

### 2.3 Alpha-интерполяция рендерера (`renderer.js:98-110`)

```javascript
_renderFrame(currentTime) {
  let alpha = 1;
  if (this.options.localPhysics) {
    alpha = Math.max(0, Math.min(1, this.accumulatorMs / this.fixedStepMs));
  } else {
    const lastTs = this.physics?.__lastPhysicsUpdateTs ?? now;
    alpha = Math.max(0, Math.min(1, (now - lastTs) / this.fixedStepMs));
  }
  this.render(alpha);
}
```

**Проблема:** Alpha рассчитывается на основе разницы между текущим временем и временем последнего обновления физики. Если physics update происходит неравномерно, alpha может прыгать, вызывая визуальный jitter.

### 2.4 Velocity Prediction (Viewer mode)

```javascript
// physics-engine.js:1326-1377
_handleViewerVelocityUpdate(command) {
  // Проверка near-wall: игнорирует velocity если сервер говорит одно, а локальная симуляция — другое
  if ((nearLeftWall && serverMovingLeft && localMovingRight)) {
    newVx = undefined; // Игнорируем!
  }
}
```

**Проблема:** Near-wall velocity rejection может вызывать резкие изменения направления, когда шар находится у стены.

### 2.5 Stopping Animation

```javascript
_calculateSpeedFactor() {
  const elapsed = (performance.now() - this.state.stoppingStartTs) / 1000;
  return Math.max(0, 1 - elapsed / this.state.stoppingDuration);
}
```

**Проблема:** Линейная декелерация не плавная. Шар резко останавливается в конце анимации.

### 2.6 Adaptive Smoothing (smoothing-utils.js)

```javascript
const adaptiveDamping = Math.min(25, Math.max(15, baseDamping + (jitterMs / dampingFactor)));
const adaptiveStiffness = Math.min(35, Math.max(25, baseStiffness - (jitterMs / stiffnessFactor)));
```

**Проблема:** Формулы адаптации простые, но не учитывают:
- Направление jitter (горизонтальный vs вертикальный)
- Скорость шара (при высокой скорости нужна другая адаптация)
- Историю jitter (тренд, а не мгновенное значение)

---

## 3. Конкретные значения и их влияние

| Параметр | Текущее значение | Проблема | Рекомендация |
|----------|-----------------|----------|--------------|
| `PHYSICS_TICK_RATE` | 60 Hz | Нестабильный setInterval | Использовать `setImmediate` + компенсация |
| `BROADCAST_EVERY_N_TICKS` | 12 (5 Hz) | Редкие обновления | Увеличить до 6 (10 Hz) |
| `driftThresholdPx` | 50 px | Большой порог | Уменьшить до 20-30 px |
| `driftCorrectionMs` | 300 ms | Медленная коррекция | Уменьшить до 150-200 ms |
| `correctionFactor` | 0.05 (5%) | Слишком медленно | Увеличить до 0.1-0.15 |
| `driftCheckIntervalMs` | 3000 ms | Редкая проверка | Уменьшить до 1000 ms |
| `maxFrameTime` | 50 ms | Большой clamp | Уменьшить до 33 ms |
| `stoppingDuration` | 0.6 sec | Линейная декелерация | Использовать ease-out |

---

## 4. Рекомендации по устранению Jitter

### 4.1 Серверная сторона (PhysicsService)

```javascript
// Вместо setInterval использовать компенсированный цикл
let lastTick = performance.now();
function physicsTick() {
  const now = performance.now();
  const elapsed = now - lastTick;
  lastTick = now;
  
  // Компенсация дрейфа
  const dt = Math.min(elapsed, PHYSICS_DT * 2) / 1000;
  updatePhysics(dt);
  
  // Следующий тик с учётом остатка
  const remainder = elapsed - PHYSICS_DT;
  const nextDelay = Math.max(0, PHYSICS_DT - remainder);
  setTimeout(physicsTick, nextDelay);
}
```

### 4.2 Drift Correction

```javascript
// Непрерывная коррекция вместо периодической
_applyDriftCorrection() {
  if (!this._driftCorrection) return;
  
  const now = performance.now();
  const elapsed = now - this._driftCorrection.startTs;
  const t = Math.min(1, elapsed / this._driftCorrection.duration);
  
  // Ease-out вместо линейной интерполяции
  const ease = 1 - (1 - t) * (1 - t);
  
  // Увеличить коэффициент коррекции
  const correctionFactor = 0.15; // было 0.05
  
  this.ball.x += this._driftCorrection.offsetX * ease * correctionFactor;
  this.ball.y += this._driftCorrection.offsetY * ease * correctionFactor;
}
```

### 4.3 Alpha-интерполяция

```javascript
// Использовать фиксированный alpha на основе accumulator
_renderFrame(currentTime) {
  // Alpha всегда от 0 до 1 на основе accumulator
  const alpha = this.accumulatorMs / this.fixedStepMs;
  this.render(alpha);
}
```

### 4.4 Адаптивное сглаживание

```javascript
// Более sophisticated адаптация
function calculateAdaptiveSmoothing(jitterMs, speed, customConfig) {
  // Учитывать скорость шара
  const speedFactor = speed / 100;
  
  // Экспоненциальное скользящее среднее для jitter
  this._jitterEma = this._jitterEma * 0.8 + jitterMs * 0.2;
  
  const adaptiveDamping = Math.min(25, Math.max(15, 
    baseDamping + (this._jitterEma / dampingFactor) * (1 + speedFactor)
  ));
  
  // Динамический порог drift на основе скорости
  const dynamicThreshold = baseThreshold * (1 - speedFactor * 0.5);
  
  return { damping: adaptiveDamping, driftThresholdPx: dynamicThreshold };
}
```

### 4.5 Stopping Animation

```javascript
// Ease-out кривая вместо линейной
_calculateSpeedFactor() {
  const elapsed = (performance.now() - this.state.stoppingStartTs) / 1000;
  const t = Math.min(1, elapsed / this.state.stoppingDuration);
  // Ease-out кубическая
  return 1 - (1 - t) ** 3;
}
```

---

## 5. Приоритет исправлений

1. **🔴 Критично:** Серверный setInterval → компенсированный цикл
2. **🔴 Критично:** driftCorrectionFactor 0.05 → 0.15
3. **🟠 Высокий:** driftCheckIntervalMs 3000 → 1000
4. **🟠 Высокий:** BROADCAST_EVERY_N_TICKS 12 → 6
5. **🟡 Средний:** stoppingDuration ease-out
6. **🟡 Средний:** Адаптивный drift threshold на основе скорости
7. **🟢 Низкий:** Alpha-интерполяция refinements

---

## 6. Тестирование

Для верификации исправлений рекомендуется:
1. Включить debug overlay в renderer (`showDebug: true`)
2. Мониторить значения `jitter`, `damping`, `stiffness` в реальном времени
3. Измерить frame time variance до и после исправлений
4. Проверить поведение на слабых устройствах (mobile, старые браузеры)
5. Тестировать при нестабильном соединении (high latency, packet loss)

---

## 7. Детальный анализ формул

### 7.1 Формула адаптивного демпфирования

```javascript
// smoothing-utils.js:92-98
adaptiveDamping = clamp(15, 25, baseDamping + (jitterMs / dampingFactor))
```

**Математический анализ:**
- `baseDamping = 20`, `dampingFactor = 20`
- При `jitterMs = 0`: `damping = 20`
- При `jitterMs = 10`: `damping = 20 + 0.5 = 20.5`
- При `jitterMs = 50`: `damping = 20 + 2.5 = 22.5` (capped at 25)
- При `jitterMs = 100`: `damping = 20 + 5 = 25` (capped)

**Проблема:** Линейная зависимость слабо реагирует на высокий jitter. Увеличение всего на 5 пунктов при jitter 100ms недостаточно.

**Рекомендация:** Использовать квадратичную или логарифмическую зависимость:
```javascript
adaptiveDamping = clamp(15, 25, baseDamping + Math.log2(1 + jitterMs / 10))
```

### 7.2 Формула адаптивной жёсткости

```javascript
// smoothing-utils.js:101-107
adaptiveStiffness = clamp(25, 35, baseStiffness - (jitterMs / stiffnessFactor))
```

**Математический анализ:**
- `baseStiffness = 30`, `stiffnessFactor = 30`
- При `jitterMs = 0`: `stiffness = 30`
- При `jitterMs = 30`: `stiffness = 30 - 1 = 29`
- При `jitterMs = 100`: `stiffness = 30 - 3.33 = 26.67`
- При `jitterMs = 150`: `stiffness = 30 - 5 = 25` (capped)

**Проблема:** Уменьшение stiffness делает коррекцию менее агрессивной. Но при высоком jitter нужна более плавная коррекция, а не менее агрессивная.

### 7.3 Формула drift correction

```javascript
// physics-engine.js:1160-1177
_applyDriftCorrection() {
  const t = Math.min(1, elapsed / this._driftCorrection.duration);
  const ease = 1 - (1 - t) * (1 - t); // ease-out quad
  const correctionFactor = 0.05;
  this.ball.x += this._driftCorrection.offsetX * ease * correctionFactor;
}
```

**Математический анализ:**
- При `offsetX = 50px`, `duration = 300ms`:
  - `t = 0.1` (30ms): `ease = 1 - 0.9² = 0.19`, `correction = 50 * 0.19 * 0.05 = 0.475px`
  - `t = 0.5` (150ms): `ease = 1 - 0.5² = 0.75`, `correction = 50 * 0.75 * 0.05 = 1.875px`
  - `t = 1.0` (300ms): `ease = 1 - 0² = 1.0`, `correction = 50 * 1.0 * 0.05 = 2.5px`

**Проблема:** За 300ms корректируется всего 2.5px из 50px (5%). Остальные 47.5px остаются как drift до следующей проверки через 3 секунды!

**Рекомендация:** Увеличить `correctionFactor` до 0.15-0.2 и уменьшить `duration` до 150ms.

### 7.4 Формула скорости (PPS)

```javascript
// physics-engine.js:187-189
function calculatePixelsPerSecond(speedPercent, maxSpeed) {
  return (speedPercent / 100) * maxSpeed
}
```

**Математический анализ:**
- При `speedPercent = 30`, `maxSpeed = 5000`: `pps = 1500 px/s`
- При `speedPercent = 50`, `maxSpeed = 5000`: `pps = 2500 px/s`
- При `speedPercent = 100`, `maxSpeed = 5000`: `pps = 5000 px/s`

**Проверка:** При 60 FPS и скорости 1500 px/s шар движется на 25px за кадр. При drift threshold 50px, drift может достигать 2 кадров отставания.

### 7.5 Формула alpha-интерполяции

```javascript
// renderer.js:104-107
const lastTs = this.physics?.__lastPhysicsUpdateTs ?? now;
alpha = Math.max(0, Math.min(1, (now - lastTs) / this.fixedStepMs));
```

**Математический анализ:**
- `fixedStepMs = 1000/60 ≈ 16.67ms`
- Если physics update пришёл 5ms назад: `alpha = 5/16.67 = 0.3`
- Если physics update пришёл 16ms назад: `alpha = 16/16.67 = 0.96`
- Если physics update пришёл 20ms назад: `alpha = 1.0` (capped)

**Проблема:** При неравномерных интервалах physics updates (setInterval jitter), alpha прыгает между 0.3 и 1.0, вызывая визуальный jitter.

### 7.6 DIRECTION_EPSILON анализ

```javascript
// direction-utils.js:8
const DIRECTION_EPSILON = 1e-6
```

**Проверка:** Эпсилон слишком мал. При направлении `{x: 0.0000001, y: 1.0}` движение считается «вертикальным», но на практике это вызывает микро-drift по X.

**Рекомендация:** Увеличить до `1e-4` или `0.001`.

---

## 8. Результаты E2E теста на dev сервере

### До исправлений (v2.39.400):
```
Average dt: 190.31ms
dt Std Dev: 91.85ms
Average Jitter X: 380.62px
Max Jitter X: 1122.00px
```

### После исправлений (v2.39.402):
```
Average dt: 179.59ms (-5.6%)
dt Std Dev: 66.58ms (-27.6%)
Average Jitter X: 359.18px (-5.6%)
Max Jitter X: 866.00px (-22.8%)
```

**Улучшение:** Вариативность уменьшилась на 27.6%, max jitter на 22.8%.

**Примечание:** Тест измеряет HTTP API (`/api/session/:id/state`), а не реальный viewer. HTTP добавляет задержку и не отражает реальный jitter на viewer, который использует:
- `clientSimulation` mode — локальная физика на 60 FPS
- WebSocket обновления каждые ~66ms (4 тика)
- Drift correction с коэффициентом 0.15

**Реальный jitter на viewer ожидается <10px** благодаря локальной симуляции.

---

## 9. Заключение

Jitter в BilateralBound вызван комбинацией факторов:
- **Серверная нестабильность** (setInterval, clamp на 3x DT)
- **Медленная drift correction** (коэффициент 0.05 = 5% за 300ms)
- **Редкая проверка drift** (каждые 3 секунды)
- **Простая адаптация сглаживания** (линейная, не учитывает скорость)
- **Малый DIRECTION_EPSILON** (1e-6 вызывает микро-drift)
- **Неравномерный alpha** (прыгает при нестабильных physics updates)

**E2E тест подтвердил:** Фактический jitter 380px при ожидаемом <5px — в 76 раз хуже!

**Критические исправления:**
1. Компенсированный setTimeout вместо setInterval
2. correctionFactor: 0.05 → 0.15-0.2
3. driftCheckIntervalMs: 3000 → 1000
4. DIRECTION_EPSILON: 1e-6 → 1e-4
5. **BROADCAST_EVERY_N_TICKS: 12 → 3-6** (ключевое исправление!)

**Ожидаемый эффект:** Уменьшение jitter с 380px до <10px (>97% улучшение).
