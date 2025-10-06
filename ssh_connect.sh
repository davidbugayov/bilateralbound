#!/bin/bash

# Скрипт для подключения к VPS серверу
SERVER="213.139.229.44"
USER="root"
PASSWORD="t!Vt3bNWtkaq"
PORT="22"

echo "🔐 Подключение к VPS серверу..."
echo "Сервер: $SERVER"
echo "Пользователь: $USER"
echo "Порт: $PORT"
echo ""

# Используем expect для автоматизации ввода пароля
expect << EOF
spawn ssh -o StrictHostKeyChecking=no -p $PORT $USER@$SERVER
expect "password:"
send "$PASSWORD\r"
interact
EOF
