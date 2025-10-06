#!/bin/bash

echo "🚀 Настройка SSH туннелей для EMDR сайтов"
echo "========================================"
echo ""

SERVER_IP="213.139.229.44"
SERVER_USER="root"
SERVER_PORT="22"

echo "📋 Создание SSH туннелей..."
echo ""

# Функция для создания туннеля
create_tunnel() {
    local local_port=$1
    local remote_target=$2
    local description=$3

    echo "Создание $description (порт $local_port)..."
    echo "Команда: ssh -R $local_port:$remote_target $SERVER_USER@$SERVER_IP -p $SERVER_PORT -N -f"
    ssh -R $local_port:$remote_target $SERVER_USER@$SERVER_IP -p $SERVER_PORT -N -f

    if [ $? -eq 0 ]; then
        echo "✅ $description создан успешно"
    else
        echo "❌ Ошибка создания $description"
        echo "Возможные причины:"
        echo "• Неправильный пароль"
        echo "• SSH ключи не настроены"
        echo "• Сервер недоступен"
        echo ""
        echo "Попробуйте выполнить команду вручную:"
        echo "ssh -R $local_port:$remote_target $SERVER_USER@$SERVER_IP -p $SERVER_PORT"
    fi
}

echo ""
echo "📡 Создание туннелей..."
echo ""

# Создание туннелей
create_tunnel 8080 "localhost:3000" "HTTP туннель для EMDR приложения"
echo ""
create_tunnel 8443 "localhost:3000" "HTTPS туннель для EMDR приложения"
echo ""
create_tunnel 8081 "localhost:8081" "HTTP туннель для VPN инструкций"
echo ""
create_tunnel 8444 "localhost:8081" "HTTPS туннель для VPN инструкций"

echo ""
echo "⏳ Ожидание активации туннелей (5 секунд)..."
sleep 5

echo ""
echo "🔍 Проверка доступности туннелей..."
echo ""

# Проверка HTTP туннелей
if curl -s --max-time 3 "http://localhost:8080" > /dev/null 2>&1; then
    echo "✅ EMDR приложение (HTTP) - ДОСТУПЕН"
    echo "   Адрес: http://localhost:8080"
else
    echo "❌ EMDR приложение (HTTP) - НЕДОСТУПЕН"
fi

if curl -s --max-time 3 "http://localhost:8081" > /dev/null 2>&1; then
    echo "✅ VPN инструкции (HTTP) - ДОСТУПЕН"
    echo "   Адрес: http://localhost:8081"
else
    echo "❌ VPN инструкции (HTTP) - НЕДОСТУПЕН"
fi

# Проверка HTTPS туннелей
if curl -s --max-time 3 -k "https://localhost:8443" > /dev/null 2>&1; then
    echo "✅ EMDR приложение (HTTPS) - ДОСТУПЕН"
    echo "   Адрес: https://localhost:8443"
else
    echo "❌ EMDR приложение (HTTPS) - НЕДОСТУПЕН"
fi

if curl -s --max-time 3 -k "https://localhost:8444" > /dev/null 2>&1; then
    echo "✅ VPN инструкции (HTTPS) - ДОСТУПЕН"
    echo "   Адрес: https://localhost:8444"
else
    echo "❌ VPN инструкции (HTTPS) - НЕДОСТУПЕН"
fi

echo ""
echo "🌐 Сайты готовы к использованию!"
echo "================================"
echo "📱 EMDR приложение:    http://localhost:8080"
echo "📖 VPN инструкции:     http://localhost:8081"
echo "🔒 EMDR приложение:    https://localhost:8443"
echo "🔐 VPN инструкции:     https://localhost:8444"
echo ""

echo "💡 Советы:"
echo "• Туннели работают только пока запущены процессы SSH"
echo "• Для остановки: pkill -f 'ssh.*$SERVER_IP'"
echo "• Для постоянной работы: перезапускайте туннели при разрыве"
echo "• Для тестирования: откройте файл test_sites.html в браузере"
echo ""

echo "✅ Туннели созданы и готовы к использованию!"
