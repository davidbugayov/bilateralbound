#!/bin/bash

# Quick deploy helper for BilateralBound
# Usage:
#   ./deploy-quick.sh prod   # deploy production
#   ./deploy-quick.sh dev    # deploy development
#   ./deploy-quick.sh all    # deploy both
#   npm run deploy:prod      # via package.json
#   npm run deploy:dev       # via package.json

set -e

SERVER="213.139.229.44"
USER="root"
PASSWORD='tOx8q7HN+'

run_prod() {
  echo "==> Deploying PROD on ${SERVER}"
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USER@$SERVER" \
    "cd /var/www/bilateralbound-prod && git pull && systemctl restart bilateralbound-prod && systemctl status bilateralbound-prod --no-pager"
}

run_dev() {
  echo "==> Deploying DEV on ${SERVER}"
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USER@$SERVER" \
    "cd /var/www/bilateralbound-dev && git pull && systemctl restart bilateralbound-dev && systemctl status bilateralbound-dev --no-pager"
}

case "$1" in
  prod)
    run_prod
    ;;
  dev)
    run_dev
    ;;
  all|"")
    run_prod
    run_dev
    ;;
  *)
    echo "Usage: $0 [prod|dev|all]"
    exit 1
    ;;
 esac
