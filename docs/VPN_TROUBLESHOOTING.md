# VPN StrongSwan - Диагностика и Решение Проблем

## Серверные Данные
- **IP**: 213.139.229.44
- **Провайдер**: Beget VPS
- **Домены**: emdrbilateral.online, emdrbilateral.ru, dev.emdrbilateral.online

## Проблема: Connection Reset при SSH подключении

### Причина
IP адрес заблокирован на уровне firewall/fail2ban на сервере.

### Решение через Beget Панель

1. **Войти в панель Beget** → https://cp.beget.com/
2. **VPS/VDS** → Выбрать ваш сервер
3. **Консоль** → Открыть веб-консоль (VNC)
4. **Авторизоваться**: root / 9Ddc0BYKqrJZm6a9

### Команды для выполнения в консоли Beget:

```bash
# 1. Проверить IP адрес блокировки
iptables -L -n -v | grep DROP

# 2. Разблокировать все IP в fail2ban
fail2ban-client unban --all

# 3. Очистить все правила iptables (ОСТОРОЖНО!)
iptables -F
iptables -X
iptables -P INPUT ACCEPT
iptables -P FORWARD ACCEPT
iptables -P OUTPUT ACCEPT

# 4. Сохранить правила
iptables-save > /etc/iptables/rules.v4

# 5. Узнать ваш текущий IP
curl -4 ifconfig.me

# 6. Добавить ваш IP в whitelist fail2ban
cat >> /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 ВАШ_IP_АДРЕС
EOF

# 7. Перезапустить fail2ban
systemctl restart fail2ban

# 8. Проверить StrongSwan
systemctl status strongswan-starter
systemctl status ipsec

# 9. Проверить порт UDP 500 и 4500
ss -ulnp | grep -E ':(500|4500)'

# 10. Перезапустить VPN если не работает
systemctl restart strongswan-starter
systemctl restart ipsec
```

## Разрешенные VPN пользователи

| Пользователь | Пароль     | Статус |
|--------------|------------|--------|
| Swetlana     | qs819GCAur | ✓      |
| Sergey       | 6jEA5K8m1b | ✓      |
| Yulia        | LmbPhkGd4q | ✓      |
| David        | c4RrhQu7xi | ✓      |
| DavidMac1    | EmjXM4cttx | ✓      |
| DavidMac2    | o3GCWWeq7r | ✓      |
| Elena        | EF8oHBnYBz | ✓      |
| DavidDeck    | c2KxINLtB5 | ✓      |
| Bogdan       | DKCFQHsgkP | ✓      |

## Диагностика VPN после разблокировки

```bash
# Проверить конфигурацию
cat /etc/ipsec.conf
cat /etc/ipsec.secrets

# Логи VPN
journalctl -u strongswan-starter -n 100 --no-pager
journalctl -u ipsec -n 100 --no-pager

# Активные VPN соединения
ipsec statusall

# Firewall правила для VPN
iptables -L -n -v | grep -E '(500|4500)'
```

## Типичные ошибки

### 1. "peer not responding" 
- **Причина**: UDP порты 500/4500 заблокированы firewall
- **Решение**: Открыть порты в iptables

### 2. "Connection reset"
- **Причина**: IP заблокирован fail2ban или iptables
- **Решение**: Разблокировать через веб-консоль Beget

### 3. Слишком много активных соединений
- **Причина**: Старые сессии не закрыты
- **Решение**: `ipsec restart`

## Настройка Firewall для VPN

```bash
# Разрешить VPN трафик
iptables -A INPUT -p udp --dport 500 -j ACCEPT
iptables -A INPUT -p udp --dport 4500 -j ACCEPT
iptables -A INPUT -p esp -j ACCEPT

# Разрешить forwarding для VPN
iptables -A FORWARD -m policy --dir in --pol ipsec -j ACCEPT
iptables -A FORWARD -m policy --dir out --pol ipsec -j ACCEPT

# Сохранить
iptables-save > /etc/iptables/rules.v4
```
