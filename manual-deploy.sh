#!/bin/bash

##############################################################################
# Резервный скрипт для ручного деплоя BilateralBound
# Используется когда автоматический деплой через webhook не сработал
##############################################################################

set -e  # Останавливаться при ошибках

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Конфигурация сервера
SERVER="213.139.229.44"
USER="root"
PASSWORD='tOx8q7HN+'

# Логирование
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

# Функция для выполнения команды через SSH
ssh_exec() {
    local cmd="$1"
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USER@$SERVER" "$cmd"
}

# Функция для копирования файлов
scp_copy() {
    local src="$1"
    local dest="$2"
    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no -r "$src" "$USER@$SERVER:$dest"
}

# Деплой для конкретного окружения
deploy_environment() {
    local ENV_NAME="$1"
    local BRANCH="$2"
    local WORK_DIR="$3"
    local SERVICE_NAME="$4"
    local PORT="$5"
    
    log "=========================================="
    log "Deploying ${ENV_NAME}"
    log "Branch: ${BRANCH}"
    log "WorkDir: ${WORK_DIR}"
    log "Service: ${SERVICE_NAME}"
    log "Port: ${PORT}"
    log "=========================================="
    
    # Проверяем существование директории
    log "Checking if directory exists..."
    if ssh_exec "[ -d ${WORK_DIR} ]"; then
        log "Directory exists, pulling latest changes..."
        
        # Останавливаем сервис
        log "Stopping service ${SERVICE_NAME}..."
        ssh_exec "systemctl stop ${SERVICE_NAME} || true"
        
        # Обновляем код
        log "Updating code from branch ${BRANCH}..."
        ssh_exec "cd ${WORK_DIR} && git fetch --all"
        ssh_exec "cd ${WORK_DIR} && git checkout ${BRANCH}"
        ssh_exec "cd ${WORK_DIR} && git reset --hard origin/${BRANCH}"
        
        # Устанавливаем зависимости
        log "Installing dependencies..."
        ssh_exec "cd ${WORK_DIR} && npm ci --production"
    else
        log "Directory doesn't exist, cloning repository..."
        ssh_exec "mkdir -p ${WORK_DIR}"
        ssh_exec "git clone -b ${BRANCH} https://github.com/davidbugayov/bilateralbound.git ${WORK_DIR}"
        ssh_exec "cd ${WORK_DIR} && npm ci --production"
    fi
    
    # Принудительно пересоздаем systemd service файл для обновления порта
    local SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    log "Force recreating systemd service file to apply new port..."
    
    ssh_exec "cat > ${SERVICE_FILE} << 'EOF'
[Unit]
Description=BilateralBound EMDR - ${SERVICE_NAME}
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${WORK_DIR}
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
StartLimitInterval=60s
StartLimitBurst=3

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${WORK_DIR} /tmp

StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

Environment=NODE_ENV=production
Environment=PORT=${PORT}

[Install]
WantedBy=multi-user.target
EOF"
    ssh_exec "systemctl daemon-reload"
    
    # Запускаем сервис
    log "Starting service ${SERVICE_NAME}..."
    ssh_exec "systemctl enable ${SERVICE_NAME}"
    ssh_exec "systemctl start ${SERVICE_NAME}"
    
    # Ждем запуска
    sleep 3
    
    # Проверяем статус
    log "Checking service status..."
    if ssh_exec "systemctl is-active --quiet ${SERVICE_NAME}"; then
        log_success "${ENV_NAME} deployed successfully!"
        ssh_exec "systemctl status ${SERVICE_NAME} --no-pager | head -20"
    else
        log_error "${ENV_NAME} deployment failed!"
        ssh_exec "systemctl status ${SERVICE_NAME} --no-pager | head -30"
        return 1
    fi
    
    echo ""
}

# Главное меню
show_menu() {
    echo ""
    echo "=========================================="
    echo "  BilateralBound Manual Deploy Script"
    echo "=========================================="
    echo "1) Deploy PRODUCTION (emdrbilateral.online) - branch: stable"
    echo "2) Deploy PRODUCTION RU (emdrbilateral.ru) - branch: stable"
    echo "3) Deploy DEV (dev.emdrbilateral.online) - branch: main"
    echo "4) Deploy ALL environments"
    echo "5) Check services status"
    echo "6) View logs"
    echo "7) Restart services"
    echo "0) Exit"
    echo "=========================================="
    echo -n "Select option: "
}

# Проверка статуса всех сервисов
check_status() {
    log "Checking services status..."
    echo ""
    
    log "Production (emdrbilateral.online):"
    ssh_exec "systemctl status bilateralbound-prod --no-pager | head -10" || true
    echo ""
    
    log "Production RU (emdrbilateral.ru):"
    ssh_exec "systemctl status bilateralbound-prod-ru --no-pager | head -10" || true
    echo ""
    
    log "Dev (dev.emdrbilateral.online):"
    ssh_exec "systemctl status bilateralbound-dev --no-pager | head -10" || true
    echo ""
}

# Просмотр логов
view_logs() {
    echo ""
    echo "Select logs to view:"
    echo "1) Production (emdrbilateral.online)"
    echo "2) Production RU (emdrbilateral.ru)"
    echo "3) Dev (dev.emdrbilateral.online)"
    echo "4) Webhook server logs"
    echo -n "Select option: "
    read -r log_option
    
    case $log_option in
        1)
            log "Showing production logs (last 50 lines)..."
            ssh_exec "journalctl -u bilateralbound-prod -n 50 --no-pager"
            ;;
        2)
            log "Showing production RU logs (last 50 lines)..."
            ssh_exec "journalctl -u bilateralbound-prod-ru -n 50 --no-pager"
            ;;
        3)
            log "Showing dev logs (last 50 lines)..."
            ssh_exec "journalctl -u bilateralbound-dev -n 50 --no-pager"
            ;;
        4)
            log "Showing webhook server logs..."
            ssh_exec "tail -100 /var/log/webhook-deploy.log" || log_warn "Webhook logs not found"
            ;;
        *)
            log_error "Invalid option"
            ;;
    esac
}

# Перезапуск сервисов
restart_services() {
    echo ""
    echo "Select service to restart:"
    echo "1) Production (emdrbilateral.online)"
    echo "2) Production RU (emdrbilateral.ru)"
    echo "3) Dev (dev.emdrbilateral.online)"
    echo "4) All services"
    echo -n "Select option: "
    read -r restart_option
    
    case $restart_option in
        1)
            log "Restarting production..."
            ssh_exec "systemctl restart bilateralbound-prod"
            log_success "Production restarted"
            ;;
        2)
            log "Restarting production RU..."
            ssh_exec "systemctl restart bilateralbound-prod-ru"
            log_success "Production RU restarted"
            ;;
        3)
            log "Restarting dev..."
            ssh_exec "systemctl restart bilateralbound-dev"
            log_success "Dev restarted"
            ;;
        4)
            log "Restarting all services..."
            ssh_exec "systemctl restart bilateralbound-prod"
            ssh_exec "systemctl restart bilateralbound-prod-ru"
            ssh_exec "systemctl restart bilateralbound-dev"
            log_success "All services restarted"
            ;;
        *)
            log_error "Invalid option"
            ;;
    esac
}

# Проверка зависимостей
check_dependencies() {
    if ! command -v sshpass &> /dev/null; then
        log_error "sshpass is not installed!"
        echo "Install it with:"
        echo "  macOS: brew install hudochenkov/sshpass/sshpass"
        echo "  Linux: sudo apt-get install sshpass"
        exit 1
    fi
}

# Главный цикл
main() {
    log "BilateralBound Manual Deploy Script"
    log "Server: ${SERVER}"
    
    # Проверяем зависимости
    check_dependencies

    # Непрерывный режим: поддержка неинтерактивного запуска
    # Примеры:
    #   ./manual-deploy.sh --env=dev
    #   ./manual-deploy.sh --env=prod
    #   ./manual-deploy.sh --env=prod-ru
    if [ $# -gt 0 ]; then
        ENV_ARG=""
        for arg in "$@"; do
            case "$arg" in
                --env=dev|--dev)
                    ENV_ARG="dev"
                    ;;
                --env=prod|--prod)
                    ENV_ARG="prod"
                    ;;
                --env=prod-ru|--prod-ru)
                    ENV_ARG="prod-ru"
                    ;;
            esac
        done

        if [ -n "$ENV_ARG" ]; then
            if [ "$ENV_ARG" = "dev" ]; then
                deploy_environment \
                    "Dev (dev.emdrbilateral.online)" \
                    "main" \
                    "/var/www/bilateralbound-dev" \
                    "bilateralbound-dev" \
                    "3002"
            elif [ "$ENV_ARG" = "prod" ]; then
                deploy_environment \
                    "Production (emdrbilateral.online)" \
                    "stable" \
                    "/var/www/bilateralbound-prod" \
                    "bilateralbound-prod" \
                    "3000"
            elif [ "$ENV_ARG" = "prod-ru" ]; then
                deploy_environment \
                    "Production RU (emdrbilateral.ru)" \
                    "stable" \
                    "/var/www/bilateralbound-prod-ru" \
                    "bilateralbound-prod-ru" \
                    "3001"
            fi
            exit $?
        fi
    fi
    
    while true; do
        show_menu
        read -r option
        
        case $option in
            1)
                deploy_environment \
                    "Production (emdrbilateral.online)" \
                    "stable" \
                    "/var/www/bilateralbound-prod" \
                    "bilateralbound-prod" \
                    "3000"
                ;;
            2)
                deploy_environment \
                    "Production RU (emdrbilateral.ru)" \
                    "stable" \
                    "/var/www/bilateralbound-prod-ru" \
                    "bilateralbound-prod-ru" \
                    "3001"
                ;;
            3)
                deploy_environment \
                    "Dev (dev.emdrbilateral.online)" \
                    "main" \
                    "/var/www/bilateralbound-dev" \
                    "bilateralbound-dev" \
                    "3002"
                ;;
            4)
                log "Deploying all environments..."
                deploy_environment "Production (emdrbilateral.online)" "stable" "/var/www/bilateralbound-prod" "bilateralbound-prod" "3000"
                deploy_environment "Production RU (emdrbilateral.ru)" "stable" "/var/www/bilateralbound-prod-ru" "bilateralbound-prod-ru" "3001"
                deploy_environment "Dev (dev.emdrbilateral.online)" "main" "/var/www/bilateralbound-dev" "bilateralbound-dev" "3002"
                log_success "All environments deployed!"
                ;;
            5)
                check_status
                ;;
            6)
                view_logs
                ;;
            7)
                restart_services
                ;;
            0)
                log "Exiting..."
                exit 0
                ;;
            *)
                log_error "Invalid option!"
                ;;
        esac
        
        echo ""
        echo -n "Press Enter to continue..."
        read -r
    done
}

# Запуск
main "$@"
