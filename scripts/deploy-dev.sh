#!/bin/bash

# Deploy script for dev.emdrbilateral.online
# Usage: ./scripts/deploy-dev.sh

SERVER="213.139.229.44"
USER="root"
PROJECT_DIR="/var/www/bilateral_bound"
BRANCH="stable-enhanced"

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
npm install
echo "✅ Dependencies installed"
ENDSSH

# Restart PM2 process
echo "🔄 Restarting PM2 process..."
ssh -T ${USER}@${SERVER} bash << ENDSSH
pm2 restart bilateral-bound
pm2 save
echo "✅ PM2 restarted"
ENDSSH

# Check status
echo "📊 Checking deployment status..."
ssh -T ${USER}@${SERVER} bash << ENDSSH
echo "Current commit:"
cd ${PROJECT_DIR} && git log --oneline -1
echo ""
echo "PM2 status:"
pm2 list | grep bilateral-bound
ENDSSH

echo ""
echo "✅ Deployment completed!"
echo "🌐 Check: https://dev.emdrbilateral.online/"
