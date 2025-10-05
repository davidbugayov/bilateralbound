#!/bin/bash

# Быстрая настройка VPN на сервере
SERVER="213.139.229.44"
USER="root"
PASSWORD='t!Vt3bNWtkaq'

echo "🔒 НАСТРОЙКА VPN НА СЕРВЕРЕ"
echo "=========================="

# Функция для выполнения команды
run_command() {
    echo ""
    echo "📋 $2"
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "$1"
}

echo "ШАГ 1: Установка StrongSwan"
run_command "apt update && apt install -y strongswan strongswan-pki libcharon-extra-plugins libcharon-extauth-plugins libstrongswan-extra-plugins" "Установка пакетов"

echo ""
echo "ШАГ 2: Создание сертификатов"
run_command "mkdir -p ~/pki/{cacerts,certs,private} && chmod 700 ~/pki" "Создание директорий"

run_command "cd ~/pki && ipsec pki --gen --type rsa --size 4096 --outform pem > private/ca-key.pem" "Генерация CA ключа"

run_command "cd ~/pki && ipsec pki --self --ca --lifetime 3650 --in private/ca-key.pem --type rsa --dn 'CN=VPN root CA' --outform pem > cacerts/ca-cert.pem" "Создание CA сертификата"

run_command "cd ~/pki && ipsec pki --gen --type rsa --size 4096 --outform pem > private/server-key.pem" "Генерация серверного ключа"

run_command "cd ~/pki && ipsec pki --pub --in private/server-key.pem --type rsa | ipsec pki --issue --lifetime 1825 --cacert cacerts/ca-cert.pem --cakey private/ca-key.pem --dn 'CN=vpn.emdrbilateral.online' --san vpn.emdrbilateral.online --san 213.139.229.44 --flag serverAuth --flag ikeIntermediate --outform pem > certs/server-cert.pem" "Создание серверного сертификата"

run_command "cp -r ~/pki/* /etc/ipsec.d/" "Копирование сертификатов"

echo ""
echo "ШАГ 3: Настройка конфигурации"
run_command "cat > /etc/ipsec.conf << 'EOF'
config setup
    charondebug=\"ike 1, knl 1, cfg 0\"
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
    left=%any
    leftid=@vpn.emdrbilateral.online
    leftcert=server-cert.pem
    leftsendcert=always
    leftsubnet=0.0.0.0/0
    right=%any
    rightid=%any
    rightauth=eap-mschapv2
    rightsourceip=10.10.10.0/24
    rightdns=8.8.8.8,8.8.4.4
    rightsendcert=never
    ike=chacha20poly1305-prfsha256-ecp256,aes256gcm16-prfsha384-ecp384!
    esp=chacha20poly1305-ecp256,aes256gcm16-ecp384!
    eap_identity=%identity
EOF" "Создание ipsec.conf"

run_command "cat > /etc/ipsec.secrets << 'EOF'
: RSA \"server-key.pem\"
user1 : EAP \"SecurePassword123!\"
admin : EAP \"AdminPassword789!\"
EOF" "Создание пользователей"

run_command "chmod 600 /etc/ipsec.secrets" "Установка прав"

echo ""
echo "ШАГ 4: Настройка сети"
run_command "echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf && echo 'net.ipv6.conf.all.forwarding=1' >> /etc/sysctl.conf && sysctl -p" "Включение IP forwarding"

run_command "apt install -y iptables-persistent" "Установка iptables-persistent"

run_command "iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -m policy --pol ipsec --dir out -j ACCEPT && iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o eth0 -j MASQUERADE && iptables -A FORWARD -s 10.10.10.0/24 -j ACCEPT && iptables -A FORWARD -d 10.10.10.0/24 -j ACCEPT" "Настройка NAT"

run_command "netfilter-persistent save" "Сохранение правил"

echo ""
echo "ШАГ 5: Настройка Firewall"
run_command "ufw allow 500/udp && ufw allow 4500/udp" "Открытие VPN портов"

echo ""
echo "ШАГ 6: Запуск VPN"
run_command "systemctl restart strongswan-starter && systemctl enable strongswan-starter" "Запуск сервиса"

echo ""
echo "ШАГ 7: Проверка статуса"
run_command "systemctl status strongswan-starter --no-pager | head -10" "Статус сервиса"

echo ""
echo "🎉 VPN НАСТРОЕН!"
echo "==============="
echo ""
echo "Пользователи:"
echo "• user1 / SecurePassword123!"
echo "• admin / AdminPassword789!"
echo ""
echo "Сервер: vpn.emdrbilateral.online или 213.139.229.44"
