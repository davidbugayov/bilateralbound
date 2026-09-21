#!/bin/bash
# Update nginx configuration — deploys the unified nginx-config (prod + dev + health)

set -e

echo "🔧 Deploying nginx configuration..."

# Backup current config
sudo cp /etc/nginx/sites-available/bilateralbound /etc/nginx/sites-available/bilateralbound.backup 2>/dev/null || true

# Copy unified config (handles prod, dev, and health checks)
sudo cp scripts/nginx-config /etc/nginx/sites-available/bilateralbound

# Ensure symlink
sudo ln -sf /etc/nginx/sites-available/bilateralbound /etc/nginx/sites-enabled/bilateralbound 2>/dev/null || true

# Test nginx config
echo "✅ Testing nginx configuration..."
sudo nginx -t

# Reload nginx
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

echo "✅ Nginx configuration deployed successfully!"
echo ""
echo "📋 To verify SSE endpoint (dev):"
echo "curl -N 'https://dev.emdrbilateral.online/api/session/test/events?role=viewer' -H 'Accept: text/event-stream'"
