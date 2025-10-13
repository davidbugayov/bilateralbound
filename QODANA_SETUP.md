# Настройка Qodana

## Получение токена аутентификации

1. Перейдите на https://qodana.cloud
2. Зарегистрируйтесь или войдите в аккаунт
3. В настройках профиля сгенерируйте токен API
4. Скопируйте токен (он должен быть длинным, обычно 32+ символа)

## Настройка проекта

Конфигурация Qodana уже настроена в файле `qodana.yaml`:
- Проект: xPEo1
- Организация: eo1V5

## Использование токена

### Локальная разработка
```bash
export QODANA_TOKEN="ВАШ_ПОЛНЫЙ_ТОКЕН"
qodana scan --show-report
```

### GitHub Actions
Токен уже настроен в `.github/workflows/qodana_code_quality.yml`.
Для работы в CI/CD добавьте токен в секреты репозитория:
- Название секрета: `QODANA_TOKEN_1293692040`
- Значение: ваш полный токен аутентификации

## Структура проекта

Проект настроен для анализа JavaScript кода с использованием Qodana for JS.

## Исключения

Настроены исключения для следующих файлов:
- `public/js/new-features.js`
- `public/js/controller.js`
- `server/session/SessionManager.js`
- `server/session/WebSocketManager.js`

## Запуск анализа

```bash
# С токеном из переменной окружения
QODANA_TOKEN="ВАШ_ТОКЕН" qodana scan

# Показать отчет после анализа
qodana scan --show-report
