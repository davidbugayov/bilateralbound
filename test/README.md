# Тесты BilateralBound

## Запуск

```bash
node test/automated-tests.js
# или
node test/ui-tests.js
```

## Что покрывается

- Отсутствие initial_state до подключения вьювера
- Центрирование шара после viewer.connect
- Движение шара и наличие viewerScreenSize в state_update

## Таймауты

- Каждый автотест имеет таймаут 10 секунд. Если тест зависает, он упадёт с ошибкой `Test timed out`.

## Рекомендации по стабильности

- Дожидаться `open` на обоих WebSocket перед отправкой команд
- Ставить слушателей на сообщения до действия, которое их вызовет
- Не полагаться на `setTimeout` без ожидания событий

## Локальный сервер

```bash
node server.js
# Откройте http://localhost:3000
```

## Полезное

- Логи сервера: `LOG_LEVEL=DEBUG node server.js`
- Проверка здоровья: `GET /health`
