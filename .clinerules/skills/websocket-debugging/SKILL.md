---
name: websocket-debugging
description: Debug WebSocket sync issues, physics drift, heartbeat failures, and connection drops in bilateral_bound
---

# WebSocket Debugging — bilateral_bound

## Когда использовать
- Viewer и controller рассинхронизированы (мяч в разных позициях)
- Heartbeat timeout / клиент отключается
- `bounce_sync` не доходит до controller
- Jitter или дрожание мяча на viewer
- `state_update` не приходит (15Hz broadcasts пропадают)

## Архитектура (быстрый референс)

```
Controller ──── WebSocket ──── Server (60Hz physics, 15Hz broadcast)
                                    └─── WebSocket ──── Viewer (локальная физика 60Hz)

Viewer детектирует bounce локально → шлёт bounce на сервер
Сервер → bounce_sync с direction → Controller preview
```

**Ключевой инвариант:** сервер НЕ релеит x/y координаты в 15Hz updates.
Viewer и controller синхронизируются через параметры (speed, dirX, dirY) + локальная физика.

## Шаги диагностики

### 1. Проверить логи сервера
```bash
npm run deploy:dev:logs | grep -E "(WS|websocket|bounce|heartbeat|disconnect|error)"
# или локально:
npm run dev 2>&1 | grep -E "(WS|bounce|sync|disconnect)"
```

### 2. Проверить что 15Hz broadcasts идут
В браузере (F12 → Network → WS):
- Должно быть ~15 сообщений/сек типа `state_update`
- `bounce_sync` должен приходить controller-у после каждого отскока

### 3. Локальная физика — проверить параметры
Если viewer дрейфует — ищи в `packages/shared/physics-engine.js`:
```javascript
// FIXED_DT должен быть 1/60 на обоих концах
// worldWidth/worldHeight должны совпадать
```

### 4. Проверить `initial_state` alignment
`initial_state` стареет через 1.5s после коннекта.
Если viewer коннектится позже — он начнёт с центра при следующем `play`.

### 5. Heartbeat
В `packages/server-core/src/network/webSocketServer.js` — heartbeat интервал.
Если клиент отключается через ровно N секунд — heartbeat timeout.

## Частые баги

| Симптом | Причина | Фикс |
|---------|---------|------|
| Viewer позади controller на 1-2 шага | Latency без компенсации | Проверить timestamp sync |
| Мяч "прыгает" при реконнекте | initial_state устарел | Ждать следующий `play` |
| bounce_sync не доходит | WS не в состоянии OPEN | Проверить WebSocketManager.js |
| 15Hz updates пропадают | PhysicsService.js loop упал | Проверить uncaught exception |
