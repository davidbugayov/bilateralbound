# Улучшения для плохого интернета - BilateralBound

## Проблема

Пользователи жаловались на мерцание мяча при плохом интернете. Мяч начинал "прыгать" каждые несколько секунд,尤其是在 высоком jitter (нестабильное соединение).

## Найденные проблемы

### 1. Drift Correction работал слишком редко
- **Было**: проверка каждые 3000мс (3 секунды)
- **Проблема**: при плохом интернете за 3 секунды мяч уходил на десятки пикселей
- **Визуальный эффект**: резкие "прыжки" мяча каждые 3 секунды

### 2. Фиксированный порог коррекции
- **Было**: порог 50px для всех условий сети
- **Проблема**: слишком большой порог для EMDR терапии, где важна точность
- **Визуальный эффект**: заметные скачки при коррекции

### 3. Отсутствие prediction
- **Было**: позиция корректировалась на основе текущего серверного положения
- **Проблема**: не учитывалась задержка между сервером и клиентом
- **Визуальный эффект**: мяч "отставал" от реальной позиции

### 4. Нет адаптации к jitter
- **Было**: фиксированные параметры сглаживания
- **Проблема**: при высоком jitter параметры были недостаточно агрессивными
- **Визуальный эффект**: дрожание мяча при нестабильном соединении

## Реализованные улучшения

### 1. Адаптивный Drift Correction

```javascript
// Новые параметры
smoothing: {
  driftThresholdPx: 25,        // Было 50, уменьшено для EMDR
  driftCorrectionMs: 200,      // Было 300, ускоренная коррекция
  driftCheckIntervalMs: 1000,  // Было 3000, проверка каждую секунду
  
  // Адаптивные параметры
  adaptiveSmoothing: true,
  minDriftCheckMs: 500,        // Минимум при high jitter
  maxDriftCheckMs: 3000,       // Максимум при low jitter
  minThresholdPx: 15,          // Минимальный порог
  maxThresholdPx: 50,          // Максимальный порог
}
```

**Алгоритм адаптации**:
- Jitter > 50мс: проверка каждые 500мс, порог 50px
- Jitter > 20мс: проверка каждые 500мс, порог 37.5px
- Jitter > 10мс: проверка каждые 750мс, порог 25px
- Jitter ≤ 10мс: проверка каждые 1000мс, порог 18.75px

### 2. Position Prediction с Latency Compensation

```javascript
_predictPosition(x, y, vx, vy) {
  const latencySec = 100 / 1000 // 100ms latency estimate
  return {
    x: x + vx * latencySec,
    y: y + vy * latencySec
  }
}
```

**Преимущества**:
- Компенсирует задержку между сервером и клиентом
- Мяч движется к предсказанной позиции, а не к текущей серверной
- Уменьшает визуальное "отставание" мяча

### 3. Adaptive Correction Duration

```javascript
// Длительность коррекции адаптируется к величине drift
const baseDuration = 200ms
const adaptiveDuration = Math.min(400, baseDuration + drift * 2)
```

**Преимущества**:
- Малые drifts корректируются быстро (200мс)
- Большие drifts корректируются плавнее (до 400мс)
- Уменьшает резкие скачки при больших расхождениях

### 4. Adaptive Blend Factor

```javascript
// Фактор сглаживания адаптируется к jitter
const jitter = this._currentJitterMs || 0
const blendBase = jitter > 30 ? 0.08 : 0.05
```

**Преимущества**:
- При high jitter коррекция более агрессивная (8% за шаг)
- При low jitter коррекция более мягкая (5% за шаг)
- Баланс между плавностью и точностью

### 5. Integration with WebSocket Metrics

```javascript
// Viewer.js - передача jitter в physics engine
wsClient.on('net_metrics', ({ jitterMs }) => {
  physicsEngine.updateJitter(jitterMs)
})

// PhysicsEngine.js - использование jitter для адаптации
updateJitter(jitterMs) {
  this._currentJitterMs = jitterMs
}
```

## Измененные файлы

### 1. `packages/web-client/public/js/physics-engine.js`
- Добавлены адаптивные параметры drift correction
- Реализован `_getAdaptiveDriftInterval()`
- Реализован `_getAdaptiveDriftThreshold()`
- Реализован `_predictPosition()`
- Добавлен `updateJitter()` метод
- Обновлен `_checkDriftCorrection()` с адаптивной логикой
- Обновлен `_applyDriftCorrection()` с adaptive blend factor

### 2. `packages/web-client/src/viewer.js`
- Добавлен обработчик `net_metrics` для обновления jitter
- Интеграция с physics engine для adaptive smoothing

### 3. `packages/web-client/public/js/controller.js`
- Добавлен обработчик `net_metrics` для обновления jitter
- Интеграция с preview physics engine

### 4. `scripts/e2e/test-bad-internet.js`
- Создан стресс-тест для проверки при плохом интернете
- Симуляция различных профилей сети (Good, Moderate, Poor, Very Poor)
- Измерение jitter мяча
- Проверка на "прыжки" мяча

### 5. `package.json`
- Добавлена команда `test:bad-internet` для запуска стресс-теста

## Ожидаемый результат

### До улучшений:
- Мяч "прыгает" каждые 3 секунды при jitter > 20мс
- Заметные скачки при коррекции позиции
- Мяч "отстает" от серверной позиции

### После улучшений:
- Мяч движется плавно даже при jitter 50-100мс
- Коррекция происходит незаметно для пользователя
- Мяч следует за серверной позицией с компенсацией latency
- Адаптация к текущему качеству соединения

## Запуск теста

```bash
# Запуск стресс-теста
npm run test:bad-internet

# Тест проверяет 4 профиля сети:
# 1. Good (20ms latency, 5ms jitter)
# 2. Moderate (100ms latency, 30ms jitter)
# 3. Poor (300ms latency, 100ms jitter)
# 4. Very Poor (500ms latency, 200ms jitter)
```

## Метрики для мониторинга

1. **Avg Jitter**: среднее отклонение от предсказанной позиции (px)
2. **Max Jitter**: максимальное отклонение за период (px)
3. **Ball Jumping**: наличие резких скачков позиции (> 100px)

## Дальнейшие улучшения (потенциальные)

1. **Machine Learning для prediction**: использовать ML для более точного предсказания позиции
2. **Adaptive physics timestep**: изменять шаг физики в зависимости от jitter
3. **Client-side dead reckoning**: более сложные алгоритмы предсказания
4. **Network quality indicator**: показывать пользователю качество соединения
5. **Fallback на серверную физику**: при очень плохом интернете переключаться на серверный режим

## Заключение

Реализованные улучшения значительно повышают стабильность движения мяча при плохом интернете. Адаптивный подход позволяет оптимально балансировать между плавностью и точностью в зависимости от текущих условий сети.
