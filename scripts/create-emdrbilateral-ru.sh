#!/bin/bash

# Скрипт для создания папки emdrbilateral.ru и развертывания на ней stable ветки

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Конфигурация
SERVER="213.139.229.44"
USER="root"
PASSWORD='tOx8q7HN+'
SOURCE_DIR="/var/www/emdrbilateral.online"
DEST_DIR="/var/www/emdrbilateral.ru"
BRANCH="stable"

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
    sshpass -p "$PASSWORD" ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$USER@$SERVER" "$cmd"
}

echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║      Создание /var/www/emdrbilateral.ru и развертывание stable    ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

log "🔍 Проверка существования источника: $SOURCE_DIR"
ssh_exec "test -d $SOURCE_DIR && echo '✅ Источник найден' || (echo '❌ Источник не найден'; exit 1)"
log_success "Источник найден"

log "🔍 Проверка существования целевой директории"
if ssh_exec "test -d $DEST_DIR"; then
    log_warn "Директория $DEST_DIR уже существует!"
    read -p "Перезаписать? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Отмена операции"
        exit 1
    fi
    log "🗑️  Удаляю существующую директорию"
    ssh_exec "rm -rf $DEST_DIR"
    log_success "Директория удалена"
else
    log "✅ Целевая директория свободна"
fi

log "📋 Копирование $SOURCE_DIR → $DEST_DIR"
ssh_exec "cp -r $SOURCE_DIR $DEST_DIR"
log_success "Копирование завершено"

log "🔄 Обновление git репозитория"
ssh_exec "cd $DEST_DIR && git fetch --all"
log_success "Git fetch завершен"

log "📌 Hard reset на $BRANCH ветку"
ssh_exec "cd $DEST_DIR && git reset --hard origin/$BRANCH"
log_success "Hard reset завершен"

log "🔧 Переустановка зависимостей"
ssh_exec "cd $DEST_DIR && npm ci --production --legacy-peer-deps 2>&1 | tail -3"
log_success "Зависимости установлены"

log "ℹ️  Информация о созданной папке:"
ssh_exec "cd $DEST_DIR && echo 'Размер:' && du -sh . && echo 'Ветка:' && git branch && echo 'Последний коммит:' && git log --oneline -1"

log "🚀 Запуск приложения (PM2)"
ssh_exec "cd $DEST_DIR && pm2 start packages/server-core/server/index.js --name bilateralbound-prod-ru --watch false"
log_success "Приложение запущено через PM2"

log "💾 Сохранение конфигурации PM2"
ssh_exec "pm2 save"
log_success "PM2 конфигурация сохранена"

echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                   ✅ ОПЕРАЦИЯ ЗАВЕРШЕНА УСПЕШНО                  ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

log_success "Папка /var/www/emdrbilateral.ru успешно создана и развернута"
log "📊 Проверка статуса:"
ssh_exec "pm2 list | grep bilateralbound"

log ""
log "🌐 Проверьте доступность сайта:"
log "  curl -I https://emdrbilateral.ru"
log ""

log "📋 Логи приложения:"
log "  sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 logs bilateralbound-prod-ru'"
log ""
