# Исправление: Синхронизация направления мяча между отскоками

## Проблема

Мяч двигался только в одну сторону (например, только вправо) и не менял направление при отскоке о стену. Контроллер и зритель были рассинхронизированы.

### Симптомы
- Мяч отскакивает, но продолжает двигаться в ту же сторону
- Направление `dirX` не инвертируется при отскоке
- Синхронизация между viewer и controller нарушена

## Причина

В файле `packages/server-core/src/services/PhysicsService.js` было два места, где **старое направление пользователя перезаписывало** состояние физического движка после обновления:

1. **В методе `_startSharedPhysicsLoop()` (строки 315-323)**:
```javascript
// НЕПРАВИЛЬНО - перезаписывает направление после обновления физики
const { dirX: userDirX, dirY: userDirY } = session.ballState
// ... обновление физики ...
Object.assign(session.ballState, session.physicsEngine.getState())
if (userDirX !== undefined && userDirY !== undefined) {
  session.ballState.dirX = userDirX  // ❌ ПЕРЕЗАПИСЫВАЕМ ОТСКОК!
  session.ballState.dirY = userDirY
}
```

2. **В методе `updateScreenSize()` (строки 186-193)**:
```javascript
// Аналогичная проблема при изменении размера экрана
const { dirX: userDirX, dirY: userDirY } = session.ballState
// ... обновление размера ...
Object.assign(session.ballState, session.physicsEngine.getState())
if (userDirX !== undefined && userDirY !== undefined) {
  session.ballState.dirX = userDirX  // ❌ ПЕРЕЗАПИСЫВАЕМ ОТСКОК!
  session.ballState.dirY = userDirY
}
```

**Почему это происходило?**
- Когда мяч отскакивает в physics engine, `handleBoundaryCollisions()` корректно инвертирует направление:
  ```javascript
  // Правильная инверсия при отскоке о правую стену
  if (ball.x >= worldWidth - radius && dirX > 0) {
    state.lastDirection.x = -Math.abs(dirX)  // ✅ Меняем на ВЛЕВО
  }
  ```
- Но потом сервер ПЕРЕЗАПИСЫВАЛ это значение исходным направлением!

## Решение

Удалили код, который перезаписывал направление после каждого обновления физики. Теперь физический движок полностью отвечает за управление направлением во время игры:

```javascript
// ПРАВИЛЬНО - позволяем physics engine управлять направлением
this._withSoundPreserved(session, () => {
  session.physicsEngine.update(actualDt)
  Object.assign(session.ballState, session.physicsEngine.getState())
})
// ✅ НЕ перезаписываем направление - полностью доверяем physics engine
```

### Изменённые файлы
- `packages/server-core/src/services/PhysicsService.js`
  - Удалены строки 315-323 в `_startSharedPhysicsLoop()`
  - Удалены строки 186-193 в `updateScreenSize()`

## Проверка

### Unit тест
```bash
node test-physics-direct.js
# Результат: ✅ SUCCESS: Ball bounces bidirectionally!
```

### E2E тесты
```bash
npm run test:local
# Результат: Пройдено: 22/22
```

## Результат

✅ Мяч теперь **корректно меняет направление** при отскоке  
✅ Синхронизация между controller и viewer **исправлена**  
✅ Движение **плавное** в обе стороны (左 ↔️ 右)  
✅ Все существующие тесты **по-прежнему проходят**

## Дополнительная информация

Логика инверсии направления находится в `packages/shared/physics-engine.js`:
```javascript
handleBoundaryCollisions() {
  // При отскоке о левую стену:
  if (ball.x <= radius && dirX < 0) {
    state.lastDirection.x = Math.abs(dirX)  // Инвертируем на вправо
  }
  
  // При отскоке о правую стену:
  if (ball.x >= worldWidth - radius && dirX > 0) {
    state.lastDirection.x = -Math.abs(dirX)  // Инвертируем на влево
  }
}
```

Это изменение **не требует** изменений на клиенте - исправление полностью на уровне сервера.

