#!/bin/bash

# Простой скрипт для подключения к VPS серверу с помощью sshpass
SERVER="213.139.229.44"
USER="root"
PASSWORD="t!Vt3bNWtkaq"
PORT="22"

echo "🔐 Подключение к VPS серверу с помощью sshpass..."
echo "Сервер: $SERVER"
echo "Пользователь: $USER"
echo "Порт: $PORT"
echo ""

# Подключаемся с помощью sshpass
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -p $PORT $USER@$SERVER
