# Memory Subprocess Fix Guide

## Issue Summary

The dev and qa agents were instructed to call JavaScript functions directly (e.g., `persistObservation`, `persistDecision`) but agents operating in subprocess mode cannot directly execute JavaScript functions. This resulted in memory updates not being persisted to the working memory JSON files.

## Root Cause

1. **Agent Instructions Mismatch**: The agent YAML files instruct agents to call JavaScript functions directly:
   ```yaml
   - "MEMORY OPERATIONS: After each implementation step, record key observations, decisions, and blockers using persistObservation, persistDecision, and persistBlocker..."
   ```

2. **Subprocess Limitation**: When agents run in subprocess mode (which is the standard execution model), they cannot directly import and execute JavaScript functions. They need to use either:
   - Command-line interfaces
   - Structured tasks that wrap the functions
   - Special "AndExit" versions of functions designed for subprocess use

## Solution Implemented

### 1. CLI Wrapper Created
Created `/bmad-core/utils/persist-memory-cli.js` that provides command-line access to memory persistence functions:

```bash
# Usage examples:
node persist-memory-cli.js observation dev "Found authentication bug"
node persist-memory-cli.js decision qa "Reject implementation" "Missing test coverage"
node persist-memory-cli.js blocker dev "API documentation missing"
node persist-memory-cli.js keyfact dev "Database uses PostgreSQL 14"
```

### 2. Structured Task Created
Created `/bmad-core/structured-tasks/persist-memory.yaml` that agents can execute:

```yaml
# Agent can now use:
*execute-task persist-memory agentName=dev memoryType=observation content="Implementation complete"
```

## How Agents Should Use Memory

### Option 1: Using the CLI directly
Agents can execute shell commands:
```bash
node /path/to/persist-memory-cli.js observation dev "My observation here"
```

### Option 2: Using the structured task
Agents can execute the persist-memory task:
```
*execute-task persist-memory
- agentName: dev
- memoryType: observation
- content: "My observation here"
```

### Option 3: Using dev-save-memory task (for dev agent)
The dev agent has a specialized task `dev-save-memory` that handles comprehensive memory saving including both working and long-term memory.

## Verification

The memory persistence functions are working correctly when called. Test results show:
- ✅ persistObservation updates the observations array
- ✅ persistDecision updates the decisions array with rationale
- ✅ persistBlocker updates the blockers array
- ✅ All updates include proper timestamps and context

## Recommendations

1. **Update Agent Instructions**: Modify the agent YAML files to reference the CLI or structured task instead of direct function calls.

2. **Use Structured Tasks**: For complex memory operations, create structured tasks that handle the subprocess execution properly.

3. **Monitor Memory Logs**: Check `.ai/memory-usage.log` for successful updates and any errors.

4. **Test Memory Updates**: After agent operations, verify the working memory files are being updated:
   - `.ai/working_memory_dev.json`
   - `.ai/working_memory_qa.json`
   - `.ai/working_memory_sm.json`

## Memory Files Location

All memory files are stored in the `.ai` directory:
- Working memory: `.ai/working_memory_[agent].json`
- Memory logs: `.ai/memory-usage.log`
- Legacy memory files: `.ai/[agent]-memory.json` (deprecated)

## Next Steps

1. Update agent activation instructions to use the CLI or structured task
2. Add the persist-memory task to agent dependencies
3. Test memory persistence in actual agent workflows
4. Consider creating agent-specific memory tasks with pre-configured parameters