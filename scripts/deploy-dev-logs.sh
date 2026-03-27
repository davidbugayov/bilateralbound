#!/bin/bash

# Show dev service logs
# Usage: npm run deploy:dev:logs

ssh root@213.139.229.44 'journalctl -u emdrbilateral-dev -n 100 --no-pager'
