#!/bin/bash

# Перезапуск сервера с исправленным паролем
SERVER="213.139.229.44"
USER="root"
PASSWORD='t!Vt3bNWtkaq'

echo "🔄 ПЕРЕЗАПУСК EMDR СЕРВЕРА"
echo "========================="

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo "📋 Остановка текущего сервера..."
run_on_server "pkill -f node"

echo "🚀 Запуск обновленного сервера..."
run_on_server "cd /root/emdr-app && node production_server.js" &

echo "⏳ Ожидание запуска сервера..."
sleep 3

echo "🔍 Проверка статуса сервера..."
run_on_server "ps aux | grep node"

echo ""
echo "🌐 Тестирование API эндпоинтов..."
echo "Тестирование /api/sessions..."
run_on_server "curl -s -X POST http://localhost:3000/api/sessions -H 'Content-Type: application/json' -d '{}'"

echo ""
echo "Тестирование /api/sessions/create..."
run_on_server "curl -s -X POST http://localhost:3000/api/sessions/create -H 'Content-Type: application/json' -d '{}'"

echo ""
echo "🔧 Тестирование health check..."
run_on_server "curl -s http://localhost:3000/api/health"

echo ""
echo "✅ СЕРВЕР ПЕРЕЗАПУЩЕН С ИСПРАВЛЕННЫМИ API!"
echo "========================================="
echo ""
echo "📋 ДОСТУПНЫЕ API ЭНДПОИНТЫ:"
echo "• POST /api/sessions - Создание сессии"
echo "• POST /api/sessions/create - Альтернативное создание сессии"
echo "• GET /api/sessions/:id - Получение сессии"
echo "• GET /api/sessions/:id/status - Статус сессии"
echo "• GET /api/health - Проверка сервера"
echo ""
echo "🎉 EMDR ПРИЛОЖЕНИЕ ГОТОВО К ИСПОЛЬЗОВАНИЮ:"
echo "🌐 https://emdrbilateral.online"
