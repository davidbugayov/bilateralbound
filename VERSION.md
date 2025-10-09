# BilateralBound - Система Версионирования

## Текущая Версия: v2.41.0
**Статус:** Активна
**Дата релиза:** 9 октября 2025 г. в 16:08
**Коммит:** 8f83299

### Основные Изменения v2.41.0:
- ✨ fix(deploy): force recreate systemd service on deploy

Force recreates the systemd service file on each deployment to ensure the correct port is always applied. This resolves an issue where port changes in the deploy script were not being reflected in the running service.
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию

### Предыдущие Версии:
- **v2.40.0** - Предыдущая версия

### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок

### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии

---
*Автоматически сгенерировано: 2025-10-09T13:08:55.061Z*
