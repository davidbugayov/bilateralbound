# BilateralBound - Система Версионирования
## Текущая Версия: v3.3.0
**Статус:** Активна
**Дата релиза:** 22 октября 2025 г. в 16:42
**Коммит:** e51e2a0
### Основные Изменения v3.3.0:
- ✨ Refactor: Reduce cognitive complexity in controller.js

- Split detectAndCountBounceFromServer: extract _hasBounced helper
- Refactor togglePlayPause: separate _handlePlay and _handlePause methods
- Refactor initializeComponents: split into focused helper functions
- Refactor getScaledState: extract _normalizeCoordinate utility
- Fix syntax errors and duplicated deleteSessionById in new-features.js
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию
### Предыдущие Версии:
- **v3.2.2** - Предыдущая версия
### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок
### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии
---
*Автоматически сгенерировано: 2025-10-22T13:42:15.566Z*
