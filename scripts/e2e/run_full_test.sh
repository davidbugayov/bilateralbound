#!/bin/bash

echo "🔥 Killing all node processes..."
pkill -9 node
sleep 3

echo "🚀 Starting server..."
cd /Users/davidbugayov/StudioProject/bilateral_bound/packages/server-core
node server/index.js > /tmp/bilateral-server.log 2>&1 &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID"

echo "⏳ Waiting for server to start..."
sleep 5

echo "🔍 Checking server health..."
if curl -s http://localhost:3000/health > /dev/null; then
  echo "✅ Server is healthy"
else
  echo "❌ Server is not responding"
  cat /tmp/bilateral-server.log
  exit 1
fi

echo ""
echo "🧪 Running E2E test..."
cd /Users/davidbugayov/StudioProject/bilateral_bound
BASE_URL=http://localhost:3000 HEADLESS=true node scripts/e2e/test_local_sse_sync.js

TEST_EXIT_CODE=$?

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "🎉 ✅ TEST PASSED!"
else
  echo "❌ TEST FAILED with exit code: $TEST_EXIT_CODE"
  echo ""
  echo "Server logs:"
  tail -50 /tmp/bilateral-server.log
fi

exit $TEST_EXIT_CODE
