#!/bin/bash

echo "=== Let's Encrypt SSL Setup ==="
echo "После настройки DNS записей выполните следующие команды:"
echo ""

echo "1. Остановить Nginx:"
echo "   systemctl stop nginx"

echo "2. Получить сертификаты Let's Encrypt:"
echo "   certbot certonly --standalone -d emdrbilateral.online -d emdrbilateral.ru --email davidbugayov@ya.ru --agree-tos --no-eff-email"

echo "3. Обновить Nginx конфигурацию:"
echo "   sed -i 's|/etc/ssl/certs/nginx-selfsigned.crt|/etc/letsencrypt/live/emdrbilateral.online/fullchain.pem|' /etc/nginx/sites-available/default"
echo "   sed -i 's|/etc/ssl/private/nginx-selfsigned.key|/etc/letsencrypt/live/emdrbilateral.online/privkey.pem|' /etc/nginx/sites-available/default"

echo "4. Запустить Nginx:"
echo "   systemctl start nginx"

echo "5. Настроить автоматическое обновление:"
echo "   echo '0 3 * * * certbot renew --quiet' | crontab -"

echo ""
echo "=== DNS записи для настройки ==="
echo "emdrbilateral.online    A    2.58.98.132"
echo "emdrbilateral.ru        A    2.58.98.132"
echo "vpn.emdrbilateral.online A    2.58.98.132"
echo "vpn.emdrbilateral.ru     A    2.58.98.132"
