# Система версионирования

## Описание

Автоматическая система версионирования для BilateralBound, которая обновляет версии во всех файлах проекта при каждом коммите.

## Архитектура

- **Версия хранится** в `package.json` файлах и HTML meta тегах
- **Автоинкремент** patch версии при каждом коммите
- **Git hash** добавляется к версии для уникальной идентификации
- **Формат версии**: `major.minor.patch-githash` (например, `2.38.2-c746b32`)

## Компоненты

### 1. scripts/update-version.js

Главный скрипт версионирования, который:

- Генерирует новую версию (инкремент patch)
- Получает текущий git hash
- Обновляет все `package.json` файлы
- Обновляет HTML файлы:
  - Добавляет/обновляет `<meta name="version" content="..." />`
  - Обновляет query параметры `?v=` на всех ресурсах (script, link, img)

### 2. Git Pre-commit Hook

Автоматически запускается перед каждым коммитом:

```bash
#!/bin/sh
# Pre-commit hook - Auto-increment version
echo "🔄 Running pre-commit hook: updating version..."
node scripts/update-version.js
git add package.json packages/*/package.json packages/web-client/public/*.html
echo "✅ Pre-commit hook completed"
```

Расположение: `.git/hooks/pre-commit`

## Использование

### Автоматический режим

При каждом коммите версия обновляется автоматически:

```bash
git commit -m "feat: Новая фича"
# 🔄 Running pre-commit hook: updating version...
# 📦 New version: 2.38.3
# 🔗 Git hash: abc1234
# ✅ Version updated to 2.38.3-abc1234
```

### Ручной режим

Для ручного обновления версий:

```bash
node scripts/update-version.js
```

## Где обновляется версия

1. **package.json** файлы:
   - `package.json`
   - `packages/server-core/package.json`
   - `packages/web-client/package.json`

2. **HTML файлы**:
   - `packages/web-client/public/index.html`
   - `packages/web-client/public/session-controller.html`
   - `packages/web-client/public/viewer.html`

3. **Meta теги** в HTML:
   ```html
   <meta name="version" content="2.38.2-c746b32" />
   ```

4. **Query параметры** на ресурсах:
   ```html
   <script src="/js/common.js?v=2.38.2-c746b32"></script>
   <link href="/css/styles.css?v=2.38.2-c746b32" />
   <img src="/logo.svg?v=2.38.2-c746b32" />
   ```

## Преимущества

✅ **Автоматизация** - версии обновляются без ручного вмешательства
✅ **Кеш-бастинг** - браузеры загружают новые версии файлов
✅ **Трассировка** - каждая версия привязана к git commit
✅ **PM2 интеграция** - версия отображается в `pm2 list`
✅ **Единый источник истины** - версия в package.json

## Отладка

Проверить текущую версию на сайте:

```bash
# Проверка meta тега
curl -s https://dev.emdrbilateral.online/viewer.html | grep 'meta name="version"'

# Проверка версий ресурсов
curl -s https://dev.emdrbilateral.online/viewer.html | grep 'script src='

# Проверка версии в PM2
pm2 list
```

## Примечания

- Если нужно добавить версию к новому ресурсу, добавьте `?v=1.0.0` к его URL
- Скрипт автоматически обновит все существующие `?v=` параметры
- Git hash берется из текущего коммита, поэтому версия обновляется после коммита

