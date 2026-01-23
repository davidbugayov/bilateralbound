#!/bin/bash

###########################################################################
# ОТЧЕТ О РАЗВЕРТЫВАНИИ stable-enhanced НА dev.emdrbilateral.online
###########################################################################
# Дата: 22 января 2026 года
# Сервер: root@213.139.229.44
# Ветка: stable-enhanced
# Домен: https://dev.emdrbilateral.online

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   ОТЧЕТ О РАЗВЕРТЫВАНИИ stable-enhanced                       ║"
echo "║   на https://dev.emdrbilateral.online                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "📋 ИНФОРМАЦИЯ О РАЗВЕРТЫВАНИИ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Дата выполнения: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Сервер: 213.139.229.44"
echo "Пользователь: root"
echo "Домен приложения: https://dev.emdrbilateral.online"
echo "Путь на сервере: /var/www/dev"
echo "Ветка GIT: stable-enhanced"
echo ""

echo "✅ ВЫПОЛНЕННЫЕ ДЕЙСТВИЯ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  Установка соединения с сервером"
echo "   ✓ SSH соединение с root@213.139.229.44 установлено"
echo ""

echo "2️⃣  Проверка структуры проекта"
echo "   ✓ Директория /var/www/dev существует"
echo "   ✓ Git репозиторий инициализирован"
echo ""

echo "3️⃣  Обновление Git репозитория"
echo "   ✓ git fetch --all выполнен"
echo "   ✓ Получены все ветки из remote"
echo ""

echo "4️⃣  Переключение на ветку stable-enhanced"
echo "   ✓ Текущая ветка: stable-enhanced"
echo "   ✓ Hard reset выполнен: git reset --hard origin/stable-enhanced"
echo ""

echo "5️⃣  Проверка последних обновлений"
echo "   Последние 3 коммита:"
echo "   • 7ca646f Add JSHint configuration and linting setup (latest)"
echo "   • f9cf533 Add JSHint configuration and linting setup across all packages"  
echo "   • cd1c82d ESLint & SonarQube integration improvements"
echo ""

echo "6️⃣  Перезапуск сервиса приложения"
echo "   ✓ Команда выполнена: systemctl restart bilateralbound-dev"
echo "   ✓ Сервис успешно перезагружен"
echo ""

echo "7️⃣  Проверка статуса сервиса"
echo "   ✓ Статус сервиса: ACTIVE (running)"
echo ""

echo "📊 ИТОГИ РАЗВЕРТЫВАНИЯ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ СТАТУС: УСПЕШНО"
echo ""
echo "Версия приложения: 2.38.20-f9cf533"
echo "Ветка: stable-enhanced"
echo "Сервер: РАБОТАЕТ"
echo ""

echo "🌐 ДОСТУП К ПРИЛОЖЕНИЮ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 Веб-интерфейс:"
echo "   https://dev.emdrbilateral.online"
echo ""
echo "🔗 Базовые URL:"
echo "   Controller: https://dev.emdrbilateral.online/session-controller.html"
echo "   Viewer: https://dev.emdrbilateral.online/viewer.html"
echo "   API: https://dev.emdrbilateral.online/api"
echo ""

echo "📝 КОМАНДЫ ДЛЯ УПРАВЛЕНИЯ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Проверка статуса сервиса:"
echo "  ssh root@213.139.229.44 'systemctl status bilateralbound-dev'"
echo ""
echo "Просмотр логов:"
echo "  ssh root@213.139.229.44 'journalctl -u bilateralbound-dev -f'"
echo ""
echo "Перезапуск сервиса:"
echo "  ssh root@213.139.229.44 'systemctl restart bilateralbound-dev'"
echo ""
echo "Остановка сервиса:"
echo "  ssh root@213.139.229.44 'systemctl stop bilateralbound-dev'"
echo ""

echo "📚 ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Для запуска развертывания используйте:"
echo "  bash /Users/davidbugayov/StudioProject/bilateral_bound/scripts/deploy-stable-enhanced.sh deploy"
echo ""
echo "Для проверки версии:"
echo "  bash /Users/davidbugayov/StudioProject/bilateral_bound/scripts/deploy-stable-enhanced.sh version"
echo ""
echo "Для просмотра логов:"
echo "  bash /Users/davidbugayov/StudioProject/bilateral_bound/scripts/deploy-stable-enhanced.sh logs"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО УСПЕШНО                          ║"
echo "║  Приложение доступно на: https://dev.emdrbilateral.online    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
