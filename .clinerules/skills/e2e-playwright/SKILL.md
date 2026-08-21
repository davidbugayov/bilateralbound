---
name: e2e-playwright
description: Run, debug, and fix E2E Playwright tests for bilateral_bound across dev/local/prod environments
---

# E2E Playwright Tests — bilateral_bound

## Команды

```bash
npm test                 # против dev.emdrbilateral.online
npm run test:local       # против localhost:3000 (запусти npm run dev сначала)
npm run test:dev         # против dev сервера
npm run test:sync        # тесты синхронизации параметров
npm run test:sync:local  # sync тесты локально
npm run test:bad-internet # симуляция плохого интернета
```

## Когда тест падает

### 1. Запусти с verbose/headed

```bash
npx playwright test --headed --reporter=list
npx playwright test --debug  # пошаговый режим
```

### 2. Посмотри trace

```bash
npx playwright show-report
```

### 3. Типичные причины падений

| Ошибка                        | Причина                     | Фикс                        |
| ----------------------------- | --------------------------- | --------------------------- |
| `WebSocket connection failed` | Dev сервер не запущен       | `npm run dev`               |
| `Timeout waiting for bounce`  | Physics loop медленнее 60Hz | Проверить CPU load          |
| `Expected position X, got Y`  | Рассинхрон physics params   | Проверить worldWidth/Height |
| `CSRF token mismatch`         | Cookie проблема             | Очистить browser state      |

### 4. Архитектура тестов

Тесты в `packages/*/tests/` или корневом `tests/`.
Playwright config в `playwright.config.js` (если есть) или `package.json`.

## Запуск одного теста

```bash
npx playwright test tests/sync.spec.js
npx playwright test -g "bounce sync"  # по названию
```
