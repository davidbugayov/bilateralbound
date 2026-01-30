# Инструкция по запуску E2E теста SSE синхронизации

## Проблема: Тест не запускается

### Причина
Puppeteer не установлен или сервер не запущен.

### Решение

#### Шаг 1: Установите зависимости
```bash
cd /Users/davidbugayov/StudioProject/bilateral_bound
npm install
```

Дождитесь окончания установки (может занять несколько минут).

#### Шаг 2: Запустите сервер (в отдельном терминале)
```bash
cd /Users/davidbugayov/StudioProject/bilateral_bound/packages/server-core
PORT=3000 node server/index.js
```

Вы должны увидеть:
```
--- SERVER STARTING (Modular Architecture) ---
```

#### Шаг 3: Проверьте что сервер работает
```bash
curl http://localhost:3000/health
```

Должен вернуть:
```json
{"status":"ok","timestamp":"...","sessions":0,"uptime":...}
```

#### Шаг 4: Запустите тест
```bash
cd /Users/davidbugayov/StudioProject/bilateral_bound
npm run test:sse:sync
```

Или напрямую:
```bash
BASE_URL=http://localhost:3000 HEADLESS=false node scripts/e2e/test_local_sse_sync.js
```

## Если тест всё равно не запускается

### Вариант 1: Проверьте Node.js
```bash
node --version  # Должно быть >= 16.0.0
npm --version   # Должно быть >= 8.0.0
```

### Вариант 2: Проверьте Puppeteer
```bash
ls node_modules/puppeteer
```

Если папки нет - запустите `npm install` ещё раз.

### Вариант 3: Запустите минимальный тест
```bash
node scripts/e2e/test_check.js
```

Это покажет что именно не работает.

### Вариант 4: Ручной тест
Откройте в браузере:
1. Controller: http://localhost:3000/session-controller.html
2. Скопируйте ссылку для viewer и откройте в новой вкладке
3. Проверьте вручную:
   - Изменение цвета мяча
   - Изменение цвета фона
   - Изменение размера
   - Изменение скорости
   - Изменение направления
   - Включение звука
   - Движение мяча

## Контакты для помощи

Если проблема не решается:
1. Проверьте логи сервера
2. Откройте DevTools (F12) в браузере
3. Проверьте вкладку Console на ошибки
4. Проверьте вкладку Network → EventStream на SSE соединения
