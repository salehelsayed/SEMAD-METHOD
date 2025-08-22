#!/bin/bash

echo "Running build check..."

if npm run build --dry-run 2>/dev/null | grep -q "build"; then
  npm run build
  BUILD_EXIT=$?
else
  echo "No build script configured"
  BUILD_EXIT=0
fi

if [ $BUILD_EXIT -eq 0 ]; then
  echo "✓ Build check passed"
else
  echo "✗ Build check failed"
fi

exit $BUILD_EXIT
