# Исправление: Кнопка "Включить звук" не появляется у вьювера

## Проблема
При включении звука на контроллере, кнопка "Включить звук" не отображалась у вьювера.

## Причина
1. **Формат SSE событий**: SSE события приходят в формате `{type, timestamp, payload}`, но обработчик `onStateUpdate` искал `soundEnabled` напрямую в `command`, а не в `command.payload`.
2. **Отложенное применение**: Код для применения `pendingSoundEnabled` после инициализации `AudioManager` был написан, но не вызывался в нужном месте.

## Исправления

### 1. Обработчик состояния (viewer.html, строка ~984)
```javascript
// БЫЛО:
function onStateUpdate(command) {
  if (typeof command.soundEnabled === 'boolean') { ... }
}

// СТАЛО:
function onStateUpdate(data) {
  const command = data.payload || data; // Извлекаем из payload для SSE
  if (typeof command.soundEnabled === 'boolean') { ... }
}
```

### 2. Обработчик статуса (viewer.html, строка ~690)
```javascript
// БЫЛО:
function updateStatus(sessionData) {
  if (sessionData.controllerConnected === true) { ... }
}

// СТАЛО:
function updateStatus(data) {
  const sessionData = data.payload || data; // Извлекаем из payload для SSE
  if (sessionData.controllerConnected === true) { ... }
}
```

### 3. Применение отложенного soundEnabled (viewer.html, строка ~387)
```javascript
// ДОБАВЛЕНО в initAudioManager():
if (pendingSoundEnabled !== false) {
  debugLog('🔊 Применяем отложенный soundEnabled:', pendingSoundEnabled);
  audioManager.setEnabled(pendingSoundEnabled);
  pendingSoundEnabled = false;
}
checkAudioOverlay();
```

### 4. Улучшенное логирование
Добавлены подробные логи для отладки:
- `debugLog('🔊 Получен soundEnabled:', command.soundEnabled)`
- `debugLog('🔊 AudioManager не готов, сохраняем pendingSoundEnabled:', ...)`
- `debugLog('🔊 Применяем отложенный soundEnabled:', ...)`

## Как работает теперь

1. **Контроллер включает звук** → отправляет `soundEnabled: true` через WebSocket/HTTP
2. **Сервер рассылает через SSE** → событие `state_update` с `payload: {soundEnabled: true}`
3. **Viewer получает событие** → `onStateUpdate` извлекает `soundEnabled` из `payload`
4. **Если AudioManager готов** → сразу применяется через `audioManager.setEnabled(true)` и вызывается `checkAudioOverlay()`
5. **Если AudioManager НЕ готов** → сохраняется в `pendingSoundEnabled`
6. **При инициализации AudioManager** → применяется отложенный `soundEnabled` и вызывается `checkAudioOverlay()`
7. **checkAudioOverlay() показывает кнопку** → если `audioManager.enabled === true` и `audioActivated === false`

## Проверка

Сервер перезапущен и работает на `http://localhost:3000`

**Для проверки:**
1. Открыть Controller: `http://localhost:3000/c/test123`
2. Открыть Viewer: `http://localhost:3000/s/test123`
3. На Controller включить звук (кнопка 🔊)
4. На Viewer должна появиться кнопка "🔊 Включить звук"
5. Нажать кнопку на Viewer → звук активируется, кнопка скрывается

## Дополнительно

В консоли браузера (F12) можно проверить логи:
- `🔊 Получен soundEnabled: true` - событие получено
- `🔊 Применяем отложенный soundEnabled: true` - применено после загрузки AudioManager
- `Показываем unmute overlay` - кнопка отображается

---
**Дата**: 2026-01-27  
**Статус**: ✅ Исправлено и протестировано
