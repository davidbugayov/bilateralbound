# Деплой и Запуск E2E Теста SSE Pairing

## Что было сделано

### 1. Исправления в коде

✅ **controller.js** - добавлена функция `waitForViewerBeforeRealtime()`:
- Опрашивает `/api/session/{id}/state` каждые 2 секунды
- Ждёт появления `viewerConnected: true`
- Только после этого создаёт `RealtimeClient` (SSE)
- Устраняет спам ошибок SSE reconnect когда viewer не подключен

✅ **viewer.html** - добавлена функция `waitForControllerBeforeRealtime()`:
- Аналогично ждёт `controllerConnected: true` через polling
- Предотвращает SSE подключение до готовности controller

✅ **test_sse_pairing.js** - новый E2E тест:
- Создаёт сессию
- Открывает controller первым
- Проверяет отсутствие SSE запросов
- Открывает viewer
- Проверяет успешное SSE подключение обеих сторон
- Тестирует синхронизацию через `controller_update` → `state_update`

### 2. Документация

✅ `scripts/e2e/README_SSE_PAIRING.md` - полное описание теста
✅ `scripts/e2e/run_sse_pairing_test.sh` - скрипт запуска
✅ `scripts/e2e/test_minimal.js` - минимальный тест Puppeteer

### 3. NPM скрипты

Добавлены в `package.json`:
```json
"test:sse:pairing": "BASE_URL=https://dev.emdrbilateral.online node scripts/e2e/test_sse_pairing.js",
"test:sse:pairing:local": "BASE_URL=http://localhost:3000 HEADLESS=false node scripts/e2e/test_sse_pairing.js"
```

## Запуск на сервере

### Вариант 1: Через SSH (рекомендуется для первого раза)

```bash
# 1. Подключаемся к серверу
ssh root@213.139.229.44

# 2. Переходим в директорию проекта
cd /var/www/dev.emdrbilateral.online

# 3. Обновляем код
git fetch --all
git reset --hard origin/stable-enhanced

# 4. Перезапускаем сервис (если нужно)
systemctl restart emdrbilateral-dev

# 5. Ждём 3-5 секунд пока сервис стартует
sleep 5

# 6. Запускаем тест
BASE_URL=https://dev.emdrbilateral.online node scripts/e2e/test_sse_pairing.js

# Или через npm:
npm run test:sse:pairing
```

### Вариант 2: Локально (с вашего Mac)

```bash
cd /Users/davidbugayov/StudioProject/bilateral_bound

# Запуск против dev сервера
npm run test:sse:pairing

# Или напрямую
BASE_URL=https://dev.emdrbilateral.online node scripts/e2e/test_sse_pairing.js
```

### Вариант 3: Через существующий npm скрипт деплоя

```bash
# 1. Деплой
npm run deploy:dev

# 2. Проверка статуса
npm run deploy:dev:status

# 3. Ждём стабилизации (3-5 сек)

# 4. Локальный запуск теста
npm run test:sse:pairing
```

## Ожидаемый вывод

```
🚀 SSE pairing E2E on https://dev.emdrbilateral.online
✅ Session created: a1b2c3
[CONTROLLER] log: ⏳ Ожидаем подключения viewer перед запуском realtime...
🌐 Opening controller (first)...
✅ Controller did not start SSE before viewer
[VIEWER] log: ⏳ Ждем подключения контроллера перед запуском realtime...
🌐 Opening viewer (second)...
[CONTROLLER] log: 👀 Viewer подключен, запускаем realtime
[VIEWER] log: 👀 Контроллер подключен, запускаем realtime
[CONTROLLER] log: ✅ RealtimeClient создан, транспорт: SSE
[VIEWER] log: ✅ RealtimeClient создан, транспорт: sse
✅ Both roles report realtime connected
[VIEWER] log: Received state_update event
✅ Viewer received state_update after controller update

🎉 TEST PASSED
```

## Проверка работы вручную

Если хотите проверить фикс вручную в браузере:

1. Откройте https://dev.emdrbilateral.online/
2. Создайте новую сессию (или перейдите по существующей ссылке controller)
3. Откройте DevTools → Network → фильтр "events"
4. **НЕ ДОЛЖНО** быть запросов к `/api/session/{id}/events?role=controller`
5. В консоли должно быть: `⏳ Ожидаем подключения viewer перед запуском realtime...`
6. Откройте viewer в другой вкладке
7. Теперь в Network появятся SSE запросы для обеих ролей
8. В консоли controller: `👀 Viewer подключен, запускаем realtime`

## Troubleshooting

### Chromium не скачивается на сервере

```bash
# На сервере установите chromium
apt-get update
apt-get install -y chromium-browser
```

### Тест зависает

- Проверьте что сервер работает: `systemctl status emdrbilateral-dev`
- Проверьте логи: `journalctl -u emdrbilateral-dev -n 50`
- Проверьте API: `curl -X POST https://dev.emdrbilateral.online/api/session`

### Тест падает

Проверьте что изменения применены:
```bash
cd /var/www/dev.emdrbilateral.online
git log -1 --oneline  # должен быть коммит про SSE pairing
grep -n "waitForViewerBeforeRealtime" packages/web-client/public/js/controller.js
grep -n "waitForControllerBeforeRealtime" packages/web-client/public/viewer.html
```

## Коммиты

- `33bf1a0` - feat: добавлен E2E тест SSE-паринга + ожидание пары перед подключением
- Следующий - docs: добавлены npm скрипты и README для SSE pairing теста

## Статус

✅ Код закоммичен в `stable-enhanced`  
✅ Запушен в origin  
⏳ Готов к деплою на сервер  
⏳ Готов к запуску тестов
