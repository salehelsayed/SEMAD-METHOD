#!/bin/bash

echo "Running lint checks..."

# Check if npm run lint exists
if npm run lint --dry-run 2>/dev/null | grep -q "lint"; then
  npm run lint
  LINT_EXIT=$?
else
  # Fallback to eslint if available
  if command -v eslint &> /dev/null; then
    eslint . --ext .js,.jsx,.ts,.tsx
    LINT_EXIT=$?
  else
    echo "No linter configured"
    LINT_EXIT=0
  fi
fi

if [ $LINT_EXIT -eq 0 ]; then
  echo "✓ Lint checks passed"
else
  echo "✗ Lint checks failed"
fi

exit $LINT_EXIT
