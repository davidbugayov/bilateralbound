# BilateralBound - Система Версионирования

## Текущая Версия: v2.41.1
**Статус:** Активна
**Дата релиза:** 9 октября 2025 г. в 16:18
**Коммит:** 045e058

### Основные Изменения v2.41.1:
- ✨ refactor(physics): remove unused startMovement and stopMovement methods

Removed the startMovement and stopMovement methods from the PhysicsEngine class as they are no longer used anywhere in the codebase. This cleanup simplifies the API and removes dead code.
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию

### Предыдущие Версии:
- **v2.41.0** - Предыдущая версия

### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок

### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии

---
*Автоматически сгенерировано: 2025-10-09T13:18:35.637Z*
