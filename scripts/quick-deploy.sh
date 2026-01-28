#!/bin/bash
set -e

echo "=== Quick Deploy to dev.emdrbilateral.online ==="
echo ""

ssh root@213.139.229.44 << 'EOF'
set -e
echo "1. Navigating to project..."
cd /var/www/emdrbilateral.online

echo "2. Pulling latest code..."
git pull origin stable-enhanced

echo "3. Restarting PM2..."
pm2 restart bilateral-bound

echo "4. Checking status..."
pm2 list | grep bilateral-bound

echo ""
echo "=== Deploy Complete ==="
EOF
