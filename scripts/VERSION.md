# BilateralBound - Система Версионирования
## Текущая Версия: v2.28.0
**Статус:** Активна
**Дата релиза:** 10 ноября 2025 г. в 15:56
**Коммит:** 3770606
### Основные Изменения v2.28.0:
- ✨ fix: resolve resetSession function and improve code quality

- Implement resetSession() function for session reset functionality
- Replace Math.sqrt() with Math.hypot() for better numerical stability in diagonal calculations
- Fix notification system API call to use proper options object
- Resolve unresolved variable references (previewRenderer, fullscreenPreviewRenderer)
- Fix linting issues with nested if-else structures
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию
### Предыдущие Версии:
- **v2.27.0** - Предыдущая версия
### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок
### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии
---
*Автоматически сгенерировано: 2025-11-10T12:56:49.627Z*
