# 🔍 ДИАГНОСТИКА СЕРВЕРА ЗАВЕРШЕНА

## Дата: 22 января 2026

### Сервер: 213.139.229.44

---

## 📊 ГЛАВНЫЙ РЕЗУЛЬТАТ

| Окружение | Папка | Git ветка | Статус |
|-----------|-------|-----------|--------|
| ✅ DEV | `/var/www/dev` | `stable-enhanced` | **РАБОТАЕТ** |
| ✅ PROD (.online) | `/var/www/emdrbilateral.online` | `stable` | **РАБОТАЕТ** |
| ❌ PROD (.ru) | `/var/www/emdrbilateral.ru` | `stable` | **ОТСУТСТВУЕТ!** |

---

## 🔴 ПРОБЛЕМА

**На сервере отсутствует папка `/var/www/emdrbilateral.ru`** для PROD сайта https://emdrbilateral.ru

---

## ✅ РЕШЕНИЕ (выберите один вариант)

### Вариант 1: Автоматический скрипт (рекомендуется)

```bash
bash scripts/create-emdrbilateral-ru.sh
```

### Вариант 2: Одна команда

```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 << 'EOF'
cp -r /var/www/emdrbilateral.online /var/www/emdrbilateral.ru && \
cd /var/www/emdrbilateral.ru && \
git fetch origin && \
git reset --hard origin/stable && \
npm ci --production --legacy-peer-deps && \
pm2 start packages/server-core/server/index.js --name bilateralbound-prod-ru && \
pm2 save && \
echo "✅ ГОТОВО!"
EOF
```

---

## 📋 ПОСЛЕ ИСПРАВЛЕНИЯ

Проверьте что все работает:

```bash
# Проверить папку
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'ls -la /var/www/ | grep emdrbilateral'

# Проверить процессы
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'pm2 list'

# Проверить доступность
curl -I https://emdrbilateral.ru
# Должна вернуть 200 (вместо 502)
```

---

## 📚 ДОКУМЕНТЫ

Подробная информация в:

- **SERVER_STRUCTURE_REPORT.md** - полный анализ
- **SERVER_CHECKLIST.md** - чек-лист проверки
- **DEPLOYMENT_GUIDE.md** - руководство по развертыванию

---

## ⏱️ Время на исправление: ~5-15 минут
