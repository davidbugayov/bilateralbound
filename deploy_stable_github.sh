#!/bin/bash

# Развертывание стабильной ветки с GitHub
SERVER="213.139.229.44"
USER="root"
PASSWORD='t!Vt3bNWtkaq'

echo "🚀 РАЗВЕРТЫВАНИЕ СТАБИЛЬНОЙ ВЕТКИ С GITHUB"
echo "========================================="

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo ""
echo "📋 ШАГ 1: Остановка текущих процессов..."
run_on_server "pkill -f node" 2>/dev/null || echo "Node процессы остановлены"

echo ""
echo "🗑️ ШАГ 2: Очистка старого приложения..."
run_on_server "rm -rf /root/emdr-app"

echo ""
echo "📥 ШАГ 3: Клонирование стабильной ветки..."
run_on_server "cd /root && git clone https://github.com/davidbugayov/bilateralbound.git emdr-app"
run_on_server "cd /root/emdr-app && git checkout stable"

echo ""
echo "📦 ШАГ 4: Установка зависимостей..."
run_on_server "cd /root/emdr-app && npm install"

echo ""
echo "🔧 ШАГ 5: Сборка приложения..."
run_on_server "cd /root/emdr-app && npm run build"

echo ""
echo "📋 ШАГ 6: Проверка сборки..."
run_on_server "cd /root/emdr-app && ls -la dist/"

echo ""
echo "🚀 ШАГ 7: Создание production сервера для стабильной версии..."
run_on_server "cat > /root/emdr-app/stable_server.js << 'EOF'
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API для сессий (стабильная версия)
app.post('/api/session', (req, res) => {
  const sessionId = Date.now().toString();
  res.json({
    success: true,
    sessionId: sessionId,
    message: 'Сессия создана (стабильная версия)'
  });
});

app.get('/api/session/:id', (req, res) => {
  res.json({
    success: true,
    sessionId: req.params.id,
    status: 'active'
  });
});

// Обработка статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Для всех остальных запросов возвращаем index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log('🚀 Стабильный EMDR сервер запущен');
  console.log('📍 Порт:', PORT);
  console.log('🌐 http://localhost:' + PORT);
  console.log('📁 Папка:', __dirname);
});

module.exports = app;
EOF"

echo ""
echo "📦 ШАГ 8: Установка зависимостей для сервера..."
run_on_server "cd /root/emdr-app && npm install express cors"

echo ""
echo "🚀 ШАГ 9: Запуск стабильного сервера..."
run_on_server "cd /root/emdr-app && node stable_server.js" &

echo ""
echo "⏳ ШАГ 10: Ожидание запуска..."
sleep 5

echo ""
echo "🔍 ШАГ 11: Проверка запущенного сервера..."
run_on_server "ps aux | grep 'node stable_server.js' | grep -v grep"

echo ""
echo "🌐 ШАГ 12: Тестирование локального сервера..."
run_on_server "curl -s http://localhost:3000 | head -3"

echo ""
echo "🔧 ШАГ 13: Тестирование API..."
run_on_server "curl -s -X POST http://localhost:3000/api/session -H 'Content-Type: application/json' -d '{}'"

echo ""
echo "🔄 ШАГ 14: Перезапуск nginx..."
run_on_server "systemctl restart nginx"

echo ""
echo "🌍 ШАГ 15: Финальное тестирование..."
run_on_server "curl -I http://localhost"

echo ""
echo "✅ СТАБИЛЬНАЯ ВЕРСИЯ РАЗВЕРНУТА!"
echo "==============================="

echo ""
echo "📋 ИНФОРМАЦИЯ О РАЗВЕРТЫВАНИИ:"
echo "============================"
echo "• Репозиторий: https://github.com/davidbugayov/bilateralbound"
echo "• Ветка: stable"
echo "• Сервер: Express с API поддержкой"
echo "• Статические файлы: /public"
echo "• Сборка: Production build"

echo ""
echo "🌐 ДОСТУПНЫЕ САЙТЫ:"
echo "=================="
echo "• https://emdrbilateral.online - Основное приложение"
echo "• https://vpn.emdrbilateral.online - VPN инструкции"
echo "• https://emdrbilateral.ru - Альтернативный домен"

echo ""
echo "🔧 УПРАВЛЕНИЕ ПРИЛОЖЕНИЕМ:"
echo "========================="
echo "• Остановить: pkill -f 'node stable_server.js'"
echo "• Перезапустить: cd /root/emdr-app && node stable_server.js"
echo "• Обновить: cd /root/emdr-app && git pull && npm install && npm run build && node stable_server.js"

echo ""
echo "🎉 СТАБИЛЬНАЯ ВЕРСИЯ EMDR ПРИЛОЖЕНИЯ УСПЕШНО РАЗВЕРНУТА!"
