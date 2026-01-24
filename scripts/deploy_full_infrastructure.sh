пр#!/bin/bash

# ПОЛНОЕ РАЗВЕРТЫВАНИЕ EMDR BILATERAL ИНФРАСТРУКТУРЫ
# На основе очищенного проекта bilateral_bound

SERVER="213.139.229.44"
USER="root"
PASSWORD='9Ddc0BYKqrJZm6a9'

echo "🚀 ПОЛНОЕ РАЗВЕРТЫВАНИЕ EMDR BILATERAL ИНФРАСТРУКТУРЫ"
echo "=================================================="
echo "Сервер: $SERVER"
echo "Домены: emdrbilateral.online, emdrbilateral.ru"
echo ""

# Функция для выполнения команд на сервере
run_command() {
    echo ""
    echo "📋 Выполнение: $2"
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
    echo "✅ Выполнено"
}

echo "🔧 ШАГ 1: ОБНОВЛЕНИЕ СИСТЕМЫ"
run_command "apt update && apt upgrade -y" "Обновление системы"

echo ""
echo "🔧 ШАГ 2: УСТАНОВКА НЕОБХОДИМЫХ ПАКЕТОВ"
run_command "apt install -y curl wget nodejs npm nginx certbot python3-certbot-nginx ufw" "Установка базовых пакетов"

echo ""
echo "🔧 ШАГ 3: УСТАНОВКА NODE.JS"
run_command "curl -fsSL https://deb.nodesource.com/setup_18.x | bash -" "Установка NodeSource репозитория"
run_command "apt install -y nodejs" "Установка Node.js"

echo ""
echo "🔧 ШАГ 4: СОЗДАНИЕ ДИРЕКТОРИИ ПРИЛОЖЕНИЯ"
run_command "mkdir -p /var/www/emdrbilateral" "Создание директории приложения"

echo ""
echo "🔧 ШАГ 5: СОЗДАНИЕ ГЛАВНОЙ СТРАНИЦЫ"
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

echo ""
echo "🔧 ШАГ 6: СОЗДАНИЕ СЕРВЕРНОГО ФАЙЛА"
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

echo ""
echo "🔧 ШАГ 7: СОЗДАНИЕ PACKAGE.JSON"
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
echo "🔧 ШАГ 8: УСТАНОВКА ЗАВИСИМОСТЕЙ"
run_command "cd /var/www/emdrbilateral && npm install" "Установка npm пакетов"

echo ""
echo "🔧 ШАГ 9: НАСТРОЙКА ПРАВ ДОСТУПА"
run_command "chown -R root:root /var/www/emdrbilateral && chmod -R 755 /var/www/emdrbilateral" "Настройка прав"

echo ""
echo "🔧 ШАГ 10: СОЗДАНИЕ СИСТЕМНОГО СЕРВИСА"
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
echo "🔧 ШАГ 11: НАСТРОЙКА NGINX"
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
echo "🔧 ШАГ 12: НАСТРОЙКА FIREWALL"
run_command "ufw allow OpenSSH" "Разрешение SSH"
run_command "ufw allow 'Nginx Full'" "Разрешение веб-сервера"
run_command "ufw --force enable" "Включение firewall"

echo ""
echo "🔧 ШАГ 13: УСТАНОВКА SSL СЕРТИФИКАТОВ"
echo "Установка сертификата для emdrbilateral.online..."
run_command "certbot --nginx -d emdrbilateral.online --non-interactive --agree-tos --register-unsafely-without-email" "SSL для emdrbilateral.online"

echo "Установка сертификата для emdrbilateral.ru..."
run_command "certbot --nginx -d emdrbilateral.ru --non-interactive --agree-tos --register-unsafely-without-email" "SSL для emdrbilateral.ru"

echo ""
echo "⏳ ШАГ 14: ОЖИДАНИЕ ЗАПУСКА СЕРВИСОВ"
sleep 10

echo ""
echo "🔧 ШАГ 15: ПРОВЕРКА СТАТУСА СЕРВИСОВ"
run_command "systemctl status emdrbilateral.service --no-pager | head -10" "Статус приложения"
run_command "systemctl status nginx --no-pager | head -10" "Статус Nginx"

echo ""
echo "🔧 ШАГ 16: ТЕСТИРОВАНИЕ ПРИЛОЖЕНИЯ"
run_command "curl -s http://localhost:3000 | head -5" "Тест локального приложения"
run_command "curl -s http://localhost:3000/api/status" "Тест API"

echo ""
echo "🔧 ШАГ 17: ТЕСТИРОВАНИЕ ДОМЕНОВ"
run_command "curl -I https://emdrbilateral.online" "Тест HTTPS emdrbilateral.online"
run_command "curl -I https://emdrbilateral.ru" "Тест HTTPS emdrbilateral.ru"

echo ""
echo "🎉 РАЗВЕРТЫВАНИЕ ИНФРАСТРУКТУРЫ ЗАВЕРШЕНО!"
echo "========================================"
echo ""
echo "🌐 ПРИЛОЖЕНИЕ ДОСТУПНО:"
echo "• https://emdrbilateral.online"
echo "• https://emdrbilateral.ru"
echo ""
echo "📋 ПРОВЕРЬТЕ ЛОГИ ПРИ НЕОБХОДИМОСТИ:"
echo "=================================="
echo "• sudo journalctl -u emdrbilateral.service -f"
echo "• sudo journalctl -u nginx -f"
echo ""
echo "🔧 УПРАВЛЕНИЕ СЕРВИСАМИ:"
echo "======================"
echo "• sudo systemctl restart emdrbilateral.service"
echo "• sudo systemctl restart nginx"
echo ""
echo "✅ ИНФРАСТРУКТУРА УСПЕШНО РАЗВЕРНУТА!"
