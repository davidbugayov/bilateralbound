# 🚀 Руководство по деплою

## VPS Сервер

- **IP**: 90.156.254.190
- **ОС**: Ubuntu, Linux 6.18
- **Node.js**: v22.22.0
- **RAM**: 4GB
- **Пользователь**: root
- **Порт SSH**: 22

## Окружения

| Окружение  | URL                              | Директория                           | Ветка  | systemd                    | Порт |
|------------|----------------------------------|--------------------------------------|--------|----------------------------|------|
| Dev        | https://dev.emdrbilateral.online | `/var/www/dev.emdrbilateral.online`  | main   | `emdrbilateral-dev`        | 3003 |
| Production | https://emdrbilateral.online     | `/var/www/emdrbilateral.online`      | stable | `emdrbilateral-online`     | 8080 |
| Production | https://emdrbilateral.ru         | `/var/www/emdrbilateral.online`      | stable | `emdrbilateral-ru`         | 8081 |

Оба production домена из одной директории, но разные systemd сервисы на разных портах.

## Nginx

- `/etc/nginx/sites-enabled/emdrbilateral` — .online (→ 8080) и .ru (→ 8081)
- `/etc/nginx/sites-enabled/dev.emdrbilateral.online` — dev (→ 3003)
- WebSocket (wss) проходит через стандартный reverse proxy

## Управление сервисами

```bash
ssh -o StrictHostKeyChecking=no root@90.156.254.190

# Статус
systemctl status emdrbilateral-dev
systemctl status emdrbilateral-online
systemctl status emdrbilateral-ru

# Рестарт
systemctl restart emdrbilateral-dev
systemctl restart emdrbilateral-online
systemctl restart emdrbilateral-ru

# Логи
journalctl -u emdrbilateral-dev -n 50 --no-pager
journalctl -u emdrbilateral-online -n 50 --no-pager
journalctl -u emdrbilateral-ru -n 50 --no-pager

# Список Node.js процессов
ss -tlnp | grep node
```

## Деплой через npm скрипты

### Настройка

Перед деплоем установите `DEPLOY_PASSWORD`:

```bash
export DEPLOY_PASSWORD='password_here'
# Или создайте .env файл (он в .gitignore):
cp .env.example .env
# Отредактируйте .env и добавьте DEPLOY_PASSWORD
```

### Development

```bash
npm run deploy:dev          # git pull origin/main → npm install → npm run build → restart
npm run deploy:dev:status   # Статус systemd
npm run deploy:dev:logs     # Логи (journalctl)
```

### Production

```bash
npm run deploy:prod           # git pull origin/stable → npm install → npm run build → restart обоих
npm run deploy:prod:status    # Статус systemd
npm run deploy:prod:logs      # Логи (journalctl)
```

## Переменные окружения

| Переменная            | Где требуется   | Описание                                       |
|-----------------------|-----------------|-------------------------------------------------|
| `DEPLOY_PASSWORD`     | Для деплоя      | Пароль для SSH деплоя                           |
| `STARS_BOT_TOKEN`     | Для подписок    | Telegram Bot токен (@emdrbilateral_bot)         |
| `STARS_PROVIDER_TOKEN`| Опционально     | Telegram Stars provider_token (обычно пусто для XTR) |

## Архитектура приложения

Monorepo с npm workspaces:

```
bilateral_bound/
├── packages/
│   ├── server-core/         # Node.js + Express сервер (src/index.js)
│   ├── web-client/          # Vanilla JS фронтенд (webpack, src/ → dist/)
│   └── shared/              # Детерминистический physics engine
├── package.json             # Корневой package.json с workspace скриптами
└── scripts/                 # Скрипты деплоя (deploy-dev.sh, deploy-prod.sh)
```

### Entry point

```bash
# Development
node /var/www/dev.emdrbilateral.online/packages/server-core/src/index.js

# Production (.online)
node /var/www/emdrbilateral.online/packages/server-core/src/index.js

# Production (.ru) — тот же файл, разный systemd сервис
node /var/www/emdrbilateral.online/packages/server-core/src/index.js
```

## WebSocket и синхронизация

- **Единственный транспорт**: WebSocket (не SSE, не REST polling)
- **Endpoint**: `wss://host/?sessionId=:id&role=viewer|controller`
- **Heartbeat**: 25с клиент → 30с сервер
- **Auto-reconnect**: exponential backoff, макс 50 попыток
- **Детерминистическая синхронизация**: сервер передаёт только параметры (speed, dirX, dirY, paused, radius, colorBall, colorBg), позиция вычисляется локально на 60Hz

## Telegram Bot

- **Бот**: @emdrbilateral_bot
- **Платежи**: Telegram Stars (валюта XTR, provider_token не нужен)
- **Цена**: 75 Stars за 30 дней
- **Webhook**: `POST /api/subscription/webhook`
- **Команды**: /start, /status, /renew, /cancel, /autorenew
- **Языки**: 8 языков (EN, RU, DE, ES, FR, PT, JA, ZH)

## Health check

```bash
# Development
curl https://dev.emdrbilateral.online/api/health

# Production
curl https://emdrbilateral.online/api/health
curl https://emdrbilateral.ru/api/health
```

## Troubleshooting

### Сервис в crash-loop (EADDRINUSE)

```bash
ssh root@90.156.254.190
systemctl stop emdrbilateral-dev
kill -9 $(lsof -t -i:3003 2>/dev/null)
sleep 3
systemctl start emdrbilateral-dev
```

### Cron-скрипт мониторинга

`/usr/local/bin/check-services.sh` запускается каждые 5 минут и автоматически рестартует упавший сервис.

### VPN (StrongSwan IKEv2)

После перезагрузки VPS iptables NAT правила сбрасываются:

```bash
iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -j MASQUERADE
iptables -A FORWARD -s 10.10.10.0/24 -j ACCEPT
iptables -A FORWARD -d 10.10.10.0/24 -j ACCEPT
```

Правила сохранены в `/etc/iptables.rules` и авто-восстанавливаются через `/etc/networkd-dispatcher/routable.d/50-iptables-restore`.

## Версионирование

Текущая версия: **2.39.553**

Версия автоматически обновляется во всех `package.json` через `npm run version:update` (pre-commit hook).
