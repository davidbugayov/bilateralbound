# 🚀 Быстрый старт: Автоматический деплой

Краткая инструкция для настройки автоматического деплоя через GitHub Webhooks.

## Шаг 1: Установка (5 минут)

```bash
# Запустите установку на VPS
./setup-webhooks.sh
```

Скрипт установит webhook-сервер и выведет **webhook secret** - сохраните его!

## Шаг 2: Настройка GitHub (2 минуты)

Создайте 3 webhook в GitHub:

📍 **Настройки:** https://github.com/davidbugayov/bilateralbound/settings/hooks

### Webhook 1: Production
- URL: `https://emdrbilateral.online/webhook`
- Secret: [ваш secret из шага 1]
- Events: Push events

### Webhook 2: Production RU
- URL: `https://emdrbilateral.ru/webhook`
- Secret: [тот же secret]
- Events: Push events

### Webhook 3: Development
- URL: `https://dev.emdrbilateral.online/webhook`
- Secret: [тот же secret]
- Events: Push events

## Шаг 3: Тестирование

```bash
# Push в stable → деплой на production
git push origin stable

# Push в main → деплой на dev
git push origin main
```

## 📊 Проверка статуса

```bash
# Просмотр логов деплоя
ssh root@213.139.229.44 "tail -f /var/log/webhook-deploy.log"

# Статус webhook-сервера
ssh root@213.139.229.44 "systemctl status webhook-server"
```

## 🛠 Ручной деплой (если webhook не сработал)

```bash
./manual-deploy.sh
```

Выберите окружение из интерактивного меню.

## 📚 Полная документация

Детальная инструкция: [WEBHOOK_DEPLOY.md](./WEBHOOK_DEPLOY.md)

## 🔧 Полезные команды

| Действие | Команда |
|----------|---------|
| Просмотр логов | `ssh root@213.139.229.44 "tail -f /var/log/webhook-deploy.log"` |
| Статус webhook | `ssh root@213.139.229.44 "systemctl status webhook-server"` |
| Перезапуск webhook | `ssh root@213.139.229.44 "systemctl restart webhook-server"` |
| Ручной деплой | `./manual-deploy.sh` |

## ⚡ Как это работает

```
Push в GitHub
    ↓
GitHub отправляет webhook
    ↓
Nginx → webhook-server (порт 9000)
    ↓
Автоматический деплой:
  • git pull
  • npm ci --production
  • systemctl restart service
    ↓
Приложение обновлено ✅
```

## 🎯 Окружения

| Домен | Ветка | Порт |
|-------|-------|------|
| emdrbilateral.online | stable | 3000 |
| emdrbilateral.ru | stable | 3001 |
| dev.emdrbilateral.online | main | 3002 |

## 💡 Troubleshooting

**Webhook не работает?**
1. Проверьте логи: `ssh root@213.139.229.44 "journalctl -u webhook-server -n 50"`
2. Проверьте GitHub webhooks: Settings → Webhooks → Recent Deliveries
3. Используйте ручной деплой: `./manual-deploy.sh`

**Нужна помощь?** Читайте [полную документацию](./WEBHOOK_DEPLOY.md)
