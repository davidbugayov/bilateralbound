# Структура серверов EMDR Bilateral

## Окружения

Проект развернут на VPS **213.139.229.44** в двух окружениях:

### Development

- **URL**: https://dev.emdrbilateral.online
- **Директория**: `/var/www/dev.emdrbilateral.online`
- **Ветка Git**: `main`
- **Порт**: 3003
- **NODE_ENV**: production
- **systemd**: `emdrbilateral-dev`
- **Назначение**: Тестирование новых функций

### Production

- **URL**: https://emdrbilateral.online и https://emdrbilateral.ru
- **Директория**: `/var/www/emdrbilateral.online`
- **Ветка Git**: `stable`
- **Порт**: 8080
- **NODE_ENV**: production
- **systemd**: `emdrbilateral-online` + `emdrbilateral-ru`
- **Назначение**: Основной рабочий сайт

## Nginx конфигурация

Nginx проксирует запросы на соответствующие порты:

- `dev.emdrbilateral.online` → `localhost:3003`
- `emdrbilateral.online` → `localhost:8080`
- `emdrbilateral.ru` → `localhost:8080`

**Важно**: SSE endpoint `/api/session/:id/stream` имеет специальный nginx-блок с `proxy_buffering off` и `proxy_read_timeout 3600s`. Без этого EventSource буферизуется и не доставляет события.

## Команды деплоя

```bash
# Development
npm run deploy:dev              # Pull origin/main + restart
npm run deploy:dev:status       # Статус systemd
npm run deploy:dev:logs         # Логи (journalctl)

# Production
npm run deploy:prod             # Pull origin/stable + restart обоих
npm run deploy:prod:status      # Статус systemd
npm run deploy:prod:logs        # Логи
```

## Диагностика

```bash
# Проверить запущенные Node.js процессы
ps aux | grep node | grep -v grep

# Проверить порты
ss -tlnp | grep -E '3003|8080'

# Health check
curl https://dev.emdrbilateral.online/api/health
curl https://emdrbilateral.online/api/health

# Логи
journalctl -u emdrbilateral-dev -n 50 --no-pager
journalctl -u emdrbilateral-online -n 50 --no-pager
```

## Troubleshooting

### Сервис в crash-loop (EADDRINUSE)

Причина: зомби-процесс держит порт (из-за конкуренции между systemd RestartSec и check-services.sh cron).

```bash
ssh root@90.156.254.190
systemctl stop emdrbilateral-dev
kill -9 $(lsof -t -i:3003 2>/dev/null)
sleep 3
systemctl start emdrbilateral-dev
```

### Cron-скрипт мониторинга

`/usr/local/bin/check-services.sh` запускается каждые 5 минут и автоматически рестартует упавший сервис. При ручном управлении нужно учитывать, что он может запустить orphan-процесс.

### Nginx не стримит SSE

Убедиться, что в nginx-конфиге для `/api/session/:id/stream` есть:

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600s;
proxy_set_header Connection '';
```

## Структура директорий на VPS

```
/var/www/
├── dev.emdrbilateral.online/    # Development (ветка: main)
│   ├── packages/server-core/
│   ├── packages/web-client/
│   └── package.json
└── emdrbilateral.online/        # Production (ветка: stable)
    ├── packages/server-core/
    ├── packages/web-client/
    └── package.json
```
