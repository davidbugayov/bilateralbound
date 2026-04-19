#!/bin/bash
# Complete deployment script for SSE fix on dev.emdrbilateral.online

set -e

SERVER="root@90.156.254.190"
PASSWORD="9Ddc0BYKDavidqrJZm6a9"
PROJECT_DIR="/var/www/dev.emdrbilateral.online"

echo "🚀 Deploying SSE fix to dev.emdrbilateral.online..."
echo ""

# Step 1: Update code
echo "1️⃣ Updating code from git..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" "cd $PROJECT_DIR && git pull origin main"

# Step 2: Copy nginx config
echo ""
echo "2️⃣ Updating nginx configuration..."
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no scripts/nginx-fixed.conf "$SERVER:/tmp/nginx-dev.conf"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" "sudo cp /tmp/nginx-dev.conf /etc/nginx/sites-available/dev.emdrbilateral.online"

# Step 3: Test nginx
echo ""
echo "3️⃣ Testing nginx configuration..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" "sudo nginx -t"

# Step 4: Reload nginx
echo ""
echo "4️⃣ Reloading nginx..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" "sudo systemctl reload nginx"

# Step 5: Restart app
echo ""
echo "5️⃣ Restarting application..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" "sudo systemctl restart emdrbilateral-dev"

# Step 6: Wait for startup
echo ""
echo "6️⃣ Waiting for service to start..."
sleep 3

# Step 7: Check service status
echo ""
echo "7️⃣ Checking service status..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" "sudo systemctl status emdrbilateral-dev --no-pager -l | head -20"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Test SSE connection:"
echo "curl -N 'https://dev.emdrbilateral.online/api/session/test123/events?role=viewer' -H 'Accept: text/event-stream'"
echo ""
echo "🌐 Open in browser:"
echo "https://dev.emdrbilateral.online/s/test123"
