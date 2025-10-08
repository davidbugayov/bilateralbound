#!/bin/bash

# Скрипт для настройки порта 8080 для webhook сервера
# Запустите этот скрипт на сервере с правами root

set -e

echo "🔧 Настройка порта 8080 для webhook сервера..."

# Проверяем, запущен ли firewall
if command -v ufw &> /dev/null; then
    echo "📋 Настройка UFW firewall..."
    ufw allow 8080/tcp
    ufw status
elif command -v firewall-cmd &> /dev/null; then
    echo "📋 Настройка firewalld..."
    firewall-cmd --permanent --add-port=8080/tcp
    firewall-cmd --reload
    firewall-cmd --list-ports
else
    echo "📋 Настройка iptables..."
    # Добавляем правило для порта 8080
    iptables -A INPUT -p tcp --dport 8080 -j ACCEPT

    # Сохраняем правила iptables
    if command -v netfilter-persistent &> /dev/null; then
        netfilter-persistent save
    else
        # Альтернативный способ сохранения для Debian/Ubuntu
        apt-get update && apt-get install -y iptables-persistent
        netfilter-persistent save
    fi

    echo "✅ Правила iptables:"
    iptables -L -n | grep 8080
fi

# Проверяем, открыт ли порт
echo ""
echo "🔍 Проверка порта 8080..."
if command -v netstat &> /dev/null; then
    netstat -tulpn | grep :8080 || echo "Порт 8080 не прослушивается (это нормально, если webhook сервер не запущен)"
elif command -v ss &> /dev/null; then
    ss -tulpn | grep :8080 || echo "Порт 8080 не прослушивается (это нормально, если webhook сервер не запущен)"
fi

echo ""
echo "🌐 Тестируем доступность порта извне..."
curl -s http://213.139.229.44:8080/ || echo "Не удалось подключиться к порту 8080 (возможно, webhook сервер не запущен)"

echo ""
echo "✅ Настройка завершена!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Обновите URL webhook в GitHub на порт 8080"
echo "2. Перезапустите webhook сервер: systemctl restart webhook-server"
echo "3. Протестируйте webhook через GitHub"
