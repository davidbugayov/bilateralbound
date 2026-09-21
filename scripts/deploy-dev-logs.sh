#!/bin/bash

# Show dev service logs
# Usage: npm run deploy:dev:logs

ssh -o StrictHostKeyChecking=no root@144.31.68.9 'journalctl -u emdrbilateral-dev -n 100 --no-pager'
