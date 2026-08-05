#!/bin/bash
# Setup HTTPS for dev.emdrbilateral.online
#  1) nginx: dev block on port 80 → 301 https + acme-challenge
#  2) Let's Encrypt cert for dev.emdrbilateral.online (webroot /var/www/html)
#  3) nginx: dev block on port 443 → proxy localhost:3003
#
# Prerequisite: DNS A record  dev → 144.31.68.9  must exist in reg.ru panel.
# Usage: bash scripts/setup-dev-https.sh

set -e

SERVER="144.31.68.9"
SSH_KEY="$HOME/.ssh/id_rsa_emdr"
SSH="ssh -o StrictHostKeyChecking=no -i $SSH_KEY root@$SERVER"
NGINX_CONF="/etc/nginx/sites-available/emdrbilateral"
CERT_DIR="/etc/letsencrypt/live/dev.emdrbilateral.online"

log() { echo "$(date '+%H:%M:%S') ℹ️  $1"; }
ok()  { echo "$(date '+%H:%M:%S') ✅ $1"; }
die() { echo "$(date '+%H:%M:%S') ❌ $1"; exit 1; }

# ---------- 1. DNS check ----------
log "Проверяю DNS: dev.emdrbilateral.online"
DNS_IP="$(dig +short @8.8.8.8 dev.emdrbilateral.online A | head -1 || true)"
if [ -z "$DNS_IP" ]; then
    die "DNS ещё не пропагировался.
   Добавьте A-запись в панели reg.ru: host=dev, value=$SERVER, TTL=300
   и повторите: bash scripts/setup-dev-https.sh"
fi
ok "DNS: dev.emdrbilateral.online → $DNS_IP"

# ---------- 2. Backup + ensure symlink ----------
log "Бэкап текущего nginx-конфига"
$SSH "cp $NGINX_CONF $NGINX_CONF.backup.\$(date +%Y%m%d-%H%M%S)"
# nginx reads sites-enabled/* — ensure it points to the file we edit in sites-available
$SSH "ln -sf ../sites-available/emdrbilateral /etc/nginx/sites-enabled/emdrbilateral"
$SSH "mkdir -p /var/www/html"
ok "Бэкап создан, symlink sites-enabled → sites-available гарантирован"

# ---------- 3. Config WITHOUT 443 dev block (only if cert missing) ----------
if ! $SSH "[ -f $CERT_DIR/fullchain.pem ]"; then
    log "Сертификата нет — применяю HTTP-конфиг для acme-валидации"
    $SSH "cat > $NGINX_CONF" <<'NGINX_PHASE1'
# HTTP → HTTPS redirect (prod domains)
server {
    listen 80 default_server;
    server_name emdrbilateral.online emdrbilateral.ru;
    return 301 https://$host$request_uri;
}

# emdrbilateral.online → port 8080
server {
    listen 443 ssl http2;
    server_name emdrbilateral.online www.emdrbilateral.online;
    ssl_certificate /etc/letsencrypt/live/emdrbilateral.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/emdrbilateral.online/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location /breathing {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_hide_header X-Frame-Options;
        add_header X-Frame-Options "ALLOW-FROM https://web.telegram.org" always;
    }

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# emdrbilateral.ru → port 8081
server {
    listen 443 ssl http2;
    server_name emdrbilateral.ru www.emdrbilateral.ru;
    ssl_certificate /etc/letsencrypt/live/emdrbilateral.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/emdrbilateral.online/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location /breathing {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_hide_header X-Frame-Options;
        add_header X-Frame-Options "ALLOW-FROM https://web.telegram.org" always;
    }

    location / {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# dev.emdrbilateral.online → HTTP: acme-валидация + редирект на HTTPS
server {
    listen 80;
    server_name dev.emdrbilateral.online;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}
NGINX_PHASE1
    $SSH "nginx -t && systemctl reload nginx"
    ok "HTTP-конфиг применён"

    log "Выпускаю сертификат Let's Encrypt для dev.emdrbilateral.online"
    $SSH "certbot certonly --webroot -w /var/www/html -d dev.emdrbilateral.online --non-interactive --agree-tos --keep-until-expiring"
    ok "Сертификат выпущен"
else
    log "Сертификат уже есть — пропускаю выпуск"
fi

# ---------- 4. Full config WITH 443 dev block ----------
log "Применяю полный конфиг (dev на 443)"
$SSH "cat > $NGINX_CONF" <<'NGINX_FULL'
# HTTP → HTTPS redirect (prod domains)
server {
    listen 80 default_server;
    server_name emdrbilateral.online emdrbilateral.ru;
    return 301 https://$host$request_uri;
}

# emdrbilateral.online → port 8080
server {
    listen 443 ssl http2;
    server_name emdrbilateral.online www.emdrbilateral.online;
    ssl_certificate /etc/letsencrypt/live/emdrbilateral.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/emdrbilateral.online/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location /breathing {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_hide_header X-Frame-Options;
        add_header X-Frame-Options "ALLOW-FROM https://web.telegram.org" always;
    }

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# emdrbilateral.ru → port 8081
server {
    listen 443 ssl http2;
    server_name emdrbilateral.ru www.emdrbilateral.ru;
    ssl_certificate /etc/letsencrypt/live/emdrbilateral.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/emdrbilateral.online/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location /breathing {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_hide_header X-Frame-Options;
        add_header X-Frame-Options "ALLOW-FROM https://web.telegram.org" always;
    }

    location / {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# dev.emdrbilateral.online → HTTP: acme-валидация + редирект на HTTPS
server {
    listen 80;
    server_name dev.emdrbilateral.online;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

# dev.emdrbilateral.online → port 3003 (HTTPS)
server {
    listen 443 ssl http2;
    server_name dev.emdrbilateral.online;
    ssl_certificate /etc/letsencrypt/live/dev.emdrbilateral.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.emdrbilateral.online/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_FULL
$SSH "nginx -t && systemctl reload nginx"
ok "Полный конфиг применён"

echo ""
echo "==============================================="
echo "✅ HTTPS для dev.emdrbilateral.online настроен!"
echo "Проверка:"
echo "  curl -I https://dev.emdrbilateral.online/"
echo "  npm run test:dev"
echo "==============================================="
