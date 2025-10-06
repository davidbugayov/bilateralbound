#!/bin/bash

echo "🚀 Настройка SSH туннеля для доступа к EMDR сайтам"
echo "=================================================="
echo ""

# Проверка наличия SSH ключей
if [ ! -f ~/.ssh/id_rsa ]; then
    echo "⚠️  SSH ключи не найдены. Создайте их или используйте парольную аутентификацию"
    echo ""
fi

echo "📋 Выполните следующие команды в отдельных терминалах:"
echo ""

echo "1️⃣  HTTP туннель для EMDR приложения:"
echo "   ssh -R 8080:localhost:3000 root@213.139.229.44 -p 22"
echo ""

echo "2️⃣  HTTPS туннель для EMDR приложения:"
echo "   ssh -R 8443:localhost:3000 root@213.139.229.44 -p 22"
echo ""

echo "3️⃣  HTTP туннель для VPN инструкций:"
echo "   ssh -R 8081:localhost:8081 root@213.139.229.44 -p 22"
echo ""

echo "4️⃣  HTTPS туннель для VPN инструкций:"
echo "   ssh -R 8444:localhost:8081 root@213.139.229.44 -p 22"
echo ""

echo "🌐 После создания туннелей сайты будут доступны:"
echo "   http://localhost:8080  - EMDR приложение"
echo "   http://localhost:8081  - VPN инструкции"
echo "   https://localhost:8443 - EMDR приложение (HTTPS)"
echo "   https://localhost:8444 - VPN инструкции (HTTPS)"
echo ""

echo "💡 Для постоянного туннеля добавьте флаги -N -f:"
echo "   ssh -R 8080:localhost:3000 root@213.139.229.44 -p 22 -N -f"
echo ""

echo "🔧 Если нужно остановить туннель:"
echo "   pkill -f 'ssh.*213.139.229.44'"
echo ""

echo "✅ Готово! Туннели настроены."
