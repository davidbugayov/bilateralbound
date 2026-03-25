#!/bin/bash

# Show production service status
# Usage: npm run deploy:prod:status

if [ -z "$DEPLOY_PASSWORD" ]; then
    echo "❌ Error: DEPLOY_PASSWORD env var not set"
    exit 1
fi

sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no root@213.139.229.44 \
    'systemctl status emdrbilateral-online emdrbilateral-ru --no-pager'
