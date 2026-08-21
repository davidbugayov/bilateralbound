---
name: deploy-bilateral
description: Deploy bilateral_bound to dev or prod, check service status, view logs
---

# Deploy bilateral_bound

## Команды деплоя

```bash
# Dev (dev.emdrbilateral.online)
npm run deploy:dev

# Prod (emdrbilateral.online + emdrbilateral.ru)
npm run deploy:prod

# Статус
npm run deploy:dev:status
npm run deploy:prod:status

# Логи
npm run deploy:dev:logs
npm run deploy:prod:logs
```

## Процесс

### 1. Перед деплоем

```bash
npm run lint        # 0 ошибок
npm run test:local  # E2E на localhost
npm run build 2>/dev/null || npm start &  # убедиться что билд проходит
```

### 2. Ветки

- `main` → dev деплой
- `stable` → prod деплой

### 3. Если деплой завис

```bash
ssh root@144.31.68.9 'systemctl status emdrbilateral-online.service'
ssh root@144.31.68.9 'systemctl restart emdrbilateral-online.service'
ssh root@144.31.68.9 'systemctl restart emdrbilateral-ru.service'
```

### 4. После деплоя — проверка

```bash
npm test              # E2E против dev.emdrbilateral.online
curl -s https://emdrbilateral.online/health | head -5
```

## SSH доступ

SSH key: `~/.ssh/id_rsa_emdr`. Пароль не требуется.
