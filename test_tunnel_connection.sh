#!/bin/bash

echo "🔍 Тестирование SSH туннелей для EMDR сайтов"
echo "============================================"
echo ""

# Функция для проверки доступности порта
check_port() {
    local port=$1
    local description=$2

    if curl -s --max-time 5 "http://localhost:$port" > /dev/null 2>&1; then
        echo "✅ $description (порт $port) - ДОСТУПЕН"
        return 0
    else
        echo "❌ $description (порт $port) - НЕДОСТУПЕН"
        return 1
    fi
}

echo "Проверяем доступность туннелей..."
echo ""

# Проверка HTTP портов
check_port 8080 "EMDR приложение (HTTP)"
check_port 8081 "VPN инструкции (HTTP)"

# Проверка HTTPS портов
if curl -s --max-time 5 -k "https://localhost:8443" > /dev/null 2>&1; then
    echo "✅ EMDR приложение (HTTPS) - ДОСТУПЕН"
else
    echo "❌ EMDR приложение (HTTPS) - НЕДОСТУПЕН"
fi

if curl -s --max-time 5 -k "https://localhost:8444" > /dev/null 2>&1; then
    echo "✅ VPN инструкции (HTTPS) - ДОСТУПЕН"
else
    echo "❌ VPN инструкции (HTTPS) - НЕДОСТУПЕН"
fi

echo ""
echo "📊 Сводка:"
echo "Если все туннели показывают 'ДОСТУПЕН', то сайты работают корректно"
echo "Если есть 'НЕДОСТУПЕН', проверьте SSH туннели"
echo ""

echo "🌐 Для доступа к сайтам используйте:"
echo "http://localhost:8080  - EMDR приложение"
echo "http://localhost:8081  - VPN инструкции"
echo "https://localhost:8443 - EMDR приложение (HTTPS)"
echo "https://localhost:8444 - VPN инструкции (HTTPS)"
