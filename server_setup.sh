#!/bin/bash

# Комплексный скрипт настройки сервера для EMDR сайтов
SERVER="213.139.229.44"
USER="root"
PASSWORD="t!Vt3bNWtkaq"

echo "🚀 НАЧИНАЕМ НАСТРОЙКУ СЕРВЕРА ДЛЯ EMDR САЙТОВ"
echo "============================================="
echo ""

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

# 1. Проверяем текущее состояние сервера
echo "📊 ПРОВЕРКА ТЕКУЩЕГО СОСТОЯНИЯ СЕРВЕРА:"
echo "======================================"
run_on_server "whoami && pwd && echo 'Операционная система:' && cat /etc/os-release | grep 'PRETTY_NAME' && echo 'IP адрес:' && ip route get 1 | awk '{print \$7}' && echo 'Процессы:' && ps aux | grep -E '(nginx|node|npm)' | grep -v grep"

echo ""
echo "🌐 ПРОВЕРКА СЕТЕВЫХ НАСТРОЕК:"
echo "============================"
run_on_server "echo 'Порты в LISTEN:' && netstat -tlnp | grep LISTEN && echo 'Firewall правила:' && ufw status"

echo ""
echo "🔧 УСТАНОВКА НЕОБХОДИМЫХ ПАКЕТОВ:"
echo "================================="
run_on_server "apt update && apt install -y nginx nodejs npm certbot python3-certbot-nginx"

echo ""
echo "⚙️ НАСТРОЙКА NGINX ДЛЯ ДОМЕНОВ:"
echo "==============================="
# Создаем конфигурацию для emdrbilateral.online
run_on_server "cat > /etc/nginx/sites-available/emdrbilateral.online << 'EOF'
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
    }
}
EOF"

# Создаем конфигурацию для vpn.emdrbilateral.online
run_on_server "cat > /etc/nginx/sites-available/vpn.emdrbilateral.online << 'EOF'
server {
    listen 80;
    server_name vpn.emdrbilateral.online;

    location / {
        proxy_pass http://localhost:8081;
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
EOF"

# Создаем конфигурацию для emdrbilateral.ru
run_on_server "cat > /etc/nginx/sites-available/emdrbilateral.ru << 'EOF'
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
    }
}
EOF"

echo ""
echo "🔗 АКТИВАЦИЯ САЙТОВ:"
echo "==================="
run_on_server "ln -sf /etc/nginx/sites-available/emdrbilateral.online /etc/nginx/sites-enabled/"
run_on_server "ln -sf /etc/nginx/sites-available/vpn.emdrbilateral.online /etc/nginx/sites-enabled/"
run_on_server "ln -sf /etc/nginx/sites-available/emdrbilateral.ru /etc/nginx/sites-enabled/"

echo ""
echo "🔒 НАСТРОЙКА SSL СЕРТИФИКАТОВ:"
echo "=============================="
run_on_server "certbot --nginx -d emdrbilateral.online --non-interactive --agree-tos -m admin@emdrbilateral.online"
run_on_server "certbot --nginx -d vpn.emdrbilateral.online --non-interactive --agree-tos -m admin@emdrbilateral.online"
run_on_server "certbot --nginx -d emdrbilateral.ru --non-interactive --agree-tos -m admin@emdrbilateral.ru"

echo ""
echo "🔥 НАСТРОЙКА FIREWALL:"
echo "====================="
run_on_server "ufw allow 'OpenSSH'"
run_on_server "ufw allow 'Nginx Full'"
run_on_server "ufw --force reload"

echo ""
echo "🚀 ПЕРЕЗАПУСК СЛУЖБ:"
echo "=================="
run_on_server "systemctl restart nginx"
run_on_server "systemctl enable nginx"

echo ""
echo "📋 ПРОВЕРКА КОНФИГУРАЦИИ:"
echo "========================"
run_on_server "nginx -t"
run_on_server "systemctl status nginx --no-pager"

echo ""
echo "🌍 ТЕСТИРОВАНИЕ ДОСТУПНОСТИ САЙТОВ:"
echo "=================================="
run_on_server "curl -I http://emdrbilateral.online"
run_on_server "curl -I http://vpn.emdrbilateral.online"
run_on_server "curl -I http://emdrbilateral.ru"

echo ""
echo "✅ НАСТРОЙКА ЗАВЕРШЕНА!"
echo "======================"
echo ""
echo "📋 ДОСТУПНЫЕ САЙТЫ:"
echo "=================="
echo "• http://emdrbilateral.online    - Основное EMDR приложение"
echo "• http://vpn.emdrbilateral.online - VPN инструкции"
echo "• http://emdrbilateral.ru        - Альтернативный домен"
echo ""
echo "🔒 HTTPS ВЕРСИИ:"
echo "==============="
echo "• https://emdrbilateral.online"
echo "• https://vpn.emdrbilateral.online"
echo "• https://emdrbilateral.ru"
echo ""
echo "🔑 ДАННЫЕ ДЛЯ ПОДКЛЮЧЕНИЯ К СЕРВЕРУ:"
echo "=================================="
echo "Сервер: $SERVER"
echo "Пользователь: $USER"
echo "Пароль: $PASSWORD"
echo "Порт: 22"
echo ""

echo "🎉 ВСЕ ГОТОВО! Сайты должны быть доступны извне."
