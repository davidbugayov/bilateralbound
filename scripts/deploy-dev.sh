#!/bin/bash

# Deploy dev.emdrbilateral.online
# Usage: npm run deploy:dev
#
# Uses rsync to transfer files (git repo on server has no credentials).
# Run from project root.

set -e

SERVER="144.31.68.9"
PROJECT_DIR="/var/www/dev.emdrbilateral.online"
SERVICE="emdrbilateral-dev"
BRANCH="main"
PORT="3003"
MAX_RETRIES=30
RETRY_INTERVAL=2
SSH_KEY="$HOME/.ssh/id_rsa_emdr"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# SSH connection uses key auth (no password needed)
SSH="ssh -o StrictHostKeyChecking=no -i $SSH_KEY root@$SERVER"
RSYNC="rsync -avz --delete --exclude node_modules --exclude .git --exclude dist --exclude .scannerwork --exclude test-results -e \"ssh -o StrictHostKeyChecking=no -i $SSH_KEY\""

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

log "🚀 Starting deployment to dev.emdrbilateral.online ($BRANCH branch)..."

# 1. Rsync code (replaces git pull)
log "📥 Syncing code via rsync..."
eval $RSYNC "$LOCAL_ROOT/" root@$SERVER:$PROJECT_DIR/ || log_error "Rsync failed"
log_success "Code synced"

# 2. Install dependencies (root + web-client)
log "📦 Installing dependencies..."
$SSH bash << 'ENDSSH' || log_error "npm install failed"
set -e
cd /var/www/dev.emdrbilateral.online
npm install --ignore-scripts
cd packages/web-client
npm install --ignore-scripts
ENDSSH
log_success "Dependencies installed"

# 3. Build web-client
log "🔨 Building web-client..."
$SSH bash << 'ENDSSH' || log_error "Build failed"
set -e
cd /var/www/dev.emdrbilateral.online
npm run build:prod
ENDSSH
log_success "Build completed"

# 4. Restart service
log "🔄 Restarting $SERVICE..."
$SSH "systemctl restart $SERVICE && sleep 2" || log_error "Service restart failed"
log_success "Service restarted"

# 5. Wait for service to be ready
log "⏳ Waiting for service to be healthy..."
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if $SSH "systemctl is-active $SERVICE >/dev/null 2>&1"; then
        log_success "Service is running"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        log_error "Service failed to start after $MAX_RETRIES attempts"
    fi
    sleep $RETRY_INTERVAL
done

# 6. Verify deployment
log "📊 Deployment Info:"
$SSH bash << 'ENDSSH'
echo "  Service status:"
systemctl status emdrbilateral-dev --no-pager | grep -E "Active|Main PID" | sed 's/^/    /'
echo ""
echo "  Health check:"
curl -s -o /dev/null -w "  HTTP %{http_code}" http://localhost:3003/ && echo ""
ENDSSH

log_success "✨ Deployment completed!"
echo "🌐 App URL: https://dev.emdrbilateral.online/"
echo "📝 Logs:    npm run deploy:dev:logs"
echo "📋 Status:  npm run deploy:dev:status"
