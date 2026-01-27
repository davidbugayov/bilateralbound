# Исправление: "Контроллер отключен" на вьювере

## Проблема
Вьювер показывал "Контроллер отключен", хотя контроллер был подключен через SSE.

## Причина
При SSE-подключении вьювера ПОСЛЕ контроллера:
1. `initial_state` содержал `controllerConnected: true`, но событие обрабатывалось некорректно
2. Событие `controller_connected` не отправлялось вьюверу (оно было отправлено ранее, когда вьювер ещё не подключился)

## Исправления

### 1. Сервер: SessionManager.js
При подключении вьювера через SSE, если контроллер уже подключен, явно отправляем событие `controller_connected`:

```javascript
if (role === 'viewer') {
  this.stateBroadcaster.broadcastInitialState(sessionId, res, session.ballState)
  
  // Явно отправляем статус контроллера
  if (session.controllerConnected) {
    const controllerStatusEvent = {
      type: 'controller_connected',
      timestamp: Date.now(),
      payload: { controllerConnected: true }
    }
    this.sseManager.sendEvent(res, 'controller_connected', controllerStatusEvent)
  }
}
```

### 2. Клиент: viewer.html
Добавлено детальное логирование для отладки:
- В `updateStatus()` - логирование получаемых данных
- В `onStateUpdate()` - трассировка обработки controllerConnected
- В обработчиках событий `controller_connected`/`disconnected`

## Как протестировать

### Сценарий 1: Контроллер → Вьювер
1. Откройте контроллер в одной вкладке
2. Дождитесь "Контроллер подключен"
3. Откройте вьювер в другой вкладке
4. **Ожидаемый результат**: Вьювер сразу показывает "Контроллер подключен"

### Сценарий 2: Вьювер → Контроллер
1. Откройте вьювер
2. Должно показать "Ожидание контроллера..."
3. Откройте контроллер
4. **Ожидаемый результат**: Вьювер обновляется на "Контроллер подключен"

### Сценарий 3: Переподключение
1. Оба клиента подключены
2. Закройте контроллер
3. **Ожидаемый результат**: Вьювер показывает "Контроллер отключен"
4. Снова откройте контроллер
5. **Ожидаемый результат**: Вьювер показывает "Контроллер подключен"

## Проверка логов

В консоли браузера (вьювер) должны появиться:
```
📊 [VIEWER] updateStatus called with: {"controllerConnected":true}
✅ [VIEWER] Setting status: Controller connected
```

В логах сервера:
```
Broadcasting initial_state with controllerConnected=true
Sent controller_connected to newly connected viewer
```
