# BilateralBound - Система Версионирования

## Текущая Версия: v2.63.0
**Статус:** Активна
**Дата релиза:** 12 октября 2025 г. в 19:56
**Коммит:** 7840b1d

### Основные Изменения v2.63.0:
- ✨ 🔧 Update deployment commands and fix nginx config

- Updated deploy:dev and deploy:prod commands with proper branch checkout
- Fixed nginx config for dev environment (port 3004)
- Added npm install with --legacy-peer-deps flag
- Improved webhook server signature verification
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию

### Предыдущие Версии:
- **v2.62.0** - Предыдущая версия

### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок

### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии

---
*Автоматически сгенерировано: 2025-10-12T16:56:53.601Z*
