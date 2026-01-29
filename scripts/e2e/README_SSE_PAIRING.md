# E2E Test: SSE Pairing

## Описание

Тест проверяет корректную работу SSE (Server-Sent Events) при подключении пары controller-viewer.

## Что проверяется

1. **Controller не подключается к SSE до появления viewer** - проверяем что нет запросов к `/api/session/{id}/events?role=controller` пока viewer не подключен
2. **Viewer не подключается к SSE до появления controller** - аналогично проверяем отсутствие запросов для viewer
3. **После подключения обоих ролей SSE работает** - проверяем появление SSE запросов для обеих сторон
4. **Синхронизация работает** - отправляем `controller_update` и проверяем получение `state_update` на viewer

## Запуск

### Через npm (рекомендуется)

```bash
# На production/dev сервере
npm run test:sse:pairing

# Локально с видимым браузером
npm run test:sse:pairing:local
```

### Напрямую через node

```bash
# На production/dev сервере
BASE_URL=https://dev.emdrbilateral.online node scripts/e2e/test_sse_pairing.js

# Локально
BASE_URL=http://localhost:3000 HEADLESS=false node scripts/e2e/test_sse_pairing.js
```

## Переменные окружения

- `BASE_URL` - адрес сервера для тестирования (по умолчанию: `https://dev.emdrbilateral.online`)
- `TEST_URL` - альтернативное имя для `BASE_URL`
- `HEADLESS` - запуск браузера в headless режиме (`true` по умолчанию, `false` для отладки)

## Ожидаемый результат

```
🚀 SSE pairing E2E on https://dev.emdrbilateral.online
✅ Session created: abc123
🌐 Opening controller (first)...
✅ Controller did not start SSE before viewer
🌐 Opening viewer (second)...
✅ Both roles report realtime connected
✅ Viewer received state_update after controller update

🎉 TEST PASSED
```

## Требования

- Node.js 16+
- Puppeteer (устанавливается через `npm install`)
- Доступ к работающему серверу bilateral_bound

## Troubleshooting

### Тест зависает на "Opening controller"

Проверьте что сервер работает:
```bash
curl -X POST https://dev.emdrbilateral.online/api/session
```

### Тест падает с "Controller started SSE before viewer"

Это означает что наш фикс не работает - controller подключился к SSE раньше времени. Проверьте код в `controller.js` функцию `waitForViewerBeforeRealtime`.

### Тест падает с "Missing SSE connects after pairing"

SSE не подключился после того как оба участника готовы. Проверьте серверную часть и логи browser console.

## Связанные файлы

- `packages/web-client/public/js/controller.js` - функция `waitForViewerBeforeRealtime()`
- `packages/web-client/public/viewer.html` - функция `waitForControllerBeforeRealtime()`
- `packages/web-client/public/js/sse-client.js` - SSE клиент
- `packages/web-client/public/js/realtime-client.js` - обёртка над SSE/WebSocket
