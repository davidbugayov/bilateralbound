# NPM Commands Reference

Справочник всех доступных команд в проекте BilateralBound v2.39.553.

## Основные

```bash
npm start              # Запуск сервера (production mode)
npm run dev            # Запуск в режиме разработки (concurrently: server + webpack watch)
npm run build          # Сборка web-client (webpack production)
npm run build:dev      # Сборка web-client (webpack development)
```

## Тестирование

```bash
npm test                          # E2E тесты против dev.emdrbilateral.online
npm run test:local                # E2E тесты против localhost:3000
npm run test:dev                  # E2E тесты против dev сервера
npm run test:prod                 # E2E тесты против production (emdrbilateral.ru)
npm run test:sync                 # Sync param тесты против dev
npm run test:sync:local           # Sync param тесты против localhost:3000
npm run test:sync:dev             # Sync param тесты против dev сервера
npm run test:bad-internet         # Bad Internet симуляция
npm run test:session              # Быстрая проверка создания сессии (curl POST)
```

## Качество кода

```bash
npm run lint            # ESLint проверка JavaScript
npm run lint:fix        # ESLint с автоисправлением
npm run lint:css        # Stylelint для CSS
npm run lint:css:fix    # Stylelint с автоисправлением
npm run format          # Prettier — форматирование всех файлов
npm run format:check    # Prettier — проверка без изменений
npm run lint:report     # ESLint JSON-отчёт в reports/eslint-report.json
```

## SonarQube

```bash
npm run sonar:report    # ESLint report + SonarQube сканирование
npm run sonar           # Только SonarQube сканирование
```

## Утилиты

```bash
npm run version:update    # Обновить версию во всех package.json
npm run clean             # Очистить node_modules и lock-файлы
npm run clean:cache       # Очистить npm cache и node_modules/.cache
npm run reinstall         # clean + install:all
npm run install:all       # npm install во всех пакетах
npm run update:deps       # npm update во всех пакетах
npm run check:outdated    # Проверить устаревшие зависимости
npm run dev:server        # Запустить только сервер (dev mode)
npm run dev:client        # Запустить только webpack watch
```

## Git

```bash
npm run git:stable    # Переключиться на stable + pull
npm run git:main      # Переключиться на main + pull
npm run git:status    # Git status + последние 5 коммитов
npm run git:sync      # Fetch all + status
```

## Деплой на DEV (dev.emdrbilateral.online)

> **Ветка**: `main`  
> **Сервис**: systemd `emdrbilateral-dev`  
> **Порт**: 3003  
> **Директория**: `/var/www/dev.emdrbilateral.online`

```bash
npm run deploy:dev          # Полный деплой (git pull origin/main + build + restart)
npm run deploy:dev:logs     # Показать логи (journalctl)
npm run deploy:dev:status   # Статус systemd
```

### Если сервис в crash-loop (EADDRINUSE)

```bash
ssh root@90.156.254.190
kill -9 $(lsof -t -i:3003)   # Убить зомби-процесс
systemctl restart emdrbilateral-dev
```

## Деплой на PROD (emdrbilateral.online / .ru)

> **Ветка**: `stable`  
> **Сервисы**: systemd `emdrbilateral-online` (порт 8080) + `emdrbilateral-ru` (порт 8081)  
> **Директория**: `/var/www/emdrbilateral.online` (оба домена из одной директории)

```bash
npm run deploy:prod           # Полный деплой обоих сервисов
npm run deploy:prod:logs      # Показать логи (journalctl, оба сервиса)
npm run deploy:prod:status    # Статус systemd
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
