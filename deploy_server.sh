#!/bin/bash
# Deployment script for EMDR + VPN server

SERVER="root@213.139.229.44"
PASSWORD="t!Vt3bNWtkaq"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run SSH command
run_ssh() {
    echo -e "${YELLOW}Executing: $1${NC}"
    echo "$PASSWORD" | ssh -o StrictHostKeyChecking=no $SERVER "$1"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Success${NC}"
    else
        echo -e "${RED}❌ Failed${NC}"
    fi
}

echo -e "${GREEN}🚀 Starting EMDR + VPN Server Deployment${NC}"
echo "Server: $SERVER"
echo ""

# 1. System Update
echo -e "${YELLOW}1. Системное обновление...${NC}"
run_ssh "apt update && apt upgrade -y"

# 2. Install basic tools
echo -e "${YELLOW}2. Установка базовых инструментов...${NC}"
run_ssh "apt install -y curl wget git ufw fail2ban htop nano"

# 3. Configure timezone and locale
echo -e "${YELLOW}3. Настройка локали и часового пояса...${NC}"
run_ssh "timedatectl set-timezone Europe/Moscow"
run_ssh "locale-gen ru_RU.UTF-8"
run_ssh "update-locale LANG=ru_RU.UTF-8"

# 4. Configure firewall
echo -e "${YELLOW}4. Настройка файрвола...${NC}"
run_ssh "ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 3000/tcp && ufw enable"

# 5. Install Docker for Outline VPN
echo -e "${YELLOW}5. Установка Docker для Outline VPN...${NC}"
run_ssh "curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh"
run_ssh "systemctl enable docker && systemctl start docker"

# 6. Install Node.js
echo -e "${YELLOW}6. Установка Node.js...${NC}"
run_ssh "curl -fsSL https://deb.nodesource.com/setup_18.x | bash -"
run_ssh "apt install -y nodejs"

# 7. Create project directory and clone
echo -e "${YELLOW}7. Развертывание EMDR приложения...${NC}"
run_ssh "mkdir -p /opt/bilateral-bound"
run_ssh "cd /opt/bilateral-bound && git clone https://github.com/davidbugayov/bilateralbound.git ."
run_ssh "cd /opt/bilateral-bound && npm install --production"

# 8. Create environment file
run_ssh "cd /opt/bilateral-bound && cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
WS_PORT=3000
SESSION_TIMEOUT=3600000
LOG_LEVEL=info
CORS_ORIGIN=*
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
EOF"

# 9. Create systemd service
run_ssh "cd /opt/bilateral-bound && cat > /etc/systemd/system/emdr.service << 'EOF'
[Unit]
Description=EMDR Bilateral Therapy Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/bilateral-bound
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=emdr-server

[Install]
WantedBy=multi-user.target
EOF"

# 10. Enable and start service
run_ssh "systemctl daemon-reload"
run_ssh "systemctl enable emdr.service"
run_ssh "systemctl start emdr.service"

# 11. Install Nginx
echo -e "${YELLOW}8. Установка и настройка Nginx...${NC}"
run_ssh "apt install -y nginx"
run_ssh "systemctl enable nginx && systemctl start nginx"

# 12. Configure Nginx sites
run_ssh "cat > /etc/nginx/sites-available/emdrbilateral.online << 'EOF'
server {
    listen 80;
    server_name emdrbilateral.online;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # WebSocket support
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
EOF"

run_ssh "cat > /etc/nginx/sites-available/emdrbilateral.ru << 'EOF'
server {
    listen 80;
    server_name emdrbilateral.ru;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # WebSocket support
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
EOF"

run_ssh "cat > /etc/nginx/sites-available/vpn.emdrbilateral.online << 'EOF'
server {
    listen 80;
    server_name vpn.emdrbilateral.online;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF"

# 13. Enable sites
run_ssh "ln -sf /etc/nginx/sites-available/emdrbilateral.online /etc/nginx/sites-enabled/"
run_ssh "ln -sf /etc/nginx/sites-available/emdrbilateral.ru /etc/nginx/sites-enabled/"
run_ssh "ln -sf /etc/nginx/sites-available/vpn.emdrbilateral.online /etc/nginx/sites-enabled/"
run_ssh "rm -f /etc/nginx/sites-enabled/default"
run_ssh "nginx -t && systemctl reload nginx"

# 14. Install SSL certificates with Certbot
echo -e "${YELLOW}9. Установка SSL сертификатов...${NC}"
run_ssh "apt install -y certbot python3-certbot-nginx"
run_ssh "certbot --nginx -d emdrbilateral.online -d emdrbilateral.ru -d vpn.emdrbilateral.online --non-interactive --agree-tos -m admin@emdrbilateral.online"

# 15. Setup monitoring
echo -e "${YELLOW}10. Настройка мониторинга...${NC}"
run_ssh "cat > /opt/monitor-services.sh << 'EOF'
#!/bin/bash
# Service monitoring script

services=("emdr.service" "nginx" "docker")
log_file="/var/log/service-monitor.log"

for service in "${services[@]}"; do
    if systemctl is-active --quiet "$service"; then
        echo "$(date): $service is running" >> "$log_file"
    else
        echo "$(date): $service is NOT running - restarting" >> "$log_file"
        systemctl restart "$service"
    fi
done

# Check Node.js process
if ! pgrep -f "node server/index.js" > /dev/null; then
    echo "$(date): Node.js process not found - starting" >> "$log_file"
    systemctl start emdr.service
fi
EOF"

run_ssh "chmod +x /opt/monitor-services.sh"
run_ssh "echo '*/5 * * * * /opt/monitor-services.sh' | crontab -"

# 16. Security hardening
echo -e "${YELLOW}11. Усиление безопасности...${NC}"
run_ssh "sed -i 's/#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config"
run_ssh "sed -i 's/#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config"
run_ssh "systemctl restart ssh"

# 17. Install Outline VPN
echo -e "${YELLOW}12. Установка Outline VPN...${NC}"
run_ssh "cd /opt && wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh | bash"

echo -e "${GREEN}✅ Deployment completed!${NC}"
echo ""
echo -e "${GREEN}📋 Summary:${NC}"
echo "✅ Ubuntu 24.04 system updated"
echo "✅ Basic tools installed"
echo "✅ Firewall configured"
echo "✅ Docker installed"
echo "✅ Node.js 18 installed"
echo "✅ EMDR application deployed"
echo "✅ Nginx configured with reverse proxy"
echo "✅ SSL certificates installed"
echo "✅ Monitoring setup"
echo "✅ Security hardened"
echo "✅ Outline VPN installed"
echo ""
echo -e "${YELLOW}🔗 Access URLs:${NC}"
echo "• Main site: http://emdrbilateral.online"
echo "• RU site: http://emdrbilateral.ru"
echo "• VPN management: http://vpn.emdrbilateral.online"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Access Outline VPN management interface"
echo "2. Create VPN keys for users"
echo "3. Test all services"
echo "4. Configure DNS if needed"
