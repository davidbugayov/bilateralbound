# SSE Connection Fix - Deployment Guide

## Проблема
SSE соединение не работает из-за несоответствия путей:
- **Клиент подключался к**: `/api/session/:id/stream`
- **Сервер использует**: `/api/session/:id/events`

## Что исправлено

### 1. Клиентский код (sse-client.js)
```javascript
// Было:
return `${protocol}//${host}/api/session/${this.sessionId}/stream?role=${this.role}`

// Стало:
return `${protocol}//${host}/api/session/${this.sessionId}/events?role=${this.role}`
```

### 2. Nginx конфигурация (nginx-fixed.conf)
Добавлен специальный location block для SSE endpoint с отключенным буферингом:

```nginx
# SSE endpoint - MUST come BEFORE general location /
location ~ ^/api/session/[^/]+/events$ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    
    # SSE-specific headers
    proxy_set_header Connection '';
    proxy_set_header Cache-Control 'no-cache';
    proxy_set_header X-Accel-Buffering 'no';
    
    # Disable all buffering for SSE
    proxy_buffering off;
    proxy_cache off;
    
    # Long timeout for SSE connections
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

### 3. Controller синхронизация
Добавлена синхронизация `viewerConnected` и `viewerScreenSize` из `initial_state` и `state_update`.

## Ручной деплой на сервер

### Шаг 1: Подключиться к серверу
```bash
ssh root@213.139.229.44
# Password: 9Ddc0BYKDavidqrJZm6a9
```

### Шаг 2: Обновить код
```bash
cd /var/www/dev.emdrbilateral.online
git pull origin main
```

### Шаг 3: Обновить nginx конфигурацию
```bash
# Backup current config
sudo cp /etc/nginx/sites-available/dev.emdrbilateral.online \
       /etc/nginx/sites-available/dev.emdrbilateral.online.backup

# Copy new config
sudo cp scripts/nginx-fixed.conf /etc/nginx/sites-available/dev.emdrbilateral.online

# Test config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Шаг 4: Перезапустить приложение
```bash
sudo systemctl restart emdrbilateral-dev

# Check status
sudo systemctl status emdrbilateral-dev
```

### Шаг 5: Проверить SSE соединение
```bash
curl -N 'https://dev.emdrbilateral.online/api/session/test123/events?role=viewer' \
     -H 'Accept: text/event-stream'
```

Должно вернуть:
```
event: connected
data: {"sessionId":"test123","timestamp":1234567890}
```

## Автоматический деплой (если SSH работает)
```bash
./scripts/deploy-sse-fix.sh
```

## Проверка в браузере

1. Откройте контроллер: https://dev.emdrbilateral.online/session-controller.html?sessionId=test123
2. Откройте вьювер: https://dev.emdrbilateral.online/viewer.html?sessionId=test123
3. В консоли вьювера должно быть:
   ```
   [SSEClient viewer] SSE connection established
   [SSEClient viewer] Connected to server
   ```

## Что должно работать после исправления

✅ SSE соединение устанавливается
✅ Вьювер получает real-time обновления от сервера
✅ Контроллер видит когда вьювер подключается
✅ Отображаются размеры экрана вьювера
✅ Мяч центрируется правильно
✅ Движение синхронизируется между контроллером и вьювером

## Troubleshooting

### Если SSE всё ещё не работает:

1. **Проверить логи nginx:**
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

2. **Проверить логи приложения:**
   ```bash
   sudo journalctl -u emdrbilateral-dev -f
   ```

3. **Проверить что nginx использует правильную конфигурацию:**
   ```bash
   sudo nginx -T | grep -A 20 "server_name dev.emdrbilateral.online"
   ```

4. **Убедиться что порт 3000 слушается:**
   ```bash
   sudo netstat -tlnp | grep 3000
   ```

## Файлы изменены

- `packages/web-client/public/js/sse-client.js` - изменен путь SSE endpoint
- `packages/web-client/public/js/controller.js` - добавлена синхронизация статуса вьювера
- `packages/server-core/server/session/StateBroadcaster.js` - добавлены флаги подключения в state payload
- `scripts/nginx-fixed.conf` - добавлена SSE конфигурация
- `scripts/deploy-sse-fix.sh` - скрипт автоматического деплоя
- `scripts/update-nginx-dev.sh` - скрипт обновления nginx
