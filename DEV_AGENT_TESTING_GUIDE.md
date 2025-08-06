# Dev Agent Testing Guide - Simplified Task Tracking

## What Changed

The complex memory system has been replaced with simple file-based tracking:

### Before (Complex):
```bash
# Multiple memory operations with Qdrant
node bmad-core/utils/persist-memory-cli.js observation dev 'Starting task'
Execute: *execute-task dev-save-memory task_name='task' story_id='4.1'
```

### After (Simple):
```bash
# Simple file-based tracking
mkdir -p .ai/history
node .bmad-core/utils/track-progress.js observation dev 'Starting task'
```

## Expected Behavior When Testing

### 1. Agent Activation
```bash
# STEP 2: Create tracking directories
mkdir -p .ai/history
# Output: (directory created)

# STEP 3: Log activation
node .bmad-core/utils/track-progress.js observation dev 'Dev agent activated for session'
# Output: [dev] Observation recorded: Dev agent activated for session
```

### 2. During Story Development
The agent will:
1. Create a task list in `.ai/dev_tasks.json`
2. For each task:
   - Log start: `node .bmad-core/utils/track-progress.js observation dev 'Starting task: Create user model'`
   - Implement the task
   - Log completion: `node .bmad-core/utils/track-progress.js observation dev 'Completed task: Create user model'`
   - Execute `dev-track-progress` task

### 3. File Structure Created
```
.ai/
├── dev_context.json       # Current context
├── history/
│   └── dev_log.jsonl      # Append-only log
└── dev_tasks.json         # Task list for current story
```

## Testing Commands

### View Current Context
```bash
node .bmad-core/utils/track-progress.js show dev
```

### Log an Observation
```bash
node .bmad-core/utils/track-progress.js observation dev 'Found existing auth middleware'
```

### Log a Decision
```bash
node .bmad-core/utils/track-progress.js decision dev 'Use JWT' 'Better security than sessions'
```

### Log a Key Fact
```bash
node .bmad-core/utils/track-progress.js keyfact dev 'Auth pattern can be reused'
```

## What's Different

1. **No Qdrant** - Everything is file-based
2. **No Complex Validation** - Simple logging that works
3. **No Subprocess Errors** - Direct file operations
4. **Visible Progress** - Check `.ai/` directory anytime

## Troubleshooting

If the agent shows errors about missing files:
1. Ensure you're in a project directory with `.bmad-core/`
2. The tracking utils should be in `.bmad-core/utils/`
3. Create `.ai/` directory if it doesn't exist

The simplified system achieves the same goal (tracking task progress) with 97% less code.