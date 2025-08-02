# Short-Term Memory Structure Standard

## Overview
All BMAD agents use a consistent short-term memory structure stored in `.ai/working_memory_[agentName].json`. This document defines the standard structure and usage guidelines.

## Standard Memory Structure

```json
{
  "agentName": "string",           // Agent identifier (dev, qa, sm, etc.)
  "sessionId": "string",           // Unique session ID (timestamp-based)
  "initialized": "ISO 8601 string", // When memory was initialized
  "lastUpdated": "ISO 8601 string", // Last modification timestamp
  "currentContext": {
    "storyId": "string | null",    // Current story being worked on
    "epicId": "string | null",     // Current epic context
    "taskId": "string | null"      // Current task being executed
  },
  "observations": [                // Array of observations
    {
      "timestamp": "ISO 8601 string",
      "content": "string",         // The observation text
      "context": {                 // Context when observation was made
        "storyId": "string | null",
        "epicId": "string | null",
        "taskId": "string | null"
      }
    }
  ],
  "decisions": [                   // Array of decisions made
    {
      "timestamp": "ISO 8601 string",
      "decision": "string",        // The decision text
      "reasoning": "string",       // Why this decision was made
      "context": {                 // Context when decision was made
        "storyId": "string | null",
        "epicId": "string | null",
        "taskId": "string | null"
      }
    }
  ],
  "blockers": [                    // Array of blockers encountered
    {
      "timestamp": "ISO 8601 string",
      "blocker": "string",         // Description of the blocker
      "context": {                 // Context when blocker occurred
        "storyId": "string | null",
        "epicId": "string | null",
        "taskId": "string | null"
      },
      "resolved": "boolean",       // Whether blocker is resolved
      "resolution": "string | null", // How it was resolved
      "resolvedAt": "ISO 8601 string | null"
    }
  ],
  "keyFacts": {                    // Important facts discovered
    "factKey": {                   // Unique key for the fact
      "content": "string",         // The fact content
      "timestamp": "ISO 8601 string",
      "context": {                 // Context when fact was recorded
        "storyId": "string | null",
        "epicId": "string | null",
        "taskId": "string | null"
      }
    }
  },
  "plan": ["string"],              // Current plan steps (if applicable)
  "currentStep": "number | null",  // Current step in plan
  "completedTasks": [              // Array of completed task records
    {
      "timestamp": "ISO 8601 string",
      "taskId": "string",
      "context": {
        "storyId": "string | null",
        "epicId": "string | null"
      }
    }
  ]
}
```

## Using the CLI Wrapper

All agents should use the CLI wrapper to persist memory updates:

### Persist an Observation
```bash
node .bmad-core/utils/persist-memory-cli.js observation [agentName] "observation text"
```

### Persist a Decision
```bash
node .bmad-core/utils/persist-memory-cli.js decision [agentName] "decision text" "reasoning text"
```

### Persist a Blocker
```bash
node .bmad-core/utils/persist-memory-cli.js blocker [agentName] "blocker description"
```

### Persist a Key Fact
```bash
node .bmad-core/utils/persist-memory-cli.js keyfact [agentName] "important fact"
```

### View Current Memory
```bash
node .bmad-core/utils/persist-memory-cli.js show [agentName]
```

## Memory Limits

To prevent memory bloat, the following limits are enforced:
- Observations: Maximum 100 entries (oldest are archived)
- Decisions: Maximum 50 entries
- Blockers: Maximum 30 entries
- Key Facts: Maximum 100 entries
- Completed Tasks: Maximum 200 entries

When limits are exceeded, memory hygiene automatically:
1. Archives old entries to long-term memory
2. Removes the oldest entries from working memory
3. Maintains the most recent and relevant information

## Agent-Specific Usage

### Dev Agent
- Records observations about implementation challenges
- Tracks decisions on technical approaches
- Documents blockers like missing dependencies
- Stores key facts about code patterns and solutions

### QA Agent
- Records observations about test failures and quality issues
- Tracks decisions on testing strategies
- Documents blockers preventing test completion
- Stores key facts about recurring bugs or patterns

### SM Agent
- Records observations about team progress
- Tracks decisions on sprint planning
- Documents blockers affecting team velocity
- Stores key facts about process improvements

## Best Practices

1. **Be Specific**: Include relevant details in observations and decisions
2. **Update Context**: Ensure currentContext reflects the active work
3. **Regular Updates**: Persist memory after significant actions
4. **Use Key Facts**: Store reusable knowledge as key facts
5. **Resolve Blockers**: Update blocker status when resolved

## Memory Hygiene

Memory hygiene runs automatically after each update to:
- Archive old observations to long-term memory
- Maintain performance by keeping working memory lean
- Ensure memory limits are respected
- Preserve important information in long-term storage