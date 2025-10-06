#!/bin/bash

echo "🚀 EMDR Сайты - SSH Туннель"
echo "==========================="
echo ""

echo "📋 ШАГ 1: Сделайте файлы исполняемыми"
echo "chmod +x start_tunnels.command"
echo "chmod +x create_tunnels.sh"
echo "chmod +x test_tunnel_connection.sh"
echo "chmod +x quick_start.sh"
echo ""

echo "📋 ШАГ 2: Выберите способ запуска"
echo ""
echo "Вариант A - Автоматический (рекомендуется):"
echo "   ./start_tunnels.command"
echo ""

echo "Вариант B - Интерактивный:"
echo "   ./quick_start.sh"
echo ""

echo "Вариант C - Расширенный:"
echo "   ./create_tunnels.sh"
echo ""

echo "📋 ШАГ 3: После запуска туннелей"
echo "Сайты будут доступны по адресам:"
echo "• http://localhost:8080  - EMDR приложение"
echo "• http://localhost:8081  - VPN инструкции"
echo "• https://localhost:8443 - EMDR приложение (HTTPS)"
echo "• https://localhost:8444 - VPN инструкции (HTTPS)"
echo ""

echo "🔑 Данные для подключения:"
echo "• Сервер: 213.139.229.44"
echo "• Пользователь: root"
echo "• Пароль: Nv4TQQnnF%gk"
echo "• Порт: 22"
echo ""

echo "💡 Для проверки работоспособности:"
echo "   ./test_tunnel_connection.sh"
echo ""

echo "✅ ВСЕ ГОТОВО! Выберите любой способ запуска выше."
echo ""

read -p "Нажмите Enter для продолжения..."
