#!/bin/bash
echo "=== SSH Authentication Debug ==="
echo "Checking SSH keys on local machine..."

# Check if SSH keys exist
echo "Local SSH keys:"
ls -la ~/.ssh/id_* 2>/dev/null || echo "No SSH keys found"

# Check SSH config
echo ""
echo "SSH client config:"
cat ~/.ssh/config 2>/dev/null || echo "No SSH config found"

# Try to get server info
echo ""
echo "Attempting to get server SSH config (this will fail but show us the error):"
ssh -v root@213.139.229.44 "cat /etc/ssh/sshd_config" 2>&1 | head -30
