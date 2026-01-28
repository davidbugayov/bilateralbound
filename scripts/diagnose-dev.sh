#!/bin/bash
# Diagnostic script for dev.emdrbilateral.online

set -e

echo "🔍 Diagnosing dev.emdrbilateral.online service..."
echo ""

# Check node version
echo "1️⃣ Node version:"
node --version

# Check npm version
echo ""
echo "2️⃣ NPM version:"
npm --version

# Check if service is running
echo ""
echo "3️⃣ Service status:"
systemctl status emdrbilateral-dev --no-pager | head -5

# Check if port 3000 is listening
echo ""
echo "4️⃣ Port 3000 status:"
lsof -i :3000 || echo "No process listening on port 3000"

# Check nginx status
echo ""
echo "5️⃣ Nginx status:"
systemctl status nginx --no-pager | head -5

# Check recent logs
echo ""
echo "6️⃣ Recent errors (last 20 lines):"
journalctl -u emdrbilateral-dev -n 20 --no-pager | grep -i "error" || echo "No errors found"

# Try to test API endpoint
echo ""
echo "7️⃣ Testing API endpoint (localhost:3000):"
curl -s -m 3 http://localhost:3000/api/session/test || echo "API not responding"
