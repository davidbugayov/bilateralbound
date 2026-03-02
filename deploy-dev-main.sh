#!/bin/bash

# Deploy to dev.emdrbilateral.online from main branch
# Usage: bash deploy-dev-main.sh

SERVER="213.139.229.44"
USER="root"
PROJECT_DIR="/var/www/dev.emdrbilateral.online"
SERVICE="emdrbilateral-dev"

echo "🚀 Starting deployment to dev.emdrbilateral.online..."

# Pull latest code from main
echo "📥 Pulling latest code from main..."
ssh -T ${USER}@${SERVER} << 'ENDSSH'
cd /var/www/dev.emdrbilateral.online
git fetch origin
git checkout main
git reset --hard origin/main
ENDSSH

if [ $? -eq 0 ]; then
    echo "✅ Code updated successfully"
else
    echo "❌ Failed to update code"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
ssh -T ${USER}@${SERVER} << 'ENDSSH'
cd /var/www/dev.emdrbilateral.online
npm ci --omit=dev
ENDSSH

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Restart service
echo "🔄 Restarting service..."
ssh -T ${USER}@${SERVER} << 'ENDSSH'
systemctl restart emdrbilateral-dev
sleep 2
systemctl status emdrbilateral-dev
ENDSSH

if [ $? -eq 0 ]; then
    echo "✅ Service restarted successfully"
else
    echo "❌ Failed to restart service"
    exit 1
fi

echo "✅ Deployment completed successfully!"
echo "🌐 Check: https://dev.emdrbilateral.online/"

