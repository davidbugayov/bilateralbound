# BilateralBound - Система Версионирования

## Текущая Версия: v2.89.0
**Статус:** Активна
**Дата релиза:** 19 октября 2025 г. в 18:27
**Коммит:** d3cca02

### Основные Изменения v2.89.0:
- ✨ fix: optimize Yandex.Metrika counter for better detection

- Add optimized metrika-optimized.js with early loading and retry logic
- Replace standard counters on all HTML pages (index, viewer, controller)
- Add comprehensive test page for metrika validation
- Implement MetrikaManager API for better control and debugging
- Add fallback mechanisms and detailed logging
- Fix detection issues with standard implementation

🤖 Generated with [Claude Code Assistant](https://claude.ai/code-assistant)
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию

### Предыдущие Версии:
- **v2.88.1** - Предыдущая версия

### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок

### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии

---
*Автоматически сгенерировано: 2025-10-19T15:27:30.034Z*
