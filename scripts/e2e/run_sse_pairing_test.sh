#!/bin/bash
# Простой скрипт для запуска E2E теста SSE pairing

set -e

echo "========================================="
echo "E2E Test: SSE Pairing"
echo "========================================="
echo ""
echo "Сервер: ${BASE_URL:-https://dev.emdrbilateral.online}"
echo "Headless: ${HEADLESS:-true}"
echo ""

cd "$(dirname "$0")/../.."

echo "Запуск теста..."
node scripts/e2e/test_sse_pairing.js

EXIT_CODE=$?

echo ""
echo "========================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ ТЕСТ ПРОЙДЕН"
else
    echo "❌ ТЕСТ ПРОВАЛЕН (код: $EXIT_CODE)"
fi
echo "========================================="

exit $EXIT_CODE
