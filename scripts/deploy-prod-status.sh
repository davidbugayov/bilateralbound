#!/bin/bash

# Show production service status
# Usage: npm run deploy:prod:status

ssh -o StrictHostKeyChecking=no root@144.31.68.9 \
    'systemctl status emdrbilateral-online emdrbilateral-ru --no-pager'
