#!/bin/bash
# Update nginx configuration for dev.emdrbilateral.online with SSE support

set -e

echo "🔧 Updating nginx configuration for SSE support..."

# Backup current config
sudo cp /etc/nginx/sites-available/dev.emdrbilateral.online /etc/nginx/sites-available/dev.emdrbilateral.online.backup

# Copy new config
sudo cp scripts/nginx-fixed.conf /etc/nginx/sites-available/dev.emdrbilateral.online

# Test nginx config
echo "✅ Testing nginx configuration..."
sudo nginx -t

# Reload nginx
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

echo "✅ Nginx configuration updated successfully!"
echo ""
echo "📋 To verify SSE endpoint:"
echo "curl -N 'https://dev.emdrbilateral.online/api/session/test/events?role=viewer' -H 'Accept: text/event-stream'"
