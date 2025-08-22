#!/bin/bash

echo "Running type checks..."

# Check for TypeScript
if [ -f "tsconfig.json" ]; then
  npx tsc --noEmit
  TYPE_EXIT=$?
elif npm run type:check --dry-run 2>/dev/null | grep -q "type:check"; then
  npm run type:check
  TYPE_EXIT=$?
else
  echo "No type checking configured"
  TYPE_EXIT=0
fi

if [ $TYPE_EXIT -eq 0 ]; then
  echo "✓ Type checks passed"
else
  echo "✗ Type checks failed"
fi

exit $TYPE_EXIT
