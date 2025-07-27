# Working Memory & Scratchpad Usage Guide

## Overview

The BMAD-METHOD now includes a comprehensive working memory and scratchpad system that enables agents to maintain context across sessions and retrieve relevant information from past interactions.

## Architecture

### Components

1. **Working Memory** - Per-agent JSON files storing current task state
2. **Scratchpad Helpers** - Functions for updating and querying memory
3. **Qdrant Integration** - Vector database for long-term memory storage
4. **Memory Lifecycle Management** - Cleanup, archiving, and size management

### File Structure

```
bmad-core/
├── ai/                               # Memory storage directory
│   ├── working_memory_dev.json      # Per-agent memory files
│   ├── working_memory_pm.json
│   └── ...
├── agents/
│   └── index.js                     # Memory helper functions
├── utils/
│   ├── qdrant.js                    # Qdrant integration
│   └── memory-lifecycle.js          # Lifecycle management
└── structured-tasks/
    ├── update-working-memory.yaml   # Memory update task
    ├── retrieve-context.yaml        # Context retrieval task
    └── manage-memory.yaml           # Memory management task
```

## Memory Structure

Each agent's working memory follows this structure:

```json
{
  "taskId": "current-task-identifier",
  "plan": ["step1", "step2", "step3"],
  "currentStep": "step2",
  "context": {
    "key": "value"
  },
  "observations": [
    {
      "stepId": "step1",
      "observation": "Completed successfully",
      "timestamp": "2025-01-25T10:00:00Z"
    }
  ]
}
```

## Usage Patterns by Agent

### Dev Agent
- **Initialization**: Loads memory on activation
- **Task Execution**: Updates current step as implementation progresses
- **Observations**: Records test results, build status, errors encountered
- **Context**: Stores technology choices, dependencies added

### PM Agent
- **Document Creation**: Tracks PRD sections completed
- **Context**: Stores project requirements, stakeholder feedback
- **Observations**: Records decision rationale

### Analyst Agent
- **Research**: Stores research findings in observations
- **Context**: Market analysis data, competitor information
- **Plan**: Research methodology steps

### Architect Agent
- **Design Decisions**: Records architecture choices in context
- **Observations**: Trade-off analyses, technology evaluations
- **Plan**: Design review checklist

### QA Agent
- **Review Process**: Tracks reviewed files and findings
- **Observations**: Issues found, fixes applied
- **Context**: Test coverage metrics, quality gates

### SM Agent
- **Story Creation**: Tracks story generation progress
- **Context**: Epic relationships, acceptance criteria
- **Observations**: Story refinements, stakeholder feedback

### PO Agent
- **Validation**: Records validation checklist progress
- **Context**: Document consistency checks
- **Observations**: Issues flagged, resolutions

### UX Expert
- **Design Process**: Tracks UI/UX decisions
- **Context**: Design system choices, user research
- **Observations**: Usability findings

## Memory Operations

### 1. Initialize Memory
Automatically happens during agent activation:
```yaml
activation-instructions:
  - STEP 2: Initialize working memory for this agent session
```

### 2. Update Memory
During task execution:
```javascript
await updateWorkingMemory(agentName, {
  taskId: 'new-task-id',
  currentStep: 'implementation'
});
```

### 3. Record Observations
Track important findings:
```javascript
await recordObservation(agentName, 'test-step', 'All tests passing');
```

### 4. Retrieve Context
At task start:
```javascript
const relevantMemories = await retrieveMemory('payment feature', 5);
```

## Best Practices

### 1. Task Initialization
- Always retrieve context at the beginning of a new task
- Check for related past work before starting

### 2. Regular Updates
- Update working memory at key milestones
- Record observations for significant findings or decisions

### 3. Context Preservation
- Store reusable patterns and decisions in context
- Archive completed tasks to Qdrant for future reference

### 4. Memory Cleanup
- Use manage-memory task to clear old data
- Export important memories before clearing

### 5. Cross-Agent Collaboration
- Store shareable insights in Qdrant
- Reference other agents' memories when relevant

## Memory Management Commands

Agents can use the `manage-memory` task to:
- Clear working memory
- Export memory to file
- Import memory from backup
- View memory statistics
- Archive completed tasks

## Integration with Tasks

Memory-aware tasks should:
1. Initialize or retrieve memory at start
2. Update memory during execution
3. Record key observations
4. Archive on completion

Example task structure:
```yaml
steps:
  - id: step0
    name: Initialize Memory Context
    actions:
      - description: "Initialize working memory"
      - description: "Retrieve relevant context"
  
  # ... main task steps ...
  
  - id: final
    name: Update Memory
    actions:
      - description: "Record final observations"
      - description: "Archive if task complete"
```

## Troubleshooting

### Memory Not Persisting
- Check file permissions in `bmad-core/ai/` directory
- Ensure memory initialization in agent activation

### Qdrant Connection Issues
- Verify Qdrant is running on localhost:6333
- Check collection exists: "bmad_memory"

### Memory Size Issues
- Use trimMemory() to reduce observation count
- Archive old tasks to Qdrant
- Clear memory periodically

## Future Enhancements

1. **Memory Sharing Protocol** - Structured way for agents to share memories
2. **Memory Templates** - Predefined memory structures for common tasks
3. **Memory Analytics** - Insights from aggregated memory patterns
4. **Selective Memory Export** - Export specific time ranges or task types