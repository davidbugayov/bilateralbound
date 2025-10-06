#!/bin/bash

# Развертывание EMDR приложения с GitHub на сервер
SERVER="213.139.229.44"
USER="root"
PASSWORD="t!Vt3bNWtkaq"

echo "🚀 РАЗВЕРТЫВАНИЕ EMDR С ГИТХАБА"
echo "=============================="

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo "📥 ОЧИСТКА СТАРОГО ПРИЛОЖЕНИЯ..."
run_on_server "pkill -f node"
run_on_server "rm -rf /root/emdr-app"

echo "📥 КЛОНИРОВАНИЕ С ГИТХАБА..."
run_on_server "cd /root && git clone https://github.com/davidbugayov/bilateralbound.git emdr-app"

echo "📦 УСТАНОВКА ЗАВИСИМОСТЕЙ..."
run_on_server "cd /root/emdr-app && npm install"

echo "🔧 СБОРКА ПРИЛОЖЕНИЯ..."
run_on_server "cd /root/emdr-app && npm run build"

echo "📋 ПРОВЕРКА СБОРКИ..."
run_on_server "cd /root/emdr-app && ls -la dist/"

echo "🚀 ЗАПУСК ПОЛНОГО СЕРВЕРА..."
run_on_server "cd /root/emdr-app && npm start" &

echo "⏳ ОЖИДАНИЕ ЗАПУСКА СЕРВЕРА..."
sleep 5

echo "🔍 ПРОВЕРКА СТАТУСА СЕРВЕРА..."
run_on_server "ps aux | grep npm"

echo "🌐 ТЕСТИРОВАНИЕ ПРИЛОЖЕНИЯ..."
run_on_server "curl -s http://localhost:3000 | head -10"

echo ""
echo "✅ ПРИЛОЖЕНИЕ С ГИТХАБА РАЗВЕРНУТО!"
echo "=================================="
echo ""
echo "📋 СТАТУС РАЗВЕРТЫВАНИЯ:"
echo "• Репозиторий: https://github.com/davidbugayov/bilateralbound"
echo "• Сервер: http://localhost:3000"
echo "• Доступно через nginx: http://emdrbilateral.online"
echo ""
echo "🔧 УПРАВЛЕНИЕ ПРИЛОЖЕНИЕМ:"
echo "• Остановить: pkill -f 'npm start'"
echo "• Перезапустить: cd /root/emdr-app && npm start"
echo "• Обновить: cd /root/emdr-app && git pull && npm install && npm run build && npm start"
echo ""

echo "🎉 EMDR ПРИЛОЖЕНИЕ С ПОСЛЕДНЕЙ ВЕРСИЕЙ ГИТХАБ:"
echo "🌐 http://emdrbilateral.online"
