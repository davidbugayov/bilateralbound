#!/bin/bash

# Quick deploy helper for BilateralBound
# Usage:
#   ./deploy-quick.sh prod     # deploy production
#   ./deploy-quick.sh prod-ru  # deploy production RU
#   ./deploy-quick.sh dev      # deploy development
#   ./deploy-quick.sh all      # deploy all
#   npm run deploy:prod        # via package.json
#   npm run deploy:prod-ru     # via package.json
#   npm run deploy:dev         # via package.json

set -e

SERVER="213.139.229.44"
USER="root"
PASSWORD='tOx8q7HN+'

run_prod() {
  echo "==> Deploying PROD on ${SERVER}"
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USER@$SERVER" \
    "cd /var/www/bilateralbound-prod && git fetch --all && git checkout stable && git reset --hard origin/stable && npm ci --production --legacy-peer-deps && npm run build && systemctl restart bilateralbound-prod && systemctl status bilateralbound-prod --no-pager"
}

run_prod_ru() {
  echo "==> Deploying PROD-RU on ${SERVER}"
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USER@$SERVER" \
    "cd /var/www/bilateralbound-prod-ru && git fetch --all && git checkout stable && git reset --hard origin/stable && npm ci --production --legacy-peer-deps && npm run build && systemctl restart bilateralbound-prod-ru && systemctl status bilateralbound-prod-ru --no-pager"
}

run_dev() {
  echo "==> Deploying DEV on ${SERVER}"
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USER@$SERVER" \
    "cd /var/www/bilateralbound-dev && git fetch --all && git checkout main && git reset --hard origin/main && npm ci --production --legacy-peer-deps && npm run build && systemctl restart bilateralbound-dev && systemctl status bilateralbound-dev --no-pager"
}

case "$1" in
  prod)
    run_prod
    ;;
  prod-ru)
    run_prod_ru
    ;;
  dev)
    run_dev
    ;;
  all|"")
    run_prod
    run_prod_ru
    run_dev
    ;;
  *)
    echo "Usage: $0 [prod|prod-ru|dev|all]"
    exit 1
    ;;
 esac
