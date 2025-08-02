# BMad Memory System: Detailed Guide

## Overview

BMad uses a dual-memory architecture to reduce hallucination and improve code accuracy:
- **Short-Term Memory (Working Memory)**: Session-specific context in JSON files
- **Long-Term Memory (Pattern Memory)**: Reusable knowledge in Qdrant vector database

## What Goes Into Each Memory Type

### Short-Term Memory (Working Memory)

**Purpose**: Immediate session context and current task state

**Contents**:
- **Current Context**: Active story ID, epic ID, task ID
- **Observations**: Recent findings, test results, build outputs
- **Decisions**: Technical choices made during current session
- **Key Facts**: Important discoveries (e.g., "API requires auth header")
- **Blockers**: Current issues preventing progress
- **Plan**: Current task steps and progress
- **Completed Tasks**: Recent task completions in this session

**Example Short-Term Memory Entry**:
```json
{
  "currentContext": {
    "storyId": "STORY-001",
    "epicId": "EPIC-1",
    "taskId": "implement-login"
  },
  "observations": [
    {
      "timestamp": "2025-08-01T14:00:00Z",
      "content": "All unit tests passing for auth module",
      "context": { "file": "src/auth/auth.test.js" }
    }
  ],
  "decisions": [
    {
      "decision": "Use bcrypt for password hashing",
      "reasoning": "Industry standard, already in package.json",
      "timestamp": "2025-08-01T14:05:00Z"
    }
  ],
  "keyFacts": {
    "auth_library": "passport-local",
    "hash_rounds": "10",
    "session_store": "redis"
  }
}
```

### Long-Term Memory (Pattern Memory)

**Purpose**: Reusable patterns, learned knowledge, and historical context

**Contents**:
- **Implementation Patterns**: Successful code patterns (e.g., "error handling pattern")
- **Technical Decisions**: Major architecture choices with full rationale
- **QA Patterns**: Common issues and their fixes
- **Story Completions**: Full story implementation summaries
- **Bug Solutions**: How specific bugs were resolved
- **Performance Optimizations**: Successful optimization strategies
- **Security Patterns**: Security best practices discovered

**Example Long-Term Memory Entry**:
```json
{
  "type": "implementation-pattern",
  "content": {
    "pattern": "JWT Authentication Flow",
    "description": "Standard JWT implementation with refresh tokens",
    "codeSnippet": "const jwt = require('jsonwebtoken')...",
    "files": ["src/auth/jwt.js", "src/middleware/auth.js"],
    "techStack": ["express", "jsonwebtoken", "redis"],
    "challenges": ["Token expiration handling"],
    "solutions": ["Implemented refresh token rotation"]
  },
  "metadata": {
    "timestamp": "2025-08-01T15:00:00Z",
    "importance": "high",
    "tags": ["auth", "security", "jwt"],
    "agentName": "dev",
    "storyId": "AUTH-001"
  }
}
```

## Where Memory is Stored

### Short-Term Memory Storage

Short-term memory is saved in **JSON files** in the `.ai/` directory of your project:

```
Your Project Root/
├── .ai/                             # Memory storage directory
│   ├── working_memory_dev.json      # Dev agent's short-term memory
│   ├── working_memory_qa.json       # QA agent's short-term memory
│   ├── working_memory_sm.json       # SM agent's short-term memory
│   ├── working_memory_analyst.json  # Analyst's short-term memory
│   ├── working_memory_pm.json       # PM's short-term memory
│   ├── working_memory_architect.json # Architect's short-term memory
│   ├── working_memory_po.json       # PO's short-term memory
│   ├── working_memory_ux-expert.json # UX Expert's short-term memory
│   └── memory-usage.log             # Log of all memory operations
```

### Long-Term Memory Storage

Long-term memory is stored in **Qdrant vector database**:
- Default location: `localhost:6333`
- Collection name: `bmad_memory`
- Uses semantic search for retrieval

### Important Directory Structure

When BMad is installed in your project:
```bash
/Users/you/your-project/
├── .ai/                           # Short-term memory storage (YOUR project)
│   ├── working_memory_*.json      # Agent working memory files
│   └── memory-usage.log           # Memory operation logs
├── .bmad-core/                    # BMad installation (hidden directory)
│   ├── agents/                    # Agent definitions
│   ├── utils/                     # Memory utilities
│   └── ...                        # Other BMad files
├── src/                           # Your project source code
├── docs/                          # Your project documentation
└── package.json                   # Your project config
```

**Key Points**:
- Memory files are in `.ai/` in YOUR project root (not in .bmad-core)
- BMad files are in `.bmad-core/` (hidden directory)
- The `.ai/` directory is created automatically when agents first use memory
- Memory always uses the current working directory (where you run commands from)

## Memory Limits and Retention

### Short-Term Memory Limits
- **Observations**: 50 most recent
- **Decisions**: 100 most recent
- **Key Facts**: 200 maximum
- **Blockers**: 50 maximum
- **Completed Tasks**: 100 most recent

When limits are reached, oldest items are automatically removed.

### Long-Term Memory Retention
- **Default**: 30 days
- **Archive**: 90 days
- **Can be configured** in environment variables

## How Memory Improves Development

### 1. Consistency Across Sessions
- Agents remember technology choices
- Coding patterns remain consistent
- No contradictory implementations

### 2. Learning from Experience
- QA patterns help prevent repeat bugs
- Successful solutions are reused
- Performance optimizations are remembered

### 3. Context Preservation
- No need to re-read all documents
- Story context is maintained
- Progress isn't lost between sessions

## Memory Operations

### Reading Memory
Agents automatically:
1. Load working memory on activation
2. Retrieve relevant long-term memories
3. Get recommendations based on context

### Writing Memory
Agents automatically:
1. Update working memory during tasks
2. Save important patterns to long-term memory
3. Archive completed work

### Memory Logs
Check `.ai/memory-usage.log` to see all memory operations:
```json
{"timestamp":"2025-08-01T14:30:00.123Z","agent":"dev","type":"working_memory","operation":"update_decision"}
{"timestamp":"2025-08-01T14:30:15.456Z","agent":"dev","type":"long_term_memory","operation":"save_pattern"}
{"timestamp":"2025-08-01T14:30:30.789Z","agent":"qa","type":"memory_retrieval","operation":"search_patterns"}
```

## Monitoring Memory Usage

### Agent Commands
- `*memory-status` - View current memory statistics
- `*recall-context` - Search for relevant memories

### Memory Statistics
The memory log tracks:
- Total operations per agent
- Operation types and frequency
- Error rates
- Memory size trends

## Troubleshooting

### Memory Not Persisting
1. Check `.ai/` directory exists and is writable
2. Verify agent initialization includes memory setup
3. Check memory-usage.log for errors

### Long-Term Memory Not Working
1. Ensure Qdrant is running: `docker ps | grep qdrant`
2. Check connection: `curl localhost:6333/collections`
3. Verify collection exists: `bmad_memory`

### Memory Growing Too Large
1. Working memory auto-trims at limits
2. Use memory hygiene functions if needed
3. Adjust retention settings if necessary

## Best Practices

1. **Let agents manage memory automatically** - Don't manually edit memory files
2. **Monitor memory logs** - Check for errors or unusual patterns
3. **Ensure Qdrant is running** - For best long-term memory performance
4. **Back up `.ai/` directory** - Preserve important session context
5. **Clear memory between projects** - Avoid context contamination

## Configuration

Memory settings in `bmad-core/utils/memory-config.js`:
```javascript
MAX_OBSERVATIONS: 50
MAX_DECISIONS: 100
MAX_KEY_FACTS: 200
MEMORY_RETENTION_DAYS: 30
```

Environment variables:
```bash
BMAD_MEMORY_DIR=/custom/path/.ai
BMAD_MAX_OBSERVATIONS=100
BMAD_MEMORY_RETENTION_DAYS=60
```

## Summary

The dual-memory system ensures:
- **No context loss** between sessions
- **Consistent implementations** across stories
- **Learning from experience** through pattern recognition
- **Reduced hallucination** with ground truth from actual work

This is why BMad agents can maintain context like "we're using JWT" or "bcrypt for passwords" across multiple development sessions, leading to more reliable and consistent code generation.