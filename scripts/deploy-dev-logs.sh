#!/bin/bash

# Show dev service logs
# Usage: npm run deploy:dev:logs

ssh -o StrictHostKeyChecking=no root@90.156.254.190 'journalctl -u emdrbilateral-dev -n 100 --no-pager'
