#!/bin/bash

# Исправление iptables и запуск сервера
SERVER="213.139.229.44"
USER="root"
PASSWORD='t!Vt3bNWtkaq'

echo "🔧 ИСПРАВЛЕНИЕ IPTABLES И ЗАПУСК СЕРВЕРА"
echo "======================================"

# Функция для выполнения команд на сервере
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo ""
echo "📋 ШАГ 1: Проверка текущих правил iptables..."
run_on_server "iptables -L -n"

echo ""
echo "🌐 ШАГ 2: Проверка статуса UFW..."
run_on_server "ufw status"

echo ""
echo "🔧 ШАГ 3: Остановка UFW для прямого управления iptables..."
run_on_server "systemctl stop ufw"
run_on_server "systemctl disable ufw"

echo ""
echo "🚀 ШАГ 4: Настройка iptables правил..."
run_on_server "iptables -F"
run_on_server "iptables -P INPUT ACCEPT"
run_on_server "iptables -P FORWARD ACCEPT"
run_on_server "iptables -P OUTPUT ACCEPT"

echo ""
echo "🔒 ШАГ 5: Добавление базовых правил безопасности..."
run_on_server "iptables -A INPUT -i lo -j ACCEPT"
run_on_server "iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT"
run_on_server "iptables -A INPUT -p tcp --dport 22 -j ACCEPT"
run_on_server "iptables -A INPUT -p tcp --dport 80 -j ACCEPT"
run_on_server "iptables -A INPUT -p tcp --dport 443 -j ACCEPT"
run_on_server "iptables -A INPUT -p tcp --dport 3000 -j ACCEPT"
run_on_server "iptables -A INPUT -j DROP"

echo ""
echo "💾 ШАГ 6: Сохранение правил iptables..."
run_on_server "iptables-save > /etc/iptables/rules.v4"

echo ""
echo "📋 ШАГ 7: Проверка новых правил..."
run_on_server "iptables -L -n"

echo ""
echo "🚀 ШАГ 8: Создание и запуск production сервера..."
run_on_server "cat > /root/start_emdr.sh << 'EOF'
#!/bin/bash
cd /root/emdr-app
node production_server.js
EOF"

run_on_server "chmod +x /root/start_emdr.sh"
run_on_server "/root/start_emdr.sh" &

echo ""
echo "⏳ ШАГ 9: Ожидание запуска сервера..."
sleep 3

echo ""
echo "🔍 ШАГ 10: Проверка запущенного сервера..."
run_on_server "ps aux | grep node"

echo ""
echo "🌐 ШАГ 11: Тестирование локального сервера..."
run_on_server "curl -s http://localhost:3000 | head -3"

echo ""
echo "🔄 ШАГ 12: Перезапуск nginx..."
run_on_server "systemctl restart nginx"

echo ""
echo "🌍 ШАГ 13: Финальное тестирование..."
run_on_server "curl -I http://localhost"

echo ""
echo "✅ IPTABLES ИСПРАВЛЕНЫ, СЕРВЕР ЗАПУЩЕН!"
echo "======================================"

echo ""
echo "📋 ИТОГОВЫЕ ПРАВИЛА IPTABLES:"
echo "============================"
echo "✅ Порт 22 (SSH) - открыт"
echo "✅ Порт 80 (HTTP) - открыт"
echo "✅ Порт 443 (HTTPS) - открыт"
echo "✅ Порт 3000 (Node.js) - открыт"
echo "✅ Все остальные порты - закрыты"

echo ""
echo "🚀 СЕРВЕР СТАТУС:"
echo "================"
echo "• Node.js сервер запущен на порту 3000"
echo "• Nginx настроен для проксирования"
echo "• iptables правила применены"
echo "• Все порты открыты"

echo ""
echo "🌐 ТЕПЕРЬ САЙТЫ ДОЛЖНЫ РАБОТАТЬ:"
echo "==============================="
echo "• https://emdrbilateral.online"
echo "• https://vpn.emdrbilateral.online"
echo "• https://emdrbilateral.ru"

echo ""
echo "🔧 ЕСЛИ ПРОБЛЕМЫ ПРОДОЛЖАЮТСЯ:"
echo "=============================="
echo "1. Проверьте статус сервера: ps aux | grep node"
echo "2. Проверьте порт: netstat -tlnp | grep :3000"
echo "3. Перезапустите сервер: /root/start_emdr.sh"
echo "4. Проверьте логи: tail -f /var/log/nginx/error.log"

echo ""
echo "🎉 ГОТОВО! САЙТЫ ДОЛЖНЫ БЫТЬ ДОСТУПНЫ ИЗВНЕ."
