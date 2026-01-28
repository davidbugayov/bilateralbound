#!/bin/bash

# Deploy script for dev.emdrbilateral.online
# Usage: ./scripts/deploy-dev.sh

SERVER="213.139.229.44"
USER="root"
PROJECT_DIR="/var/www/dev.emdrbilateral.online"
BRANCH="stable-enhanced"
SERVICE="emdrbilateral-dev"

echo "🚀 Starting deployment to dev.emdrbilateral.online..."

# Pull latest code
echo "📥 Pulling latest code from $BRANCH..."
ssh -T ${USER}@${SERVER} bash << ENDSSH
cd ${PROJECT_DIR} || exit 1
git fetch --all
git pull origin ${BRANCH}
echo "✅ Code updated"
ENDSSH

# Install dependencies
echo "📦 Installing dependencies..."
ssh -T ${USER}@${SERVER} bash << ENDSSH
cd ${PROJECT_DIR} || exit 1
npm ci --omit=dev
echo "✅ Dependencies installed"
ENDSSH

# Restart systemd service
echo "🔄 Restarting systemd service..."
ssh -T ${USER}@${SERVER} bash << ENDSSH
systemctl restart ${SERVICE}
ENDSSH

# Check status
echo "📊 Checking deployment status..."
ssh -T ${USER}@${SERVER} bash << ENDSSH
echo "Current commit:"
cd ${PROJECT_DIR} && git log --oneline -1
echo ""
echo "Service status:"
systemctl status ${SERVICE} --no-pager
ENDSSH

echo ""
echo "✅ Deployment completed!"
echo "🌐 Check: https://dev.emdrbilateral.online/"
