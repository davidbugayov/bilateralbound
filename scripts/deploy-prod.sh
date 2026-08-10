#!/bin/bash

# Deploy production (emdrbilateral.online + emdrbilateral.ru)
# Usage: npm run deploy:prod
#
# Uses rsync to transfer files (git repo on server has no credentials).
# Run from project root.

set -e

SERVER="144.31.68.9"
SERVICE_ONLINE="emdrbilateral-online"
SERVICE_RU="emdrbilateral-ru"
BRANCH="stable"
MAX_RETRIES=30
RETRY_INTERVAL=2
SSH_KEY="$HOME/.ssh/id_rsa_emdr"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# SSH connection uses key auth (no password needed)
SSH="ssh -o StrictHostKeyChecking=no -i $SSH_KEY root@$SERVER"
RSYNC="rsync -avz --delete --exclude node_modules --exclude .git --exclude dist --exclude .scannerwork --exclude test-results --exclude data -e \"ssh -o StrictHostKeyChecking=no -i $SSH_KEY\""

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
        if $SSH "systemctl is-active $service >/dev/null 2>&1"; then
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

deploy_site() {
    local dir=$1
    log "📍 Deploying $dir..."
    log "  📥 Syncing code via rsync..."
    eval $RSYNC "$LOCAL_ROOT/" root@$SERVER:$dir/ || log_error "Rsync failed for $dir"
    log "  📦 Installing dependencies..."
    $SSH "cd $dir && npm install --ignore-scripts" || log_error "npm install failed for $dir"
    log "  🔨 Building..."
    $SSH "cd $dir && npm run build:prod" || log_error "Build failed for $dir"
    log_success "$dir built and ready"
}

log "🚀 Starting production deployment ($BRANCH branch)..."

deploy_site "/var/www/emdrbilateral.online"
deploy_site "/var/www/emdrbilateral.ru"

# 3. Restart both services
log "🔄 Restarting services..."
$SSH "systemctl restart $SERVICE_ONLINE $SERVICE_RU && sleep 2" || log_error "Service restart failed"
log_success "Services restarted"

# 4. Wait for services to be healthy
wait_for_service "$SERVICE_ONLINE"
wait_for_service "$SERVICE_RU"

# 5. Verify deployment
log "📊 Deployment Info:"
$SSH bash << 'ENDSSH'
echo "  emdrbilateral.online:"
systemctl status emdrbilateral-online --no-pager | grep -E "Active|Main PID" | sed 's/^/    /'
echo ""
echo "  emdrbilateral.ru:"
systemctl status emdrbilateral-ru --no-pager | grep -E "Active|Main PID" | sed 's/^/    /'
ENDSSH

log_success "✨ Production deployment completed!"
echo "🌐 URLs:"
echo "   https://emdrbilateral.online/"
echo "   https://emdrbilateral.ru/"
echo "📝 Logs:    npm run deploy:prod:logs"
echo "📋 Status:  npm run deploy:prod:status"
