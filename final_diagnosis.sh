#!/bin/bash

# Финальная диагностика проблемы 502 Bad Gateway
SERVER="213.139.229.44"
USER="root"
PASSWORD='t!Vt3bNWtkaq'

echo "🔍 ФИНАЛЬНАЯ ДИАГНОСТИКА ПРОБЛЕМЫ 502 BAD GATEWAY"
echo "================================================"

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo ""
echo "📋 ШАГ 1: Проверка процессов..."
echo "Процессы nginx:"
run_on_server "ps aux | grep nginx | grep -v grep"

echo ""
echo "Процессы node:"
run_on_server "ps aux | grep node | grep -v grep"

echo ""
echo "🌐 ШАГ 2: Проверка портов..."
echo "Порты в LISTEN:"
run_on_server "netstat -tlnp | grep LISTEN"

echo ""
echo "🔧 ШАГ 3: Проверка конфигурации nginx..."
echo "Конфигурация emdrbilateral.online:"
run_on_server "cat /etc/nginx/sites-enabled/emdrbilateral.online"

echo ""
echo "📊 ШАГ 4: Тестирование nginx..."
echo "Тест конфигурации:"
run_on_server "nginx -t"

echo ""
echo "🚀 ШАГ 5: Создание минимального сервера..."
run_on_server "cat > /root/minimal_server.js << 'EOF'
const http = require('http');
const server = http.createServer((req, res) => {
  console.log('Запрос:', req.url);
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Access-Control-Allow-Origin': '*'
  });
  res.end('<h1>✅ Минимальный сервер работает!</h1><p>Время: ' + new Date().toISOString() + '</p>');
});
server.listen(3000, () => {
  console.log('🚀 Минимальный сервер запущен на порту 3000');
});
EOF"

echo ""
echo "📦 ШАГ 6: Остановка всех процессов..."
run_on_server "pkill -f node"
run_on_server "pkill -f nginx"

echo ""
echo "🚀 ШАГ 7: Запуск минимального сервера..."
run_on_server "cd /root && node minimal_server.js" &

echo ""
echo "⏳ ШАГ 8: Ожидание запуска..."
sleep 3

echo ""
echo "🔍 ШАГ 9: Проверка запущенного сервера..."
run_on_server "ps aux | grep node"

echo ""
echo "🌐 ШАГ 10: Тестирование локального сервера..."
run_on_server "curl -s http://localhost:3000"

echo ""
echo "🔄 ШАГ 11: Запуск nginx..."
run_on_server "systemctl start nginx"

echo ""
echo "📋 ШАГ 12: Проверка статуса nginx..."
run_on_server "systemctl status nginx --no-pager"

echo ""
echo "🌍 ШАГ 13: Финальное тестирование..."
run_on_server "curl -I http://localhost"

echo ""
echo "✅ ДИАГНОСТИКА ЗАВЕРШЕНА"
echo "========================"

echo ""
echo "📋 ВОЗМОЖНЫЕ ПРИЧИНЫ ПРОБЛЕМЫ 502:"
echo "================================="
echo "1. Сервер не запущен на порту 3000"
echo "2. Nginx не может подключиться к серверу"
echo "3. Firewall блокирует соединения"
echo "4. Ошибка в конфигурации nginx"

echo ""
echo "🔧 РЕШЕНИЯ:"
echo "=========="
echo "1. Убедитесь, что сервер запущен: ps aux | grep node"
echo "2. Проверьте порт: netstat -tlnp | grep :3000"
echo "3. Перезапустите nginx: systemctl restart nginx"
echo "4. Проверьте логи: tail -f /var/log/nginx/error.log"

echo ""
echo "🌐 ДЛЯ РУЧНОГО ТЕСТИРОВАНИЯ:"
echo "=========================="
echo "1. Подключитесь к серверу:"
echo "   sshpass -p 't!Vt3bNWtkaq' ssh -o StrictHostKeyChecking=no root@213.139.229.44"
echo ""
echo "2. Запустите сервер:"
echo "   cd /root && node minimal_server.js"
echo ""
echo "3. В новом терминале подключитесь снова и протестируйте:"
echo "   curl http://localhost:3000"
echo ""
echo "4. Если локально работает, перезапустите nginx:"
echo "   systemctl restart nginx"

echo ""
echo "🎯 СЛЕДУЮЩИЕ ШАГИ:"
echo "================"
echo "1. Выполните шаги выше вручную на сервере"
echo "2. Если проблема persists, проверьте firewall: ufw status"
echo "3. Проверьте логи nginx: tail -f /var/log/nginx/access.log"
echo "4. Убедитесь, что порт 3000 не заблокирован"

echo ""
echo "💡 ЕСЛИ НИЧТО НЕ ПОМОГАЕТ:"
echo "=========================="
echo "Обратитесь в поддержку Beget с текстом:"
echo '"Прошу разблокировать порты 80 и 443 для VPS сервера 213.139.229.44"'
echo "Текст уже готов в файле final_solution.sh"
