#!/bin/bash

echo "🚀 Автоматическое создание SSH туннелей"
echo "======================================"
echo ""

echo "Настройка туннелей для доступа к EMDR сайтам..."
echo ""

# Параметры сервера
SERVER_IP="213.139.229.44"
SERVER_USER="root"
SERVER_PORT="22"

echo "📡 Создание HTTP туннеля для EMDR приложения..."
ssh -R 8080:localhost:3000 $SERVER_USER@$SERVER_IP -p $SERVER_PORT -N -f

echo "📡 Создание HTTPS туннеля для EMDR приложения..."
ssh -R 8443:localhost:3000 $SERVER_USER@$SERVER_IP -p $SERVER_PORT -N -f

echo "📡 Создание HTTP туннеля для VPN инструкций..."
ssh -R 8081:localhost:8081 $SERVER_USER@$SERVER_IP -p $SERVER_PORT -N -f

echo "📡 Создание HTTPS туннеля для VPN инструкций..."
ssh -R 8444:localhost:8081 $SERVER_USER@$SERVER_IP -p $SERVER_PORT -N -f

echo ""
echo "⏳ Ожидание активации туннелей..."
sleep 3

echo ""
echo "🔍 Проверка доступности..."
echo ""

# Проверка доступности
if curl -s --max-time 3 "http://localhost:8080" > /dev/null 2>&1; then
    echo "✅ http://localhost:8080 - EMDR приложение"
else
    echo "❌ http://localhost:8080 - НЕДОСТУПЕН"
fi

if curl -s --max-time 3 "http://localhost:8081" > /dev/null 2>&1; then
    echo "✅ http://localhost:8081 - VPN инструкции"
else
    echo "❌ http://localhost:8081 - НЕДОСТУПЕН"
fi

if curl -s --max-time 3 -k "https://localhost:8443" > /dev/null 2>&1; then
    echo "✅ https://localhost:8443 - EMDR приложение (HTTPS)"
else
    echo "❌ https://localhost:8443 - НЕДОСТУПЕН"
fi

if curl -s --max-time 3 -k "https://localhost:8444" > /dev/null 2>&1; then
    echo "✅ https://localhost:8444 - VPN инструкции (HTTPS)"
else
    echo "❌ https://localhost:8444 - НЕДОСТУПЕН"
fi

echo ""
echo "🌐 ГОТОВО! Сайты доступны по адресам:"
echo "===================================="
echo "📱 EMDR приложение:    http://localhost:8080"
echo "📖 VPN инструкции:     http://localhost:8081"
echo "🔒 EMDR приложение:    https://localhost:8443"
echo "🔐 VPN инструкции:     https://localhost:8444"
echo ""
echo "💡 Туннели работают в фоновом режиме"
echo "🔄 Для перезапуска: запустите этот файл снова"
echo "🛑 Для остановки: pkill -f 'ssh.*$SERVER_IP'"
echo ""

echo "✅ Туннели активны и готовы к использованию!"
