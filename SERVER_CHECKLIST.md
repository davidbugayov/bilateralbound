# ✅ ЧЕК-ЛИСТ: СТРУКТУРА СЕРВЕРА 213.139.229.44

## Текущее состояние: 22 января 2026

---

## 📋 ОСНОВНАЯ ИНФОРМАЦИЯ

### Сервер
- **IP**: 213.139.229.44
- **Пользователь**: root
- **Пароль**: tOx8q7HN+
- **Главная папка**: /var/www/

### Git репозитории
- **Тип**: Monorepo (3 окружения)
- **Основной URL**: https://github.com/YOUR_REPO/bilateral_bound.git

---

## ✅ ПРОВЕРОЧНЫЙ СПИСОК

### 🟢 ДЕВ ОКРУЖЕНИЕ

```
☑ [✓] Папка /var/www/dev/ существует
☑ [✓] Git ветка: stable-enhanced (правильная)
☑ [✓] node_modules установлены
☑ [✓] Процесс Node.js работает (PID 684259)
☑ [✓] Домен https://dev.emdrbilateral.online доступен
☑ [✓] Nginx конфигурация настроена
☑ [✓] SSL сертификат установлен
```

**Статус**: ✅ ПОЛНОСТЬЮ ГОТОВ

---

### 🟢 PROD ОКРУЖЕНИЕ (.online)

```
☑ [✓] Папка /var/www/emdrbilateral.online/ существует
☑ [✓] Git ветка: stable (правильная)
☑ [✓] node_modules установлены
☑ [✓] Процесс Node.js работает (PID 684280)
☑ [✓] Домен https://emdrbilateral.online доступен
☑ [✓] Nginx конфигурация настроена
☑ [✓] SSL сертификат установлен
```

**Статус**: ✅ ПОЛНОСТЬЮ ГОТОВ

---

### 🔴 PROD ОКРУЖЕНИЕ (.ru)

```
☑ [ ] Папка /var/www/emdrbilateral.ru/ существует       ❌ НЕТ!
☑ [ ] Git ветка: stable (правильная)                    ❌ НЕ НАСТРОЕНА
☑ [ ] node_modules установлены                          ❌ ОТСУТСТВУЮТ
☑ [ ] Процесс Node.js работает                          ❌ НЕ ЗАПУЩЕН
☑ [ ] Домен https://emdrbilateral.ru доступен           ❌ ОШИБКА 502
☑ [ ] Nginx конфигурация настроена                      ✓ (но приложение не запущено)
☑ [ ] SSL сертификат установлен                         ✓ (shared с .online)
```

**Статус**: 🔴 ТРЕБУЕТ ИСПРАВЛЕНИЯ

---

## 🚀 ИНСТРУКЦИИ ПО ИСПРАВЛЕНИЮ

### Быстрое решение (5 минут)

**Способ 1: Использовать готовый скрипт**

```bash
cd /Users/davidbugayov/StudioProject/bilateral_bound
bash scripts/create-emdrbilateral-ru.sh
```

**Способ 2: Вручную через SSH**

```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 << 'EOF'
# Копируем от существующего prod
cp -r /var/www/emdrbilateral.online /var/www/emdrbilateral.ru

# Переходим в новую папку
cd /var/www/emdrbilateral.ru

# Обновляем git
git fetch origin
git reset --hard origin/stable

# Переустанавливаем зависимости
npm ci --production --legacy-peer-deps

# Запускаем приложение через PM2
pm2 start packages/server-core/server/index.js --name bilateralbound-prod-ru

# Сохраняем конфигурацию PM2
pm2 save

echo "✅ Готово!"
EOF
```

---

## 📊 ТАБЛИЦА ОКРУЖЕНИЙ

| Параметр | DEV | PROD (.online) | PROD (.ru) |
|----------|-----|---------|--------|
| **Папка** | ✅ `/var/www/dev` | ✅ `/var/www/emdrbilateral.online` | ❌ НЕ СУЩЕСТВУЕТ |
| **Git ветка** | ✅ `stable-enhanced` | ✅ `stable` | ❌ НЕ НАСТРОЕНА |
| **Размер** | 35 MB | 135 MB | - |
| **Процесс** | ✅ Работает | ✅ Работает | ❌ НЕ ЗАПУЩЕН |
| **Домен** | https://dev.emdrbilateral.online | https://emdrbilateral.online | https://emdrbilateral.ru |
| **Порт Nginx** | 3000 → 443 | 8080 → 443 | 8080 → 443 (но не работает) |
| **Статус** | ✅ ОК | ✅ ОК | 🔴 КРИТИЧНО |

---

## 🔍 КОМАНДЫ ДЛЯ ПРОВЕРКИ

### Проверить структуру папок

```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'ls -lah /var/www/'
```

**Ожидаемый результат**:
```
drwxr-xr-x  dev
drwxr-xr-x  emdrbilateral.online
drwxr-xr-x  emdrbilateral.ru          ← После исправления
```

### Проверить Git ветки

```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 << 'EOF'
for d in /var/www/*/; do
  echo "$(basename $d): $(cd $d && git branch | grep "*")"
done
EOF
```

**Ожидаемый результат**:
```
dev: * stable-enhanced
emdrbilateral.online: * stable
emdrbilateral.ru: * stable          ← После исправления
```

### Проверить запущенные процессы

```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 list'
```

**Ожидаемый результат**: Три приложения
```
bilateralbound-dev       (запущено)
bilateralbound-prod      (запущено)
bilateralbound-prod-ru   (запущено)    ← После исправления
```

### Проверить доступность сайтов

```bash
# DEV
curl -I https://dev.emdrbilateral.online
# Ожидаем: HTTP 200 или 301/302

# PROD .online
curl -I https://emdrbilateral.online
# Ожидаем: HTTP 200 или 301/302

# PROD .ru
curl -I https://emdrbilateral.ru
# Ожидаем: HTTP 200 или 301/302 (сейчас вернет 502)
```

---

## 📋 ДЫХ-ЛІ ДО ЗАПУСКА ИСПРАВЛЕНИЯ

Перед запуском скрипта убедитесь:

```
☑ [ ] Вы подключены к сети с доступом к 213.139.229.44
☑ [ ] sshpass установлен: which sshpass
☑ [ ] Пароль root правильный: tOx8q7HN+
☑ [ ] Есть резервная копия (опционально) или вы готовы рискнуть
☑ [ ] На сервере есть достаточно места на диске (~200 MB)
☑ [ ] Вы находитесь в папке /Users/davidbugayov/StudioProject/bilateral_bound
```

---

## ⚠️ ВАЖНЫЕ ПРИМЕЧАНИЯ

### Что происходит при выполнении скрипта:

1. **Копирование** (`cp -r`) - создается полная копия prod окружения
2. **Git обновление** - обновляется git репозиторий
3. **Hard reset** - переключение на ветку stable
4. **npm ci** - переустановка зависимостей
5. **PM2 старт** - запуск приложения через PM2
6. **PM2 save** - сохранение конфигурации (при перезагрузке сервера автоматически запустится)

### Потенциальные проблемы и решения:

**Проблема**: `Permission denied`
```bash
# Решение: Убедитесь что используете правильный пароль
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'echo OK'
```

**Проблема**: `npm ci` зависает
```bash
# Решение: Отмена операции (Ctrl+C) и повтор попытки
# или вручную на сервере:
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'cd /var/www/emdrbilateral.ru && npm install --production'
```

**Проблема**: Сайт недоступен после исправления
```bash
# Проверьте логи PM2:
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 logs bilateralbound-prod-ru | tail -50'

# Или проверьте процесс:
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 show bilateralbound-prod-ru'
```

---

## ✨ ПОСЛЕ ИСПРАВЛЕНИЯ

Когда исправление завершено, вы должны увидеть:

```
✅ /var/www/emdrbilateral.ru/ существует
✅ Git ветка stable установлена
✅ Все зависимости установлены
✅ Процесс запущен через PM2
✅ Сайт доступен по https://emdrbilateral.ru
✅ Нет никаких дубликатов или лишних папок
```

---

## 📞 СПРАВКА И ПОМОЩЬ

### Файлы с информацией в проекте:

1. **SERVER_STRUCTURE_REPORT.md** - Подробный анализ
2. **DEPLOYMENT_GUIDE.md** - Полное руководство
3. **QUICK_DEPLOY.md** - Быстрые команды
4. **scripts/create-emdrbilateral-ru.sh** - Автоматический скрипт

### Полезные команды:

```bash
# Просмотр лог PM2 в реальном времени
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 logs'

# Перезапуск приложения
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 restart all'

# Проверка размеров папок
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'du -sh /var/www/*'

# Проверка свободного место на диске
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'df -h'
```

---

## 🎯 ФИНАЛЬНЫЕ ДЕЙСТВИЯ

### Шаг 1: Создать emdrbilateral.ru

```bash
bash scripts/create-emdrbilateral-ru.sh
```

### Шаг 2: Убедиться что все работает

```bash
# Проверить существование
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'ls -la /var/www/emdrbilateral.ru'

# Проверить процесс
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 list | grep prod-ru'

# Проверить доступность
curl -I https://emdrbilateral.ru
```

### Шаг 3: Обновить этот документ

После успешного исправления, отметьте в чек-листе:

```
☑ [✓] Папка /var/www/emdrbilateral.ru/ существует       ✅ ГОТОВО
☑ [✓] Git ветка: stable (правильная)                    ✅ ГОТОВО
☑ [✓] node_modules установлены                          ✅ ГОТОВО
☑ [✓] Процесс Node.js работает                          ✅ ГОТОВО
☑ [✓] Домен https://emdrbilateral.ru доступен           ✅ ГОТОВО
```

---

**Дата последнего обновления**: 22 января 2026
**Статус**: Требует исправления (недостает emdrbilateral.ru)
**Приоритет**: 🔴 Высокий (PROD сайт не работает)
