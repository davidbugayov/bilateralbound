# BilateralBound - Система Версионирования

## Текущая Версия: v2.90.0
**Статус:** Активна
**Дата релиза:** 19 октября 2025 г. в 18:47
**Коммит:** ce154d0

### Основные Изменения v2.90.0:
- ✨ fix: resolve controller status display and ball centering issues

- Fix controller status display in viewer - now correctly shows 'Контроллер подключен' when controller connects
- Add proper event handling for controller_connected/disconnected events in viewer
- Fix ball centering in controller preview - ball now properly centers when preview initializes
- Improve preview initialization with better canvas sizing and ball positioning logic
- Add viewer_connected event notification to server for better session tracking

🔧 Issues resolved:
- Вьювер теперь корректно отображает статус контроллера вместо 'ожидание контроллера'
- Мяч на превью контроллера теперь центрируется правильно при инициализации

🤖 Generated with [Claude Code Assistant](https://claude.ai/code-assistant)
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию

### Предыдущие Версии:
- **v2.89.0** - Предыдущая версия

### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок

### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии

---
*Автоматически сгенерировано: 2025-10-19T15:47:50.772Z*
