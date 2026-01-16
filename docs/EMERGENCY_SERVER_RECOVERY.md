# 🚨 Экстренное Восстановление Сервера Beget

**Дата**: 16 января 2026  
**IP**: 213.139.229.44  
**Проблема**: Сервер не отвечает по сети после перезагрузки

---

## ⚡ Немедленные действия

### 1. Войти через VNC консоль Beget
- URL: https://cp.beget.com/
- VPS/VDS → Выбрать сервер → **Консоль (VNC)**
- Логин: `root`
- Пароль: `9Ddc0BYKqrJZm6a9`

---

## 🔧 Шаг 1: Проверить состояние системы

```bash
# Проверить, загрузилась ли система
uptime

# Проверить сетевые интерфейсы
ip addr show

# Проверить процессы
ps aux | head -20

# Проверить свободное место
df -h

# Проверить память
free -h
```

---

## 🌐 Шаг 2: Восстановить сеть

```bash
# Узнать имя сетевого интерфейса
ip link show

# Поднять интерфейс (замените eth0 на ваш)
ip link set eth0 up
# или
ip link set ens3 up

# Проверить маршрутизацию
ip route show

# Если маршрута нет, добавить (уточните gateway у Beget)
ip route add default via 213.139.229.1

# Проверить DNS
cat /etc/resolv.conf

# Пинг Google
ping -c 3 8.8.8.8

# Пинг по DNS
ping -c 3 google.com
```

---

## 🔓 Шаг 3: Отключить Firewall

```bash
# Остановить все firewall сервисы
systemctl stop iptables 2>/dev/null
systemctl stop firewalld 2>/dev/null
systemctl stop ufw 2>/dev/null

# Очистить все правила iptables
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

# Разрешить весь трафик
iptables -P INPUT ACCEPT
iptables -P FORWARD ACCEPT
iptables -P OUTPUT ACCEPT

# Проверить правила
iptables -L -n -v
```

---

## 🔑 Шаг 4: Восстановить SSH

```bash
# Проверить статус SSH
systemctl status sshd

# Если не запущен, запустить
systemctl start sshd

# Если ошибка, посмотреть логи
journalctl -u sshd -n 100 --no-pager

# Проверить конфигурацию SSH
sshd -t

# Проверить порт 22
ss -tlnp | grep :22
netstat -tlnp | grep :22

# Перезапустить SSH
systemctl restart sshd
```

---

## 🧪 Шаг 5: Проверить доступность извне

```bash
# Получить ваш IP адрес сервера
ip addr show | grep 213.139.229.44

# Проверить что сервер слушает на всех интерфейсах
ss -tlnp

# Проверить fail2ban
fail2ban-client status
fail2ban-client unban --all

# Разблокировать все IP
iptables -D INPUT -j DROP 2>/dev/null
```

---

## 📋 Шаг 6: Диагностика если SSH не запускается

```bash
# Проверить конфигурацию SSH
cat /etc/ssh/sshd_config | grep -v "^#" | grep -v "^$"

# Проверить права на файлы
ls -la /etc/ssh/
ls -la /root/.ssh/

# Переустановить SSH если нужно
apt update && apt reinstall openssh-server
# или
yum reinstall openssh-server

# Проверить SELinux (если CentOS/RHEL)
getenforce
setenforce 0  # временно отключить
```

---

## ✅ Шаг 7: Попытка подключения

После выполнения всех шагов, попробуйте с вашего Mac:

```bash
ssh -v -o StrictHostKeyChecking=no root@213.139.229.44
```

---

## 🔄 Если ничего не помогает

### Вариант A: Перезагрузка в Safe Mode
1. В панели Beget VPS → Управление → Перезагрузка
2. Выбрать "Safe Mode" или "Rescue Mode"

### Вариант B: Восстановление из бэкапа
1. Панель Beget → VPS → Бэкапы
2. Выбрать последний рабочий бэкап
3. Восстановить

### Вариант C: Обращение в техподдержку Beget
- Email: support@beget.com
- Телефон: +7 (495) 755-85-85
- Онлайн-чат: https://beget.com/ru/support

---

## 📝 Важные данные для техподдержки

- **IP сервера**: 213.139.229.44
- **Проблема**: Сервер не отвечает по сети после перезагрузки
- **Время перезагрузки**: [укажите время]
- **Симптомы**: 
  - Порт 22 (SSH) недоступен
  - Ping не проходит
  - HTTP/HTTPS не отвечают
  - VPN (UDP 500/4500) недоступны

---

## 🔐 Учетные данные

### SSH
- User: `root`
- Password: `9Ddc0BYKqrJZm6a9`
- IP: `213.139.229.44`

### Домены
- emdrbilateral.online
- emdrbilateral.ru
- dev.emdrbilateral.online

### VPN Пользователи
См. файл `VPN_TROUBLESHOOTING.md`

---

## 🎯 После восстановления доступа

```bash
# Настроить firewall правильно
apt install ufw -y

# Базовые правила
ufw default deny incoming
ufw default allow outgoing

# Разрешить SSH
ufw allow 22/tcp

# Разрешить HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Разрешить VPN (StrongSwan)
ufw allow 500/udp
ufw allow 4500/udp
ufw allow esp

# Включить firewall
ufw enable

# Добавить ваш IP в whitelist fail2ban
echo "[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 $(curl -4 ifconfig.me)" >> /etc/fail2ban/jail.local

systemctl restart fail2ban
```

---

**Удачи! После выполнения команд в VNC консоли дайте знать результат.**
