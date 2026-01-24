#!/bin/bash

# Быстрый скрипт для деплоя BilateralBound
# Используется для быстрого обновления всех окружений

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

deploy_prod() {
    log "Deploying Production (emdrbilateral.online)..."
    sshpass -p '9Ddc0BYKqrJZm6a9' ssh -o StrictHostKeyChecking=no root@213.139.229.44 \
        "cd /var/www/bilateralbound-prod && git fetch --all && git checkout stable && git reset --hard origin/stable && npm ci --production --legacy-peer-deps && systemctl restart bilateralbound-prod && systemctl status bilateralbound-prod --no-pager"
    log_success "Production deployed successfully"
}

deploy_prod_ru() {
    log "Deploying Production RU (emdrbilateral.ru)..."
    sshpass -p '9Ddc0BYKqrJZm6a9' ssh -o StrictHostKeyChecking=no root@213.139.229.44 \
        "cd /var/www/bilateralbound-prod-ru && git fetch --all && git checkout stable && git reset --hard origin/stable && npm ci --production --legacy-peer-deps && systemctl restart bilateralbound-prod-ru && systemctl status bilateralbound-prod-ru --no-pager"
    log_success "Production RU deployed successfully"
}

deploy_dev() {
    log "Deploying Dev (dev.emdrbilateral.online)..."
    sshpass -p '9Ddc0BYKqrJZm6a9' ssh -o StrictHostKeyChecking=no root@213.139.229.44 \
        "cd /var/www/bilateralbound-dev && git fetch --all && git checkout main && git reset --hard origin/main && npm ci --production --legacy-peer-deps && systemctl restart bilateralbound-dev && systemctl status bilateralbound-dev --no-pager"
    log_success "Dev deployed successfully"
}

deploy_all() {
    log "Deploying ALL environments..."
    deploy_prod
    deploy_prod_ru
    deploy_dev
    log_success "All environments deployed successfully"
}

show_menu() {
    echo ""
    echo "=========================================="
    echo "  BilateralBound Quick Deploy"
    echo "=========================================="
    echo "1) Deploy PRODUCTION (emdrbilateral.online)"
    echo "2) Deploy PRODUCTION RU (emdrbilateral.ru)"
    echo "3) Deploy DEV (dev.emdrbilateral.online)"
    echo "4) Deploy ALL environments"
    echo "0) Exit"
    echo "=========================================="
    echo -n "Select option: "
}

# Обработка аргументов командной строки
if [ $# -gt 0 ]; then
    case "$1" in
        prod|production)
            deploy_prod
            exit 0
            ;;
        prod-ru|production-ru)
            deploy_prod_ru
            exit 0
            ;;
        dev)
            deploy_dev
            exit 0
            ;;
        all)
            deploy_all
            exit 0
            ;;
        *)
            echo "Usage: $0 [prod|prod-ru|dev|all]"
            exit 1
            ;;
    esac
fi

# Интерактивное меню
while true; do
    show_menu
    read -r option
    
    case $option in
        1)
            deploy_prod
            ;;
        2)
            deploy_prod_ru
            ;;
        3)
            deploy_dev
            ;;
        4)
            deploy_all
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
