# 🧪 E2E тест полной синхронизации SSE

## Описание
Комплексный E2E тест для проверки синхронизации **всех параметров** между controller и viewer через SSE в реальном времени.

## ✅ Что проверяется

### 1. Базовая функциональность
- Установка SSE соединений (controller и viewer)
- Определение подключения viewer контроллером
- Разблокировка UI после подключения
- Готовность canvas элементов

### 2. Синхронизация параметров
| Параметр | Что проверяется |
|----------|-----------------|
| 🎨 **Цвет мяча** | Изменение цвета на controller синхронизируется с viewer |
| 🌈 **Цвет фона** | Изменение фона на controller синхронизируется с viewer |
| 📏 **Размер мяча** | Изменение размера (20/40/80/100) синхронизируется |
| ⚡ **Скорость** | Изменение скорости slider синхронизируется |
| 🧭 **Направление** | Переключение horizontal/vertical/diagonal синхронизируется |
| 🔊 **Звук** | Включение/выключение звука и выбор типа синхронизируются |
| 🏃 **Движение** | Позиция мяча обновляется синхронно на обоих экранах |

### 3. Проверка точности синхронизации
- Сравнение позиций мяча между controller preview и viewer
- Проверка скорости движения (velocity)
- Валидация что параметры совпадают с точностью до допустимой погрешности

## 🚀 Запуск теста

### Вариант 1: Локальный сервер (рекомендуется)
```bash
# Терминал 1: Запустите сервер
cd packages/server-core
PORT=3000 node server/index.js

# Терминал 2: Запустите тест
npm run test:sse:sync
```

### Вариант 2: Dev сервер
```bash
npm run test:sse:sync:dev
```

### Вариант 3: Headless режим (для CI/CD)
```bash
npm run test:sse:sync:headless
```

### Вариант 4: Прямой запуск
```bash
BASE_URL=http://localhost:3000 HEADLESS=false node scripts/e2e/test_local_sse_sync.js
```

## 📊 Ожидаемый результат

При успешном прохождении всех тестов вы увидите:

```
🚀 Starting SSE sync E2E test on http://localhost:3000
📦 Headless mode: false

📝 Creating session...
✅ Session created: abc123

🎮 Opening controller...
[CONTROLLER] [SSEClient controller] SSE connection established
📊 Controller status (before viewer): "ожидание"
✅ Controller SSE connection established

👁️  Opening viewer...
[VIEWER] [SSEClient viewer] SSE connection established
[VIEWER] 📊 [VIEWER] Controller connected event received: {"controllerConnected":true}
✅ Viewer received controller_connected event

⏳ Waiting for controller to update status...
📊 Controller status (after viewer): "подключен"
✅ Controller correctly shows viewer as connected!
✅ Play button is enabled

▶️  Starting playback...
✅ Viewer canvas is ready
✅ Controller preview is ready

🎨 Testing ball color sync...
✅ Ball color synced to viewer: #ef4444

🌈 Testing background color sync...
✅ Background color synced to viewer: #1a1a1a

📏 Testing ball size sync...
✅ Ball size synced to viewer: 40

⚡ Testing speed sync...
✅ Speed synced to viewer: 60

🧭 Testing direction sync...
✅ Direction synced to viewer: dx=0.00, dy=1.00

🔊 Testing sound sync...
✅ Sound enabled synced to viewer: true
✅ Sound type synced to viewer: beep

▶️  Testing ball movement sync...
✅ Ball is moving on viewer:
   Position: (400.0, 200.5) → (400.0, 215.3)
   Velocity: vx=0.0, vy=4.2
✅ Controller and viewer positions synchronized (diff: 3.2px)

🎉 ALL TESTS PASSED!
✅ SSE connections established
✅ Controller detects viewer connection
✅ UI properly unlocked
✅ Canvas elements ready for rendering
✅ Ball color synchronized
✅ Background color synchronized
✅ Ball size synchronized
✅ Speed synchronized
✅ Direction synchronized
✅ Sound settings synchronized
✅ Ball movement synchronized
✅ Controller ↔️ Viewer position sync verified
```

## ⚙️ Параметры окружения

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `BASE_URL` | `http://localhost:3000` | URL сервера для тестирования |
| `HEADLESS` | `false` | Режим браузера (`false` = с GUI, `true` = headless) |

## 🐛 Troubleshooting

### Тест падает с "Controller still shows waiting"
**Причина:** Controller не получает событие `viewer_status` от сервера.

**Решение:**
1. Убедитесь что сервер перезапущен с последними изменениями
2. Проверьте в `packages/server-core/server/session/SessionManager.js` наличие кода отправки `viewer_status` (строки 298-315)
3. Проверьте логи сервера: `tail -f /tmp/server.log`

### Параметры не синхронизируются
**Проблема:** Тест показывает `⚠️ NOT synced`.

**Решение:**
1. Откройте тест с `HEADLESS=false` чтобы видеть браузер
2. Откройте DevTools (F12) в обоих окнах
3. Проверьте вкладку Network → EventStream на наличие SSE событий
4. Убедитесь что события `state_update` содержат правильные параметры

### Canvas не обновляется
**Проблема:** `globalThis.physicsEngine` не определен.

**Решение:**
1. Проверьте инициализацию `PhysicsEngine` в `viewer.html`
2. Убедитесь что `physicsEngine.applyCommand(state)` вызывается при получении SSE событий

### Позиции не синхронизированы
**Проблема:** Большая разница между controller и viewer (>50px).

**Решение:**
1. Проверьте что оба используют одинаковые размеры canvas
2. Убедитесь что `viewerScreenSize` правильно передаётся на сервер
3. Проверьте что physics engine использует одинаковые параметры на обоих концах

## 📝 Добавление новых тестов

Чтобы добавить проверку нового параметра:

```javascript
// В test_local_sse_sync.js после существующих тестов:
console.log('\n🆕 Testing new parameter sync...')
const newControl = await controllerPage.$('#newParameterControl')
if (newControl) {
  await newControl.click()
  await wait(1500)
  
  const viewerValue = await viewerPage.evaluate(() => {
    return globalThis.physicsEngine?.state?.newParameter || null
  })
  
  if (viewerValue === expectedValue) {
    console.log(`✅ New parameter synced to viewer: ${viewerValue}`)
  } else {
    console.log(`⚠️  New parameter NOT synced. Expected: ${expectedValue}, Got: ${viewerValue}`)
  }
}
```

## 🔗 Связанные тесты

- `test_sse_pairing.js` - Проверка паринга controller/viewer через SSE
- `master_e2e_test.js` - Главный E2E тест всей платформы
- `test_production_full_sync.js` - Тест на production сервере

## 📚 Документация

- [SSE Migration Guide](../../docs/SSE_MIGRATION_GUIDE.md)
- [Server Structure](../../docs/SERVER_STRUCTURE.md)
- [SSE Fix Complete](../../SSE_FIX_COMPLETE.md)
