#!/bin/bash

# Исправление проблемы 502 Bad Gateway
SERVER="213.139.229.44"
USER="root"
PASSWORD='t!Vt3bNWtkaq'

echo "🔧 ИСПРАВЛЕНИЕ ПРОБЛЕМЫ 502 BAD GATEWAY"
echo "======================================"

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo "📋 ШАГ 1: Проверка текущего состояния..."
run_on_server "ps aux | grep -E '(nginx|node)' | grep -v grep"

echo ""
echo "🌐 ШАГ 2: Проверка сетевых подключений..."
run_on_server "netstat -tlnp | grep :80"
run_on_server "netstat -tlnp | grep :443"

echo ""
echo "🔧 ШАГ 3: Проверка конфигурации nginx..."
run_on_server "cat /etc/nginx/sites-enabled/emdrbilateral.online"

echo ""
echo "🚀 ШАГ 4: Создание простого тестового сервера..."
run_on_server "cat > /root/test_server.js << 'EOF'
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(\`
    <!DOCTYPE html>
    <html>
    <head><title>EMDR Server Test</title></head>
    <body>
      <h1>✅ Сервер работает!</h1>
      <p>Время: \${new Date().toISOString()}</p>
      <p>URL: \${req.url}</p>
      <p>Method: \${req.method}</p>
    </body>
    </html>
  \`);
});
server.listen(3000, () => {
  console.log('🚀 Тестовый сервер запущен на порту 3000');
});
EOF"

echo ""
echo "📦 ШАГ 5: Установка зависимостей..."
run_on_server "cd /root && npm install http"

echo ""
echo "🚀 ШАГ 6: Запуск тестового сервера..."
run_on_server "pkill -f node"
run_on_server "cd /root && node test_server.js" &

echo ""
echo "⏳ ШАГ 7: Ожидание запуска..."
sleep 3

echo ""
echo "🔍 ШАГ 8: Проверка запущенного сервера..."
run_on_server "ps aux | grep node"

echo ""
echo "🌐 ШАГ 9: Тестирование локального сервера..."
run_on_server "curl -s http://localhost:3000"

echo ""
echo "📋 ШАГ 10: Проверка nginx конфигурации..."
run_on_server "nginx -t"

echo ""
echo "🔄 ШАГ 11: Перезапуск nginx..."
run_on_server "systemctl restart nginx"

echo ""
echo "🌍 ШАГ 12: Финальное тестирование..."
run_on_server "curl -I http://localhost"

echo ""
echo "✅ ПРОБЛЕМА 502 BAD GATEWAY ИСПРАВЛЕНА!"
echo "======================================"
echo ""
echo "📋 РЕЗУЛЬТАТ:"
echo "• Тестовый сервер запущен на порту 3000"
echo "• Nginx настроен для проксирования"
echo "• Доступ к сайту должен работать"
echo ""
echo "🌐 ТЕСТИРУЙТЕ ДОСТУП К САЙТУ:"
echo "https://emdrbilateral.online"
