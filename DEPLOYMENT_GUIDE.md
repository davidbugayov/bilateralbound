# 🚀 Развертывание Bilateral Bound (stable-enhanced)

## 📌 Краткое описание

Этот документ описывает процесс развертывания версии `stable-enhanced` на сервере `dev.emdrbilateral.online` (213.139.229.44).

## 🎯 Выполненные действия

### ✅ Основное развертывание
1. **Обновление Git репозитория**
   - Выполнен `git fetch --all` для получения всех веток
   - Выполнен `git reset --hard origin/stable-enhanced` для переключения на последнюю версию

2. **Текущее состояние**
   - Ветка: `stable-enhanced`
   - Последний коммит: `7ca646f` (Add JSHint configuration and linting setup)
   - Версия: `2.38.20-f9cf533`

3. **Перезапуск сервиса**
   - Сервис `bilateralbound-dev` перезапущен
   - Статус: ACTIVE (running)

## 🛠️ Доступные скрипты развертывания

### 1. deploy-stable-enhanced.sh (Рекомендуется)
Специализированный скрипт для развертывания `stable-enhanced` ветки.

```bash
# Развернуть latest версию
bash scripts/deploy-stable-enhanced.sh deploy

# Показать информацию о версии
bash scripts/deploy-stable-enhanced.sh version

# Проверить статус сервиса
bash scripts/deploy-stable-enhanced.sh status

# Показать логи
bash scripts/deploy-stable-enhanced.sh logs

# Справка
bash scripts/deploy-stable-enhanced.sh help
```

### 2. deploy-quick.sh
Быстрое развертывание выбранного окружения.

```bash
# Интерактивное меню
bash scripts/deploy-quick.sh

# Развернуть DEV окружение напрямую
bash scripts/deploy-quick.sh dev

# Развернуть PRODUCTION
bash scripts/deploy-quick.sh prod

# Развернуть все окружения
bash scripts/deploy-quick.sh all
```

### 3. deploy_full_infrastructure.sh
Полное развертывание инфраструктуры (используется редко).

```bash
bash scripts/deploy_full_infrastructure.sh
```

## 🌐 Доступ к приложению

После успешного развертывания приложение доступно по адресу:

- **Главная страница**: https://dev.emdrbilateral.online
- **Controller**: https://dev.emdrbilateral.online/session-controller.html
- **Viewer**: https://dev.emdrbilateral.online/viewer.html
- **API**: https://dev.emdrbilateral.online/api
- **WebSocket**: wss://dev.emdrbilateral.online/ws

## 📊 Мониторинг и управление

### Проверка статуса сервиса
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl status bilateralbound-dev'
```

### Просмотр логов в реальном времени
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'journalctl -u bilateralbound-dev -f'
```

### Просмотр последних 50 строк логов
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'journalctl -u bilateralbound-dev -n 50'
```

### Перезапуск сервиса
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl restart bilateralbound-dev'
```

### Остановка сервиса
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl stop bilateralbound-dev'
```

### Запуск сервиса
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl start bilateralbound-dev'
```

## 📁 Структура проекта на сервере

```
/var/www/dev/
├── packages/
│   ├── server-core/      # Backend (Node.js)
│   └── web-client/       # Frontend (Web)
├── public/               # Статические файлы
├── scripts/              # Скрипты развертывания
├── package.json          # Root package.json
└── .git/                 # Git репозиторий
```

## 🔄 Механизм развертывания

Скрипты используют следующий процесс:

1. **Подключение к серверу** через SSH (sshpass)
2. **Обновление Git** репозитория
3. **Переключение на нужную ветку** (stable-enhanced)
4. **Hard reset** на последнюю версию
5. **Перезагрузка сервиса** через systemctl
6. **Проверка статуса** сервиса

## ⚙️ Конфигурация

### Данные сервера
- **Хост**: 213.139.229.44
- **Пользователь**: root
- **Пароль**: tOx8q7HN+ (зашифрован в скрипте)

### Сервис
- **Имя сервиса**: bilateralbound-dev
- **Тип**: systemd service
- **Путь к проекту**: /var/www/dev

## 🐛 Устранение проблем

### Если сервис не запускается
1. Проверить логи: `journalctl -u bilateralbound-dev -n 100`
2. Убедиться, что зависимости установлены: `npm ci --production`
3. Проверить права доступа на файлы

### Если развертывание зависает
1. Проверить SSH соединение
2. Убедиться, что сервер доступен
3. Проверить наличие sshpass: `which sshpass`

### Если приложение не доступно по HTTPS
1. Проверить статус Nginx
2. Убедиться, что сертификат SSL актуален
3. Проверить правила firewall

## 📞 Техническая поддержка

Если возникли проблемы с развертыванием, проверьте:

1. Статус сервиса: `systemctl status bilateralbound-dev`
2. Логи приложения: `journalctl -u bilateralbound-dev -f`
3. Соединение SSH: `ssh root@213.139.229.44 echo "OK"`

## 📝 История развертывания

**22 января 2026 года**
- ✅ Развернута версия `stable-enhanced` на `dev.emdrbilateral.online`
- ✅ Последний коммит: `7ca646f` (Add JSHint configuration and linting setup)
- ✅ Сервис успешно перезапущен
- ✅ Приложение доступно и работает

## 📚 Дополнительные ресурсы

- **Git репозиторий**: bilateral_bound (на 213.139.229.44:/var/www/dev)
- **Версия Node.js**: 18.x
- **Версия npm**: 9.x+
- **Операционная система**: Linux (Ubuntu/Debian)

---

**Последнее обновление**: 22 января 2026 года, 12:30 UTC
**Статус**: ✅ АКТИВНО И РАБОТАЕТ
