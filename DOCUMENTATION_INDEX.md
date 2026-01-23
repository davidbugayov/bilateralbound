# 📚 ИНДЕКС ДОКУМЕНТОВ ПО ДИАГНОСТИКЕ И РАЗВЕРТЫВАНИЮ

## 📅 Дата: 22 января 2026

---

## 🎯 БЫСТРЫЙ СТАРТ

Если у вас мало времени, прочитайте в этом порядке:

1. **SERVER_FIX_README.md** (2 минуты)
   - Краткое описание проблемы и решения

2. **scripts/create-emdrbilateral-ru.sh** (5 минут)
   - Выполните этот скрипт для исправления

3. **SERVER_CHECKLIST.md** (3 минуты)
   - Проверьте что все готово

---

## 📖 ПОДРОБНАЯ ИНФОРМАЦИЯ

### Диагностика и Анализ

| Документ | Назначение | Читать когда |
|----------|-----------|-------------|
| **SERVER_STRUCTURE_REPORT.md** | Полный анализ структуры сервера с рекомендациями | Нужна детальная информация |
| **SERVER_CHECKLIST.md** | Чек-лист проверки всех параметров | Нужно убедиться что всё готово |
| **SERVER_FIX_README.md** | Краткое резюме проблемы и решения | Нужен быстрый ответ |

### Развертывание

| Документ | Назначение | Читать когда |
|----------|-----------|-------------|
| **DEPLOYMENT_GUIDE.md** | Полное руководство по развертыванию всех окружений | Нужна инструкция по развертыванию |
| **DEPLOYMENT_README.md** | Описание развертывания stable-enhanced на dev | Работаете с dev окружением |
| **DEPLOYMENT_REPORT.md** | Отчет о выполненном развертывании | Нужна история действий |
| **QUICK_DEPLOY.md** | Быстрая шпаргалка с командами | Нужны быстрые команды |

### Скрипты

| Скрипт | Назначение | Использовать когда |
|--------|-----------|-------------------|
| **scripts/deploy-stable-enhanced.sh** | Развертывание stable-enhanced на dev | Обновляете dev |
| **scripts/deploy-quick.sh** | Быстрое развертывание выбранного окружения | Нужно выбрать окружение |
| **scripts/create-emdrbilateral-ru.sh** | Создание папки emdrbilateral.ru | Нужно создать .ru окружение |
| **scripts/deploy_full_infrastructure.sh** | Полное развертывание инфраструктуры | Пересоздаете всё с нуля |

---

## 🔍 СТРУКТУРА ДОКУМЕНТОВ ПО КАТЕГОРИЯМ

### 🔴 СРОЧНЫЕ (требуют внимания)

```
├── SERVER_FIX_README.md              ← НАЧНИТЕ ЗДЕСЬ
├── SERVER_STRUCTURE_REPORT.md
└── scripts/create-emdrbilateral-ru.sh
```

**Действие**: Запустите скрипт для создания /var/www/emdrbilateral.ru

### 🟡 ВАЖНЫЕ (для понимания структуры)

```
├── SERVER_CHECKLIST.md
├── DEPLOYMENT_GUIDE.md
└── QUICK_DEPLOY.md
```

**Действие**: Используйте для проверки и развертывания

### 🟢 СПРАВОЧНЫЕ (для справки)

```
├── DEPLOYMENT_README.md
├── DEPLOYMENT_REPORT.md
└── QUICK_DEPLOY.md
```

**Действие**: Обращайтесь при необходимости

---

## 📊 КАРТА ПРОБЛЕМ И РЕШЕНИЙ

### Проблема 1: Отсутствует /var/www/emdrbilateral.ru

**Файлы**:
- SERVER_FIX_README.md
- SERVER_STRUCTURE_REPORT.md
- scripts/create-emdrbilateral-ru.sh
- SERVER_CHECKLIST.md

**Решение**: Запустить скрипт create-emdrbilateral-ru.sh

### Проблема 2: Нужно развернуть stable-enhanced на dev

**Файлы**:
- DEPLOYMENT_GUIDE.md
- DEPLOYMENT_README.md
- scripts/deploy-stable-enhanced.sh
- QUICK_DEPLOY.md

**Решение**: Запустить scripts/deploy-stable-enhanced.sh deploy

### Проблема 3: Нужно проверить структуру сервера

**Файлы**:
- SERVER_STRUCTURE_REPORT.md
- SERVER_CHECKLIST.md

**Решение**: Прочитать отчет и проверить по чек-листу

---

## 🎯 РАБОЧИЙ ПРОЦЕСС

### День 1: Диагностика и Исправление

1. Прочитайте **SERVER_FIX_README.md** (2 мин)
2. Запустите **scripts/create-emdrbilateral-ru.sh** (5 мин)
3. Проверьте по **SERVER_CHECKLIST.md** (3 мин)

### День 2: Регулярное развертывание

1. Используйте **QUICK_DEPLOY.md** для команд (1 мин)
2. Или запустите **scripts/deploy-quick.sh** для меню (2 мин)
3. Проверьте логи по **DEPLOYMENT_GUIDE.md** если есть ошибки

### День 3+: Обслуживание

1. Используйте **SERVER_CHECKLIST.md** для проверки статуса
2. Обращайтесь к **DEPLOYMENT_GUIDE.md** при необходимости
3. Запускайте скрипты для развертывания/обновления

---

## 📝 СПИСОК ВСЕХ ДОКУМЕНТОВ

### Корневые файлы в /bilateral_bound/

```
DEPLOYMENT_GUIDE.md          Полное руководство по развертыванию
DEPLOYMENT_README.md         Описание development-enhanced развертывания
DEPLOYMENT_REPORT.md         Отчет о выполненном развертывании
QUICK_DEPLOY.md              Быстрая справка по командам
SERVER_CHECKLIST.md          Чек-лист проверки структуры
SERVER_FIX_README.md         Краткое описание проблемы и решения
SERVER_STRUCTURE_REPORT.md   Полный анализ структуры сервера
```

### Скрипты в /bilateral_bound/scripts/

```
deploy-stable-enhanced.sh         Развертывание stable-enhanced на dev
deploy-quick.sh                  Быстрое развертывание выбранного окружения
deploy_full_infrastructure.sh     Полное развертывание инфраструктуры
create-emdrbilateral-ru.sh        Создание папки emdrbilateral.ru
```

---

## 🚀 БЫСТРЫЕ ССЫЛКИ НА КОМАНДЫ

### Создать emdrbilateral.ru

```bash
bash scripts/create-emdrbilateral-ru.sh
```

### Развернуть dev

```bash
bash scripts/deploy-stable-enhanced.sh deploy
```

### Быстрое меню

```bash
bash scripts/deploy-quick.sh
```

### Проверить структуру

```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'ls -lah /var/www/'
```

### Проверить процессы

```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 list'
```

### Проверить доступность сайтов

```bash
curl -I https://dev.emdrbilateral.online
curl -I https://emdrbilateral.online
curl -I https://emdrbilateral.ru
```

---

## 📞 ПОЛУЧИТЬ ПОМОЩЬ

**Нужна быстрая ориентировка**?
→ Прочитайте SERVER_FIX_README.md

**Нужны подробности**?
→ Прочитайте SERVER_STRUCTURE_REPORT.md

**Нужно исправить проблему**?
→ Запустите scripts/create-emdrbilateral-ru.sh

**Нужно развернуть приложение**?
→ Используйте scripts/deploy-quick.sh или DEPLOYMENT_GUIDE.md

**Нужны быстрые команды**?
→ Обратитесь к QUICK_DEPLOY.md

---

## ✅ СТАТУС ПОСЛЕ ДИАГНОСТИКИ

✅ **ВЫПОЛНЕНО**:
- Полная диагностика сервера
- Обнаружена главная проблема (отсутствие emdrbilateral.ru)
- Созданы скрипты для исправления
- Написана подробная документация

❌ **ТРЕБУЕТ ДЕЙСТВИЯ**:
- Запустить скрипт create-emdrbilateral-ru.sh
- Проверить что все три сайта работают

---

## 📅 ИСТОРИЯ ОБНОВЛЕНИЙ

**22 января 2026**:
- ✅ Выполнена полная диагностика сервера
- ✅ Обнаружена проблема с отсутствием emdrbilateral.ru
- ✅ Создан скрипт для исправления
- ✅ Написана полная документация

---

**Вопросы?** Обратитесь к SERVER_STRUCTURE_REPORT.md или SERVER_CHECKLIST.md
