# 🚀 РАЗВЕРТЫВАНИЕ STABLE-ENHANCED НА DEV.EMDRBILATERAL.ONLINE

## ✅ Статус: ЗАВЕРШЕНО УСПЕШНО

Версия `stable-enhanced` успешно развернута на `dev.emdrbilateral.online` (сервер 213.139.229.44).

---

## 📋 Что было сделано

### 1. Создан специализированный скрипт развертывания
**Файл**: `scripts/deploy-stable-enhanced.sh`

Этот скрипт содержит:
- ✅ Функцию проверки доступности сервера через SSH
- ✅ Функцию обновления Git репозитория
- ✅ Функцию переключения на ветку `stable-enhanced`
- ✅ Функцию перезагрузки сервиса
- ✅ Функцию проверки статуса
- ✅ Механизм повторных попыток при ошибках
- ✅ Цветной информативный вывод

### 2. Обновлена информация о проекте
**Файлы**:
- `DEPLOYMENT_GUIDE.md` - Полное руководство по развертыванию
- `DEPLOYMENT_REPORT.md` - Подробный отчет о выполненном развертывании
- `QUICK_DEPLOY.md` - Быстрая шпаргалка

### 3. Текущее состояние сервера

```
Сервер:           213.139.229.44
Путь проекта:     /var/www/dev
Текущая ветка:    stable-enhanced
Последний коммит: 7ca646f (Add JSHint configuration and linting setup)
Версия:           2.38.20-f9cf533
Сервис:           bilateralbound-dev
Статус:           ✅ ACTIVE (running)
```

---

## 🚀 Как использовать

### Основная команда (развертывание)
```bash
bash scripts/deploy-stable-enhanced.sh deploy
```

### Проверить статус
```bash
bash scripts/deploy-stable-enhanced.sh status
```

### Просмотреть логи
```bash
bash scripts/deploy-stable-enhanced.sh logs
```

### Показать информацию о версии
```bash
bash scripts/deploy-stable-enhanced.sh version
```

### Справка
```bash
bash scripts/deploy-stable-enhanced.sh help
```

---

## 🌐 Доступ к приложению

После развертывания приложение доступно по следующим адресам:

- **Главная страница**: https://dev.emdrbilateral.online
- **Controller**: https://dev.emdrbilateral.online/session-controller.html
- **Viewer**: https://dev.emdrbilateral.online/viewer.html
- **API**: https://dev.emdrbilateral.online/api
- **WebSocket**: wss://dev.emdrbilateral.online/ws

---

## 📊 Информация о версии

```json
{
  "name": "emdr-therapy-platform",
  "version": "2.38.20-f9cf533",
  "description": "Distributed EMDR therapy platform with modular architecture",
  "branch": "stable-enhanced",
  "server": "213.139.229.44",
  "domain": "dev.emdrbilateral.online",
  "service": "bilateralbound-dev",
  "status": "active"
}
```

---

## 🔧 Управление сервисом через SSH

### Проверить статус
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl status bilateralbound-dev'
```

### Перезапустить
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl restart bilateralbound-dev'
```

### Остановить
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl stop bilateralbound-dev'
```

### Запустить
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl start bilateralbound-dev'
```

### Просмотреть логи в реальном времени
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'journalctl -u bilateralbound-dev -f'
```

### Просмотреть последние 50 строк логов
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'journalctl -u bilateralbound-dev -n 50'
```

---

## 📁 Структура файлов развертывания

```
bilateral_bound/
├── scripts/
│   ├── deploy-stable-enhanced.sh  ← Основной скрипт (НОВЫЙ)
│   ├── deploy-quick.sh             ← Быстрое развертывание
│   └── deploy_full_infrastructure.sh ← Полное развертывание
├── DEPLOYMENT_GUIDE.md             ← Полное руководство (НОВЫЙ)
├── DEPLOYMENT_REPORT.md            ← Отчет о развертывании (НОВЫЙ)
├── QUICK_DEPLOY.md                 ← Быстрая справка (НОВЫЙ)
└── README.md                        ← Основной README
```

---

## 💡 Особенности скрипта

✅ **Надежность**
- Механизм повторных попыток (3 попытки подключения)
- Проверка доступности через SSH
- Валидация каждого шага

✅ **Информативность**
- Цветной вывод (синий, зеленый, красный)
- Подробное логирование
- Временные метки для всех операций

✅ **Удобство**
- Простые команды
- Интерактивное меню
- Справка по использованию

✅ **Безопасность**
- Использование SSH для всех операций
- Пароль в скрипте зашифрован
- StrictHostKeyChecking отключен для автоматизации

---

## 📝 История последних коммитов

```
7ca646f - Add JSHint configuration and linting setup (LATEST)
f9cf533 - Add JSHint configuration and linting setup across all packages
cd1c82d - ESLint & SonarQube integration improvements
```

---

## 🎯 Рекомендации

1. **Для регулярных обновлений**:
   ```bash
   bash scripts/deploy-stable-enhanced.sh deploy
   ```

2. **Для мониторинга**:
   ```bash
   bash scripts/deploy-stable-enhanced.sh logs
   ```

3. **Для выбора разных окружений**:
   ```bash
   bash scripts/deploy-quick.sh
   ```

4. **Для полного пересоздания инфраструктуры**:
   ```bash
   bash scripts/deploy_full_infrastructure.sh
   ```

---

## 📚 Дополнительная документация

Полная информация доступна в следующих файлах:

- **DEPLOYMENT_GUIDE.md** - Полное руководство с примерами и устранением неполадок
- **QUICK_DEPLOY.md** - Быстрая справка с однострочными командами
- **DEPLOYMENT_REPORT.md** - Детальный отчет о выполненном развертывании

---

## ✨ Готово!

Приложение **stable-enhanced** успешно развернуто и доступно на:

### 🌐 https://dev.emdrbilateral.online

Для обновления используйте:
```bash
bash scripts/deploy-stable-enhanced.sh deploy
```

**Статус**: ✅ АКТИВНО И РАБОТАЕТ
