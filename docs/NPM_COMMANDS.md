# NPM Commands Reference

Справочник всех доступных команд в проекте BilateralBound v2.39.135.

## Основные

```bash
npm start              # Запуск сервера (production mode)
npm run dev            # Запуск в режиме разработки (nodemon)
npm test               # E2E тесты против dev.emdrbilateral.online
npm run test:local     # E2E тесты против localhost:3000
npm run test:dev       # E2E тесты против dev сервера
npm run test:prod      # E2E тесты против production
```

## Качество кода

```bash
npm run lint           # ESLint проверка JavaScript
npm run lint:fix       # ESLint с автоисправлением
npm run lint:css       # Stylelint для CSS
npm run lint:css:fix   # Stylelint с автоисправлением
npm run format         # Prettier для всех файлов
npm run format:check   # Prettier проверка без изменений
```

## Деплой на DEV (dev.emdrbilateral.online)

> Ветка: **main**. Сервер: systemd `emdrbilateral-dev`, порт 3003.

```bash
npm run deploy:dev         # Полный деплой (git pull origin/main + restart)
npm run deploy:dev:pull    # Только git pull
npm run deploy:dev:restart # Только рестарт systemd
npm run deploy:dev:logs    # Показать логи (journalctl)
npm run deploy:dev:status  # Статус systemd
```

### Если сервис в crash-loop (EADDRINUSE)
```bash
ssh root@213.139.229.44
kill -9 $(lsof -t -i:3003)   # Убить зомби-процесс
systemctl restart emdrbilateral-dev
```

## Деплой на PROD (emdrbilateral.online / .ru)

> Ветка: **stable**. Сервер: systemd `emdrbilateral-online` + `emdrbilateral-ru`, порт 8080.

```bash
npm run deploy:prod         # Полный деплой (git pull origin/stable + restart)
npm run deploy:prod:pull    # Только git pull
npm run deploy:prod:restart # Только рестарт systemd
npm run deploy:prod:logs    # Показать логи
npm run deploy:prod:status  # Статус systemd
```

## Git

```bash
npm run git:main     # Переключиться на main + pull
npm run git:status   # Git status + последние 5 коммитов
npm run git:sync     # Fetch all + status
```

## Утилиты

```bash
npm run version:update # Обновить версию (вызывается автоматически pre-commit)
npm run clean          # Очистить node_modules и lock файлы
npm run reinstall      # clean + install:all
npm run check:outdated # Посмотреть устаревшие зависимости
```

## Быстрый workflow

```bash
# Разработка и деплой на dev
git add <files>
git commit -m "fix: описание"   # pre-commit хук обновит версию автоматически
git push
npm run deploy:dev
npm run test:dev

# После проверки — деплой на prod
git checkout stable && git merge main
git push origin stable
npm run deploy:prod
```
