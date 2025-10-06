#!/bin/bash

echo "Настройка локального SSH туннеля для тестирования сайтов"
echo "======================================================"
echo ""

echo "1. Создание HTTP туннеля..."
echo "Выполните эту команду в терминале:"
echo "ssh -R 8080:localhost:3000 root@213.139.229.44 -p 22"
echo ""
echo "После создания туннеля сайты будут доступны локально:"
echo "http://localhost:8080 - EMDR приложение"
echo "http://localhost:8081 - VPN инструкции"
echo ""

echo "2. Создание HTTPS туннеля..."
echo "Выполните эту команду в терминале:"
echo "ssh -R 8443:localhost:3000 root@213.139.229.44 -p 22"
echo ""
echo "После создания HTTPS туннеля:"
echo "https://localhost:8443 - EMDR приложение (HTTPS)"
echo "https://localhost:8444 - VPN инструкции (HTTPS)"
echo ""

echo "3. Для постоянного туннеля используйте:"
echo "ssh -R 8080:localhost:3000 root@213.139.229.44 -p 22 -N -f"
echo ""

echo "Примечание: Убедитесь что ключи SSH настроены для беспарольного доступа"
