#!/bin/bash

# Show production service logs
# Usage: npm run deploy:prod:logs

if [ -z "$DEPLOY_PASSWORD" ]; then
    echo "❌ Error: DEPLOY_PASSWORD env var not set"
    exit 1
fi

echo "=== emdrbilateral-online logs ==="
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@90.156.254.190 \
    'journalctl -u emdrbilateral-online -n 50 --no-pager'

echo ""
echo "=== emdrbilateral-ru logs ==="
sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@90.156.254.190 \
    'journalctl -u emdrbilateral-ru -n 50 --no-pager'
