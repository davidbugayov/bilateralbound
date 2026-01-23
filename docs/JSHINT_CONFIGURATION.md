# JSHint Конфигурация

## Описание

Проект настроен на использование JSHint для проверки качества кода JavaScript. Конфигурация находится в файле `.jshintrc` в корне проекта и предназначена для минимизации warning'ов при сохранении контроля над критическими ошибками.

## Текущие настройки

### Отключенные warning'и (для уменьшения шума)

- `forin: false` - Не требует проверку свойств объекта в цикле `for...in`
- `noarg: false` - Разрешает использование `arguments` объекта
- `regexp: false` - Не требует безопасные регулярные выражения
- `regexdash: false` - Разрешает небезопасные дефисы в регулярных выражениях
- `nocomma: false` - Разрешает оператор запятой
- `noempty: false` - Разрешает пустые блоки
- `nonbsp: true` - Разрешает небесные пробелы (non-breaking spaces)
- `nonew: false` - Разрешает конструкторы без присваивания результата
- `plusplus: false` - Разрешает `++` и `--` операторы
- `maxlen: false` - Нет лимита на длину строки
- `maxcomplexity: false` - Нет лимита на цикломатическую сложность
- `maxdepth: false` - Нет лимита на глубину вложенности
- `maxparams: false` - Нет лимита на параметры функции
- `maxstatements: false` - Нет лимита на количество операторов
- `trailing: false` - Разрешает пробелы в конце строк
- `maxerr: 999999` - Показывает все ошибки (без лимита)

### Включенные проверки (критические)

- `undef: true` - Проверяет неопределенные переменные
- `unused: false` - Не требует использование всех переменных
- `boss: true` - Разрешает опасные присваивания в условных выражениях
- `expr: true` - Разрешает выражения как операторы
- `validthis: true` - Разрешает `this` в не-методах

### Синтаксические особенности

- `esversion: 11` - Поддержка ES2020 (ES11)
- `asi: true` - Автоматическое вставление точек с запятой (ASI)
- `laxbreak: true` - Более мягкие требования к разрывам строк
- `laxcomma: true` - Разрешает запятую в конце строки перед разрывом
- `laxcase: true` - Разрешает свободное использование case-switch выражений
- `multistr: true` - Разрешает многострочные строки со слешем
- `lastsemic: true` - Разрешает отсутствие точки с запятой в конце файла
- `iterator: true` - Поддержка `__iterator__`
- `moz: true` - Поддержка расширений Mozilla JavaScript
- `proto: true` - Поддержка `__proto__` свойства

### Глобальные переменные

Определены все глобальные переменные, используемые в проекте:

**Node.js / CommonJS**
- `module`, `exports`, `require`, `process`, `Buffer`, `__dirname`, `__filename`

**Browser APIs**
- `globalThis`, `BigInt`, `Promise`, `requestAnimationFrame`, `cancelAnimationFrame`
- `XMLHttpRequest`, `WebSocket`, `crypto`, `performance`, `self`

**WebRTC APIs**
- `RTCPeerConnection`, `RTCSessionDescription`, `RTCIceCandidate`

**Проектные глобали**
- `PhysicsEngine`, `BallRenderer`, `WebSocketClient`, `WS_MSG`, `AudioManager`
- `sharedComponents`, `logger`, `bbCounters`, `ThemeManager`
- `ControllerState`, `ViewerState`, `CommunicationFactory`, `BBConfig`
- И другие...

## Использование

### Проверка одного файла

```bash
npx jshint file.js
```

### Проверка исходных файлов проекта

```bash
npm run lint:jshint
```

Это проверит только исходные файлы в `packages/server-core/server` и `packages/web-client/public/js`, 
исключая node_modules и dist папки.

### Генерация отчета JSHint

```bash
npm run lint:jshint:report
```

Отчет будет сохранен в `reports/jshint-report.json`.

### Использование через npm скрипты

В проекте доступны следующие команды:

```bash
npm run lint:jshint       # Запустить JSHint на исходных файлах
npm run lint:jshint:report # Генерировать JSHint отчет в JSON формате
npm run lint:all          # Запустить все проверки (eslint, jshint, stylelint, htmlhint)
npm run lint              # Запустить ESLint (основной линтер)
npm run lint:fix          # Исправить ошибки ESLint
```

## Файлы конфигурации

### `.jshintrc` - Основная конфигурация
Содержит все правила и настройки JSHint для проекта

### `.jshintignore` - Файлы для исключения
Определяет какие файлы и папки исключаются из проверки JSHint

## Примечания

- JSHint является дополнительным инструментом к ESLint и используется параллельно
- Конфигурация оптимизирована для проекта EMDR Therapy Platform
- Все warning'и отключены в пользу лучшей совместимости с различными стилями кодирования
- Критические ошибки (undefined variables, etc) все еще проверяются

## Дополнительная информация

- [JSHint Документация](https://jshint.com/docs/)
- [JSHint Опции](https://jshint.com/docs/options/)
- [JSHint Игровая площадка](https://jshint.com/try/)

---

*Последнее обновление: 2026-01-22*
*Версия JSHint: 2.13.6*

