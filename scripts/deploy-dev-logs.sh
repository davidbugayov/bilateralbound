#!/bin/bash

# Show dev service logs
# Usage: npm run deploy:dev:logs

if [ -z "$DEPLOY_PASSWORD" ]; then
    echo "❌ Error: DEPLOY_PASSWORD env var not set"
    exit 1
fi

sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@213.139.229.44 \
    'journalctl -u emdrbilateral-dev -n 100 --no-pager'
