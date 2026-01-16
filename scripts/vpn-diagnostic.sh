#!/bin/bash
# VPN Diagnostic and Fix Script for Beget Server

set -e

SERVER="213.139.229.44"
USER="root"

echo "=== VPN Diagnostic Script ==="
echo "Server: $SERVER"
echo ""

# Check StrongSwan status
echo "1. Checking StrongSwan service..."
systemctl status strongswan-starter || systemctl status strongswan || systemctl status ipsec || echo "StrongSwan service not found"
echo ""

# Check if StrongSwan is installed
echo "2. Checking StrongSwan installation..."
which ipsec || echo "ipsec command not found"
ipsec version 2>/dev/null || echo "Cannot get ipsec version"
echo ""

# Check network configuration
echo "3. Checking network configuration..."
ip addr show
echo ""
ip route show
echo ""

# Check firewall rules
echo "4. Checking firewall rules..."
iptables -L -n -v
echo ""
iptables -t nat -L -n -v
echo ""

# Check VPN ports
echo "5. Checking VPN ports (UDP 500, 4500)..."
ss -ulnp | grep -E ':(500|4500)' || echo "VPN ports not listening"
echo ""

# Check StrongSwan configuration
echo "6. Checking StrongSwan configuration..."
ls -la /etc/ipsec.conf 2>/dev/null || echo "ipsec.conf not found"
ls -la /etc/ipsec.secrets 2>/dev/null || echo "ipsec.secrets not found"
ls -la /etc/strongswan.conf 2>/dev/null || echo "strongswan.conf not found"
echo ""

# Check VPN connections
echo "7. Checking VPN connections..."
ipsec statusall 2>/dev/null || echo "Cannot get VPN status"
echo ""

# Check system logs
echo "8. Checking system logs for VPN errors..."
journalctl -u strongswan-starter -n 50 --no-pager 2>/dev/null || \
journalctl -u strongswan -n 50 --no-pager 2>/dev/null || \
journalctl -u ipsec -n 50 --no-pager 2>/dev/null || \
echo "No VPN logs found"
echo ""

# Check kernel modules
echo "9. Checking kernel modules..."
lsmod | grep -E '(xfrm|esp|ah|ipcomp)' || echo "IPsec kernel modules not loaded"
echo ""

# Check if IP forwarding is enabled
echo "10. Checking IP forwarding..."
sysctl net.ipv4.ip_forward
sysctl net.ipv4.conf.all.forwarding
echo ""

echo "=== Diagnostic Complete ==="
