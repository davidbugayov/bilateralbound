# 🚀 Руководство по деплою

## VPS Сервер

- **IP**: 213.139.229.44
- **ОС**: Linux (Debian/Ubuntu)
- **Пользователь**: root
- **Порт SSH**: 22

## Структура на VPS

```
/var/www/
├── dev.emdrbilateral.online/     # Development окружение
│   ├── packages/
│   ├── package.json
│   ├── scripts/
│   └── ... (полная копия проекта)
└── emdrbilateral.online/         # Production окружение
    ├── packages/
    ├── package.json
    ├── scripts/
    └── ... (полная копия проекта)
```

## Сайты и домены

### Development

- **URL**: https://dev.emdrbilateral.online
- **Тип**: Развернуто по ветке `main`
- **Путь**: `/var/www/dev.emdrbilateral.online`
- **Статус**: Включено
- **Использование**: Тестирование новых функций

### Production

- **URL**: https://emdrbilateral.online (основной) или https://emdrbilateral.ru (альтернативный)
- **Тип**: Развернуто по ветке `stable`
- **Путь**: `/var/www/emdrbilateral.online`
- **Статус**: Включено
- **Использование**: Основной рабочий сайт
- **Примечание**: Оба домена обслуживаются одним Node.js процессом

## Процессы Node.js

Каждое окружение запускает отдельный Node.js процесс:

```bash
# Development
node /var/www/dev.emdrbilateral.online/packages/server-core/server/index.js

# Production
node /var/www/emdrbilateral.online/packages/server-core/server/index.js
```

## Nginx конфигурация

Оба сайта настроены в Nginx с:

- **SSL/TLS** (Let's Encrypt)
- **Reverse proxy** на Node.js приложение
- **Compression** для оптимизации
- **HTTP/2** поддержка
- **Gzip** для static файлов

## Деплой через Git

### Development деплой

```bash
# На локальной машине
cd bilateral_bound
git add -A
git commit -m "Fix: описание изменений"
git push origin main
```

### Автоматическое обновление на dev сервере

```bash
# На VPS сервере
cd /var/www/dev.emdrbilateral.online
git pull origin main
pm2 restart bilateral-bound-dev
```

## Ручной деплой по SSH

### Для Development

```bash
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no root@213.139.229.44 \
  "cd /var/www/dev.emdrbilateral.online && \
   git pull origin stable-enhanced && \
   npm install --production && \
   pkill -f 'node.*packages/server-core' && \
   sleep 2 && \
   nohup node packages/server-core/server/index.js > /tmp/server-dev.log 2>&1 &"
```

### Для Production

```bash
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no root@213.139.229.44 \
  "cd /var/www/emdrbilateral.online && \
   git pull origin stable && \
   npm install --production && \
   pkill -f 'node.*packages/server-core' && \
   sleep 2 && \
   nohup node packages/server-core/server/index.js > /tmp/server-prod.log 2>&1 &"
```

## Проверка статуса

### SSH подключение

```bash
# Подключиться к серверу
ssh root@213.139.229.44

# Проверить запущенные процессы
ps aux | grep node

# Проверить логи development
tail -f /tmp/server-dev.log

# Проверить логи production
tail -f /tmp/server-prod.log
```

### HTTP проверка

```bash
# Development
curl https://dev.emdrbilateral.online/api/health

# Production (оба домена обслуживаются одним сервером)
curl https://emdrbilateral.online/api/health
curl https://emdrbilateral.ru/api/health
```

## Проблемы и решения

### Сервер не запускается

```bash
# Проверить логи
tail -100 /tmp/server-dev.log

# Убить старые процессы
pkill -9 -f 'node.*packages/server-core'

# Запустить вручную
cd /var/www/dev.emdrbilateral.online
PORT=3000 node packages/server-core/server/index.js
```

### Высокое использование памяти

```bash
# Проверить использование памяти
ps aux | grep node

# Перезапустить сервер
pkill -f 'node.*packages/server-core'
sleep 2
nohup node /var/www/dev.emdrbilateral.online/packages/server-core/server/index.js > /tmp/server-dev.log 2>&1 &
```

## Версионирование

Версия автоматически обновляется в:

- `package.json`
- `packages/server-core/package.json`
- `packages/web-client/package.json`
- `packages/web-client/public/*.html` файлах

Текущая версия: **2.39.125**
