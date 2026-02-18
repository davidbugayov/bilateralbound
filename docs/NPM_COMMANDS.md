# 📦 NPM Commands Reference

Справочник всех доступных команд в проекте BilateralBound v2.39.125.

## 🚀 Основные команды

```bash
npm start              # Запуск сервера (production mode)
npm run dev            # Запуск в режиме разработки
npm test               # Запуск E2E тестов
npm run test:prod      # Тестирование на production URL
```

## 🧪 Тестирование

### E2E тесты
```bash
npm test               # Локальное тестирование на http://localhost:3000
npm run test:prod      # Тестирование на production
npm run test:api       # API тестирование

# Конкретные тесты
BASE_URL=http://localhost:3001 npm test
BASE_URL=https://dev.emdrbilateral.online npm test
```

## 🎨 Качество кода

### Линтинг и форматирование
```bash
npm run lint           # ESLint проверка JavaScript
npm run lint:fix       # Автоматическое исправление ESLint ошибок
npm run format         # Prettier форматирование кода
```

## 📖 Документация

```bash
npm run docs           # Открыть документацию
```

## 🔧 Утилиты

```bash
npm run clean          # Очистить node_modules и lock файлы
npm run update:version # Автоматическое обновление версии
```
npm run format          # Prettier для всех файлов
npm run format:css      # Только CSS
npm run format:html     # Только HTML
npm run format:check    # Проверка без изменений
npm run pre-commit      # Линтинг + форматирование (перед коммитом)
```

## 🔄 Версионирование

```bash
npm run version:update  # Обновить версию с git hash
npm run version:check   # Проверить версию на prod
npm run version         # Version manager
```

## 🌍 Деплой на DEV (dev.emdrbilateral.online)

```bash
npm run deploy:dev         # Полный деплой (pull + restart)
npm run deploy:dev:pull    # Только git pull
npm run deploy:dev:restart # Только рестарт PM2
npm run deploy:dev:logs    # Показать логи
npm run deploy:dev:status  # Статус PM2
```

### Ручной запуск (если npm не работает)
```bash
sshpass -p '9Ddc0BYKDavidqrJZm6a9' ssh -o StrictHostKeyChecking=no root@213.139.229.44 'cd /var/www/dev.emdrbilateral.online && git fetch --all && git reset --hard origin/main && pm2 restart bilateral-bound-dev'
```

## 🌐 Деплой на PROD (emdrbilateral.online / .ru)

```bash
npm run deploy:prod         # Полный деплой (pull + restart)
npm run deploy:prod:pull    # Только git pull
npm run deploy:prod:restart # Только рестарт PM2
npm run deploy:prod:logs    # Показать логи
npm run deploy:prod:status  # Статус PM2
```

## 🖥️ VPS управление

```bash
npm run vps:deploy   # Полный деплой с нуля (pull + install + start)
npm run vps:pull     # Git pull на VPS
npm run vps:install  # Установка зависимостей на VPS
npm run vps:start    # Запуск PM2 процессов
npm run vps:logs     # Все логи PM2
npm run vps:ssh      # SSH подключение к VPS
```

## 🔀 Git операции

```bash
npm run git:stable   # Переключиться на stable-enhanced + pull
npm run git:main     # Переключиться на main + pull
npm run git:status   # Git status + последние 5 коммитов
npm run git:sync     # Fetch all + status
```

## 📋 Примеры использования

### Быстрый деплой на DEV после коммита
```bash
git add -A
git commit -m "fix: исправление"
git push origin main
npm run deploy:dev
```

### Быстрое обновление DEV (без коммита)
```bash
npm run deploy:dev  # Pull latest + restart
```

### Проверка статуса после деплоя
```bash
npm run deploy:dev:status
npm run deploy:dev:logs
```

### Обновление зависимостей
```bash
npm run check:outdated    # Посмотреть что устарело
npm run update:deps       # Обновить
npm test                  # Протестировать
git add -A && git commit -m "deps: обновление зависимостей"
```

### Откат на стабильную версию
```bash
git checkout v2.38.17-stable
npm run deploy:dev
```

### Проверка и форматирование перед коммитом
```bash
npm run pre-commit        # Линтинг + форматирование
git add -A
git commit -m "feat: новая фича"
```

## 🎯 Горячие клавиши (aliases)

Самые частые команды:
- `npm run deploy:dev` - быстрый деплой на dev
- `npm run vps:logs` - смотреть логи
- `npm test` - запустить тесты
- `npm run format` - форматировать код

## 📌 Точки отката

### Стабильные версии с тегами:
```bash
git tag -l "v*-stable"       # Список стабильных версий
git checkout v2.38.17-stable # Откат на стабильную
```

### По коммитам:
```bash
git log --oneline --grep="STABLE" # Найти стабильные коммиты
git checkout 3db3c6e              # Откат на конкретный коммит
```

## 🆘 Troubleshooting

### Если что-то сломалось:
```bash
npm run clean:cache    # Очистить кеш
npm run reinstall      # Переустановить зависимости
npm test              # Проверить работоспособность
```

### Если деплой не работает:
```bash
npm run vps:logs       # Посмотреть логи
npm run vps:ssh        # Зайти на сервер
pm2 list              # Проверить статус
pm2 restart all       # Рестарт всех процессов
```

### Откат на последнюю стабильную:
```bash
git checkout v2.38.17-stable
npm run deploy:dev
npm run deploy:dev:status
```
