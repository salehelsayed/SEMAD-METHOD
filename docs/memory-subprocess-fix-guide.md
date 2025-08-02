# Memory Subprocess Hanging Fix Guide

## Problem Summary

When agents execute memory-related tasks via subprocess (`node -e`), the Qdrant HTTP client keeps connections open, preventing the Node.js process from exiting. This causes tasks to hang and timeout after 30-60 seconds instead of completing in milliseconds.

## Affected Agents and Tasks

### Dev Agent
- `dev-save-memory.yaml` ✅ (Fixed)
- `generate-datamodel-tests.yaml`
- `check-dependencies-before-commit.yaml`
- `address-qa-feedback.yaml`

### QA Agent  
- `validate-story-contract.yaml`
- `validate-next-story.yaml`
- `qa-dev-handoff.yaml`
- `review-story.yaml`
- `analyze-dependency-impacts-qa.yaml`
- `execute-checklist.yaml`

### SM Agent
- `create-next-story.yaml`
- `brownfield-create-story.yaml`
- `create-brownfield-story.yaml`
- `generate-search-tools.yaml`

### Analyst Agent
- `document-project.yaml`
- `shard-doc.yaml`

### PM Agent
- `facilitate-brainstorming-session.yaml`
- `brownfield-create-epic.yaml`

### Architect Agent
- `generate-ai-frontend-prompt.yaml`

## Solution: Exit-Safe Functions

We've created exit-safe wrapper functions that properly close connections and exit:

- `loadAgentMemoryContextAndExit` - for agent activation
- `retrieveRelevantMemoriesAndExit` - for memory retrieval
- `updateWorkingMemoryAndExit` - for memory updates
- `saveToLongTermMemoryAndExit` - for long-term storage

## How to Fix Tasks

### Option 1: Update Agent Instructions (Recommended)

Update agent activation instructions to mention both functions:

```yaml
activation-instructions:
  - STEP 2: Initialize working memory for this agent session using loadAgentMemoryContext from utils/agent-memory-loader.js with agent name 'AGENT_NAME' (or use loadAgentMemoryContextAndExit if running in a subprocess)
  - STEP 3: Load relevant long-term memories from previous sessions using retrieveRelevantMemories (or use retrieveRelevantMemoriesAndExit from agent-memory-loader.js if running in a subprocess)
```

### Option 2: Update Task Files

For each affected task, update the memory function loading:

```javascript
// OLD WAY (causes hanging)
const { updateWorkingMemory, saveToLongTermMemory } = require('.bmad-core/utils/agent-memory-manager.js');

// NEW WAY (handles both contexts)
// If running in a subprocess (node -e), use exit-safe versions:
const { updateWorkingMemoryAndExit, saveToLongTermMemoryAndExit } = require('.bmad-core/utils/agent-memory-loader.js');
// Or if running in main process, use regular versions:
const { updateWorkingMemory, saveToLongTermMemory } = require('.bmad-core/utils/agent-memory-manager.js');
```

### Option 3: Dynamic Detection (Most Flexible)

Use the template pattern from `memory-task-template.yaml` that detects execution context:

```javascript
if (typeof process !== 'undefined' && process.argv[1] === '-e') {
  // Use exit-safe functions
} else {
  // Use regular functions
}
```

## Testing

After updating, test that tasks complete quickly:

```bash
time node -e "require('./bmad-core/utils/agent-memory-loader').updateWorkingMemoryAndExit('dev', {})"
# Should complete in ~0.2 seconds, not timeout
```

## Root Cause

The issue stems from:
1. Qdrant HTTP client using undici with keep-alive enabled
2. Open sockets prevent Node.js event loop from becoming empty
3. Process never naturally exits
4. Tasks timeout after 30-60 seconds

The fix:
1. Configure undici Agent with `keepAliveTimeout: 0`
2. Call `closeConnections()` to destroy the agent
3. Force exit with `process.exit(0)` after a short delay

## Priority

High priority to fix for all agents as this affects:
- Development workflow efficiency
- CI/CD pipeline execution times
- Overall system reliability