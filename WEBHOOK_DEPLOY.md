# 🚀 Система автоматического деплоя через GitHub Webhooks

Полная инструкция по настройке и использованию системы автоматического деплоя для BilateralBound EMDR.

## 📋 Оглавление

1. [Обзор системы](#обзор-системы)
2. [Архитектура](#архитектура)
3. [Быстрый старт](#быстрый-старт)
4. [Детальная настройка](#детальная-настройка)
5. [Ручной деплой](#ручной-деплой)
6. [Мониторинг и отладка](#мониторинг-и-отладка)
7. [Troubleshooting](#troubleshooting)

---

## Обзор системы

Система автоматически разворачивает приложение на VPS при push в GitHub:

- **Production (emdrbilateral.online)** - ветка `stable`, порт 3000
- **Production RU (emdrbilateral.ru)** - ветка `stable`, порт 3001
- **Development (dev.emdrbilateral.online)** - ветка `main`, порт 3002

### Компоненты

- `webhook-server.js` - Node.js сервер для обработки webhooks от GitHub
- `setup-webhooks.sh` - скрипт автоматической установки на VPS
- `manual-deploy.sh` - интерактивный скрипт для ручного деплоя
- `webhook-server.service` - systemd сервис для webhook-сервера

---

## Архитектура

```
GitHub Push
    ↓
GitHub Webhook
    ↓
nginx (reverse proxy)
    ↓
webhook-server.js:9000
    ↓
┌─────────────────────────────────────┐
│  Для каждого окружения:             │
│  1. git pull                        │
│  2. npm ci --production             │
│  3. systemctl restart service       │
└─────────────────────────────────────┘
    ↓
Приложение запущено
```

### Маппинг окружений

| Домен                    | Ветка  | Директория                      | Сервис                 | Порт |
| ------------------------ | ------ | ------------------------------- | ---------------------- | ---- |
| emdrbilateral.online     | stable | /var/www/bilateralbound-prod    | bilateralbound-prod    | 3000 |
| emdrbilateral.ru         | stable | /var/www/bilateralbound-prod-ru | bilateralbound-prod-ru | 3001 |
| dev.emdrbilateral.online | main   | /var/www/bilateralbound-dev     | bilateralbound-dev     | 3002 |

---

## Быстрый старт

### 1. Установка на VPS

```bash
# Сделайте скрипты исполняемыми
chmod +x setup-webhooks.sh manual-deploy.sh

# Запустите установку
./setup-webhooks.sh
```

Скрипт:

- Установит webhook-сервер на VPS
- Сгенерирует webhook secret
- Настроит systemd сервис
- Настроит firewall и nginx
- Выведет инструкции для GitHub

### 2. Настройка GitHub Webhooks

После установки скрипт выведет webhook secret. Используйте его для настройки:

1. Откройте: https://github.com/davidbugayov/bilateralbound/settings/hooks
2. Нажмите **Add webhook**
3. Создайте 3 webhook (по одному для каждого домена):

**Webhook #1 - Production**

```
Payload URL: https://emdrbilateral.online/webhook
Content type: application/json
Secret: [ваш сгенерированный secret]
Events: Just the push event
Active: ✓
```

**Webhook #2 - Production RU**

```
Payload URL: https://emdrbilateral.ru/webhook
Content type: application/json
Secret: [ваш сгенерированный secret]
Events: Just the push event
Active: ✓
```

**Webhook #3 - Development**

```
Payload URL: https://dev.emdrbilateral.online/webhook
Content type: application/json
Secret: [ваш сгенерированный secret]
Events: Just the push event
Active: ✓
```

### 3. Тестирование

```bash
# Сделайте тестовый коммит
git commit --allow-empty -m "Test webhook"
git push origin stable  # или main для dev

# Проверьте логи
ssh root@213.139.229.44 "tail -f /var/log/webhook-deploy.log"
```

---

## Детальная настройка

### Конфигурация webhook-сервера

Файл: `/opt/webhook-server/webhook-server.js`

Основные параметры в `CONFIG`:

```javascript
{
  port: 9000,                    // Порт webhook-сервера
  secret: process.env.WEBHOOK_SECRET,  // Secret из переменной окружения
  logFile: '/var/log/webhook-deploy.log',

  environments: {
    'emdrbilateral.online': {
      branch: 'stable',
      workDir: '/var/www/bilateralbound-prod',
      serviceName: 'bilateralbound-prod',
      port: 3000
    },
    // ... другие окружения
  }
}
```

### Процесс деплоя

Для каждого окружения webhook-сервер выполняет:

1. **Проверка директории**
   - Если нет - клонирует репозиторий
   - Если есть - обновляет код

2. **Остановка сервиса**

   ```bash
   systemctl stop bilateralbound-prod
   ```

3. **Обновление кода**

   ```bash
   git fetch --all
   git checkout stable
   git reset --hard origin/stable
   ```

4. **Установка зависимостей**

   ```bash
   npm ci --production
   ```

5. **Создание systemd сервиса** (если не существует)

6. **Запуск сервиса**

   ```bash
   systemctl enable bilateralbound-prod
   systemctl start bilateralbound-prod
   ```

7. **Проверка статуса** (через 3 секунды)

---

## Ручной деплой

Если автоматический деплой не сработал, используйте `manual-deploy.sh`:

```bash
chmod +x manual-deploy.sh
./manual-deploy.sh
```

### Интерактивное меню

```
==========================================
  BilateralBound Manual Deploy Script
==========================================
1) Deploy PRODUCTION (emdrbilateral.online)
2) Deploy PRODUCTION RU (emdrbilateral.ru)
3) Deploy DEV (dev.emdrbilateral.online)
4) Deploy ALL environments
5) Check services status
6) View logs
7) Restart services
0) Exit
==========================================
```

### Функции

- **Deploy** - полный деплой выбранного окружения
- **Check status** - проверка статуса всех сервисов
- **View logs** - просмотр логов (приложения или webhook)
- **Restart** - перезапуск сервисов без обновления кода

---

## Мониторинг и отладка

### Проверка статуса webhook-сервера

```bash
# Статус сервиса
ssh root@213.139.229.44 "systemctl status webhook-server"

# Проверка порта
ssh root@213.139.229.44 "netstat -tuln | grep 9000"
```

### Просмотр логов

**Webhook-сервер (все события деплоя)**

```bash
# Файловый лог
ssh root@213.139.229.44 "tail -f /var/log/webhook-deploy.log"

# Journalctl
ssh root@213.139.229.44 "journalctl -u webhook-server -f"
```

**Приложения**

```bash
# Production
ssh root@213.139.229.44 "journalctl -u bilateralbound-prod -f"

# Production RU
ssh root@213.139.229.44 "journalctl -u bilateralbound-prod-ru -f"

# Development
ssh root@213.139.229.44 "journalctl -u bilateralbound-dev -f"
```

### Проверка GitHub webhooks

1. Откройте: https://github.com/davidbugayov/bilateralbound/settings/hooks
2. Кликните на webhook
3. Вкладка **Recent Deliveries** покажет:
   - Статус запроса
   - Request/Response
   - Ошибки

---

## Troubleshooting

### Webhook не срабатывает

**Проблема:** GitHub показывает ошибку доставки

**Решение:**

1. Проверьте статус webhook-сервера:

   ```bash
   ssh root@213.139.229.44 "systemctl status webhook-server"
   ```

2. Проверьте логи:

   ```bash
   ssh root@213.139.229.44 "journalctl -u webhook-server -n 50"
   ```

3. Проверьте firewall:

   ```bash
   ssh root@213.139.229.44 "ufw status"
   ```

4. Проверьте nginx конфигурацию:
   ```bash
   ssh root@213.139.229.44 "nginx -t"
   ```

### Деплой не завершается

**Проблема:** Webhook получен, но деплой зависает

**Решение:**

1. Проверьте логи деплоя:

   ```bash
   ssh root@213.139.229.44 "tail -100 /var/log/webhook-deploy.log"
   ```

2. Проверьте доступ к GitHub:

   ```bash
   ssh root@213.139.229.44 "git ls-remote https://github.com/davidbugayov/bilateralbound.git"
   ```

3. Используйте ручной деплой:
   ```bash
   ./manual-deploy.sh
   ```

### Приложение не запускается после деплоя

**Проблема:** Деплой успешен, но приложение не работает

**Решение:**

1. Проверьте статус сервиса:

   ```bash
   ssh root@213.139.229.44 "systemctl status bilateralbound-prod"
   ```

2. Проверьте логи приложения:

   ```bash
   ssh root@213.139.229.44 "journalctl -u bilateralbound-prod -n 100"
   ```

3. Проверьте зависимости:

   ```bash
   ssh root@213.139.229.44 "cd /var/www/bilateralbound-prod && npm ci --production"
   ```

4. Проверьте порты:
   ```bash
   ssh root@213.139.229.44 "netstat -tuln | grep -E '3000|3001|3002'"
   ```

### Неверная подпись (Invalid signature)

**Проблема:** Webhook получен, но отклонен с ошибкой "Invalid signature"

**Решение:**

1. Проверьте secret в systemd сервисе:

   ```bash
   ssh root@213.139.229.44 "systemctl cat webhook-server | grep WEBHOOK_SECRET"
   ```

2. Убедитесь, что в GitHub webhook используется тот же secret

3. Перезапустите webhook-сервер:
   ```bash
   ssh root@213.139.229.44 "systemctl restart webhook-server"
   ```

### Конфликты портов

**Проблема:** Сервис не запускается из-за занятого порта

**Решение:**

1. Найдите процесс на порту:

   ```bash
   ssh root@213.139.229.44 "lsof -i :3000"
   ```

2. Остановите конфликтующий процесс или измените порт в конфигурации

---

## Полезные команды

### Управление webhook-сервером

```bash
# Запуск
ssh root@213.139.229.44 "systemctl start webhook-server"

# Остановка
ssh root@213.139.229.44 "systemctl stop webhook-server"

# Перезапуск
ssh root@213.139.229.44 "systemctl restart webhook-server"

# Статус
ssh root@213.139.229.44 "systemctl status webhook-server"

# Включить автозапуск
ssh root@213.139.229.44 "systemctl enable webhook-server"
```

### Управление приложениями

```bash
# Перезапуск всех окружений
ssh root@213.139.229.44 "systemctl restart bilateralbound-prod bilateralbound-prod-ru bilateralbound-dev"

# Проверка статуса всех
ssh root@213.139.229.44 "systemctl status 'bilateralbound-*'"

# Просмотр логов всех окружений
ssh root@213.139.229.44 "journalctl -u 'bilateralbound-*' -f"
```

### Очистка

```bash
# Очистка логов webhook (старше 7 дней)
ssh root@213.139.229.44 "find /var/log -name 'webhook-deploy.log*' -mtime +7 -delete"

# Очистка журнала systemd
ssh root@213.139.229.44 "journalctl --vacuum-time=7d"
```

---

## Безопасность

### Рекомендации

1. **Используйте сложный webhook secret** (генерируется автоматически при установке)
2. **Ограничьте доступ к порту 9000** через firewall
3. **Используйте HTTPS** для всех webhook endpoints (через nginx)
4. **Регулярно обновляйте** Node.js и зависимости на сервере
5. **Мониторьте логи** на предмет подозрительной активности

### Обновление webhook secret

Если нужно изменить secret:

```bash
# Сгенерировать новый secret
NEW_SECRET=$(openssl rand -hex 32)
echo $NEW_SECRET

# Обновить на сервере
ssh root@213.139.229.44 "sed -i 's/WEBHOOK_SECRET=.*/WEBHOOK_SECRET=$NEW_SECRET/' /etc/systemd/system/webhook-server.service"
ssh root@213.139.229.44 "systemctl daemon-reload"
ssh root@213.139.229.44 "systemctl restart webhook-server"

# Обновить в GitHub webhooks
# (вручную через веб-интерфейс)
```

---

## Дополнительная информация

### Требования к серверу

- **OS:** Ubuntu 20.04+ / Debian 11+
- **Node.js:** v18+
- **RAM:** минимум 1GB (рекомендуется 2GB+)
- **Диск:** минимум 10GB свободного места
- **Сеть:** откр
