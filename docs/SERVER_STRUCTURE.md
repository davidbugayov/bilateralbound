# Структура серверов EMDR Bilateral

## Окружения

Проект развернут на VPS **213.139.229.44** в трех окружениях:

### 1. Development
- **URL**: https://dev.emdrbilateral.online
- **Директория**: `/var/www/dev.emdrbilateral.online`
- **Ветка Git**: `stable-enhanced`
- **Service**: `emdrbilateral-dev.service`
- **Порт**: 3001
- **NODE_ENV**: development

### 2. Production Online
- **URL**: https://emdrbilateral.online
- **Директория**: `/var/www/emdrbilateral.online`
- **Ветка Git**: `stable`
- **Service**: `emdrbilateral-online.service`
- **Порт**: 8080
- **NODE_ENV**: production

### 3. Production RU
- **URL**: https://emdrbilateral.ru
- **Директория**: `/var/www/emdrbilateral.ru`
- **Ветка Git**: `stable`
- **Service**: `emdrbilateral-ru.service`
- **Порт**: 8081
- **NODE_ENV**: production

## Systemd сервисы

Все окружения управляются через systemd:

```bash
# Проверка статуса
systemctl status emdrbilateral-dev
systemctl status emdrbilateral-online
systemctl status emdrbilateral-ru

# Перезапуск
systemctl restart emdrbilateral-dev
systemctl restart emdrbilateral-online
systemctl restart emdrbilateral-ru

# Логи
journalctl -u emdrbilateral-dev -f
journalctl -u emdrbilateral-online -f
journalctl -u emdrbilateral-ru -f
```

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
npm run deploy:prod:logs        # Показать логи

# VPS команды
npm run vps:pull                # Обновить код на обоих prod
npm run vps:deploy              # Полный деплой (pull + install + restart)
npm run vps:logs                # Логи обоих prod окружений
npm run vps:ssh                 # Подключиться к серверу
```

### Через скрипты

```bash
# Быстрый деплой всех окружений
./scripts/deploy-quick.sh all

# Отдельные окружения
./scripts/deploy-quick.sh dev
./scripts/deploy-quick.sh prod
./scripts/deploy-quick.sh prod-ru

# Деплой stable-enhanced на dev
./scripts/deploy-stable-enhanced.sh deploy
./scripts/deploy-stable-enhanced.sh status
./scripts/deploy-stable-enhanced.sh logs
```

## Установка сервисов с нуля

Если нужно пересоздать systemd сервисы:

```bash
./scripts/setup-services.sh
```

Этот скрипт:
1. Создаст файлы сервисов в `/etc/systemd/system/`
2. Перезагрузит systemd daemon
3. Включит и запустит все сервисы
4. Покажет их статус

## Структура директорий на VPS

```
/var/www/
├── dev.emdrbilateral.online/       # Dev окружение (stable-enhanced)
│   └── packages/server-core/
│       └── server/index.js
├── emdrbilateral.online/           # Prod Online (stable)
│   └── packages/server-core/
│       └── server/index.js
└── emdrbilateral.ru/               # Prod RU (stable)
    └── packages/server-core/
        └── server/index.js
```

## Nginx конфигурация

Nginx проксирует запросы на соответствующие порты:
- `dev.emdrbilateral.online` → `localhost:3001`
- `emdrbilateral.online` → `localhost:8080`
- `emdrbilateral.ru` → `localhost:8081`

## Мониторинг

```bash
# Все bilateral сервисы
systemctl list-units | grep bilateral

# Статус всех трех сервисов
systemctl status emdrbilateral-*

# Логи всех трех сервисов в реальном времени
journalctl -u emdrbilateral-dev -u emdrbilateral-online -u emdrbilateral-ru -f
```

## Troubleshooting

### Сервис не запускается

```bash
# Проверить логи
journalctl -u emdrbilateral-dev -n 100 --no-pager

# Проверить конфигурацию
systemctl cat emdrbilateral-dev

# Перезагрузить daemon и перезапустить
systemctl daemon-reload
systemctl restart emdrbilateral-dev
```

### Обновить код вручную

```bash
# Подключиться к серверу
ssh root@213.139.229.44

# Обновить dev
cd /var/www/dev.emdrbilateral.online
git fetch --all
git reset --hard origin/stable-enhanced
systemctl restart emdrbilateral-dev

# Обновить prod
cd /var/www/emdrbilateral.online
git fetch --all
git reset --hard origin/stable
systemctl restart emdrbilateral-online

cd /var/www/emdrbilateral.ru
git fetch --all
git reset --hard origin/stable
systemctl restart emdrbilateral-ru
```

## Автозапуск

Все сервисы настроены на автозапуск при перезагрузке сервера через `WantedBy=multi-user.target`.

Проверить:
```bash
systemctl is-enabled emdrbilateral-dev
systemctl is-enabled emdrbilateral-online
systemctl is-enabled emdrbilateral-ru
```

Все должны показывать `enabled`.
