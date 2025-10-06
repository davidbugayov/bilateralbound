#!/bin/bash

# Развертывание production-сервера EMDR
SERVER="213.139.229.44"
USER="root"
PASSWORD="t!Vt3bNWtkaq"

echo "🚀 РАЗВЕРТЫВАНИЕ PRODUCTION СЕРВЕРА EMDR"
echo "======================================"

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo "📥 ОЧИСТКА СТАРОГО ПРИЛОЖЕНИЯ..."
run_on_server "pkill -f node"
run_on_server "rm -rf /root/emdr-app"

echo "📋 СОЗДАНИЕ НОВОЙ ДИРЕКТОРИИ..."
run_on_server "mkdir -p /root/emdr-app"

echo "📦 КОПИРОВАНИЕ ФАЙЛОВ ПРИЛОЖЕНИЯ..."
# Копируем package.json
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no /Users/davidbugayov/StudioProject/bilateral_bound/package.json $USER@$SERVER:/root/emdr-app/

# Копируем публичные файлы
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no -r /Users/davidbugayov/StudioProject/bilateral_bound/public $USER@$SERVER:/root/emdr-app/

# Копируем production сервер
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no /Users/davidbugayov/StudioProject/bilateral_bound/production_server.js $USER@$SERVER:/root/emdr-app/

echo "📦 УСТАНОВКА EXPRESS И CORS..."
run_on_server "cd /root/emdr-app && npm install express cors"

echo "🚀 ЗАПУСК PRODUCTION СЕРВЕРА..."
run_on_server "cd /root/emdr-app && node production_server.js" &

echo "⏳ ОЖИДАНИЕ ЗАПУСКА СЕРВЕРА..."
sleep 3

echo "🔍 ПРОВЕРКА СТАТУСА СЕРВЕРА..."
run_on_server "ps aux | grep node"

echo "🌐 ТЕСТИРОВАНИЕ ПРИЛОЖЕНИЯ..."
run_on_server "curl -s http://localhost:3000 | head -5"

echo "🔧 ТЕСТИРОВАНИЕ API..."
run_on_server "curl -s -X POST http://localhost:3000/api/sessions -H 'Content-Type: application/json' -d '{}'"

echo ""
echo "✅ PRODUCTION СЕРВЕР РАЗВЕРНУТ!"
echo "==============================="
echo ""
echo "📋 СЕРВЕР ЗАПУЩЕН:"
echo "• Express сервер с правильной обработкой статических файлов"
echo "• API endpoints для сессий"
echo "• CORS включен"
echo "• SPA поддержка"
echo ""
echo "🔧 УПРАВЛЕНИЕ СЕРВЕРОМ:"
echo "• Остановить: pkill -f 'node production_server.js'"
echo "• Перезапустить: cd /root/emdr-app && node production_server.js"
echo ""

echo "🎉 EMDR ПРИЛОЖЕНИЕ С PRODUCTION СЕРВЕРОМ:"
echo "🌐 http://emdrbilateral.online"
