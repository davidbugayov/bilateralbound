#!/bin/bash

# Show dev service status
# Usage: npm run deploy:dev:status

ssh -o StrictHostKeyChecking=no root@144.31.68.9 \
    'systemctl status emdrbilateral-dev --no-pager'
