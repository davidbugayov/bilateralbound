# 🖥️ VPS Server Infrastructure

**IP:** 213.139.229.44  
**OS:** Ubuntu  
**Последнее обновление:** 23 января 2026

## 📂 Структура директорий

```
/var/www/
├── dev.emdrbilateral.online/     ← DEV окружение
│   ├── Git: stable-enhanced
│   ├── Сервис: systemd (emdrbilateral-dev.service)
│   ├── Порт: 3001
│   ├── packages/
│   │   ├── server-core/
│   │   └── web-client/
│   └── Статус: ✅ ONLINE
│
├── emdrbilateral.online/          ← PROD .online (EN)
│   ├── Git: stable
│   ├── Сервис: PM2 процесс
│   ├── Порт: 3002
│   ├── packages/
│   │   ├── server-core/
│   │   └── web-client/
│   └── Статус: ✅ ONLINE
│
└── emdrbilateral.ru/              ← PROD .ru (RU)
    ├── Git: stable
    ├── Сервис: PM2 процесс
    ├── Порт: 3003
    ├── packages/
    │   ├── server-core/
    │   └── web-client/
    └── Статус: ✅ ONLINE
```

## 🔧 Конфигурация сервисов

### DEV - systemd service

**Файл:** `/etc/systemd/system/emdrbilateral-dev.service`

```ini
[Unit]
Description=EMDR Bilateral Dev
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/dev.emdrbilateral.online/packages/server-core
Environment=NODE_ENV=development
Environment=PORT=3001
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Управление:**
```bash
systemctl start emdrbilateral-dev
systemctl stop emdrbilateral-dev
systemctl restart emdrbilateral-dev
systemctl status emdrbilateral-dev
journalctl -u emdrbilateral-dev -f
```

### PROD - PM2 процессы

**Управление:**
```bash
# Статус всех процессов
pm2 status

# Перезапуск
pm2 restart emdrbilateral.online
pm2 restart emdrbilateral.ru

# Логи
pm2 logs emdrbilateral.online
pm2 logs emdrbilateral.ru
pm2 logs --lines 100

# Остановка
pm2 stop emdrbilateral.online
pm2 stop emdrbilateral.ru
```

## 🌐 Nginx конфигурация

Nginx проксирует запросы на Node.js приложения:

- **dev.emdrbilateral.online** → `http://localhost:3001`
- **emdrbilateral.online** → `http://localhost:3002`
- **emdrbilateral.ru** → `http://localhost:3003`

**Конфигурация:** `/etc/nginx/sites-available/`

## 🚀 Процесс развертывания

### Development (автоматически на push в stable-enhanced)

```bash
# SSH на сервер
ssh root@213.139.229.44

# Обновление кода
cd /var/www/dev.emdrbilateral.online
git fetch --all
git checkout stable-enhanced
git pull origin stable-enhanced

# Установка зависимостей
npm install --production --legacy-peer-deps --ignore-scripts

# Перезапуск сервиса
systemctl restart emdrbilateral-dev

# Проверка статуса
systemctl status emdrbilateral-dev
```

### Production (вручную после тестирования на dev)

```bash
# SSH на сервер
ssh root@213.139.229.44

# emdrbilateral.online
cd /var/www/emdrbilateral.online
git fetch --all
git checkout stable
git pull origin stable
npm install --production --legacy-peer-deps --ignore-scripts
pm2 restart emdrbilateral.online

# emdrbilateral.ru
cd /var/www/emdrbilateral.ru
git fetch --all
git checkout stable
git pull origin stable
npm install --production --legacy-peer-deps --ignore-scripts
pm2 restart emdrbilateral.ru

# Проверка
pm2 status
pm2 logs --lines 50
```

## 📊 Мониторинг

### Проверка портов
```bash
lsof -i :3001  # DEV
lsof -i :3002  # PROD .online
lsof -i :3003  # PROD .ru
```

### Проверка процессов
```bash
ps aux | grep node
```

### Логи
```bash
# DEV (systemd)
journalctl -u emdrbilateral-dev -f
journalctl -u emdrbilateral-dev -n 100 --no-pager

# PROD (PM2)
pm2 logs
pm2 logs --lines 100
```

### Проверка доступности
```bash
# Локально на сервере
curl http://localhost:3001  # DEV
curl http://localhost:3002  # PROD .online
curl http://localhost:3003  # PROD .ru

# Извне
curl https://dev.emdrbilateral.online
curl https://emdrbilateral.online
curl https://emdrbilateral.ru
```

## 🔐 SSL Сертификаты

Управляются через Let's Encrypt (certbot):

```bash
certbot certificates
certbot renew
```

Автоматическое обновление настроено через cron.

## 🗂️ Важные файлы

| Файл/Директория | Назначение |
|-----------------|-----------|
| `/etc/systemd/system/emdrbilateral-dev.service` | DEV systemd конфигурация |
| `/etc/nginx/sites-available/` | Nginx конфигурации |
| `/var/www/*/packages/server-core/.env` | Environment переменные (если есть) |
| `/var/log/nginx/` | Nginx логи |
| `~/.pm2/logs/` | PM2 логи |

## 🔄 Git ветки

| Окружение | Ветка | Назначение |
|-----------|-------|-----------|
| **DEV** | `stable-enhanced` | Последние фичи для тестирования |
| **PROD** | `stable` | Стабильная production версия |

## 📝 Примечания

1. **Изоляция окружений:** Каждое окружение - отдельный git clone, независимые `node_modules`
2. **Порты:** DEV=3001, PROD_EN=3002, PROD_RU=3003
3. **Управление:** DEV через systemd, PROD через PM2
4. **Автодеплой:** DEV можно настроить с GitHub webhooks, PROD - только вручную

## 🚨 Troubleshooting

### DEV сервис не запускается
```bash
journalctl -u emdrbilateral-dev -n 100
systemctl status emdrbilateral-dev -l
```

### PROD процесс упал
```bash
pm2 status
pm2 logs --err
pm2 restart all
```

### Порт занят
```bash
lsof -i :3001
kill -9 <PID>
systemctl restart emdrbilateral-dev
```

### Нет места на диске
```bash
df -h
du -sh /var/www/*
npm cache clean --force
```

---

**Последнее обновление:** 23 января 2026  
**Ответственный:** DevOps Team
