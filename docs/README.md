# 📚 Документация проекта Bilateral Bound

## 🗂️ Структура документации

### 📖 Основная документация
- [README.md](../README.md) - Главная страница проекта
- [NPM_COMMANDS.md](NPM_COMMANDS.md) - NPM команды и скрипты разработки

### 🔐 VPN и серверная инфраструктура

#### Быстрый старт (для Beget VPS)
- **[BEGET_QUICK_START.md](BEGET_QUICK_START.md)** ⚡ - Краткая инструкция для быстрого запуска VPN на Beget
- **[BEGET_LOGIN_GUIDE.md](BEGET_LOGIN_GUIDE.md)** 🔑 - Где найти логин и пароль для входа в Beget VPS

#### Детальная документация
- **[BEGET_VPN_SETUP.md](BEGET_VPN_SETUP.md)** 📖 - Полное руководство по настройке StrongSwan VPN на Beget VPS

---

## 🚀 С чего начать?

### Для разработчиков приложения
1. Прочитайте [README.md](../README.md) - основную документацию проекта
2. Изучите [NPM_COMMANDS.md](NPM_COMMANDS.md) - команды для разработки

### Для администраторов VPN
1. **Не знаете где взять логин?** → [BEGET_LOGIN_GUIDE.md](BEGET_LOGIN_GUIDE.md) 🔑
2. **Срочная проблема с VPN?** → [BEGET_QUICK_START.md](BEGET_QUICK_START.md) ⚡
3. **Настройка с нуля?** → [BEGET_VPN_SETUP.md](BEGET_VPN_SETUP.md) 📖
4. **Автоматизация?** → Используйте [scripts/beget-vpn-auto-setup.sh](../scripts/beget-vpn-auto-setup.sh)

---

## 📋 Краткая справка

### VPN Пользователи
| Пользователь | Пароль | Назначение |
|---|---|---|
| Swetlana | qs819GCAur | Светлана |
| Sergey | 6jEA5K8m1b | Сергей |
| Yulia | LmbPhkGd4q | Юлия |
| David | c4RrhQu7xi | David (телефон) |
| DavidMac1 | EmjXM4cttx | David (Mac 1) |
| DavidMac2 | o3GCWWeq7r | David (Mac 2) |
| Elena | EF8oHBnYBz | Елена |
| DavidDeck | c2KxINLtB5 | David (Desktop) |
| Bogdan | DKCFQHsgkP | Богдан |

### Серверная информация
- **IP:** 213.139.229.44
- **SSH Root:** 9Ddc0BYKqrJZm6a9
- **Панель Beget:** https://cp.beget.com
- **Сайты:**
  - https://dev.emdrbilateral.online/
  - https://emdrbilateral.online/
  - https://emdrbilateral.ru/

---

## 🆘 Быстрые решения

### SSH не работает
```bash
# Через консоль Beget: https://cp.beget.com → VPS → Консоль
fail2ban-client unban --all
systemctl restart sshd
```

### VPN не подключается
```bash
ssh root@213.139.229.44
systemctl restart strongswan-starter
journalctl -u strongswan-starter -n 50
```

### Проверка статуса VPN
```bash
ssh root@213.139.229.44 "ipsec status"
```

---

**Обновлено:** 16 января 2026  
**Версия:** 1.0
