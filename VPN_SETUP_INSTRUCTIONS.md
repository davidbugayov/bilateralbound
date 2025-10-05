ны# 🔒 Инструкция по настройке VPN на VPS

## Сервер: 213.139.229.44
## Домены: vpn.emdrbilateral.online, emdrbilateral.online, emdrbilateral.ru

---

## 📋 Содержание

1. [Настройка VPN сервера](#настройка-vpn-сервера)
2. [Подключение клиентов](#подключение-клиентов)
3. [Устранение неполадок](#устранение-неполадок)

---

## 🔧 Настройка VPN сервера

### Шаг 1: Установка StrongSwan (IKEv2/IPsec VPN)

```bash
# Подключитесь к серверу
ssh root@213.139.229.44

# Обновите систему
apt update && apt upgrade -y

# Установите StrongSwan и необходимые пакеты
apt install -y strongswan strongswan-pki libcharon-extra-plugins libcharon-extauth-plugins libstrongswan-extra-plugins

# Установите утилиты для сертификатов
apt install -y certbot
```

### Шаг 2: Создание сертификатов

```bash
# Создайте директорию для сертификатов
mkdir -p ~/pki/{cacerts,certs,private}
chmod 700 ~/pki

# Создайте корневой сертификат CA
cd ~/pki
ipsec pki --gen --type rsa --size 4096 --outform pem > private/ca-key.pem
ipsec pki --self --ca --lifetime 3650 --in private/ca-key.pem \
    --type rsa --dn "CN=VPN root CA" --outform pem > cacerts/ca-cert.pem

# Создайте сертификат для сервера
ipsec pki --gen --type rsa --size 4096 --outform pem > private/server-key.pem
ipsec pki --pub --in private/server-key.pem --type rsa | \
    ipsec pki --issue --lifetime 1825 \
        --cacert cacerts/ca-cert.pem \
        --cakey private/ca-key.pem \
        --dn "CN=vpn.emdrbilateral.online" \
        --san vpn.emdrbilateral.online \
        --san 213.139.229.44 \
        --flag serverAuth --flag ikeIntermediate --outform pem \
    > certs/server-cert.pem

# Скопируйте сертификаты в системную директорию
cp -r ~/pki/* /etc/ipsec.d/
```

### Шаг 3: Конфигурация StrongSwan

Создайте файл `/etc/ipsec.conf`:

```bash
cat > /etc/ipsec.conf << 'EOF'
config setup
    charondebug="ike 1, knl 1, cfg 0"
    uniqueids=no

conn ikev2-vpn
    auto=add
    compress=no
    type=tunnel
    keyexchange=ikev2
    fragmentation=yes
    forceencaps=yes
    dpdaction=clear
    dpddelay=300s
    rekey=no
    
    # Левая сторона (сервер)
    left=%any
    leftid=@vpn.emdrbilateral.online
    leftcert=server-cert.pem
    leftsendcert=always
    leftsubnet=0.0.0.0/0
    
    # Правая сторона (клиент)
    right=%any
    rightid=%any
    rightauth=eap-mschapv2
    rightsourceip=10.10.10.0/24
    rightdns=8.8.8.8,8.8.4.4
    rightsendcert=never
    
    # Шифрование
    ike=chacha20poly1305-prfsha256-ecp256,aes256gcm16-prfsha384-ecp384!
    esp=chacha20poly1305-ecp256,aes256gcm16-ecp384!
    
    # EAP авторизация
    eap_identity=%identity
EOF
```

### Шаг 4: Создание пользователей

Создайте файл `/etc/ipsec.secrets`:

```bash
cat > /etc/ipsec.secrets << 'EOF'
# Сертификат сервера
: RSA "server-key.pem"

# Пользователи VPN (логин : EAP "пароль")
user1 : EAP "SecurePassword123!"
user2 : EAP "AnotherSecurePass456!"
admin : EAP "AdminPassword789!"
EOF

chmod 600 /etc/ipsec.secrets
```

### Шаг 5: Настройка сети

```bash
# Включите IP forwarding
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
sysctl -p

# Настройте NAT для VPN клиентов
apt install -y iptables-persistent

# Добавьте правила iptables
iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -m policy --pol ipsec --dir out -j ACCEPT
iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -j MASQUERADE
iptables -A FORWARD -s 10.10.10.0/24 -j ACCEPT
iptables -A FORWARD -d 10.10.10.0/24 -j ACCEPT

# Сохраните правила
netfilter-persistent save
```

### Шаг 6: Настройка Firewall

```bash
# Откройте необходимые порты
ufw allow 500/udp
ufw allow 4500/udp
ufw allow OpenSSH
ufw enable
```

### Шаг 7: Запуск VPN сервера

```bash
# Перезапустите StrongSwan
systemctl restart strongswan-starter
systemctl enable strongswan-starter

# Проверьте статус
systemctl status strongswan-starter
ipsec status
```

---

## 📱 Подключение клиентов

### Для iOS/macOS

1. **Скачайте CA сертификат:**
   ```bash
   # На сервере экспортируйте CA сертификат
   cat /etc/ipsec.d/cacerts/ca-cert.pem
   ```

2. **Создайте файл профиля `.mobileconfig`:**
   - Используйте уже существующий файл `vpn_profile.mobileconfig`
   - Или создайте новый с параметрами:
     - Сервер: `vpn.emdrbilateral.online` или `213.139.229.44`
     - Тип: IKEv2
     - Логин и пароль из `/etc/ipsec.secrets`

3. **Установка на устройство:**
   - iOS: Отправьте `.mobileconfig` по email, откройте на устройстве
   - macOS: Дважды кликните на файл `.mobileconfig`

### Для Android

1. **Установите приложение:**
   - Скачайте **strongSwan VPN Client** из Google Play
   - Или используйте файл `emdr_vpn.sswan` / `vpn_profile.sswan`

2. **Настройка подключения:**
   - Откройте приложение strongSwan
   - Нажмите "+" для добавления профиля
   - Параметры:
     - **Gateway:** `vpn.emdrbilateral.online` или `213.139.229.44`
     - **Type:** IKEv2 EAP (Username/Password)
     - **Username:** ваш логин из `/etc/ipsec.secrets`
     - **Password:** ваш пароль

3. **Импорт CA сертификата:**
   - В настройках профиля выберите "Select certificate"
   - Импортируйте CA сертификат с сервера

### Для Windows

1. **Добавьте VPN подключение:**
   ```
   Настройки → Сеть и Интернет → VPN → Добавить VPN-подключение
   ```

2. **Параметры подключения:**
   - **Поставщик VPN:** Windows (встроенный)
   - **Имя подключения:** EMDR VPN
   - **Имя или адрес сервера:** `vpn.emdrbilateral.online`
   - **Тип VPN:** IKEv2
   - **Тип данных для входа:** Имя пользователя и пароль
   - **Имя пользователя:** ваш логин
   - **Пароль:** ваш пароль

3. **Импорт сертификата:**
   - Импортируйте CA сертификат в "Доверенные корневые центры сертификации"

### Для Linux

1. **Установите NetworkManager и плагин StrongSwan:**
   ```bash
   sudo apt install network-manager-strongswan
   ```

2. **Настройка через GUI:**
   - Откройте NetworkManager
   - Добавьте VPN → IPsec/IKEv2 (strongswan)
   - Gateway: `vpn.emdrbilateral.online`
   - Authentication: EAP
   - Username/Password: ваши учетные данные

---

## 🔍 Проверка работы VPN

### На сервере:

```bash
# Проверить статус
systemctl status strongswan-starter

# Посмотреть активные подключения
ipsec status

# Логи
journalctl -u strongswan-starter -f

# Проверить правила iptables
iptables -t nat -L -n -v
```

### На клиенте:

После подключения:
```bash
# Проверить IP адрес (должен быть IP сервера)
curl ifconfig.me

# Проверить доступность сайтов
ping google.com
```

---

## 🛠️ Устранение неполадок

### Проблема: Не удается подключиться

**Решение:**
```bash
# Проверьте firewall
ufw status

# Проверьте порты
netstat -tulpn | grep -E '500|4500'

# Перезапустите сервис
systemctl restart strongswan-starter
```

### Проблема: Подключение установлено, но нет интернета

**Решение:**
```bash
# Проверьте IP forwarding
sysctl net.ipv4.ip_forward

# Проверьте правила NAT
iptables -t nat -L POSTROUTING -n -v

# Переприменить правила
iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -j MASQUERADE
```

### Проблема: Ошибка сертификата

**Решение:**
```bash
# Проверьте сертификаты
ipsec listcerts

# Пересоздайте сертификаты
cd ~/pki
# Повторите шаги из "Шаг 2: Создание сертификатов"
```

---

## 📊 Мониторинг

### Просмотр подключенных клиентов:

```bash
ipsec statusall
```

### Логи в реальном времени:

```bash
journalctl -u strongswan-starter -f
```

### Статистика трафика:

```bash
iptables -t nat -L -n -v | grep 10.10.10
```

---

## 🔐 Безопасность

### Рекомендации:

1. **Регулярно обновляйте пароли** в `/etc/ipsec.secrets`
2. **Используйте сильные пароли** (минимум 12 символов)
3. **Ограничьте доступ к серверу** через firewall
4. **Мониторьте логи** на предмет подозрительной активности
5. **Регулярно обновляйте систему:**
   ```bash
   apt update && apt upgrade -y
   ```

### Добавление нового пользователя:

```bash
# Отредактируйте файл secrets
nano /etc/ipsec.secrets

# Добавьте строку:
# newuser : EAP "NewSecurePassword!"

# Перезапустите сервис
systemctl restart strongswan-starter
```

---

## 📞 Поддержка

- **Веб-интерфейс статуса:** https://vpn.emdrbilateral.online
- **Основной сайт:** https://emdrbilateral.online
- **Сервер:** 213.139.229.44

---

## ✅ Быстрая настройка (краткая версия)

```bash
# 1. Установка
apt update && apt install -y strongswan strongswan-pki

# 2. Создание сертификатов
mkdir -p ~/pki && cd ~/pki
ipsec pki --gen --type rsa --size 4096 > private/ca-key.pem
ipsec pki --self --ca --lifetime 3650 --in private/ca-key.pem \
  --dn "CN=VPN CA" > cacerts/ca-cert.pem

# 3. Копирование конфигов (используйте файлы из проекта)
# или создайте вручную по инструкции выше

# 4. Запуск
systemctl restart strongswan-starter
ipsec status
```

---

**Дата создания:** 05.10.2025  
**Версия:** 1.0
