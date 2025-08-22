#!/bin/bash

# Traceability Commit Hook
# Ensures all commits include story ID reference

commit_regex='\[(AH-[0-9]+|STORY-[0-9]+|story:[a-zA-Z0-9-]+)\]'
skip_regex='\[skip-traceability\]'

commit_msg_file=$1
commit_msg=$(cat "$commit_msg_file")

# Check for skip flag
if echo "$commit_msg" | grep -qE "$skip_regex"; then
  echo "⚠ Skipping traceability check (override flag detected)"
  exit 0
fi

# Check for story ID
if ! echo "$commit_msg" | grep -qE "$commit_regex"; then
  echo "❌ Commit message must include a story ID"
  echo "   Format: [AH-###], [STORY-###], or [story:id]"
  echo "   Or use [skip-traceability] to bypass"
  exit 1
fi

echo "✓ Traceability check passed"
exit 0
