# BilateralBound - Система Версионирования

## Текущая Версия: v2.91.1
**Статус:** Активна
**Дата релиза:** 19 октября 2025 г. в 18:59
**Коммит:** 51ac1cb

### Основные Изменения v2.91.1:
- ✨ fix: remove duplicate event handlers in viewer and prevent status reset

- Remove duplicate controller_connected/disconnected event handlers in viewer
- Prevent stateUpdate from resetting controller status to 'waiting for controller'
- Fix issue where ball movement resets controller status display
- Ensure controller status persists during session activity

🔧 This resolves the issue where viewer shows 'waiting for controller' when ball starts moving

🤖 Generated with [Claude Code Assistant](https://claude.ai/code-assistant)
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию

### Предыдущие Версии:
- **v2.91.0** - Предыдущая версия

### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок

### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии

---
*Автоматически сгенерировано: 2025-10-19T15:59:24.893Z*
