# BilateralBound - Система Версионирования
## Текущая Версия: v2.32.0
**Статус:** Активна
**Дата релиза:** 11 ноября 2025 г. в 11:57
**Коммит:** 6404108
### Основные Изменения v2.32.0:
- ✨ Refactor: Replace for loops with for-of loops for better code readability

- Updated for loops to for-of loops in:
  - packages/web-client/public/index.html
  - packages/web-client/public/components/shared-head.html
  - packages/web-client/public/emdr-therapy/index.html

This improves code readability and resolves SonarQube issue
about using for-of loops for simple iterations.
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию
### Предыдущие Версии:
- **v2.31.0** - Предыдущая версия
### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок
### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии
---
*Автоматически сгенерировано: 2025-11-11T08:57:51.653Z*
