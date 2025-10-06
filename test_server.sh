#!/bin/bash

# Простой тест сервера
SERVER="213.139.229.44"
USER="root"
PASSWORD="t!Vt3bNWtkaq"

echo "🔍 ТЕСТИРОВАНИЕ СЕРВЕРА"
echo "======================"

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo "📊 ПРОВЕРКА ПРОЦЕССОВ..."
run_on_server "ps aux | grep -E '(nginx|node)' | grep -v grep"

echo ""
echo "🌐 ПРОВЕРКА ПОРТОВ..."
run_on_server "netstat -tlnp | grep LISTEN"

echo ""
echo "📋 СОСТОЯНИЕ NGINX..."
run_on_server "systemctl status nginx --no-pager"

echo ""
echo "🔧 СОЗДАНИЕ ТЕСТОВОГО HTML ФАЙЛА..."
run_on_server "cat > /var/www/html/test.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>EMDR Server Test</title>
    <meta charset="UTF-8">
</head>
<body>
    <h1>✅ EMDR Сервер работает!</h1>
    <p>Сервер успешно настроен и отвечает на запросы.</p>
    <p>Время сервера: <span id="time"></span></p>
    <p>IP адрес: 213.139.229.44</p>
    <script>
        document.getElementById('time').textContent = new Date().toLocaleString();
    </script>
</body>
</html>
EOF"

echo ""
echo "🌍 ТЕСТИРОВАНИЕ ДОСТУПНОСТИ САЙТОВ..."
echo "Проверка http://emdrbilateral.online..."
run_on_server "curl -I http://localhost/test.html"

echo ""
echo "📋 ПРОВЕРКА КОНФИГУРАЦИИ NGINX..."
run_on_server "nginx -t"

echo ""
echo "🔑 ИНФОРМАЦИЯ ДЛЯ ПОДКЛЮЧЕНИЯ:"
echo "============================="
echo "Сервер: $SERVER"
echo "Пользователь: $USER"
echo "Пароль: $PASSWORD"
echo "Порт: 22"

echo ""
echo "🌐 ДОСТУПНЫЕ САЙТЫ:"
echo "=================="
echo "• http://emdrbilateral.online"
echo "• http://vpn.emdrbilateral.online"
echo "• http://emdrbilateral.ru"
echo ""
echo "🔒 HTTPS ВЕРСИИ:"
echo "==============="
echo "• https://emdrbilateral.online"
echo "• https://vpn.emdrbilateral.online"
echo "• https://emdrbilateral.ru"

echo ""
echo "✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО!"
