# BilateralBound - Система Версионирования
## Текущая Версия: v2.7.0
**Статус:** Активна
**Дата релиза:** 5 ноября 2025 г. в 16:16
**Коммит:** ac29bda
### Основные Изменения v2.7.0:
- ✨ feat: implement dynamic version injection from package.json

- Add server-side version injection for index.html footer
- Modify Express app to read version from package.json and replace hardcoded version
- Restructure static middleware to prevent conflicts with dynamic serving
- Ensure version in footer always matches package.json version automatically
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию
### Предыдущие Версии:
- **v2.6.0** - Предыдущая версия
### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок
### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии
---
*Автоматически сгенерировано: 2025-11-05T13:16:40.268Z*
