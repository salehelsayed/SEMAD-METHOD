# Dynamic Planning in BMAD-METHOD

## Overview

Dynamic Plan Adaptation is a mechanism that automatically breaks down complex tasks into manageable sub-tasks, reducing cognitive load and preventing hallucinations in AI agents. This feature monitors task complexity and creates smaller, focused work units that can be executed sequentially.

## Why Dynamic Planning Reduces Hallucinations

Research shows that LLMs perform better on smaller, focused tasks compared to large, complex ones. By implementing a divide-and-conquer approach:

1. **Reduced Context Overload**: Smaller tasks require less context to be held in memory
2. **Clear Boundaries**: Each sub-task has a specific, well-defined scope
3. **Sequential Progress**: Agents can focus on one sub-task at a time
4. **Better Error Recovery**: Issues in one sub-task don't affect others

## How It Works

### Automatic Task Splitting

When a task is initialized, the dynamic planner evaluates it against configurable rules:

```javascript
const TaskRunner = require('./tools/task-runner');
const taskRunner = new TaskRunner(rootDir);

// Execute task with automatic adaptation
const result = await taskRunner.executeTask(agentName, taskPath);
// The task runner automatically calls planAdaptation() internally
```

### Splitting Rules

The system uses rules defined in `bmad-core/structured-tasks/dynamic-plan-rules.yaml`:

1. **Step Count**: Tasks with more than 5 steps (configurable) are automatically split
2. **Conjunctions**: Tasks containing configurable keywords (default: "and", "then", "additionally", "furthermore", "also") are split at natural boundaries
3. **Context Size**: Tasks with context exceeding token threshold (default: 2000) are divided
4. **Domain Separation**: Tasks involving multiple domains (frontend, backend, database, infrastructure, testing) are separated
5. **Complex Dependencies**: Tasks where >30% of steps have dependency indicators are split

### Working Memory Integration

Sub-tasks are stored in the agent's working memory:

```json
{
  "taskId": "implement-feature-123",
  "plan": [
    { "id": "implement-feature-123_sub_1695123456789_a1b2c3d4", "status": "pending" },
    { "id": "implement-feature-123_sub_1695123456790_e5f6g7h8", "status": "pending" }
  ],
  "subTasks": [
    {
      "id": "implement-feature-123_sub_1695123456789_a1b2c3d4",
      "title": "Backend API Implementation",
      "steps": ["Create models", "Add endpoints", "Write tests"],
      "status": "pending",
      "parentTaskId": "implement-feature-123"
    }
  ]
}
```

**Note**: Sub-task IDs use timestamp and random components to ensure uniqueness and avoid collisions.

## Configuration

### Adjusting Thresholds

Edit `bmad-core/structured-tasks/dynamic-plan-rules.yaml`:

```yaml
thresholds:
  maxSteps: 5          # Maximum steps before splitting
  maxContextTokens: 2000  # Maximum context size
  maxComplexity: "high"   # Complexity threshold
```

### Custom Split Strategies

```yaml
splitStrategies:
  byStepCount:
    chunkSize: 5
    preserveBoundaries: true
  byConjunction:
    keywords: ["and", "then", "additionally"]
    requireNewChunk: true
```

## Agent Integration

All agents have been updated with the core principle:

> "When a task contains more than 5 distinct actions or if a step seems ambiguous, use the Dynamic Plan Adaptation protocol: break the task into smaller sub-tasks, record them in working memory and execute them sequentially."

## Real-time Sub-task Insertion

Agents can dynamically insert sub-tasks when encountering unforeseen complexities:

```javascript
const { insertSubTask } = require('./bmad-core/tools/dynamic-planner');
const { updateWorkingMemory } = require('./bmad-core/agents');

// When agent encounters a blocker
const updatedMemory = insertSubTask(memory, {
  title: 'Fix database migration',
  steps: ['Analyze schema', 'Create migration script', 'Test migration']
});

// IMPORTANT: The caller must persist the updated memory
await updateWorkingMemory(agentName, updatedMemory);
```

**Note**: Sub-tasks are inserted relative to the current step position, not always at the beginning of the plan.

## Example Usage

### Story Creation with Dynamic Planning

When the Scrum Master creates a complex story:

1. **Original Task**: "Implement user authentication with email verification and password reset"
2. **Dynamic Planning Result**:
   - Sub-task 1: "Implement basic authentication" (3 steps)
   - Sub-task 2: "Add email verification" (4 steps)
   - Sub-task 3: "Implement password reset" (3 steps)

### Development with Sub-tasks

The Developer agent:
1. Uses the task runner to execute tasks: `taskRunner.executeTask(agentName, taskPath)`
2. The runner automatically applies planAdaptation() and creates sub-tasks if needed
3. Executes each sub-task sequentially using `taskRunner.executeSubTask()`
4. Updates progress with `taskRunner.completeSubTask()`
5. Can insert new sub-tasks if blockers are found using `insertSubTask()`

## Best Practices

1. **Keep Rules Simple**: Start with basic step count rules
2. **Monitor Performance**: Track how often tasks are split
3. **Adjust Thresholds**: Fine-tune based on agent performance
4. **Document Sub-tasks**: Ensure each sub-task has clear objectives

## Troubleshooting

### Tasks Not Being Split

- Check that the task has a `steps` array
- Verify threshold settings in rules file
- Ensure working memory includes `subTasks` field

### Too Many Sub-tasks

- Increase `maxSteps` threshold
- Adjust conjunction keywords
- Review task structure for natural boundaries

## Task Runner Integration

### Using the Task Runner

The task runner (`tools/task-runner.js`) provides automatic integration:

```javascript
// Execute any task with automatic adaptation
const result = await taskRunner.executeTask('dev', 'path/to/task.yaml');

// Execute a specific sub-task
await taskRunner.executeSubTask('dev', 'task_sub_1');

// Complete a sub-task
await taskRunner.completeSubTask('dev', 'task_sub_1');
```

### Agent Commands

Agents can use the `execute-task` command to run tasks with adaptation:
```
*execute-task path/to/complex-task.yaml
```

## Advanced Features

### Recursive Decomposition

Large sub-tasks are automatically decomposed recursively:

```javascript
const { processTaskRecursively } = require('./bmad-core/tools/dynamic-planner');

// Recursively process a task with maximum depth
const processedTask = processTaskRecursively(task, maxDepth = 3);
```

### Context-Aware Splitting

The planner can split based on context size when provided:

```javascript
const result = planAdaptation(memory, task, { tokenCount: 2500 });
```

### Error Handling

The system handles various error conditions:
- Missing or corrupt YAML rules files
- Invalid threshold values
- Malformed rule structures

All errors fall back to sensible defaults to ensure continued operation.

## Working Memory Persistence

The updated working memory system now:
- Merges all update fields automatically (future-proof for new fields)
- Handles special cases for arrays and objects
- Preserves arbitrary fields added by agents or modules

## Future Enhancements

- Machine learning-based complexity detection
- Dynamic threshold adjustment based on success rates
- Cross-agent sub-task coordination
- Visual task decomposition tools
- Token counting integration for precise context size tracking