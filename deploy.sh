#!/bin/bash

# EMDR Bilateral Auto-Deploy Script
# Downloads latest stable version from GitHub and deploys it

set -e

echo "🚀 Starting EMDR Bilateral deployment..."

# Configuration
APP_DIR="/var/www/html/app"
BACKUP_DIR="/var/www/html/backup"
GITHUB_REPO="https://github.com/davidbugayov/bilateralbound"
BRANCH="stable"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M-%S')] ERROR: $1${NC}"
}

# Create directories
log "Creating directories..."
mkdir -p $APP_DIR
mkdir -p $BACKUP_DIR

# Backup current version
if [ -d "$APP_DIR" ] && [ "$(ls -A $APP_DIR)" ]; then
    log "Creating backup of current version..."
    BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
    cp -r $APP_DIR $BACKUP_DIR/$BACKUP_NAME
    log "Backup created: $BACKUP_NAME"
fi

# Download latest version
log "Downloading latest version from GitHub..."
cd /tmp
rm -f bilateralbound.tar.gz

# Try multiple methods to download
if command -v curl &> /dev/null; then
    curl -L -o bilateralbound.tar.gz "$GITHUB_REPO/archive/refs/heads/$BRANCH.tar.gz"
elif command -v wget &> /dev/null; then
    wget -O bilateralbound.tar.gz "$GITHUB_REPO/archive/refs/heads/$BRANCH.tar.gz"
else
    error "Neither curl nor wget available"
    exit 1
fi

# Extract and move
log "Extracting application..."
rm -rf bilateralbound_temp
tar -xzf bilateralbound.tar.gz
EXTRACTED_DIR=$(ls -d bilateralbound-*/ | head -1)
mv "$EXTRACTED_DIR" "$APP_DIR"

# Install dependencies
log "Installing dependencies..."
cd $APP_DIR
npm install --production

# Set proper permissions
log "Setting permissions..."
chown -R root:root $APP_DIR
chmod -R 755 $APP_DIR

# Create/update systemd service
log "Creating systemd service..."
cat > /etc/systemd/system/emdrbilateral.service << EOF
[Unit]
Description=EMDR Bilateral Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=emdrbilateral

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR /var/log/emdrbilateral

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and restart service
log "Reloading systemd and restarting service..."
systemctl daemon-reload
systemctl enable emdrbilateral.service
systemctl restart emdrbilateral.service

# Wait for service to start
sleep 5

# Health check
log "Performing health check..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    log "✅ Deployment successful!"
    log "🌐 Application available at: https://emdrbilateral.online"
    log "🔗 Health check: https://emdrbilateral.online/health"

    # Cleanup old backups (keep last 5)
    log "Cleaning up old backups..."
    cd $BACKUP_DIR
    ls -t | tail -n +6 | xargs -r rm -rf

    # Log deployment
    echo "$(date): Deployed EMDR Bilateral successfully" >> /var/log/emdrbilateral/deploy.log

else
    error "❌ Health check failed!"
    error "🔄 Rolling back to previous version..."

    # Find latest backup
    LATEST_BACKUP=$(ls -t $BACKUP_DIR | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        rm -rf $APP_DIR
        cp -r $BACKUP_DIR/$LATEST_BACKUP $APP_DIR
        systemctl restart emdrbilateral.service

        error "✅ Rollback completed"
        exit 1
    else
        error "❌ No backup found for rollback!"
        exit 1
    fi
fi

log "🎉 Deployment completed successfully!"
