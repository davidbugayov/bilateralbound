# 🔄 Автоматическая синхронизация версий

Система автоматической синхронизации версий во всех package.json с git hash.

## 📦 Как это работает

### Pre-commit хук
При каждом коммите автоматически запускается `.husky/pre-commit`, который:
1. Читает версию из root `package.json`
2. Получает текущий git hash
3. Обновляет версии во всех package.json:
   - `root/package.json`: `2.38.20-15b24c8` (с hash)
   - `server-core/package.json`: `2.38.20-15b24c8` (с hash)
   - `web-client/package.json`: `2.38.20-15b24c8` (с hash)

### Формат версий
- **Все package.json**: `MAJOR.MINOR.PATCH-GITHASH` (все с git hash)
- **Единая версия**: Одна и та же версия с git hash во всех файлах
- **PM2**: Показывает полную версию с hash

## 🚀 Использование

### Обновление версии вручную
```bash
# 1. Измените версию в root package.json
nano package.json  # Измените "version": "2.38.21"

# 2. Закоммитьте изменения
git add package.json
git commit -m "chore: bump version to 2.38.21"

# 3. Pre-commit хук автоматически обновит все package.json
```

### Ручная синхронизация (без коммита)
```bash
npm run version:sync
```

### Проверка текущих версий
```bash
echo "Root:" && grep '"version"' package.json
echo "Server:" && grep '"version"' packages/server-core/package.json
echo "Web:" && grep '"version"' packages/web-client/package.json
```

## 📋 Доступные команды

```bash
npm run version:sync    # Синхронизировать версии вручную
npm run version:update  # Обновить версию с git hash (старая команда)
npm run version:check   # Проверить версию на production
npm run version        # Version manager
```

## 🔧 Конфигурация

### Структура файлов
```
.husky/
  pre-commit          # Git hook для автоматической синхронизации
scripts/
  sync-versions.js    # Скрипт синхронизации версий
package.json          # Root package (версия с git hash)
packages/
  server-core/
    package.json      # Версия с git hash (одинаковая с root)
  web-client/
    package.json      # Версия с git hash (одинаковая с root)
```

### Логика работы скрипта

1. **Читает базовую версию** из root `package.json`
2. **Убирает существующий hash** (если есть): `2.38.20-abc123` → `2.38.20`
3. **Получает текущий git hash**: `git rev-parse --short HEAD`
4. **Формирует финальные версии**:
   - Root: `2.38.20-15b24c8`
   - Server: `2.38.20-15b24c8`
   - Web: `2.38.20-15b24c8`
5. **Обновляет package.json** файлы
6. **Добавляет изменения в git**: `git add package.json packages/*/package.json`

## 🎯 Преимущества

### ✅ Автоматизация
- Не нужно вручную обновлять версии в 3 файлах
- Не нужно помнить про git hash
- Всё происходит автоматически при коммите

### ✅ Консистентность
- Все версии всегда синхронизированы
- Server-core всегда имеет правильный git hash
- PM2 показывает актуальную версию с hash

### ✅ Удобство
- Изменяете версию только в одном месте (root package.json)
- Pre-commit хук делает всю работу
- Можно запустить синхронизацию вручную если нужно

## 🐛 Troubleshooting

### Версии не синхронизируются
```bash
# Проверьте что pre-commit хук исполняемый
ls -la .husky/pre-commit

# Если нет, сделайте исполняемым
chmod +x .husky/pre-commit

# Проверьте что husky установлен
npm run prepare
```

### Git hash не добавляется
```bash
# Проверьте что вы в git репозитории
git status

# Проверьте что есть коммиты
git log --oneline -1
```

### Ручная синхронизация
```bash
# Если pre-commit не сработал, запустите вручную
npm run version:sync

# Добавьте изменения
git add package.json packages/*/package.json
```

## 📚 Примеры

### Пример 1: Обновление версии
```bash
# 1. Открываем root package.json
nano package.json

# 2. Меняем версию
"version": "2.38.21"

# 3. Коммитим
git add package.json
git commit -m "chore: bump to 2.38.21"

# 4. Результат (автоматически):
# root/package.json: 2.38.21-abc1234
# server-core/package.json: 2.38.21-abc1234
# web-client/package.json: 2.38.21-abc1234
```

### Пример 2: Проверка версий
```bash
npm run version:sync

# Вывод:
# 🔄 Синхронизация версий...
# 📦 Базовая версия: 2.38.20
# 🔖 Git hash: 15b24c8
# ✅ server-core/package.json: 2.38.20-15b24c8
# 🎯 Версии синхронизированы!
```

### Пример 3: PM2 с правильной версией
```bash
pm2 list

# Вывод:
# │ name                     │ version         │
# │ dev.emdrbilateral.online │ 2.38.20-15b24c8 │
```

## 🎉 Результат

Теперь при каждом коммите:
- ✅ Все версии автоматически синхронизируются
- ✅ Server-core получает актуальный git hash
- ✅ PM2 показывает полную версию с hash
- ✅ Не нужно ничего делать вручную!

---

**Создано:** 2026-01-15  
**Версия:** 2.38.20-15b24c8  
**Статус:** ✅ Работает автоматически

