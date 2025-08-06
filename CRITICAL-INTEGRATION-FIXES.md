# Critical Integration Fixes for Simple Task Tracker

## Immediate Actions Required

### 1. Update Function Registry (HIGH PRIORITY)

**File**: `/tools/lib/function-registry.js`

**Action**: Add the following imports and functions to the existing file:

```javascript
// Add imports after existing imports
const { getTracker } = require(resolveModule('utils/memory-compatibility-wrapper', '../../bmad-core/utils/memory-compatibility-wrapper'));
const simpleMemory = require(resolveModule('utils/simpleMemory', '../../bmad-core/utils/simpleMemory'));

// Add to FUNCTION_REGISTRY object
'simpleMemory.saveContext': async (params) => {
  return await simpleMemory.saveContext(params);
},

'simpleMemory.logEntry': async (params) => {
  return await simpleMemory.logEntry(params);
},

'simpleMemory.getProgress': async () => {
  return await simpleMemory.getProgress();
},

'simpleMemory.getProgressReport': async () => {
  return await simpleMemory.getProgressReport();
},

trackProgress: async (workflow, task, status, notes) => {
  const tracker = getTracker();
  
  if (!tracker.workflow) {
    tracker.startWorkflow(workflow, [{ name: task }]);
  }
  
  if (status === 'completed') {
    return { success: tracker.completeCurrentTask(notes), timestamp: new Date().toISOString() };
  } else if (status === 'skipped') {
    return { success: tracker.skipCurrentTask(notes), timestamp: new Date().toISOString() };
  } else {
    tracker.log(`Task ${task}: ${status}`, 'info');
    return { success: true, timestamp: new Date().toISOString() };
  }
},

saveDebugLog: async (directory = '.ai') => {
  const tracker = getTracker();
  const filepath = tracker.saveDebugLog(directory);
  return { success: true, filepath, timestamp: new Date().toISOString() };
}

// Add to parameterMappings in extractFunctionArguments
'simpleMemory.saveContext': ['params'],
'simpleMemory.logEntry': ['params'],
'simpleMemory.getProgress': [],
'simpleMemory.getProgressReport': [],
'trackProgress': ['workflow', 'task', 'status', 'notes'],
'saveDebugLog': ['directory']
```

### 2. Update Agent Activation Instructions

**Files**: All agent files in `/bmad-core/agents/`

**Example for dev.md**:

Replace:
```yaml
- STEP 2: "Initialize working memory for this agent session using loadAgentMemoryContextAndExit..."
```

With:
```yaml
- STEP 2: Initialize task tracker for this session using const TaskTracker = require('./simple-task-tracker'); const tracker = new TaskTracker(); tracker.setAgent('dev')
```

### 3. Create Module Aliases

The `simpleMemory.js` module has been created at `/bmad-core/utils/simpleMemory.js` to bridge the gap.

### 4. Update Task Runner Memory Handling

**File**: `/tools/task-runner.js`

Consider adding a check for simplified tracking mode:

```javascript
// Around line 253, after memory initialization
if (process.env.USE_SIMPLE_TRACKER === 'true' || !memory) {
  // Use simple tracker instead of complex memory
  const { getTracker } = require('../bmad-core/utils/memory-compatibility-wrapper');
  const tracker = getTracker();
  tracker.setAgent(agentName);
  if (!tracker.workflow) {
    tracker.startWorkflow(`task-${task.name}`, [{ name: task.name }]);
  }
}
```

## Testing Instructions

1. Run the integration test:
```bash
node test-simple-tracker-integration.js
```

2. Test with an actual task:
```bash
# Set environment variable to use simple tracker
export USE_SIMPLE_TRACKER=true

# Run a task that uses memory operations
node tools/task-runner.js dev bmad-core/structured-tasks/dev-save-memory.yaml \
  --story_id="test-123" \
  --task_name="test-task" \
  --implementation_details='{"decision":"test","rationale":"testing"}'
```

3. Verify agent activation works:
```bash
# Test agent activation with new tracker
node -e "
const TaskTracker = require('./bmad-core/utils/simple-task-tracker');
const tracker = new TaskTracker();
tracker.setAgent('dev');
console.log('Agent set:', tracker.workflow?.agentName || 'Not set');
"
```

## Rollback Plan

If issues occur:

1. Keep old memory system files intact during transition
2. Use environment variable to toggle between systems
3. Compatibility wrapper ensures old calls still work
4. Can revert agent activation instructions if needed

## Success Criteria

- [ ] All structured tasks execute without errors
- [ ] Agents can track progress through workflows
- [ ] Debug logs are saved correctly
- [ ] No regression in existing functionality
- [ ] Performance improvement (no Qdrant delays)

## Notes

- The simpleMemory module provides a clean interface for structured tasks
- The compatibility wrapper ensures backward compatibility
- The tracker is designed to be session-based (no persistence between runs)
- Debug logs provide an audit trail when needed