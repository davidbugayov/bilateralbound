#!/bin/bash

# Show dev service status
# Usage: npm run deploy:dev:status

ssh -o StrictHostKeyChecking=no root@213.139.229.44 \
    'systemctl status emdrbilateral-dev --no-pager'
