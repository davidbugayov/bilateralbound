#!/bin/bash

# ПОЛНЫЙ ШАБЛОН РАЗВЕРТЫВАНИЯ EMDR BILATERAL + VPN
# Используйте этот скрипт для развертывания на новом сервере

# НАСТРОЙКИ СЕРВЕРА (ИЗМЕНИТЕ ПОД СВОИ НУЖДЫ)
SERVER="213.139.229.44"  # Измените на IP нового сервера
USER="root"              # Пользователь сервера
PASSWORD='t!Vt3bNWtkaq'  # Пароль сервера

# НАСТРОЙКИ ДОМЕНОВ (ИЗМЕНИТЕ ПОД СВОИ ДОМЕНЫ)
DOMAINS=("emdrbilateral.online" "emdrbilateral.ru")
VPN_DOMAIN="vpn.emdrbilateral.online"

# НАСТРОЙКИ VPN ПОЛЬЗОВАТЕЛЕЙ (ИЗМЕНИТЕ ПО НЕОБХОДИМОСТИ)
VPN_USERS=("user1:SecurePassword123!" "admin:AdminPassword789!")

echo "🚀 ПОЛНОЕ РАЗВЕРТЫВАНИЕ EMDR BILATERAL + VPN"
echo "=========================================="
echo "Сервер: $SERVER"
echo "Домены: ${DOMAINS[*]}"
echo "VPN домен: $VPN_DOMAIN"
echo ""

# Функция для выполнения команд на сервере
run_command() {
    echo ""
    echo "📋 Выполнение: $2"
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
    echo "✅ Выполнено"
}

# Функция для загрузки файлов на сервер
upload_file() {
    echo "📤 Загрузка файла: $1"
    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no "$1" $USER@$SERVER:"$2"
    echo "✅ Загружено"
}

echo "🔧 ШАГ 1: ОБНОВЛЕНИЕ СИСТЕМЫ"
run_command "apt update && apt upgrade -y" "Обновление системы"

echo ""
echo "🔧 ШАГ 2: УСТАНОВКА НЕОБХОДИМЫХ ПАКЕТОВ"
run_command "apt install -y curl wget git nodejs npm nginx certbot python3-certbot-nginx ufw fail2ban" "Установка базовых пакетов"

echo ""
echo "🔧 ШАГ 3: УСТАНОВКА NODE.JS (если версия ниже 16)"
run_command "node --version || curl -fsSL https://deb.nodesource.com/setup_18.x | bash -" "Проверка версии Node.js"
run_command "apt install -y nodejs" "Установка Node.js"

echo ""
echo "🔧 ШАГ 4: УСТАНОВКА STRONGSWAN ДЛЯ VPN"
run_command "apt install -y strongswan strongswan-pki libcharon-extra-plugins libcharon-extauth-plugins libstrongswan-extra-plugins" "Установка StrongSwan"

echo ""
echo "🔧 ШАГ 5: СОЗДАНИЕ СЕРТИФИКАТОВ VPN"
run_command "mkdir -p ~/pki/{cacerts,certs,private} && chmod 700 ~/pki" "Создание директорий для сертификатов"

run_command "cd ~/pki && ipsec pki --gen --type rsa --size 4096 --outform pem > private/ca-key.pem" "Генерация CA ключа"

run_command "cd ~/pki && ipsec pki --self --ca --lifetime 3650 --in private/ca-key.pem --type rsa --dn 'CN=VPN root CA' --outform pem > cacerts/ca-cert.pem" "Создание CA сертификата"

run_command "cd ~/pki && ipsec pki --gen --type rsa --size 4096 --outform pem > private/server-key.pem" "Генерация серверного ключа"

run_command "cd ~/pki && ipsec pki --pub --in private/server-key.pem --type rsa | ipsec pki --issue --lifetime 1825 --cacert cacerts/ca-cert.pem --cakey private/ca-key.pem --dn 'CN=$VPN_DOMAIN' --san $VPN_DOMAIN --san $SERVER --flag serverAuth --flag ikeIntermediate --outform pem > certs/server-cert.pem" "Создание серверного сертификата"

run_command "cp -r ~/pki/* /etc/ipsec.d/" "Копирование сертификатов"

echo ""
echo "🔧 ШАГ 6: НАСТРОЙКА STRONGSWAN"
run_command "cat > /etc/ipsec.conf << EOF
config setup
    charondebug=\"ike 1, knl 1, cfg 0\"
    uniqueids=no

conn ikev2-vpn
    auto=add
    compress=no
    type=tunnel
    keyexchange=ikev2
    fragmentation=yes
    forceencaps=yes
    dpdaction=clear
    dpddelay=300s
    rekey=no
    left=%any
    leftid=@$VPN_DOMAIN
    leftcert=server-cert.pem
    leftsendcert=always
    leftsubnet=0.0.0.0/0
    right=%any
    rightid=%any
    rightauth=eap-mschapv2
    rightsourceip=10.10.10.0/24
    rightdns=8.8.8.8,8.8.4.4
    rightsendcert=never
    # Совместимые с macOS алгоритмы
    ike=aes256-sha256-modp2048,aes256-sha256-modp1024,aes128-sha256-modp1024,aes256-sha1-modp1024,aes128-sha1-modp1024,3des-sha1-modp1024!
    esp=aes256-sha256,aes256-sha1,aes128-sha256,aes128-sha1,3des-sha1!
    eap_identity=%identity
EOF" "Создание конфигурации StrongSwan"

# Создание пользователей VPN
USER_SECRETS=""
for user in "${VPN_USERS[@]}"; do
    USERNAME=$(echo $user | cut -d: -f1)
    PASSWORD=$(echo $user | cut -d: -f2)
    USER_SECRETS="$USER_SECRETS$USERNAME : EAP \"$PASSWORD\"
"
done

run_command "cat > /etc/ipsec.secrets << EOF
: RSA \"server-key.pem\"
$USER_SECRETS
EOF" "Создание пользователей VPN"

run_command "chmod 600 /etc/ipsec.secrets" "Установка прав на секреты"

echo ""
echo "🔧 ШАГ 7: НАСТРОЙКА СЕТИ И МАРШРУТИЗАЦИИ"
run_command "echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf && echo 'net.ipv6.conf.all.forwarding=1' >> /etc/sysctl.conf && sysctl -p" "Включение IP forwarding"

run_command "apt install -y iptables-persistent" "Установка iptables-persistent"

run_command "iptables -t nat -F" "Очистка старых правил NAT"
run_command "iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -j MASQUERADE" "Добавление правила MASQUERADE"
run_command "iptables -A FORWARD -s 10.10.10.0/24 -j ACCEPT" "Разрешение форвардинга"
run_command "iptables -A FORWARD -d 10.10.10.0/24 -j ACCEPT" "Разрешение обратного форвардинга"
run_command "netfilter-persistent save" "Сохранение правил"

echo ""
echo "🔧 ШАГ 8: НАСТРОЙКА FIREWALL"
run_command "ufw allow OpenSSH" "Разрешение SSH"
run_command "ufw allow 'Nginx Full'" "Разрешение веб-сервера"
run_command "ufw allow 500/udp" "Разрешение IKEv2"
run_command "ufw allow 4500/udp" "Разрешение NAT Traversal"
run_command "ufw --force enable" "Включение firewall"

echo ""
echo "🔧 ШАГ 9: НАСТРОЙКА NGINX"
run_command "cat > /etc/nginx/sites-available/emdrbilateral << 'EOF'
server {
    listen 80;
    server_name _;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate /etc/letsencrypt/live/\$host/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/\$host/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;

    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    add_header Strict-Transport-Security \"max-age=63072000; includeSubDomains; preload\";
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection \"1; mode=block\";

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
    }
}
EOF" "Создание конфигурации Nginx"

run_command "ln -sf /etc/nginx/sites-available/emdrbilateral /etc/nginx/sites-enabled/" "Включение сайта"
run_command "rm -f /etc/nginx/sites-enabled/default" "Отключение дефолтного сайта"
run_command "systemctl reload nginx" "Перезапуск Nginx"

echo ""
echo "🔧 ШАГ 10: УСТАНОВКА SSL СЕРТИФИКАТОВ"
for domain in "${DOMAINS[@]}"; do
    echo "Получение сертификата для $domain..."
    run_command "certbot --nginx -d $domain --non-interactive --agree-tos --register-unsafely-without-email" "Получение SSL сертификата"
done

echo ""
echo "🔧 ШАГ 11: СОЗДАНИЕ ПРИЛОЖЕНИЯ"
run_command "mkdir -p /var/www/emdrbilateral" "Создание директории приложения"

# Создание основного HTML файла
run_command "cat > /var/www/emdrbilateral/index.html << 'EOF'
<!DOCTYPE html>
<html lang=\"ru\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>EMDR Bilateral Therapy</title>
    <link rel=\"stylesheet\" href=\"/css/common.css\">
    <link rel=\"stylesheet\" href=\"/css/light-theme.css\">
    <link rel=\"icon\" href=\"/favicon.ico\" type=\"image/x-icon\">
</head>
<body>
    <div id=\"app\">
        <h1>EMDR Bilateral Therapy</h1>
        <div class=\"status\">
            <h2>Статус сервера</h2>
            <p>Сервер активен и работает</p>
            <p>Время: $(date)</p>
            <p>Среда: Production</p>
        </div>
    </div>
    <script src=\"/js/common.js\"></script>
    <script src=\"/js/controller.js\"></script>
</body>
</html>
EOF" "Создание главной страницы"

# Создание простого сервера
run_command "cat > /var/www/emdrbilateral/server.js << 'EOF'
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3000;

const server = http.createServer((req, res) => {
  console.log('Запрос:', req.url);

  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'active',
      service: 'EMDR Bilateral Therapy',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Отправляем HTML файл
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Файл не найден');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    }
  });
});

server.listen(port, () => {
  console.log('EMDR сервер запущен на порту', port);
});
EOF" "Создание серверного файла"

# Создание package.json
run_command "cat > /var/www/emdrbilateral/package.json << 'EOF'
{
  \"name\": \"emdrbilateral\",
  \"version\": \"1.0.0\",
  \"description\": \"EMDR Bilateral Therapy Application\",
  \"main\": \"server.js\",
  \"scripts\": {
    \"start\": \"node server.js\"
  },
  \"dependencies\": {
    \"express\": \"^4.18.0\"
  },
  \"engines\": {
    \"node\": \">=16.0.0\"
  }
}
EOF" "Создание package.json"

echo ""
echo "🔧 ШАГ 12: УСТАНОВКА ЗАВИСИМОСТЕЙ"
run_command "cd /var/www/emdrbilateral && npm install" "Установка npm пакетов"

echo ""
echo "🔧 ШАГ 13: НАСТРОЙКА ПРАВ ДОСТУПА"
run_command "chown -R root:root /var/www/emdrbilateral && chmod -R 755 /var/www/emdrbilateral" "Настройка прав"

echo ""
echo "🔧 ШАГ 14: СОЗДАНИЕ СИСТЕМНОГО СЕРВИСА"
run_command "cat > /etc/systemd/system/emdrbilateral.service << 'EOF'
[Unit]
Description=EMDR Bilateral Therapy Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/emdrbilateral
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=emdrbilateral

Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF" "Создание systemd сервиса"

run_command "systemctl daemon-reload && systemctl enable emdrbilateral.service && systemctl start emdrbilateral.service" "Запуск сервиса"

echo ""
echo "🔧 ШАГ 15: ЗАПУСК VPN СЕРВИСА"
run_command "systemctl enable strongswan-starter && systemctl restart strongswan-starter" "Запуск VPN сервиса"

echo ""
echo "⏳ ШАГ 16: ОЖИДАНИЕ ЗАПУСКА СЕРВИСОВ"
sleep 10

echo ""
echo "🔧 ШАГ 17: ПРОВЕРКА СТАТУСА СЕРВИСОВ"
run_command "systemctl status emdrbilateral.service --no-pager | head -10" "Статус приложения"
run_command "systemctl status strongswan-starter --no-pager | head -10" "Статус VPN"
run_command "systemctl status nginx --no-pager | head -10" "Статус Nginx"

echo ""
echo "🔧 ШАГ 18: ТЕСТИРОВАНИЕ ПРИЛОЖЕНИЯ"
run_command "curl -s http://localhost:3000 | head -5" "Тест локального приложения"
run_command "curl -s http://localhost:3000/api/status" "Тест API"

echo ""
echo "🔧 ШАГ 19: ТЕСТИРОВАНИЕ ДОМЕНОВ"
for domain in "${DOMAINS[@]}"; do
    echo "Тестирование $domain..."
    run_command "curl -I https://$domain" "Тест HTTPS $domain"
done

run_command "curl -s https://$VPN_DOMAIN" "Тест VPN домена"

echo ""
echo "🔧 ШАГ 20: ПРОВЕРКА VPN СТАТУСА"
run_command "ipsec status" "Статус VPN подключений"

echo ""
echo "🎉 РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО!"
echo "=========================="
echo ""
echo "🌐 ПРИЛОЖЕНИЕ ДОСТУПНО:"
for domain in "${DOMAINS[@]}"; do
    echo "• https://$domain"
done
echo "• https://$VPN_DOMAIN (VPN статус)"
echo ""
echo "🔒 VPN НАСТРОЕН:"
echo "Сервер: $VPN_DOMAIN или $SERVER"
echo "Пользователи:"
for user in "${VPN_USERS[@]}"; do
    USERNAME=$(echo $user | cut -d: -f1)
    PASSWORD=$(echo $user | cut -d: -f2)
    echo "• $USERNAME / $PASSWORD"
done
echo ""
echo "📋 ПРОВЕРЬТЕ ЛОГИ ПРИ НЕОБХОДИМОСТИ:"
echo "=================================="
echo "• sudo journalctl -u emdrbilateral.service -f"
echo "• sudo journalctl -u strongswan-starter -f"
echo "• sudo journalctl -u nginx -f"
echo ""
echo "🔧 УПРАВЛЕНИЕ СЕРВИСАМИ:"
echo "======================"
echo "• sudo systemctl restart emdrbilateral.service"
echo "• sudo systemctl restart strongswan-starter"
echo "• sudo systemctl restart nginx"
echo ""
echo "✅ РАЗВЕРТЫВАНИЕ УСПЕШНО ЗАВЕРШЕНО!"
