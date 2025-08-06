#!/bin/bash

echo "Verifying dev agent has no memory/Qdrant references..."
echo "=================================================="

# Check for any remaining memory/Qdrant references
echo -e "\n1. Checking for memory system references:"
grep -i -E "memory-manager|qdrant|persist-memory|loadMemory|saveMemory|retrieveRelevant|memory-usage-logger|memory-cli|dev-save-memory" bmad-core/agents/dev.md | grep -v "# Removed:" | grep -v "data/content:" || echo "✅ No memory system references found"

echo -e "\n2. Checking for old tracking methods:"
grep -E "persist-memory-cli\.js|memory-operation-validator|loadMemoryWithValidation|checkContextSufficiency" bmad-core/agents/dev.md || echo "✅ No old tracking methods found"

echo -e "\n3. Verifying new tracking methods are present:"
echo -n "track-progress.js references: "
grep -c "track-progress.js" bmad-core/agents/dev.md

echo -n "dev-track-progress references: "
grep -c "dev-track-progress" bmad-core/agents/dev.md

echo -e "\n4. Checking dependencies section:"
grep -A 20 "dependencies:" bmad-core/agents/dev.md | grep -E "memory|qdrant" | grep -v "# Removed:" || echo "✅ No memory/Qdrant in dependencies"

echo -e "\n5. Summary of tracking approach:"
echo "- Uses: node .bmad-core/utils/track-progress.js"
echo "- Task tracking in: .ai/dev_tasks.json"
echo "- History logging in: .ai/history/dev_log.jsonl"
echo "- Context stored in: .ai/dev_context.json"

echo -e "\n✅ Dev agent cleanup verification complete!"