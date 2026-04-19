#!/bin/bash

# Show dev service status
# Usage: npm run deploy:dev:status

ssh -o StrictHostKeyChecking=no root@90.156.254.190 \
    'systemctl status emdrbilateral-dev --no-pager'
