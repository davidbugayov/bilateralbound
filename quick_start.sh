#!/bin/bash

echo "🚀 Быстрый старт - EMDR сайты через SSH туннель"
echo "==============================================="
echo ""

echo "Выберите вариант настройки:"
echo "1) Ручная настройка туннелей"
echo "2) Показать инструкции"
echo "3) Проверить доступность"
echo "4) Остановить туннели"
echo ""

read -p "Выберите вариант (1-4): " choice

case $choice in
    1)
        echo ""
        echo "📋 Откройте 4 терминала и выполните команды:"
        echo ""
        echo "Терминал 1:"
        echo "ssh -R 8080:localhost:3000 root@213.139.229.44 -p 22"
        echo ""
        echo "Терминал 2:"
        echo "ssh -R 8443:localhost:3000 root@213.139.229.44 -p 22"
        echo ""
        echo "Терминал 3:"
        echo "ssh -R 8081:localhost:8081 root@213.139.229.44 -p 22"
        echo ""
        echo "Терминал 4:"
        echo "ssh -R 8444:localhost:8081 root@213.139.229.44 -p 22"
        echo ""
        echo "✅ После выполнения сайты доступны локально!"
        ;;
    2)
        echo ""
        echo "📖 Инструкции:"
        echo "=============="
        cat SSH_TUNNEL_GUIDE.md
        ;;
    3)
        echo ""
        echo "🔍 Проверка доступности туннелей..."
        chmod +x test_tunnel_connection.sh
        ./test_tunnel_connection.sh
        ;;
    4)
        echo ""
        echo "🛑 Остановка туннелей..."
        pkill -f 'ssh.*213.139.229.44'
        echo "✅ Туннели остановлены"
        ;;
    *)
        echo "Неверный выбор. Попробуйте снова."
        ;;
esac

echo ""
echo "🌐 После настройки туннелей используйте:"
echo "http://localhost:8080  - EMDR приложение"
echo "http://localhost:8081  - VPN инструкции"
echo "https://localhost:8443 - EMDR приложение (HTTPS)"
echo "https://localhost:8444 - VPN инструкции (HTTPS)"
