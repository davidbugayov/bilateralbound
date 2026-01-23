#!/bin/bash
# JSHint validation script for EMDR project

echo "🔍 Running JSHint on source files..."
cd "$(dirname "$0")" || exit 1

# Only check src/main application files, exclude dist, node_modules, etc
npx jshint \
  packages/server-core/server \
  packages/web-client/public/js \
  --exclude-path .jshintignore \
  2>&1 || {
    echo "⚠️  JSHint check completed with warnings/errors (see above)"
    exit 0
  }

echo "✅ JSHint check passed!"
