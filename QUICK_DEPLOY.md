# 🚀 Быстрая шпаргалка для развертывания

## Одна команда для развертывания stable-enhanced на dev

```bash
bash scripts/deploy-stable-enhanced.sh deploy
```

## Проверка статуса

```bash
bash scripts/deploy-stable-enhanced.sh status
```

## Просмотр логов

```bash
bash scripts/deploy-stable-enhanced.sh logs
```

## Информация о версии

```bash
bash scripts/deploy-stable-enhanced.sh version
```

---

## Альтернативные команды

### Быстрое развертывание (menu)
```bash
bash scripts/deploy-quick.sh
# Или напрямую:
bash scripts/deploy-quick.sh dev
```

### Полное развертывание инфраструктуры
```bash
bash scripts/deploy_full_infrastructure.sh
```

---

## Прямые SSH команды

### Проверить статус сервиса
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl status bilateralbound-dev'
```

### Перезапустить сервис
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'systemctl restart bilateralbound-dev'
```

### Просмотреть последние логи
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'journalctl -u bilateralbound-dev -n 50'
```

### Смотреть логи в реальном времени
```bash
sshpass -p 'tOx8q7HN+' ssh root@213.139.229.44 'journalctl -u bilateralbound-dev -f'
```

---

## URL приложения

- **Главная**: https://dev.emdrbilateral.online
- **Controller**: https://dev.emdrbilateral.online/session-controller.html
- **Viewer**: https://dev.emdrbilateral.online/viewer.html

---

## Текущее состояние

- **Ветка**: stable-enhanced
- **Версия**: 2.38.20-f9cf533
- **Сервер**: 213.139.229.44
- **Путь**: /var/www/dev
- **Статус**: ✅ РАБОТАЕТ
