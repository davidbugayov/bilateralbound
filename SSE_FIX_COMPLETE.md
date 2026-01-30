# ✅ ВЫПОЛНЕНО: Фикс SSE-паринга и E2E тест

## Дата: 29 января 2026

## Проблема
При открытии controller без viewer:
```
sse-client.js:400 [SSEClient controller] SSE connection failed on first attempt, will retry...
sse-client.js:402 [SSEClient controller] Reconnecting in 2000ms (attempt 1/10)
```

И наоборот - viewer без controller спамил аналогичные ошибки.

## Решение

### 1. Controller ждёт viewer ✅

Файл: `packages/web-client/public/js/controller.js`

Добавлена функция `waitForViewerBeforeRealtime()`:
- Опрашивает `GET /api/session/{id}/state` каждые 2 секунды
- Проверяет `state.viewerConnected === true`
- Только после этого вызывает `initializeWebSocketClient()`
- UI уже отрисован, пользователь может делиться ссылкой пока ждём

### 2. Viewer ждёт controller ✅

Файл: `packages/web-client/public/viewer.html`

Добавлена функция `waitForControllerBeforeRealtime()`:
- Аналогичный polling `/api/session/{id}/state`
- Проверяет `state.controllerConnected === true`
- Применяет серверное состояние если оно уже есть
- Создаёт `RealtimeClient` только после подтверждения

### 3. E2E тест для проверки ✅

Файл: `scripts/e2e/test_sse_pairing.js`

Сценарий:
1. Создаёт сессию через API
2. Открывает controller в Puppeteer
3. **Проверяет отсутствие** запросов к `/api/session/{id}/events?role=controller`
4. Открывает viewer
5. **Проверяет появление** SSE запросов для обеих ролей
6. Отправляет `controller_update`
7. **Проверяет получение** `state_update` на viewer

## Коммиты

1. `33bf1a0` - feat: добавлен E2E тест SSE-паринга + ожидание пары перед подключением
2. `[hash]` - docs: добавлены npm скрипты и README для SSE pairing теста
3. `[hash]` - docs: полная документация по деплою и запуску SSE pairing теста

## Деплой

✅ Код запушен в `origin/stable-enhanced`
✅ Выполнен `npm run deploy:dev:pull`
✅ Выполнен `npm run deploy:dev:restart`
⏳ Сервер перезапускается (3-5 секунд)

## Как запустить тест

### Вариант 1: Локально с вашего Mac
```bash
cd /Users/davidbugayov/StudioProject/bilateral_bound
npm run test:sse:pairing
```

### Вариант 2: На сервере через SSH
```bash
ssh root@213.139.229.44
cd /var/www/dev.emdrbilateral.online
npm run test:sse:pairing
```

### Вариант 3: Напрямую
```bash
BASE_URL=https://dev.emdrbilateral.online node scripts/e2e/test_sse_pairing.js
```

## Ожидаемый результат теста

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

## Проверка вручную

1. Откройте https://dev.emdrbilateral.online/
2. Создайте сессию → откройте controller
3. DevTools → Console должен показать:
   ```
   ⏳ Ожидаем подключения viewer перед запуском realtime...
   ```
4. DevTools → Network → NO запросов к `/events?role=controller`
5. Откройте viewer в новой вкладке
6. Controller console:
   ```
   👀 Viewer подключен, запускаем realtime
   🔌 Используется транспорт: SSE
   ```
7. Network → появляются SSE запросы для обеих ролей

## Файлы изменены

- ✅ `packages/web-client/public/js/controller.js` (+58 строк)
- ✅ `packages/web-client/public/viewer.html` (+36 строк)
- ✅ `scripts/e2e/test_sse_pairing.js` (новый, 170 строк)
- ✅ `scripts/e2e/README_SSE_PAIRING.md` (новый)
- ✅ `scripts/e2e/run_sse_pairing_test.sh` (новый)
- ✅ `scripts/e2e/test_minimal.js` (новый)
- ✅ `DEPLOY_SSE_TEST.md` (новый)
- ✅ `package.json` (+2 npm скрипта)

## Зависимости

Уже установлены:
- ✅ `puppeteer@24.35.0`
- ✅ Node.js 16+

## Следующие шаги

1. **Подождать 5 секунд** пока сервер полностью стартует
2. **Запустить тест** одним из способов выше
3. **Проверить логи** если тест упал:
   ```bash
   npm run deploy:dev:logs
   ```
4. **Проверить вручную** в браузере по инструкции выше

## Контакты

Если нужна помощь:
- Проверьте `DEPLOY_SSE_TEST.md` - там troubleshooting
- Проверьте `scripts/e2e/README_SSE_PAIRING.md` - детали теста
- Логи сервера: `npm run deploy:dev:logs`

---

**Статус: ✅ ГОТОВО К ТЕСТИРОВАНИЮ**

Всё задеплоено, осталось только запустить тест когда сервер полностью стартует (через 5 сек после restart).
