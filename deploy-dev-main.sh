#!/bin/bash

# Deploy to dev.emdrbilateral.online from main branch
# Usage: bash deploy-dev-main.sh

SERVER="90.156.254.190"
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

# Install dependencies and build client
echo "📦 Installing dependencies and building client..."
ssh -T ${USER}@${SERVER} << 'ENDSSH'
cd /var/www/dev.emdrbilateral.online
# Include devDependencies for webpack build
npm ci --ignore-scripts
# Rebuild the viewer and controller bundles
rm -rf packages/web-client/public/dist/*
npm run build --workspace=packages/web-client
ENDSSH

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed and client rebuilt successfully"
else
    echo "❌ Failed to install dependencies or build client"
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

