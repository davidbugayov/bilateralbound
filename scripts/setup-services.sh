#!/bin/bash

# Скрипт для настройки systemd сервисов на VPS
# Создает 3 сервиса: dev, prod online, prod ru

set -e

SERVER="90.156.254.190"
USER="root"
PASSWORD='9Ddc0BYKqrJZm6a9'

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log "🚀 Создание systemd сервисов на VPS..."

# Создаем временные файлы сервисов
cat > /tmp/emdrbilateral-dev.service << 'EOF'
[Unit]
Description=EMDR Bilateral Dev (dev.emdrbilateral.online)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/dev.emdrbilateral.online/packages/server-core
Environment=NODE_ENV=development
Environment=PORT=3004
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /tmp/emdrbilateral-online.service << 'EOF'
[Unit]
Description=EMDR Bilateral Production Online (emdrbilateral.online)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/emdrbilateral.online/packages/server-core
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /tmp/emdrbilateral-ru.service << 'EOF'
[Unit]
Description=EMDR Bilateral Production RU (emdrbilateral.ru)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/emdrbilateral.ru/packages/server-core
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

log "📤 Загрузка service файлов на сервер..."
sshpass -p "$PASSWORD" scp /tmp/emdrbilateral-dev.service root@$SERVER:/etc/systemd/system/
sshpass -p "$PASSWORD" scp /tmp/emdrbilateral-online.service root@$SERVER:/etc/systemd/system/
sshpass -p "$PASSWORD" scp /tmp/emdrbilateral-ru.service root@$SERVER:/etc/systemd/system/
log_success "Service файлы загружены"

log "🔄 Перезагрузка systemd daemon..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER "systemctl daemon-reload"
log_success "Daemon перезагружен"

log "🚀 Включение и запуск сервисов..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER "
    systemctl enable emdrbilateral-dev.service
    systemctl enable emdrbilateral-online.service
    systemctl enable emdrbilateral-ru.service
    systemctl restart emdrbilateral-dev.service
    systemctl restart emdrbilateral-online.service
    systemctl restart emdrbilateral-ru.service
"
log_success "Сервисы запущены"

log "📊 Проверка статуса сервисов..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER "
    echo '=== DEV ==='
    systemctl status emdrbilateral-dev.service --no-pager | head -10
    echo ''
    echo '=== ONLINE ==='
    systemctl status emdrbilateral-online.service --no-pager | head -10
    echo ''
    echo '=== RU ==='
    systemctl status emdrbilateral-ru.service --no-pager | head -10
"

log_success "✨ Настройка завершена!"
log_success "📱 Доступные окружения:"
log_success "   - Dev: https://dev.emdrbilateral.online"
log_success "   - Prod Online: https://emdrbilateral.online"
log_success "   - Prod RU: https://emdrbilateral.ru"
