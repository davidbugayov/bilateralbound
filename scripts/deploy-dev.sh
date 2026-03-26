#!/bin/bash

# Deploy dev.emdrbilateral.online
# Usage: npm run deploy:dev

set -e

SERVER="213.139.229.44"
PROJECT_DIR="/var/www/dev.emdrbilateral.online"
SERVICE="emdrbilateral-dev"
BRANCH="main"
PORT="3003"
HEALTH_CHECK_URL="https://dev.emdrbilateral.online/"
MAX_RETRIES=30
RETRY_INTERVAL=2

# SSH connection uses key auth (no password needed)

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

# 1. Pull and build
log "📥 Pulling code from $BRANCH..."
ssh root@$SERVER bash << 'ENDSSH' || log_error "Git pull failed"
set -e
cd /var/www/dev.emdrbilateral.online
git fetch --all
git reset --hard origin/main
ENDSSH
log_success "Code pulled"

# 2. Install dependencies
log "📦 Installing dependencies..."
ssh root@$SERVER bash << 'ENDSSH' || log_error "npm install failed"
set -e
cd /var/www/dev.emdrbilateral.online
npm install
ENDSSH
log_success "Dependencies installed"

# 3. Build web-client (CRITICAL STEP)
log "🔨 Building web-client..."
ssh root@$SERVER bash << 'ENDSSH' || log_error "Build failed"
set -e
cd /var/www/dev.emdrbilateral.online
npm run build
ENDSSH
log_success "Build completed"

# 4. Restart service
log "🔄 Restarting $SERVICE..."
ssh root@$SERVER bash << 'ENDSSH' || log_error "Service restart failed"
systemctl restart emdrbilateral-dev
sleep 2
ENDSSH
log_success "Service restarted"

# 5. Wait for service to be ready
log "⏳ Waiting for service to be healthy..."
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ssh root@$SERVER "systemctl is-active emdrbilateral-dev >/dev/null 2>&1"; then
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
ssh root@$SERVER bash << 'ENDSSH'
echo "  Latest commit:"
cd /var/www/dev.emdrbilateral.online && git log --oneline -1 | sed 's/^/    /'
echo ""
echo "  Service status:"
systemctl status emdrbilateral-dev --no-pager | grep -E "Active|Main PID" | sed 's/^/    /'
ENDSSH

log_success "✨ Deployment completed!"
echo "🌐 App URL: https://dev.emdrbilateral.online/"
echo "📝 Logs:    npm run deploy:dev:logs"
echo "📋 Status:  npm run deploy:dev:status"
