# Тест исправления функции включения звука

## Проблема
Когда пользователь включал звук на контроллере (🔊 Звук → Включить звук), на вьювере не отображалась кнопка для активации звука.

## Причины проблемы
1. Функция `onStateUpdate()` на вьювере не обрабатывала параметры `soundEnabled` и `soundType` из состояния сервера
2. Функция `syncUIWithState()` на контроллере не синхронизировала UI параметры звука

## Решение

### Изменение 1: viewer.html (функция onStateUpdate)
- Добавлена обработка `soundEnabled` и `soundType` из state_update
- Вызывается `audioManager.setEnabled()` и `checkAudioOverlay()` для обновления UI

```javascript
// ВАЖНО: Обрабатываем звук из state_update
if (state && audioManager) {
  if (typeof state.soundEnabled === 'boolean') {
    audioManager.setEnabled(state.soundEnabled);
    checkAudioOverlay();
  }
  if (state.soundType) {
    audioManager.setSoundType(state.soundType);
  }
}
```

### Изменение 2: controller.js (функция syncUIWithState)
- Добавлена синхронизация `soundEnabled` и `soundType` в UI
- Обновляет чекбокс и select элементы при получении состояния от сервера

```javascript
// Синхронизируем параметры звука с UI
if (ballState.soundEnabled !== undefined) {
  const soundEnabledCheckbox = document.getElementById('soundEnabledCheckbox');
  if (soundEnabledCheckbox) {
    soundEnabledCheckbox.checked = Boolean(ballState.soundEnabled);
    // Обновляем состояние контрола типа звука
    const soundTypeControl = document.getElementById('soundTypeControl');
    if (soundTypeControl) {
      if (ballState.soundEnabled) {
        soundTypeControl.style.opacity = '1';
        soundTypeControl.style.pointerEvents = 'auto';
      } else {
        soundTypeControl.style.opacity = '0.5';
        soundTypeControl.style.pointerEvents = 'none';
      }
    }
  }
}
if (ballState.soundType) {
  const soundTypeSelect = document.getElementById('soundTypeSelect');
  if (soundTypeSelect) {
    soundTypeSelect.value = ballState.soundType;
  }
}
```

### Изменение 3: controller.js (экспорт функций)
- Добавлены `setSoundEnabled` и `setSoundType` в список экспортируемых функций для совместимости с тестами

## Поток данных

1. **Контроллер**: пользователь включает чекбокс "Включить звук"
2. **_initializeSoundControls()**: событие change вызывает `setSoundEnabled(true)`
3. **setSoundEnabled()**: отправляет `safeSend(WS_MSG.controllerUpdate, { soundEnabled: true })`
4. **Сервер**: сохраняет состояние и передает вьюверу
5. **Вьювер**: получает state_update с `soundEnabled: true`
6. **onStateUpdate()**: вызывает `audioManager.setEnabled(true)` и `checkAudioOverlay()`
7. **checkAudioOverlay()**: показывает кнопку "🔊 Включить звук" если `audioManager.enabled === true` и пользователь еще не активировал аудио

## Проверка работы

### На контроллере:
1. Откройте контроллер
2. Найдите раздел "🛠️ Настройки" → "🔊 Звук"
3. Отметьте чекбокс "Включить звук"
4. Убедитесь что select "Тип звука" стал активным (opacity: 1)

### На вьювере:
1. Откройте вьювер в отдельном окне
2. После отметки чекбокса на контроллере должна появиться кнопка "🔊 Включить звук"
3. Нажмите кнопку для активации аудио контекста
4. Убедитесь что индикатор на контроллере показывает что звук активирован

## Файлы измененные:
- `/packages/web-client/public/viewer.html`
- `/packages/web-client/public/js/controller.js`

