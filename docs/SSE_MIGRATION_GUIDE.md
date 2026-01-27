# Миграция на SSE: Руководство

## Быстрый старт

### 1. Запуск сервера с поддержкой SSE

```bash
npm start
```

Сервер автоматически поддерживает оба транспорта:
- ✅ SSE (по умолчанию для новых клиентов)
- ✅ WebSocket (для обратной совместимости)

### 2. Проверка работы SSE

Откройте viewer или controller - они автоматически будут использовать SSE:

```bash
# Откройте в браузере
http://localhost:3000/s/test123  # Viewer
http://localhost:3000/c/test123  # Controller
```

В консоли браузера вы увидите:
```
[RealtimeClient] Using SSE transport for viewer
✓ SSE connection established
```

### 3. Тестирование нагрузки

Сравните нагрузку SSE vs WebSocket:

```bash
# Тест с 10 сессиями (20 клиентов)
npm run test:load:sse:10

# Тест с 50 сессиями (100 клиентов)
npm run test:load:sse:50

# Тест с 100 сессиями (200 клиентов)
npm run test:load:sse:100
```

Результаты сохраняются в `./load-test-sse-{timestamp}.json`

## Архитектура

### Server-Sent Events (SSE)

**Преимущества:**
- 📉 **Меньше нагрузка**: Однонаправленное соединение (сервер → клиент)
- 🚀 **Проще масштабировать**: Обычный HTTP, работает с любым балансировщиком
- 🔄 **Автоматический reconnect**: Встроен в браузер
- 💾 **Меньше памяти**: ~40 KB vs ~150 KB на соединение

**Когда использовать:**
- ✅ Просмотр данных (viewer)
- ✅ Получение обновлений состояния
- ✅ Real-time уведомления

### Протокол

#### Сервер → Клиент (SSE)

```
GET /api/session/:sessionId/stream?role=viewer

Сервер отправляет:
event: state_update
data: {"type":"state_update","payload":{...}}

event: viewer_status  
data: {"type":"viewer_status","payload":{...}}
```

#### Клиент → Сервер (HTTP POST)

```
POST /api/session/:sessionId/controller/update
Content-Type: application/json

{
  "speed": 30,
  "paused": false,
  "dirX": 1,
  "dirY": 0
}
```

## API клиента

### RealtimeClient

Универсальный клиент с автоматическим выбором транспорта:

```javascript
// SSE по умолчанию
const client = new RealtimeClient(sessionId, 'viewer')

// Принудительно WebSocket
const client = new RealtimeClient(sessionId, 'viewer', {
  transport: 'websocket'
})

// Подключение
await client.connect()

// Отправка команды
await client.send('controller_update', {
  speed: 30,
  paused: false
})

// Получение событий
client.on('state_update', (state) => {
  console.log('Новое состояние:', state)
})

// Проверка транспорта
console.log(client.getTransportType()) // 'sse' или 'websocket'

// Статистика
const stats = client.getStats()
console.log(stats.messagesReceived, stats.reconnectCount)
```

### SSEClient (напрямую)

Если нужен только SSE:

```javascript
const client = new SSEClient(sessionId, 'viewer', {
  maxReconnectAttempts: 5,
  reconnectInterval: 3000,
  heartbeatTimeout: 60000
})

await client.connect()

client.on('state_update', (data) => {
  // Обработка обновления
})

// Отправка команды
await client.send('viewer_update', { paused: true })
```

## Endpoints

### SSE Stream

```
GET /api/session/:sessionId/stream?role={viewer|controller}

Headers:
  Accept: text/event-stream
  Cache-Control: no-cache

События:
  - initial_state
  - state_update
  - viewer_status
  - viewer_audio_activated
  - controller_connected
  - controller_disconnected
```

### HTTP Commands

```
POST /api/session/:sessionId/controller/update
POST /api/session/:sessionId/viewer/update
POST /api/session/:sessionId/viewer/audio-activated
POST /api/session/:sessionId/controller/connect
POST /api/session/:sessionId/viewer/connect
```

## Конфигурация

### Серверная часть

```javascript
// packages/server-core/server/session/SessionManager.js

// SSEManager автоматически создается
this.sseManager = new SSEManager(this.sessionRepository)

// StateBroadcaster поддерживает оба транспорта
this.stateBroadcaster = new StateBroadcaster(
  this.sessionRepository,
  this.webSocketManager,
  this.sseManager
)
```

### Клиентская часть

```javascript
// packages/web-client/public/js/config.js

// Настройки применяются для обоих транспортов
globalThis.BBConfig = {
  network: {
    heartbeatInterval: 25000,
    reconnectDelay: 2000,
    maxReconnectAttempts: 10
  }
}
```

## Мониторинг

### Метрики сервера

```bash
curl http://localhost:3000/health

{
  "status": "ok",
  "sessions": 10,
  "uptime": 3600
}
```

### Метрики клиента

```javascript
// В консоли браузера
wsClient.getStats()

{
  transportType: 'sse',
  messagesReceived: 3600,
  reconnectCount: 0,
  lastActivity: 1234567890,
  isConnected: true
}
```

### Логи

```javascript
// Включить debug логи
localStorage.setItem('bb_debug', 'true')

// Выключить
localStorage.removeItem('bb_debug')
```

## Troubleshooting

### SSE не подключается

1. Проверьте CORS заголовки:
```javascript
// Должно быть в expressApp.js
res.setHeader('Access-Control-Allow-Origin', origin)
res.setHeader('Access-Control-Allow-Credentials', 'true')
```

2. Проверьте nginx/прокси конфигурацию:
```nginx
# Отключить буферизацию для SSE
proxy_buffering off;
proxy_cache off;
proxy_set_header Connection '';
proxy_http_version 1.1;
chunked_transfer_encoding off;
```

### Высокая latency

1. Проверьте dead reckoning:
```javascript
// packages/server-core/server/config.js
DEAD_RECKON_EPS: 1.5 // Увеличьте для меньшей точности но меньшей нагрузки
```

2. Проверьте частоту обновлений:
```javascript
// SessionManager.js
const PHYSICS_TICK_RATE = 60 // Уменьшите до 30 для экономии
```

### Соединение часто обрывается

1. Увеличьте heartbeat timeout:
```javascript
const client = new SSEClient(sessionId, 'viewer', {
  heartbeatTimeout: 90000 // 90 секунд
})
```

2. Проверьте firewall/прокси таймауты

## Production Checklist

- [ ] Протестировано с 100+ одновременными сессиями
- [ ] Настроен мониторинг метрик
- [ ] Проверена работа через nginx/HAProxy
- [ ] Настроены правильные CORS заголовки
- [ ] Добавлено логирование ошибок
- [ ] Настроен graceful shutdown
- [ ] Проверена работа reconnect логики
- [ ] Добавлен health check endpoint
- [ ] Настроен rate limiting
- [ ] Проверена работа с мобильными браузерами

## Rollback на WebSocket

Если нужно вернуться на WebSocket:

### Вариант 1: Принудительно для всех клиентов

```javascript
// packages/web-client/public/js/controller.js
wsClient = new RealtimeClient(sessionId, 'controller', {
  transport: 'websocket' // Принудительно WebSocket
})
```

### Вариант 2: Feature flag

```javascript
// packages/web-client/public/js/config.js
globalThis.BBConfig = {
  network: {
    preferSSE: false // Отключить SSE, использовать WebSocket
  }
}

// В RealtimeClient
const useSSE = options.transport !== 'websocket' && 
               globalThis.BBConfig?.network?.preferSSE !== false
```

## Дальнейшие оптимизации

1. **Gzip compression**:
```javascript
// expressApp.js
const compression = require('compression')
app.use(compression())
```

2. **Delta encoding** (только изменения):
```javascript
// Вместо полного state отправлять только изменения
const delta = computeDelta(previousState, currentState)
broadcast('state_delta', delta)
```

3. **Adaptive frame rate**:
```javascript
// Уменьшать частоту при высоком jitter
if (avgJitter > 50) {
  PHYSICS_TICK_RATE = 30
}
```

4. **HTTP/2 Server Push**:
```nginx
http2_push /api/session/:id/initial-state;
```

---

**Версия**: 2.40.0  
**Дата обновления**: 2026-01-27  
**Поддержка**: https://github.com/davidbugayov/bilateral_bound
