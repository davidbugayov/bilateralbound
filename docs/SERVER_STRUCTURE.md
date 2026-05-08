# Структура серверов EMDR Bilateral

## Окружения

Проект развернут на VPS **90.156.254.190** в двух окружениях:

### Development

- **URL**: https://dev.emdrbilateral.online
- **Директория**: `/var/www/dev.emdrbilateral.online`
- **Ветка Git**: `main`
- **Порт**: 3003
- **NODE_ENV**: production
- **systemd**: `emdrbilateral-dev`
- **Назначение**: Тестирование новых функций

### Production

- **URL**: https://emdrbilateral.online (основной) и https://emdrbilateral.ru
- **Директория**: `/var/www/emdrbilateral.online` (оба домена из одной директории)
- **Ветка Git**: `stable`
- **systemd**: `emdrbilateral-online` (порт 8080) + `emdrbilateral-ru` (порт 8081)
- **NODE_ENV**: production
- **Назначение**: Основной рабочий сайт

## Nginx конфигурация

Nginx проксирует запросы на соответствующие порты:

- `dev.emdrbilateral.online` → `localhost:3003`
- `emdrbilateral.online` → `localhost:8080`
- `emdrbilateral.ru` → `localhost:8081`

WebSocket подключения (ws/wss) проходят через стандартный reverse proxy без специальных настроек.

## Транспорт реального времени

- **WebSocket** — единственный транспорт (не SSE, не REST polling)
- Путь: `ws://host/?sessionId=:id&role=viewer|controller`
- Heartbeat каждые 25с (клиент), 30с (сервер)
- Auto-reconnect с exponential backoff (макс 50 попыток)

## Детерминистическая синхронизация физики

Сервер НЕ передаёт позицию шара (x/y/vx/vy). Вместо этого:

1. Оба клиента (viewer и controller preview) запускают локальную физику на 60Hz с `clientSimulation: true`
2. Сервер рассылает только изменённые параметры 15 раз/сек (delta compression): speed, dirX, dirY, paused, radius, colorBall, colorBg
3. Одинаковые параметры + `worldWidth/worldHeight` + `FIXED_DT=1/60` = идентичная траектория
4. Bounce события: viewer определяет локально → `bounce` (direction only) → сервер релеит `bounce_sync` контроллеру

## Команды деплоя

```bash
# Development
npm run deploy:dev              # Pull origin/main + build + restart
npm run deploy:dev:status       # Статус systemd
npm run deploy:dev:logs         # Логи (journalctl)

# Production
npm run deploy:prod             # Pull origin/stable + restart обоих сервисов
npm run deploy:prod:status      # Статус systemd
npm run deploy:prod:logs        # Логи
```

## Диагностика

```bash
# Проверить запущенные Node.js процессы
ps aux | grep node | grep -v grep

# Проверить порты
ss -tlnp | grep -E '3003|8080|8081'

# Health check
curl https://dev.emdrbilateral.online/api/health
curl https://emdrbilateral.online/api/health
curl https://emdrbilateral.ru/api/health

# Логи
journalctl -u emdrbilateral-dev -n 50 --no-pager
journalctl -u emdrbilateral-online -n 50 --no-pager
journalctl -u emdrbilateral-ru -n 50 --no-pager
```

## Troubleshooting

### Сервис в crash-loop (EADDRINUSE)

Причина: зомби-процесс держит порт (из-за конкуренции между systemd RestartSec и check-services.sh cron).

```bash
ssh root@90.156.254.190
systemctl stop emdrbilateral-dev  # или emdrbilateral-online/ru
kill -9 $(lsof -t -i:3003 2>/dev/null)
sleep 3
systemctl start emdrbilateral-dev
```

### Cron-скрипт мониторинга

`/usr/local/bin/check-services.sh` запускается каждые 5 минут и автоматически рестартует упавший сервис. При ручном управлении нужно учитывать, что он может запустить orphan-процесс.

## Структура директорий на VPS

```
/var/www/
├── dev.emdrbilateral.online/    # Development (ветка: main)
│   ├── packages/
│   │   ├── server-core/
│   │   ├── web-client/
│   │   └── shared/
│   ├── package.json
│   └── node_modules/
└── emdrbilateral.online/        # Production (ветка: stable)
    ├── packages/
    │   ├── server-core/
    │   ├── web-client/
    │   └── shared/
    ├── package.json
    └── node_modules/
```
