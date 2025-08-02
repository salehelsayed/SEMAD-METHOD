# Memory Testing Guide for BMad Projects

## For Projects Using BMad (like SEMAD-TEST)

When BMad is installed in a project, files are located in `.bmad-core` (hidden directory).

### 1. Test Memory Manager Command

```bash
# Navigate to your project
cd /path/to/your/project

# Run memory check (note the dot prefix)
node .bmad-core/utils/agent-memory-manager.js checkContextSufficiency qa

# Check memory status for an agent
node .bmad-core/utils/agent-memory-manager.js getMemorySummary qa
```

### 2. Memory Log Location

The memory usage log is created at `.ai/memory-usage.log` in your project root (NOT in .bmad-core).

```bash
# Check if log exists
ls -la .ai/

# View recent log entries
tail -f .ai/memory-usage.log

# Pretty print log entries (if you have jq installed)
tail -20 .ai/memory-usage.log | jq '.'
```

### 3. When Memory Logging Happens

Memory logging occurs when:
- Agents are activated (memory initialization)
- Stories are created (SM agent)
- Code is implemented (Dev agent)
- Reviews are performed (QA agent)
- Memory operations are executed in tasks

### 4. Testing Memory Logging in Workflow

To see memory logging in action:

```bash
# 1. Start the orchestrator
/BMad:agents:bmad-orchestrator

# 2. Execute development-phase workflow
Execute the development-phase workflow

# 3. Follow the prompts to activate agents
# Each agent activation will create memory log entries

# 4. Monitor the log in another terminal
tail -f .ai/memory-usage.log
```

### 5. What You Should See

Example log entries:
```json
{"timestamp":"2025-08-01T14:30:00.123Z","agent":"sm","operation":"initialize_memory","type":"memory_init","details":{"status":"start"}}
{"timestamp":"2025-08-01T14:30:00.456Z","agent":"sm","operation":"create_story","type":"task_memory","details":{"storyId":"STORY-001"}}
{"timestamp":"2025-08-01T14:30:15.789Z","agent":"dev","operation":"load_story_context","type":"memory_retrieval","details":{"storyId":"STORY-001"}}
```

### 6. Memory Files Location

Working memory files are stored in:
```bash
# Hidden directory with dot prefix
.bmad-core/ai/working_memory_<agent>.json

# Example:
.bmad-core/ai/working_memory_qa.json
.bmad-core/ai/working_memory_dev.json
.bmad-core/ai/working_memory_sm.json
```

### 7. Troubleshooting

If you don't see memory logs:
1. Ensure agents are actually performing operations (not just being activated)
2. Check that `.ai` directory exists in your project root
3. Look for any error messages in the console
4. Verify BMad was built successfully with `npm run build` in the BMad source directory

### 8. Memory Status Command

Each agent has a `*memory-status` command that shows:
- Current memory operations count
- Recent activity
- Memory usage statistics

Use it like:
```
*memory-status
```

## For BMad Development (in source directory)

When working in the BMad source directory itself:

```bash
# Files are in bmad-core (no dot prefix)
node bmad-core/utils/agent-memory-manager.js checkContextSufficiency qa

# Test script is available
node test-memory-logging.js
```