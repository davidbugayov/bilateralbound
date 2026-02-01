# Структура серверов EMDR Bilateral

## Окружения

Проект развернут на VPS **213.139.229.44** в двух окружениях:

### 1. Development
- **URL**: https://dev.emdrbilateral.online
- **Директория**: `/var/www/dev.emdrbilateral.online`
- **Ветка Git**: `stable-enhanced`
- **Порт**: 3000
- **NODE_ENV**: development
- **Назначение**: Тестирование новых функций

### 2. Production
- **URL**: https://emdrbilateral.online (основной) или https://emdrbilateral.ru (альтернативный)
- **Директория**: `/var/www/emdrbilateral.online`
- **Ветка Git**: `stable`
- **Порт**: 3000
- **NODE_ENV**: production
- **Назначение**: Основной рабочий сайт
- **Примечание**: Оба домена указывают на одну директорию и один процесс Node.js

## Node.js процессы

Каждое окружение запускает отдельный Node.js процесс:

```bash
# Development
node /var/www/dev.emdrbilateral.online/packages/server-core/server/index.js

# Production
node /var/www/emdrbilateral.online/packages/server-core/server/index.js
```

Процессы запускаются вручную или автоматически при перезагрузке через systemd/pm2.

## Команды деплоя

### Через npm scripts (из локального проекта)

```bash
# Development
npm run deploy:dev              # Pull + restart
npm run deploy:dev:status       # Проверить статус
npm run deploy:dev:logs         # Показать логи

# Production (оба окружения)
npm run deploy:prod             # Pull + restart для обоих
npm run deploy:prod:status      # Проверить статус
## Nginx конфигурация

Nginx проксирует запросы на соответствующие порты:
- `dev.emdrbilateral.online` → `localhost:3000`
- `emdrbilateral.online` → `localhost:3000`
- `emdrbilateral.ru` → `localhost:3000` (тот же процесс что и .online)

Два продакшн домена (emdrbilateral.online и emdrbilateral.ru) обслуживаются одним Node.js процессом.

## Деплой через Git Push

Оба окружения могут быть обновлены через Git:

```bash
# Development: push в stable-enhanced
git push origin stable-enhanced

# Production: push в stable
git push origin stable
```

После push нужно вручную обновить на сервере:

```bash
# Подключиться к серверу
ssh root@213.139.229.44

# Development обновление
cd /var/www/dev.emdrbilateral.online
git pull origin stable-enhanced
npm install --production
pkill -f 'node.*packages/server-core'
sleep 2
nohup node packages/server-core/server/index.js > /tmp/server-dev.log 2>&1 &

# Production обновление
cd /var/www/emdrbilateral.online
git pull origin stable
npm install --production
pkill -f 'node.*packages/server-core'
sleep 2
nohup node packages/server-core/server/index.js > /tmp/server-prod.log 2>&1 &
```

## Мониторинг

```bash
# Проверить запущенные Node.js процессы
ps aux | grep 'node.*packages/server-core'

# Проверить статус dev сервера
curl https://dev.emdrbilateral.online/api/health

# Проверить статус prod сервера (оба домена)
curl https://emdrbilateral.online/api/health
curl https://emdrbilateral.ru/api/health

# Показать логи dev
tail -f /tmp/server-dev.log

# Показать логи prod
tail -f /tmp/server-prod.log
```

## Troubleshooting

### Сервер не отвечает

```bash
# Подключиться к серверу
ssh root@213.139.229.44

# Проверить процессы
ps aux | grep node

# Убить старые процессы
pkill -9 -f 'node.*packages/server-core'

# Проверить логи последние 50 строк
tail -50 /tmp/server-dev.log
tail -50 /tmp/server-prod.log

# Запустить вручную для debug
cd /var/www/dev.emdrbilateral.online
PORT=3000 node packages/server-core/server/index.js
```

### Высокое использование памяти

```bash
# Проверить процессы
ps aux --sort=-%mem | head -10

# Перезапустить конкретное окружение
pkill -f '/var/www/dev.emdrbilateral.online'
cd /var/www/dev.emdrbilateral.online
nohup node packages/server-core/server/index.js > /tmp/server-dev.log 2>&1 &
```

## Структура директорий на VPS

```
/var/www/
├── dev.emdrbilateral.online/     # Development (ветка: stable-enhanced)
│   ├── packages/server-core/
│   ├── packages/web-client/
│   ├── package.json
│   └── ...
└── emdrbilateral.online/         # Production (ветка: stable)
    ├── packages/server-core/
    ├── packages/web-client/
    ├── package.json
    └── ...
```
