#!/bin/bash

# Развертывание простого EMDR сервера на VPS
SERVER="213.139.229.44"
USER="root"
PASSWORD="t!Vt3bNWtkaq"

echo "🚀 РАЗВЕРТЫВАНИЕ ПРОСТОГО EMDR СЕРВЕРА"
echo "===================================="

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo "📥 СОЗДАНИЕ ДИРЕКТОРИИ ПРИЛОЖЕНИЯ..."
run_on_server "mkdir -p /root/emdr-app"

echo "📋 КОПИРОВАНИЕ ФАЙЛОВ ПРИЛОЖЕНИЯ..."
# Копируем package.json
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no /Users/davidbugayov/StudioProject/bilateral_bound/package.json $USER@$SERVER:/root/emdr-app/

# Копируем публичные файлы
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no -r /Users/davidbugayov/StudioProject/bilateral_bound/public $USER@$SERVER:/root/emdr-app/

# Копируем простой сервер
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no /Users/davidbugayov/StudioProject/bilateral_bound/simple_server.js $USER@$SERVER:/root/emdr-app/

echo "📦 УСТАНОВКА NODE.JS ЗАВИСИМОСТЕЙ..."
run_on_server "cd /root/emdr-app && npm install"

echo "🚀 ЗАПУСК EMDR СЕРВЕРА..."
run_on_server "cd /root/emdr-app && node simple_server.js" &

echo "⏳ ОЖИДАНИЕ ЗАПУСКА СЕРВЕРА..."
sleep 3

echo "🔍 ПРОВЕРКА СТАТУСА СЕРВЕРА..."
run_on_server "ps aux | grep node"

echo "🌐 ТЕСТИРОВАНИЕ ПРИЛОЖЕНИЯ..."
run_on_server "curl -s http://localhost:3000 | head -5"

echo ""
echo "✅ ПРОСТОЙ СЕРВЕР РАЗВЕРНУТ!"
echo "=========================="
echo ""
echo "📋 СЕРВЕР ЗАПУЩЕН:"
echo "• Node.js сервер: http://localhost:3000"
echo "• Доступен через nginx: http://emdrbilateral.online"
echo ""
echo "🔧 УПРАВЛЕНИЕ СЕРВЕРОМ:"
echo "• Остановить: pkill -f 'node simple_server.js'"
echo "• Перезапустить: cd /root/emdr-app && node simple_server.js"
echo ""

echo "🎉 EMDR ПРИЛОЖЕНИЕ ДОСТУПНО ПО АДРЕСУ:"
echo "🌐 http://emdrbilateral.online"
