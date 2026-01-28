# 🚨 КРИТИЧЕСКАЯ ПРОБЛЕМА: Сервер dev.emdrbilateral.online не отвечает

## 📊 Статус (28 января 2026, ~13:40 UTC)

- **Server IP**: 213.139.229.44
- **Service**: emdrbilateral-dev
- **Status**: ❌ FROZEN / NOT RESPONDING
- **Ping**: ❌ No response
- **SSH**: ❌ Connection timeout
- **HTTP**: ❌ No response

## 🔍 Диагностика

### Что произошло:
1. ✅ Git pull был успешен (код обновлен)
2. ✅ Nginx конфигурация обновлена
3. ❌ `npm install` на prod сервере - **ЗАВИСЛА**
4. ❌ Сервер стал неответчив

### Причины:
- npm install может требовать большой объем памяти
- Возможно недостаточно свободного диска
- Возможна ошибка зависимостей при компилировании native модулей
- Процесс node может зациклиться

## 🆘 Решение (СРОЧНО)

### Вариант 1: Перезагрузить сервер через консоль VPS (ТРЕБУЕТСЯ)

1. Зайти в консоль управления VPS (хостер)
2. Найти сервер 213.139.229.44
3. Нажать "Перезагрузить" / "Reboot"
4. Ждать 2-3 минуты

### Вариант 2: Hard reset (если есть физический доступ)
- Нажать кнопку Reset
- ИЛИ отключить/включить питание

## ⚡ После перезагрузки сервера:

### 1. Проверить статус
```bash
ssh root@213.139.229.44
systemctl status emdrbilateral-dev
ps aux | grep node
```

### 2. Если сервис не запустился:
```bash
systemctl start emdrbilateral-dev
systemctl status emdrbilateral-dev
```

### 3. Проверить логи:
```bash
journalctl -u emdrbilateral-dev -n 50 --no-pager
```

### 4. Если npm install был причиной - очистить и переустановить:
```bash
cd /var/www/dev.emdrbilateral.online
rm -rf node_modules packages/*/node_modules package-lock.json
npm install --prefer-offline --no-audit
```

### 5. Проверить портыи работающие процессы:
```bash
lsof -i :3000
lsof -i :80
lsof -i :443
ps aux | grep -E "node|npm" | grep -v grep
```

## 🔄 Полный цикл восстановления

```bash
# 1. Остановить сервис
systemctl stop emdrbilateral-dev

# 2. Очистить старые процессы
pkill -9 node
pkill -9 npm

# 3. Перейти в проект
cd /var/www/dev.emdrbilateral.online

# 4. Проверить код
git status
git log -1

# 5. Очистить модули (если нужно)
# rm -rf node_modules packages/*/node_modules

# 6. Переустановить зависимости (БЕЗ npm install в фоне!)
npm ci --prefer-offline  # или npm install

# 7. Запустить сервис
systemctl start emdrbilateral-dev

# 8. Проверить статус
systemctl status emdrbilateral-dev

# 9. Проверить логи
journalctl -u emdrbilateral-dev -n 100 --no-pager | tail -30
```

## 📋 Признаки что сервер восстановился

✅ SSH соединение работает
✅ `systemctl status emdrbilateral-dev` показывает "Active (running)"
✅ Port 3000 слушается: `lsof -i :3000`
✅ Nginx перенаправляет трафик: `curl -I https://dev.emdrbilateral.online/`
✅ SSE endpoint отвечает: `curl -N https://dev.emdrbilateral.online/api/session/test/events?role=viewer`

## 🛑 Что НЕЛЬЗЯ делать

❌ Не запускать `npm install` в interactive сессии - может зависнуть
❌ Не использовать screen/tmux без detach
❌ Не забывать про timeout при выполнении длительных операций

## 📞 Следующие шаги

1. **НЕМЕДЛЕННО**: Перезагрузить сервер через консоль хостера
2. После перезагрузки: Проверить сервис SSH и статус
3. Если сервис не запустился: Выполнить "Полный цикл восстановления"
4. Проверить SSE endpoint работает
5. Запустить E2E тесты для проверки функциональности
