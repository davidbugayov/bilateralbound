#!/bin/bash

# Deploy production (emdrbilateral.online + emdrbilateral.ru)
# Usage: npm run deploy:prod

set -e

SERVER="213.139.229.44"
BRANCH="stable"
MAX_RETRIES=30
RETRY_INTERVAL=2

# Source password from local env
if [ -z "$DEPLOY_PASSWORD" ]; then
    echo "❌ Error: DEPLOY_PASSWORD env var not set"
    echo "   Set it in .env or: export DEPLOY_PASSWORD='your_password'"
    exit 1
fi

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') ℹ️  $1"
}

log_success() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') ✅ $1"
}

log_error() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') ❌ $1"
    exit 1
}

wait_for_service() {
    local service=$1
    log "⏳ Waiting for $service to be healthy..."
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER "systemctl is-active $service >/dev/null 2>&1"; then
            log_success "$service is running"
            return 0
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            log_error "$service failed to start after $MAX_RETRIES attempts"
        fi
        sleep $RETRY_INTERVAL
    done
}

log "🚀 Starting production deployment ($BRANCH branch)..."

# 1. Deploy emdrbilateral.online
log "📍 Deploying emdrbilateral.online..."
log "  📥 Pulling code..."
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER bash << 'ENDSSH' || log_error "Git pull for .online failed"
set -e
cd /var/www/emdrbilateral.online
git fetch --all
git reset --hard origin/stable
ENDSSH

log "  📦 Installing dependencies..."
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER bash << 'ENDSSH' || log_error "npm install for .online failed"
set -e
cd /var/www/emdrbilateral.online
npm install
ENDSSH

log "  🔨 Building..."
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER bash << 'ENDSSH' || log_error "Build for .online failed"
set -e
cd /var/www/emdrbilateral.online
npm run build
ENDSSH
log_success "emdrbilateral.online built and ready"

# 2. Deploy emdrbilateral.ru
log "📍 Deploying emdrbilateral.ru..."
log "  📥 Pulling code..."
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER bash << 'ENDSSH' || log_error "Git pull for .ru failed"
set -e
cd /var/www/emdrbilateral.ru
git fetch --all
git reset --hard origin/stable
ENDSSH

log "  📦 Installing dependencies..."
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER bash << 'ENDSSH' || log_error "npm install for .ru failed"
set -e
cd /var/www/emdrbilateral.ru
npm install
ENDSSH

log "  🔨 Building..."
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER bash << 'ENDSSH' || log_error "Build for .ru failed"
set -e
cd /var/www/emdrbilateral.ru
npm run build
ENDSSH
log_success "emdrbilateral.ru built and ready"

# 3. Restart both services
log "🔄 Restarting services..."
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER bash << 'ENDSSH' || log_error "Service restart failed"
systemctl restart emdrbilateral-online emdrbilateral-ru
sleep 2
ENDSSH
log_success "Services restarted"

# 4. Wait for services to be healthy
wait_for_service "emdrbilateral-online"
wait_for_service "emdrbilateral-ru"

# 5. Verify deployment
log "📊 Deployment Info:"
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER bash << 'ENDSSH'
echo "  emdrbilateral.online:"
cd /var/www/emdrbilateral.online && git log --oneline -1 | sed 's/^/    /'
systemctl status emdrbilateral-online --no-pager | grep -E "Active|Main PID" | sed 's/^/    /'
echo ""
echo "  emdrbilateral.ru:"
cd /var/www/emdrbilateral.ru && git log --oneline -1 | sed 's/^/    /'
systemctl status emdrbilateral-ru --no-pager | grep -E "Active|Main PID" | sed 's/^/    /'
ENDSSH

log_success "✨ Production deployment completed!"
echo "🌐 URLs:"
echo "   https://emdrbilateral.online/"
echo "   https://emdrbilateral.ru/"
echo "📝 Logs:    npm run deploy:prod:logs"
echo "📋 Status:  npm run deploy:prod:status"
