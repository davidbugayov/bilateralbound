# 🔍 ДИАГНОСТИКА И АНАЛИЗ СТРУКТУРЫ СЕРВЕРА

## 📊 Текущее состояние (22 января 2026)

### Сервер: 213.139.229.44

---

## ✅ ЧТО ЕСТЬ НА СЕРВЕРЕ

### Структура /var/www/

```
/var/www/
├── dev/                          (35 MB)
│   ├── ✅ Git ветка: stable-enhanced
│   ├── ✅ Процесс: node работает (PID 684259)
│   └── ✅ Статус: АКТИВЕН
│
└── emdrbilateral.online/         (135 MB)
    ├── ✅ Git ветка: stable (PROD)
    ├── ✅ Процесс: node работает (PID 684280)
    └── ✅ Статус: АКТИВЕН
```

### Git ветки

| Директория | Ветка | Последний коммит | Статус |
|-----------|-------|-----------------|--------|
| `/var/www/dev` | `stable-enhanced` | `7ca646f` | ✅ Верно |
| `/var/www/emdrbilateral.online` | `stable` | `2e49428` | ✅ Верно |

### Домены и Nginx

✅ **Nginx конфигурация**:
- Файл: `/etc/nginx/sites-enabled/emdrbilateral`
- Статус: АКТИВЕН
- Содержит конфигурации для:
  - `emdrbilateral.online` → proxy на localhost:8080
  - `emdrbilateral.ru` → proxy на localhost:8080
  - `dev.emdrbilateral.online` → proxy на localhost:8080

### Процессы

✅ **Запущенные Node.js процессы**:
- PID 684259: `node /var/www/dev/packages/server-core/server/index.js`
- PID 684280: `/usr/bin/node index.js` (prod сайт)
- PID 4259: PM2 God Daemon

---

## ❌ ЧТО ОТСУТСТВУЕТ

### 1. Папка `/var/www/emdrbilateral.ru`

**Статус**: ❌ НЕ СУЩЕСТВУЕТ

**Требуется для**: Production сайта https://emdrbilateral.ru

**Git ветка**: Должна быть `stable`

**Размер**: ~135 MB (как в emdrbilateral.online)

**Действие**: НУЖНО СОЗДАТЬ

---

### 2. Systemd сервисы

**Ожидаемые сервисы**:
```
bilateralbound-dev
bilateralbound-prod
bilateralbound-prod-ru
```

**Статус**: ❌ НЕ НАЙДЕНЫ

**Текущий механизм**: PM2 (приложения запущены через PM2)

**Это нормально?** Да, если используется PM2 вместо systemd. Нужно проверить конфигурацию PM2.

---

## 🎯 ПРОБЛЕМА И РЕШЕНИЕ

### Главная проблема

Отсутствует папка `/var/www/emdrbilateral.ru` для сайта **https://emdrbilateral.ru**

Nginx уже настроен для этого домена, но нет самого приложения на диске.

### Как это исправить

**Вариант 1: Скопировать от существующего prod**

```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 << 'EOF'
# Копируем emdrbilateral.online в emdrbilateral.ru
cp -r /var/www/emdrbilateral.online /var/www/emdrbilateral.ru

# Переходим в новую папку
cd /var/www/emdrbilateral.ru

# Обновляем git репозиторий
git fetch origin
git reset --hard origin/stable

# Переустанавливаем зависимости (опционально)
npm ci --production

echo "✅ Готово! Папка /var/www/emdrbilateral.ru создана"
EOF
```

**Вариант 2: Клонировать из git репозитория**

```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 << 'EOF'
mkdir -p /var/www/emdrbilateral.ru
cd /var/www/emdrbilateral.ru

# Клонируем только ветку stable
git clone --single-branch --branch stable \
  <URL_ВАШЕГО_РЕПО> .

# Устанавливаем зависимости
npm ci --production

echo "✅ Готово! Папка /var/www/emdrbilateral.ru создана из git"
EOF
```

### Запуск приложения

После создания папки, нужно запустить приложение:

**Если используется systemd**:
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl restart bilateralbound-prod-ru'
```

**Если используется PM2**:
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 << 'EOF'
cd /var/www/emdrbilateral.ru
pm2 start packages/server-core/server/index.js --name bilateralbound-prod-ru
pm2 save
EOF
```

---

## 📋 РЕКОМЕНДУЕМАЯ СТРУКТУРА

```
/var/www/
├── dev/                              ← stable-enhanced (DEV)
│   ├── .git/
│   ├── packages/
│   │   ├── server-core/
│   │   └── web-client/
│   ├── public/
│   ├── scripts/
│   ├── package.json
│   └── node_modules/
│
├── emdrbilateral.online/             ← stable (PROD для .online)
│   ├── .git/
│   ├── packages/
│   │   ├── server-core/
│   │   └── web-client/
│   ├── public/
│   ├── scripts/
│   ├── package.json
│   └── node_modules/
│
└── emdrbilateral.ru/                 ← stable (PROD для .ru) [ОТСУТСТВУЕТ!]
    ├── .git/
    ├── packages/
    │   ├── server-core/
    │   └── web-client/
    ├── public/
    ├── scripts/
    ├── package.json
    └── node_modules/
```

---

## 🚀 ПРОЦЕССЫ И СЕРВИСЫ

### Текущие процессы

| PID | Команда | Статус | Папка |
|-----|---------|--------|-------|
| 684259 | node /var/www/dev/... | ✅ Работает | `/var/www/dev` |
| 684280 | /usr/bin/node index.js | ✅ Работает | `/var/www/emdrbilateral.online` |
| 4259 | PM2 God Daemon | ✅ Работает | PM2 процесс |

### Ожидаемые процессы

| Приложение | Папка | Ветка | Домен | Статус |
|-----------|-------|-------|-------|--------|
| bilateralbound-dev | `/var/www/dev` | stable-enhanced | dev.emdrbilateral.online | ✅ Работает |
| bilateralbound-prod | `/var/www/emdrbilateral.online` | stable | emdrbilateral.online | ✅ Работает |
| bilateralbound-prod-ru | `/var/www/emdrbilateral.ru` | stable | emdrbilateral.ru | ❌ Отсутствует |

---

## 🌐 ПРОВЕРКА ДОМЕНОВ

Проверьте доступность сайтов:

```bash
# DEV
curl -I https://dev.emdrbilateral.online
# Должен вернуть 200 (или 302 redirect, что тоже ОК)

# PROD .online
curl -I https://emdrbilateral.online
# Должен вернуть 200

# PROD .ru
curl -I https://emdrbilateral.ru
# Должен вернуть 200 (или 502 Bad Gateway, если приложение не запущено)
```

---

## ✅ ПРОВЕРОЧНЫЙ СПИСОК

Перед тем как считать все готово, проверьте:

```
☐ [ ] /var/www/dev/ содержит ветку stable-enhanced
☐ [ ] /var/www/emdrbilateral.online/ содержит ветку stable
☐ [ ] /var/www/emdrbilateral.ru/ создана и содержит ветку stable
☐ [ ] Три Node.js процесса запущены:
      - для dev
      - для emdrbilateral.online
      - для emdrbilateral.ru
☐ [ ] Nginx конфигурация содержит все три домена
☐ [ ] Все три сайта доступны по HTTPS:
      - https://dev.emdrbilateral.online
      - https://emdrbilateral.online
      - https://emdrbilateral.ru
☐ [ ] Нет дубликатов папок (dev-old, dev2, etc)
☐ [ ] node_modules установлены во всех трех папках
```

---

## 📝 КОМАНДЫ ДЛЯ ПРОВЕРКИ

```bash
# Проверить существование папок
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'ls -la /var/www/'

# Проверить git ветки
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 \
  'for dir in /var/www/*/; do echo "$(basename $dir): $(cd $dir && git branch | grep "*" || echo "НЕТ GIT")"; done'

# Проверить запущенные процессы
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'ps aux | grep node | grep -v grep'

# Проверить PM2 приложения
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 list'

# Проверить nginx
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'nginx -t'

# Проверить доступность сайтов
curl -I https://dev.emdrbilateral.online
curl -I https://emdrbilateral.online
curl -I https://emdrbilateral.ru
```

---

## 🎯 ИТОГИ

**Что работает:**
- ✅ dev.emdrbilateral.online
- ✅ emdrbilateral.online (prod)
- ✅ Nginx и SSL сертификаты
- ✅ Git ветки правильные

**Что не работает:**
- ❌ emdrbilateral.ru (нет папки с приложением)

**Что нужно сделать:**
1. Создать папку `/var/www/emdrbilateral.ru`
2. Скопировать или клонировать туда git репозиторий на ветку `stable`
3. Запустить приложение (PM2 или systemd)
4. Убедиться что сайт доступен по https://emdrbilateral.ru

**Время на исправление**: ~5 минут

---

**Дата анализа**: 22 января 2026, 09:44 UTC
**Сервер**: 213.139.229.44
**Статус**: Частично готов (нужно добавить emdrbilateral.ru)
