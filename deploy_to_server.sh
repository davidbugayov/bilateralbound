#!/bin/bash

# Скрипт развертывания EMDR приложения на сервер
SERVER="213.139.229.44"
USER="root"
PASSWORD="t!Vt3bNWtkaq"

echo "🚀 РАЗВЕРТЫВАНИЕ EMDR ПРИЛОЖЕНИЯ НА СЕРВЕР"
echo "=========================================="

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo "📥 КЛОНИРОВАНИЕ РЕПОЗИТОРИЯ..."
run_on_server "cd /root && git clone https://github.com/davidbugayov/bilateralbound.git emdr-app"

echo "📦 УСТАНОВКА ЗАВИСИМОСТЕЙ..."
run_on_server "cd /root/emdr-app && npm install"

echo "🔧 СБОРКА ПРИЛОЖЕНИЯ..."
run_on_server "cd /root/emdr-app && npm run build"

echo "📋 ПРОВЕРКА СБОРКИ..."
run_on_server "cd /root/emdr-app && ls -la dist/"

echo "🚀 ЗАПУСК СЕРВЕРА..."
run_on_server "cd /root/emdr-app && npm start" &

echo "⏳ ОЖИДАНИЕ ЗАПУСКА СЕРВЕРА..."
sleep 5

echo "🔍 ПРОВЕРКА СТАТУСА СЕРВЕРА..."
run_on_server "ps aux | grep node"

echo "🌐 ТЕСТИРОВАНИЕ ПРИЛОЖЕНИЯ..."
run_on_server "curl -s http://localhost:3000 | head -10"

echo ""
echo "✅ РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО!"
echo "=========================="
echo ""
echo "📋 ПРИЛОЖЕНИЕ ЗАПУЩЕНО:"
echo "• Сервер: http://localhost:3000 (внутри сервера)"
echo "• Доступно через nginx: http://emdrbilateral.online"
echo ""
echo "🔧 УПРАВЛЕНИЕ ПРИЛОЖЕНИЕМ:"
echo "• Остановить: pkill -f 'npm start'"
echo "• Перезапустить: cd /root/emdr-app && npm start"
echo "• Логи: pm2 logs (если установлен pm2)"
echo ""

echo "🎉 EMDR ПРИЛОЖЕНИЕ УСПЕШНО РАЗВЕРНУТО!"
