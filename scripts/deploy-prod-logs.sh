#!/bin/bash

# Show production service logs
# Usage: npm run deploy:prod:logs

echo "=== emdrbilateral-online logs ==="
ssh -o StrictHostKeyChecking=no root@144.31.68.9 \
    'journalctl -u emdrbilateral-online -n 50 --no-pager'

echo ""
echo "=== emdrbilateral-ru logs ==="
ssh -o StrictHostKeyChecking=no root@144.31.68.9 \
    'journalctl -u emdrbilateral-ru -n 50 --no-pager'
