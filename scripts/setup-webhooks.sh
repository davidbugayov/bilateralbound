#!/bin/bash

##############################################################################
# Скрипт установки webhook-сервера на VPS
# Разворачивает инфраструктуру для автоматического деплоя
##############################################################################

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Конфигурация
SERVER="213.139.229.44"
USER="root"
PASSWORD='9Ddc0BYKqrJZm6a9'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
log_success() { echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅ $1${NC}"; }
log_error() { echo -e "${RED}[$(date +'%H:%M:%S')] ❌ $1${NC}"; }
log_warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️  $1${NC}"; }

ssh_exec() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USER@$SERVER" "$1"
}

scp_copy() {
    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no "$1" "$USER@$SERVER:$2"
}

# Проверка зависимостей
check_dependencies() {
    log "Проверка зависимостей..."
    
    if ! command -v sshpass &> /dev/null; then
        log_error "sshpass не установлен!"
        echo "Установите: brew install hudochenkov/sshpass/sshpass"
        exit 1
    fi
    
    log_success "Все зависимости установлены"
}

# Генерация webhook secret
generate_secret() {
    openssl rand -hex 32
}

# Установка webhook-сервера
install_webhook_server() {
    log "=========================================="
    log "Установка webhook-сервера"
    log "=========================================="
    
    # Генерируем secret
    WEBHOOK_SECRET=$(generate_secret)
    log "Сгенерирован webhook secret: ${WEBHOOK_SECRET}"
    
    # Создаем директорию
    log "Создание директории /opt/webhook-server..."
    ssh_exec "mkdir -p /opt/webhook-server"
    
    # Копируем файл webhook-сервера
    log "Копирование webhook-server.js..."
    scp_copy "webhook-server.js" "/opt/webhook-server/"
    
    # Устанавливаем права
    ssh_exec "chmod +x /opt/webhook-server/webhook-server.js"
    
    # Создаем systemd service с правильным секретом
    log "Создание systemd service..."
    ssh_exec "cat > /etc/systemd/system/webhook-server.service << 'EOF'
[Unit]
Description=GitHub Webhook Server for BilateralBound Auto-Deploy
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/webhook-server
ExecStart=/usr/bin/node /opt/webhook-server/webhook-server.js
Restart=always
RestartSec=10
StartLimitInterval=60s
StartLimitBurst=5

Environment=NODE_ENV=production
Environment=WEBHOOK_SECRET=${WEBHOOK_SECRET}

NoNewPrivileges=true
PrivateTmp=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=webhook-server

[Install]
WantedBy=multi-user.target
EOF"
    
    # Перезагружаем systemd
    log "Перезагрузка systemd..."
    ssh_exec "systemctl daemon-reload"
    
    # Запускаем сервис
    log "Запуск webhook-сервера..."
    ssh_exec "systemctl enable webhook-server"
    ssh_exec "systemctl start webhook-server"
    
    # Проверяем статус
    sleep 2
    if ssh_exec "systemctl is-active --quiet webhook-server"; then
        log_success "Webhook-сервер успешно запущен!"
        ssh_exec "systemctl status webhook-server --no-pager | head -15"
    else
        log_error "Не удалось запустить webhook-сервер!"
        ssh_exec "systemctl status webhook-server --no-pager"
        exit 1
    fi
    
    # Создаем лог-файл
    log "Создание лог-файла..."
    ssh_exec "touch /var/log/webhook-deploy.log"
    ssh_exec "chmod 666 /var/log/webhook-deploy.log"
    
    log_success "Webhook-сервер установлен!"
    echo ""
    echo "=========================================="
    echo "ВАЖНО: Сохраните webhook secret для GitHub:"
    echo "${WEBHOOK_SECRET}"
    echo "=========================================="
    echo ""
}

# Настройка firewall
setup_firewall() {
    log "=========================================="
    log "Настройка firewall"
    log "=========================================="
    
    log "Открытие порта 9000 для webhook..."
    ssh_exec "ufw allow 9000/tcp comment 'GitHub Webhook Server'" || log_warn "UFW может быть не установлен"
    
    log_success "Firewall настроен"
}

# Настройка nginx (опционально)
setup_nginx() {
    log "=========================================="
    log "Настройка nginx для webhook endpoints"
    log "=========================================="
    
    # Проверяем наличие nginx
    if ! ssh_exec "command -v nginx &> /dev/null"; then
        log_warn "nginx не установлен, пропускаем настройку"
        return
    fi
    
    log "Добавление конфигурации nginx..."
    
    # Для каждого домена добавляем location для webhook
    for domain in "emdrbilateral.online" "emdrbilateral.ru" "dev.emdrbilateral.online"; do
        config_file="/etc/nginx/sites-available/${domain}"
        
        if ssh_exec "[ -f ${config_file} ]"; then
            log "Обновление конфигурации для ${domain}..."
            
            # Добавляем location для webhook если его еще нет
            ssh_exec "grep -q 'location /webhook' ${config_file} || sed -i '/server_name/a\\    location /webhook {\n        proxy_pass http://127.0.0.1:9000;\n        proxy_http_version 1.1;\n        proxy_set_header Host \$host;\n        proxy_set_header X-Real-IP \$remote_addr;\n        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto \$scheme;\n    }' ${config_file}"
        fi
    done
    
    # Перезагружаем nginx
    log "Перезагрузка nginx..."
    ssh_exec "nginx -t && systemctl reload nginx" || log_warn "Не удалось перезагрузить nginx"
    
    log_success "nginx настроен"
}

# Проверка установки
verify_installation() {
    log "=========================================="
    log "Проверка установки"
    log "=========================================="
    
    # Проверяем webhook-сервер
    log "Статус webhook-сервера:"
    ssh_exec "systemctl status webhook-server --no-pager | head -10"
    echo ""
    
    # Проверяем логи
    log "Последние записи в логе:"
    ssh_exec "journalctl -u webhook-server -n 10 --no-pager"
    echo ""
    
    # Проверяем порт
    log "Проверка порта 9000:"
    ssh_exec "netstat -tuln | grep 9000 || ss -tuln | grep 9000" || log_warn "Не удалось проверить порт"
    
    log_success "Установка завершена!"
}

# Вывод инструкций для GitHub
print_github_instructions() {
    cat << 'EOF'

========================================
НАСТРОЙКА WEBHOOK В GITHUB
========================================

1. Откройте настройки репозитория на GitHub:
   https://github.com/davidbugayov/bilateralbound/settings/hooks

2. Нажмите "Add webhook"

3. Заполните данные для каждого webhook:

   A) Production (emdrbilateral.online):
      Payload URL: https://emdrbilateral.online/webhook
      Content type: application/json
      Secret: [используйте сгенерированный secret выше]
      Events: Just the push event
      Active: ✓

   B) Production RU (emdrbilateral.ru):
      Payload URL: https://emdrbilateral.ru/webhook
      Content type: application/json
      Secret: [используйте сгенерированный secret выше]
      Events: Just the push event
      Active: ✓

   C) Development (dev.emdrbilateral.online):
      Payload URL: https://dev.emdrbilateral.online/webhook
      Content type: application/json
      Secret: [используйте сгенерированный secret выше]
      Events: Just the push event
      Active: ✓

4. После создания webhook, GitHub отправит тестовый ping.
   Проверьте логи: ssh root@213.139.229.44 "tail -f /var/log/webhook-deploy.log"

5. Сделайте тестовый push в ветку stable или main для проверки.

========================================
ПОЛЕЗНЫЕ КОМАНДЫ
========================================

Проверка статуса webhook-сервера:
  ssh root@213.139.229.44 "systemctl status webhook-server"

Просмотр логов webhook:
  ssh root@213.139.229.44 "tail -f /var/log/webhook-deploy.log"

Просмотр логов через journalctl:
  ssh root@213.139.229.44 "journalctl -u webhook-server -f"

Перезапуск webhook-сервера:
  ssh root@213.139.229.44 "systemctl restart webhook-server"

Ручной деплой (если webhook не сработал):
  ./manual-deploy.sh

========================================

EOF
}

# Главная функция
main() {
    echo ""
    log "🚀 Установка webhook-сервера для BilateralBound"
    log "Сервер: ${SERVER}"
    echo ""
    
    # Проверяем зависимости
    check_dependencies
    
    # Устанавливаем webhook-сервер
    install_webhook_server
    
    # Настраиваем firewall
    setup_firewall
    
    # Настраиваем nginx (опционально)
    setup_nginx
    
    # Проверяем установку
    verify_installation
    
    # Выводим инструкции
    print_github_instructions
    
    log_success "Все готово! Теперь настройте webhooks в GitHub."
}

# Запуск
main
