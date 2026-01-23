#!/bin/bash

# Скрипт для развертывания stable-enhanced версии на dev.emdrbilateral.online
# Развертывает последнюю версию из ветки stable-enhanced

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Конфигурация
SERVER="213.139.229.44"
USER="root"
PASSWORD='tOx8q7HN+'
DEV_PATH="/var/www/dev"
BRANCH="stable-enhanced"
DOMAIN="dev.emdrbilateral.online"
RETRY_ATTEMPTS=3
RETRY_DELAY=5

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

# Функция для выполнения команды через SSH с повторными попытками
ssh_exec() {
    local cmd="$1"
    local attempt=1

    while [ $attempt -le $RETRY_ATTEMPTS ]; do
        if sshpass -p "$PASSWORD" ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$USER@$SERVER" "$cmd"; then
            return 0
        fi

        if [ $attempt -lt $RETRY_ATTEMPTS ]; then
            log_warn "Попытка $attempt не удалась. Повторная попытка через ${RETRY_DELAY}сек..."
            sleep $RETRY_DELAY
        fi
        attempt=$((attempt + 1))
    done

    log_error "Ошибка подключения после $RETRY_ATTEMPTS попыток"
    return 1
}

deploy_dev_stable_enhanced() {
    log "🚀 Начинаю развертывание $BRANCH версии на $DOMAIN..."

    log "📍 Проверка директории проекта: $DEV_PATH"
    ssh_exec "test -d $DEV_PATH && echo 'OK' || (echo 'Директория не найдена'; exit 1)"

    log "🔄 Получение всех веток из репозитория..."
    ssh_exec "cd $DEV_PATH && git fetch --all"
    log_success "Ветки обновлены"

    log "📌 Проверка текущей ветки..."
    ssh_exec "cd $DEV_PATH && git branch"

    log "⬇️  Получение последней версии из remote..."
    ssh_exec "cd $DEV_PATH && git reset --hard origin/$BRANCH"
    log_success "Получена последняя версия"

    log "📝 Информация о последних коммитах:"
    ssh_exec "cd $DEV_PATH && git log --oneline -3"

    log "🔄 Перезапуск сервиса bilateralbound-dev..."
    ssh_exec "systemctl restart bilateralbound-dev"
    log_success "Команда перезагрузки отправлена"

    # Ждем пару секунд перед проверкой статуса
    sleep 2

    log "🔍 Проверка статуса сервиса..."
    ssh_exec "systemctl is-active bilateralbound-dev || systemctl status bilateralbound-dev"

    log_success "✨ Развертывание завершено успешно!"
    log_success "📱 Приложение должно быть доступно на: https://$DOMAIN"
}

# Функция для проверки доступности сервера
check_server() {
    log "🔍 Проверка доступности сервера через SSH..."
    if sshpass -p "$PASSWORD" ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$USER@$SERVER" "echo 'OK'" &> /dev/null; then
        log_success "Сервер доступен"
        return 0
    else
        log_error "Сервер недоступен!"
        return 1
    fi
}

# Функция для отката на предыдущую версию в случае ошибки
rollback() {
    log_error "Ошибка при развертывании! Выполняю откат..."
    ssh_exec "cd $DEV_PATH && git revert --no-commit HEAD && systemctl restart bilateralbound-dev"
    log_error "Откат выполнен"
}

# Функция для вывода информации о версии
show_version_info() {
    log "📋 Информация о версии на сервере:"
    ssh_exec "cd $DEV_PATH && echo 'Текущая ветка:' && git branch && echo '' && echo 'Последние коммиты:' && git log --oneline -5"
}

# Функция для вывода справки
show_help() {
    echo ""
    echo "=========================================="
    echo "  Deploy stable-enhanced to DEV"
    echo "=========================================="
    echo "Использование: $0 [опция]"
    echo ""
    echo "Опции:"
    echo "  deploy      - Развернуть stable-enhanced"
    echo "  version     - Показать информацию о версии"
    echo "  status      - Проверить статус сервиса"
    echo "  logs        - Показать последние логи"
    echo "  help        - Показать эту справку"
    echo ""
}

# Функция для проверки статуса сервиса
check_service_status() {
    log "🔍 Проверка статуса сервиса bilateralbound-dev..."
    ssh_exec "systemctl status bilateralbound-dev --no-pager || true"
}

# Функция для просмотра логов
show_logs() {
    log "📋 Последние 50 строк логов сервиса bilateralbound-dev:"
    ssh_exec "journalctl -u bilateralbound-dev -n 50 --no-pager"
}

# Обработка аргументов командной строки
case "${1:-deploy}" in
    deploy)
        check_server && deploy_dev_stable_enhanced || log_error "Ошибка при развертывании"
        ;;
    version)
        show_version_info
        ;;
    status)
        check_service_status
        ;;
    logs)
        show_logs
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Неизвестная опция: $1"
        show_help
        exit 1
        ;;
esac
