# Task Tracking Simplification Plan

## Problem Statement
Agents need to track their progress through multi-step workflows (e.g., develop-story with 10 tasks) without losing their place. The current solution uses an over-engineered memory system with Qdrant, complex validation, and 8,674 lines of code.

## Root Cause
The system conflates two separate concerns:
1. **Task execution tracking** (within a single session)
2. **Long-term knowledge persistence** (between sessions)

For ensuring agents complete their tasks without getting lost, we only need #1.

## Current Over-Engineering
- Qdrant vector database for simple task tracking
- Complex memory operations after EVERY step
- Subprocess wrappers with exit handlers  
- Validation and audit systems
- 20+ utility files for what should be simple logging

## Simple Replacement Design

### Core Concept
Use in-memory task tracking during execution. No persistence needed within a session.

### Implementation

#### 1. Simple Task Tracker (`bmad-core/utils/simple-task-tracker.js`)
```javascript
class TaskTracker {
  constructor() {
    this.workflow = null;
    this.history = [];
  }

  startWorkflow(workflowName, tasks) {
    this.workflow = {
      name: workflowName,
      tasks: tasks,
      currentIndex: 0,
      completed: [],
      startTime: new Date()
    };
    this.log(`Started workflow: ${workflowName} with ${tasks.length} tasks`);
  }

  getCurrentTask() {
    if (!this.workflow || this.workflow.currentIndex >= this.workflow.tasks.length) {
      return null;
    }
    return {
      task: this.workflow.tasks[this.workflow.currentIndex],
      index: this.workflow.currentIndex,
      total: this.workflow.tasks.length,
      progress: `${this.workflow.currentIndex + 1}/${this.workflow.tasks.length}`
    };
  }

  completeCurrentTask(notes = '') {
    const current = this.getCurrentTask();
    if (!current) return false;
    
    this.workflow.completed.push({
      task: current.task,
      completedAt: new Date(),
      notes: notes
    });
    
    this.log(`Completed task ${current.index + 1}: ${current.task.name}`);
    this.workflow.currentIndex++;
    
    return true;
  }

  log(message, type = 'info') {
    const entry = {
      timestamp: new Date(),
      type: type,
      message: message,
      workflowContext: this.workflow ? {
        name: this.workflow.name,
        progress: `${this.workflow.completed.length}/${this.workflow.tasks.length}`
      } : null
    };
    
    this.history.push(entry);
    
    // Simple console output for debugging
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  getProgress() {
    if (!this.workflow) return null;
    return {
      workflow: this.workflow.name,
      totalTasks: this.workflow.tasks.length,
      completedTasks: this.workflow.completed.length,
      currentTask: this.getCurrentTask(),
      percentComplete: Math.round((this.workflow.completed.length / this.workflow.tasks.length) * 100)
    };
  }

  // Optional: Save to file for debugging/audit
  saveDebugLog() {
    const fs = require('fs');
    const debugData = {
      workflow: this.workflow,
      history: this.history,
      savedAt: new Date()
    };
    fs.writeFileSync(`.ai/debug_${this.workflow.name}_${Date.now()}.json`, JSON.stringify(debugData, null, 2));
  }
}

module.exports = TaskTracker;
```

#### 2. Integration with Agent Workflows

Replace complex memory operations with simple tracker calls:

**Before (Complex):**
```javascript
// Multiple memory operations for a single task
Execute: node bmad-core/utils/persist-memory-cli.js observation dev 'Starting task: [task name]'
Execute: node bmad-core/utils/persist-memory-cli.js observation dev 'Implementation complete for [task name]'
Execute: node bmad-core/utils/persist-memory-cli.js decision dev 'Test strategy' '[describe test approach]'
Execute: *execute-task dev-save-memory task_name='[task_name]' story_id='[story_id]'
```

**After (Simple):**
```javascript
const tracker = new TaskTracker();
tracker.startWorkflow('develop-story', storyTasks);

// For each task
const current = tracker.getCurrentTask();
console.log(`Working on: ${current.progress} - ${current.task.name}`);
// ... do the work ...
tracker.completeCurrentTask('Tests passed');
```

#### 3. Update Structured Tasks

Modify tasks to use the simple tracker instead of complex memory operations:

**dev-save-memory.yaml** → **dev-track-progress.yaml**
- Remove Qdrant operations
- Remove subprocess wrappers
- Just track task completion

**Example Updated Task:**
```yaml
id: dev-track-progress
name: Track Development Progress
purpose: Simple task completion tracking
steps:
  - id: step1
    name: Record Progress
    actions:
      - description: Track current task completion
        function: trackProgress
        parameters:
          workflow: "{{workflow_name}}"
          task: "{{task_name}}"
          status: "completed"
          notes: "{{completion_notes}}"
```

## Migration Strategy

### Phase 1: Create Simple Tracker (Day 1)
1. Implement `simple-task-tracker.js`
2. Create wrapper functions for backward compatibility
3. Add unit tests

### Phase 2: Update Agent Workflows (Day 2-3)
1. Replace memory operations in develop-story workflow
2. Update task execution to use tracker
3. Maintain audit logs in simple JSON format

### Phase 3: Remove Complex Infrastructure (Day 4-5)
1. Remove Qdrant dependencies
2. Delete memory validation systems
3. Remove subprocess wrappers
4. Clean up configuration

### Phase 4: Simplify Task Definitions (Day 6)
1. Update all structured tasks
2. Remove memory-specific tasks
3. Consolidate logging functions

## Benefits

1. **Simplicity**: ~200 lines instead of 8,674
2. **Performance**: No network calls, no database
3. **Reliability**: No external dependencies
4. **Debuggability**: Simple JSON logs
5. **Same Functionality**: Agents still track progress

## Success Metrics

1. Agents complete multi-step workflows without losing track
2. Task progress visible at any time
3. Debug logs available when needed
4. No Qdrant or complex memory infrastructure
5. Total task tracking code under 300 lines

## Risk Mitigation

- **Backwards Compatibility**: Wrapper functions during transition
- **Data Loss**: Export any critical Qdrant data first
- **Testing**: Comprehensive tests before removing old system