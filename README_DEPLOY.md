н# 🚀 EMDR Bilateral Автоматический деплой

Система автоматического развертывания приложения EMDR Bilateral с GitHub.

## 📋 Обзор системы

- **🔄 Автоматический деплой** при пуше в ветку `stable`
- **🔒 Безопасные вебхуки** с проверкой подписи
- **📦 Автоматическое резервное копирование** перед обновлением
- **🔧 Graceful restart** приложения без простоев
- **🏥 Автоматический откат** при неудачном деплое

## 🛠️ Установка и настройка

### 1. Загрузка скриптов на сервер

```bash
# Скопировать файлы на сервер
scp deploy.sh root@2.58.98.132:/var/www/html/
scp update_checker.sh root@2.58.98.132:/var/www/html/
scp webhook.js root@2.58.98.132:/var/www/html/

# Установить права выполнения
ssh root@2.58.98.132 "chmod +x /var/www/html/deploy.sh /var/www/html/update_checker.sh"
```

### 2. Настройка GitHub Webhook

#### Шаг 1: Создать Webhook Secret
```bash
# Сгенерировать секретный ключ
openssl rand -hex 32
# Результат: a1b2c3d4e5f6... (сохранить этот ключ)
```

#### Шаг 2: Настроить Webhook в GitHub
1. Перейти в репозиторий **davidbugayov/bilateralbound**
2. **Settings** → **Webhooks** → **Add webhook**
3. **Payload URL:** `http://2.58.98.132:3001/webhook`
4. **Content type:** `application/json`
5. **Secret:** ввести сгенерированный ключ
6. **Events:** выбрать только **Just the push event**
7. **Active:** ✅ включить

#### Шаг 3: Настроить секрет на сервере
```bash
# Добавить секрет в переменные окружения
echo 'export WEBHOOK_SECRET="ВАШ_СЕКРЕТ_КЛЮЧ"' >> ~/.bashrc
source ~/.bashrc
```

### 3. Настройка автоматической проверки обновлений

```bash
# Добавить cron задачу для проверки обновлений каждые 5 минут
crontab -e
# Добавить строку:
# */5 * * * * /var/www/html/update_checker.sh
```

### 4. Настройка сервисов

#### Создать сервис для вебхука
```bash
cat > /etc/systemd/system/emdrbilateral-webhook.service << 'EOF'
[Unit]
Description=EMDR Bilateral GitHub Webhook Handler
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/html
ExecStart=/usr/bin/node webhook.js
Restart=always
RestartSec=3
Environment=WEBHOOK_SECRET=ВАШ_СЕКРЕТ_КЛЮЧ
Environment=WEBHOOK_PORT=3001

[Install]
WantedBy=multi-user.target
EOF

# Включить и запустить сервис
systemctl enable emdrbilateral-webhook.service
systemctl start emdrbilateral-webhook.service
```

## 🎯 Как это работает

### Ручной деплой
```bash
# Запустить деплой вручную
/var/www/html/deploy.sh
```

### Автоматический деплой через cron
```bash
# Проверить обновления
/var/www/html/update_checker.sh
```

### Автоматический деплой через webhook
1. **Push в stable ветку** → GitHub отправляет webhook
2. **Вебхук сервер** получает и проверяет подпись
3. **Deploy script** скачивает последнюю версию
4. **Приложение** автоматически перезапускается
5. **Health check** проверяет работоспособность

## 📊 Мониторинг

### Логи деплоя
```bash
# Посмотреть логи деплоя
tail -f /var/log/emdrbilateral/deploy.log

# Посмотреть статус сервиса
systemctl status emdrbilateral.service
systemctl status emdrbilateral-webhook.service

# Посмотреть логи вебхука
journalctl -u emdrbilateral-webhook.service -f
```

### Резервные копии
```bash
# Посмотреть доступные бэкапы
ls -la /var/www/html/backup/

# Восстановить из бэкапа
cp /var/www/html/backup/backup_20231201_120000 /var/www/html/app
```

## 🔧 Настройка

### Изменение интервала проверки
```bash
# Редактировать cron
crontab -e
# Изменить */5 * * * * на нужный интервал
```

### Изменение ветки для деплоя
```bash
# В deploy.sh изменить BRANCH="main" на нужную ветку
BRANCH="develop"
```

### Отключение автоматического деплоя
```bash
# Остановить сервисы
systemctl stop emdrbilateral-webhook.service
systemctl disable emdrbilateral-webhook.service

# Удалить cron задачу
crontab -e
# Удалить строку с update_checker.sh
```

## 🚨 Безопасность

- **🔐 Webhook Secret** защищает от несанкционированных деплоев
- **📦 Резервные копии** сохраняются перед каждым деплоем
- **🏥 Автоматический откат** при неудачном деплое
- **🔒 Firewall** настроен только для нужных портов

## 📞 Поддержка

При возникновении проблем:
1. Проверить логи: `journalctl -u emdrbilateral.service -f`
2. Проверить статус сервисов: `systemctl status emdrbilateral*`
3. Проверить вебхуки в GitHub: Settings → Webhooks
4. Убедиться в корректности DNS записей

---

**🎉 Система готова к автоматическому развертыванию!**
