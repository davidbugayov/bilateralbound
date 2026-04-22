#!/bin/bash

# Canary deploy for production services (online -> verify -> ru)
# Usage: bash scripts/deploy-prod-canary.sh

set -e

SERVER="90.156.254.190"
BRANCH="stable"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') ℹ️  $1"
}

fail() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') ❌ $1"
  exit 1
}

check_service() {
  local service=$1
  local retries=30
  local i=0
  while [ $i -lt $retries ]; do
    if ssh root@$SERVER "systemctl is-active $service >/dev/null 2>&1"; then
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  return 1
}

deploy_path() {
  local path=$1
  local branch=$BRANCH
  ssh root@$SERVER bash -s -- "$path" "$branch" << 'ENDSSH'
set -e
cd "$1"
git fetch --all
git reset --hard "origin/$2"
npm install
npm run build
ENDSSH
}

log "🚀 Canary production deploy started"

log "Step 1/4: build .online"
deploy_path "/var/www/emdrbilateral.online" || fail "Build failed for .online"

log "Step 2/4: restart canary service emdrbilateral-online"
ssh root@$SERVER "systemctl restart emdrbilateral-online"
check_service "emdrbilateral-online" || fail "emdrbilateral-online did not become healthy"

log "Step 3/4: bake time (30s)"
sleep 30

log "Step 4/4: deploy .ru after canary success"
deploy_path "/var/www/emdrbilateral.ru" || fail "Build failed for .ru"
ssh root@$SERVER "systemctl restart emdrbilateral-ru"
check_service "emdrbilateral-ru" || fail "emdrbilateral-ru did not become healthy"

log "✅ Canary deploy completed successfully"

