# BilateralBound - Система Версионирования

## Текущая Версия: v2.91.0
**Статус:** Активна
**Дата релиза:** 19 октября 2025 г. в 18:53
**Коммит:** 86fff8c

### Основные Изменения v2.91.0:
- ✨ fix: add proper controller_connected event handling in WebSocket server

- Add controller_connected event handler to broadcast controller connection to all viewers
- Add viewer_connected event handler for better session tracking
- Fix duplicate message handler issue in WebSocket server
- Ensure proper event broadcasting when controller connects/disconnects

🔧 This resolves the issue where viewer shows 'waiting for controller' even when controller is connected

🤖 Generated with [Claude Code Assistant](https://claude.ai/code-assistant)
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию

### Предыдущие Версии:
- **v2.90.0** - Предыдущая версия

### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок

### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии

---
*Автоматически сгенерировано: 2025-10-19T15:53:37.772Z*
