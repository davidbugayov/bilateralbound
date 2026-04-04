# Prompt: Плавное предиктивное движение шарика в превью контроллера

## Контекст

В BilateralBound есть **viewer** (пациент) и **controller** (терапевт). Контроллер показывает превью движения шарика, которое должно дублировать движение на viewer.

**Текущая проблема**: Превью в контроллере дёргается (jitter), шарик иногда "прилипает" к стене при паузе.

**Референс**: https://www.bilateralstimulation.io/s/dmen — показывает ИДЕАЛЬНО плавное движение шарика.

## Ключевое преимущество нашей архитектуры

В отличие от классических проблем game networking, у нас:

- **Viewer знает скорость и направление** (получает от сервера)
- **Controller тоже знает скорость и направление** (получает от сервера через WebSocket)
- Оба могут **предсказывать** позицию шарика на основе velocity

Это позволяет использовать **dead reckoning + interpolation** для идеально плавного движения.

## Задача

Реализуй предиктивные алгоритмы для плавного движения шарика в превью контроллера, используя следующие подходы:

### 1. Dead Reckoning (Мёртвая реконка)

```javascript
// Позиция предсказывается на основе последней известной velocity
predictedX = lastKnownX + velocityX * deltaTime;
predictedY = lastKnownY + velocityY * deltaTime;
```

**Преимущество**: Шарик движется плавно между серверными обновлениями (15Hz), а не "прыгает" к новой позиции.

### 2. Cubic Hermite Interpolation (Сплайновая интерполяция)

```javascript
// Вместо линейной интерполяции между двумя точками
// используем cubic hermite spline с учётом velocity
function hermite(t, p0, p1, m0, m1) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p0 +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * p1 +
    (t3 - t2) * m1
  );
}
```

**Преимущество**: Учитывает не только позиции, но и скорости в начальной и конечной точках. Создаёт ГЛАДКУЮ кривую без резких изменений направления.

### 3. Snapshot Interpolation с Jitter Buffer

```javascript
// Буферизуем серверные снапшоты и интерполируем между ними
// с небольшой задержкой (jitter buffer) для компенсации неравномерных интервалов
class SnapshotBuffer {
  constructor(bufferSize = 3, delayMs = 50) {
    this.buffer = [];
    this.delay = delayMs;
  }

  addSnapshot(timestamp, x, y, vx, vy) {
    this.buffer.push({ timestamp, x, y, vx, vy });
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }
  }

  getPosition(renderTime) {
    // Интерполируем между двумя снапшотами, ближайшими к renderTime - delay
    const targetTime = renderTime - this.delay;
    // ... cubic hermite interpolation
  }
}
```

**Преимущество**: Компенсирует jitter в сетевых обновлениях, создаёт идеально плавное движение.

### 4. Spring-Damper для коррекции drift

```javascript
// Плавно корректируем отклонение от серверной позиции
// вместо резкого snap
function applySpringCorrection(current, target, velocity, dt) {
  const stiffness = 10; // жёсткость пружины
  const damping = 5; // демпфирование

  const dx = target.x - current.x;
  const dy = target.y - current.y;

  // Сила пружины: F = -k * x - d * v
  const fx = stiffness * dx - damping * velocity.x;
  const fy = stiffness * dy - damping * velocity.y;

  return {
    x: current.x + fx * dt,
    y: current.y + fy * dt,
  };
}
```

**Преимущество**: Даже при наличии drift, коррекция происходит плавно, без рывков.

## Файлы для изменения

1. **`packages/shared/physics-engine.js`** — добавить метод `predictPosition(dt)` для dead reckoning
2. **`packages/web-client/src/controller.js`** — изменить `applyServerStateToPreview()` для использования предикции
3. **`packages/web-client/src/rendering/renderer.js`** — возможно, добавить snapshot buffer

## Критерии успеха

- [ ] Шарик в превью движется так же плавно, как на https://www.bilateralstimulation.io/s/dmen
- [ ] Нет видимого jitter при нормальном соединении
- [ ] Нет "прилипания" к стенам при паузе
- [ ] При сетевых задержках шарик продолжает двигаться предсказуемо
- [ ] Коррекция drift происходит плавно, без рывков

## Используй скилы

- **"modern-javascript-patterns"** — для чистой реализации алгоритмов
- **"performance"** — для оптимизации (60 FPS, минимум вычислений)
- **"systematic-debugging"** — для диагностики если что-то не работает

## Дополнительные требования

- Не увеличивать computational cost значительно (60 FPS на мобильных)
- Сохранить совместимость с текущей архитектурой (clientSimulation mode)
- Добавить комментарии "why" (почему выбран именно этот алгоритм)
