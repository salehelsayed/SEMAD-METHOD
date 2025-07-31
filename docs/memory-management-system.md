# BMAD Memory Management System

## Overview

The BMAD (Breakthrough Method of Agile AI-driven Development) framework includes a comprehensive memory management system that provides unified memory utilization and hygiene across all agents and tasks. This system ensures that agents maintain context continuity, share relevant information, and manage memory resources efficiently.

## Key Features

### 1. Unified Memory Interface
- **Consistent API**: All agents use the same memory loading and saving interface
- **Automatic Integration**: Structured tasks automatically include memory management actions  
- **Context Preservation**: Memory context is maintained across agent invocations

### 2. Multi-Layer Memory Architecture
- **Short-term Memory**: Agent working memory stored in `.ai/` directory
- **Long-term Memory**: Vector-based storage in Qdrant for cross-agent context sharing
- **Archive Memory**: Compressed historical data for long-term retention

### 3. Intelligent Memory Hygiene
- **Automatic Cleanup**: Configurable retention policies prevent memory bloat
- **Smart Summarization**: Old memories are summarized before archival
- **Resource Management**: Memory usage monitoring and optimization

### 4. Cross-Agent Context Sharing
- **Inter-agent Continuity**: Agents can access relevant context from other agents
- **Story/Epic Tagging**: Memories are tagged with story and epic IDs for context retrieval
- **Role-based Memory**: Agent-specific memory patterns and retrieval

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Memory Management Layer                   │
├─────────────────────────────────────────────────────────────┤
│  Unified Memory Manager                                     │
│  ├── Memory Configuration Loader                           │
│  ├── Short-term Memory Operations                          │
│  ├── Long-term Memory Operations                           │
│  └── Memory Hygiene Engine                                 │
├─────────────────────────────────────────────────────────────┤
│  Agent Memory Manager                                       │
│  ├── Working Memory CRUD                                   │
│  ├── Context Validation                                    │
│  ├── Transaction Management                                │
│  └── Backup/Recovery                                       │
├─────────────────────────────────────────────────────────────┤
│  Agent Runner                                               │
│  ├── Memory Lifecycle Orchestration                       │
│  ├── Task Context Enrichment                              │
│  └── Error Recovery                                        │
└─────────────────────────────────────────────────────────────┘
           │                             │
           ▼                             ▼
    ┌─────────────┐              ┌─────────────┐
    │ File System │              │   Qdrant    │
    │  (.ai/ dir) │              │ Vector DB   │
    │             │              │             │
    │ Short-term  │              │ Long-term   │
    │   Memory    │              │   Memory    │
    └─────────────┘              └─────────────┘
```

### Memory Types

#### Short-term Memory (Working Memory)
- **Location**: `.ai/working_memory_{agentName}.json`
- **Content**: Current session observations, decisions, key facts, plan state
- **Lifecycle**: Session-based, cleaned according to retention policies
- **Access**: Direct file operations with atomic updates

#### Long-term Memory (Persistent Context)  
- **Location**: Qdrant vector database
- **Content**: Summarized memories, significant findings, cross-agent context
- **Lifecycle**: Persistent with configurable archival policies
- **Access**: Vector similarity search with metadata filtering

#### Archive Memory
- **Location**: `.ai/archive/` directory
- **Content**: Compressed historical memories beyond retention period
- **Lifecycle**: Long-term storage with optional auto-deletion
- **Access**: Read-only for historical analysis

## Configuration

### Core Configuration (`bmad-core/core-config.yaml`)

```yaml
memory:
  enabled: true
  baseDirectory: ".ai"
  retentionPolicies:
    workingMemory:
      maxAgeDays: 7           # Auto-cleanup after 7 days
      maxObservations: 100    # Limit observations per agent
      maxDecisions: 50        # Limit decisions per agent  
      maxKeyFacts: 200        # Limit key facts per agent
      maxBlockers: 25         # Limit blockers per agent
      autoCleanup: true       # Enable automatic cleanup
    longTermMemory:
      maxAgeDays: 90          # Archive after 90 days
      autoArchive: true       # Enable automatic archiving
      summarizationThreshold: 1000  # Summarize when content exceeds threshold
      compressionEnabled: true      # Enable memory compression
    archiveMemory:
      maxAgeDays: 365         # Delete archives after 1 year
      autoDelete: false       # Manual archive deletion only
  hygiene:
    enableAutoSummarization: true
    summarizationInterval: "daily"      # daily, weekly, monthly
    cleanupSchedule: "0 2 * * *"        # Cron expression for cleanup
    maxMemorySize: "100MB"              # Total memory size limit
  tagging:
    includeStoryId: true      # Tag memories with story IDs
    includeEpicId: true       # Tag memories with epic IDs  
    includeAgentRole: true    # Tag memories with agent roles
    includeTimestamp: true    # Include timestamp in all memories
    customTags: []            # Additional custom tags
  qdrant:
    enabled: true
    host: "localhost"
    port: 6333
    collection: "bmad_agent_memory"
    vectorSize: 384
    healthCheckInterval: 30000
```

## Usage

### For Structured Tasks

Structured tasks automatically include memory management through standardized actions:

#### Load Memory Action (Added to task start)
```yaml
- description: "Load agent working memory and relevant long-term context"
  elicit: false
  function: "loadMemoryForTask"
  parameters:
    agentName: "{{AGENT_NAME}}"
    context:
      taskId: "{{TASK_ID}}"
      storyId: "{{STORY_ID}}"
      epicId: "{{EPIC_ID}}"
      taskType: "{{TASK_TYPE}}"
  metadata:
    memoryAction: true
    executionOrder: "first"
```

#### Save Memory Action (Added to task end)
```yaml
- description: "Save task completion and findings to working memory"
  elicit: false
  function: "saveAndCleanMemory"
  parameters:
    agentName: "{{AGENT_NAME}}"
    taskData:
      observation: "{{TASK_OBSERVATION}}"
      significantFinding: "{{SIGNIFICANT_FINDING}}"
      taskCompleted: true
      taskId: "{{TASK_ID}}"
  metadata:
    memoryAction: true
    executionOrder: "last"
```

### For Agent Runners

```javascript
const AgentRunner = require('./bmad-core/utils/agent-runner');

const runner = new AgentRunner({ memoryEnabled: true });

// Execute task with automatic memory management
const result = await runner.executeWithMemory(
  'dev',                    // Agent name
  'implement-feature',      // Task ID
  {                         // Context
    storyId: 'story-123',
    epicId: 'epic-456'
  },
  async (enrichedContext) => {  // Task executor
    // enrichedContext includes memory context
    const { memory, storyId, agentName } = enrichedContext;
    
    // Access previous observations
    const previousWork = memory.shortTerm?.observations || [];
    const relevantMemories = memory.longTerm || [];
    
    // Perform task work...
    
    return {
      success: true,
      observation: 'Feature implemented successfully',
      significantFinding: 'Discovered new optimization pattern',
      decision: 'Used caching strategy for performance'
    };
  }
);
```

### Direct Memory Operations

```javascript
const { 
  loadMemoryForTask, 
  saveAndCleanMemory,
  getMemoryStatus 
} = require('./bmad-core/utils/unified-memory-manager');

// Load memory for agent
const memoryContext = await loadMemoryForTask('sm', {
  taskId: 'create-story',
  storyId: 'story-123',
  epicId: 'epic-456'
});

// Save task results
const saveResult = await saveAndCleanMemory('sm', {
  observation: 'Story created with comprehensive requirements',
  significantFinding: 'Identified need for new authentication component',
  taskCompleted: true,
  taskId: 'create-story',
  context: { storyId: 'story-123' }
});

// Check memory status
const status = await getMemoryStatus('sm');
console.log(`Agent has ${status.workingMemory.observationCount} observations`);
```

## Memory Tagging Conventions

### Standard Tags
- `agent`: Agent name (sm, dev, qa, architect, etc.)
- `storyId`: Story identifier for context grouping
- `epicId`: Epic identifier for broader context
- `timestamp`: ISO timestamp of memory creation
- `type`: Memory type (observation, decision, significant-finding, etc.)

### Context-Specific Tags
- `taskId`: Specific task identifier
- `taskType`: Category of task (story-creation, implementation, review, etc.)
- `priority`: Task priority level
- `status`: Current status (in-progress, completed, blocked)

### Usage in Queries
```javascript
// Find memories related to specific story
const storyMemories = await retrieveRelevantMemories('dev', 'authentication implementation', {
  storyId: 'story-123',
  topN: 5
});

// Find cross-agent memories for epic
const epicContext = await retrieveRelevantMemories('qa', 'testing patterns', {
  epicId: 'epic-456',
  topN: 10
});
```

## Best Practices

### 1. Memory Content Guidelines
- **Observations**: Record specific actions, findings, and state changes
- **Decisions**: Document choices made with reasoning
- **Key Facts**: Store reusable information that may be needed later
- **Significant Findings**: Highlight important discoveries or patterns

### 2. Context Management
- Always include story/epic IDs when available
- Use descriptive task IDs that indicate the work being done
- Provide task types to help with memory categorization

### 3. Performance Optimization
- Configure retention policies based on project size and activity level
- Enable memory compression for long-term storage
- Monitor memory usage and adjust limits as needed

### 4. Error Handling
- Memory system failures should not prevent task execution
- Implement graceful degradation when memory is unavailable
- Use backup and recovery mechanisms for critical memories

## Memory Lifecycle

### 1. Task Initialization
```
Agent Task Started
       ↓
Load Working Memory (.ai/ directory)
       ↓
Query Long-term Memory (Qdrant)
       ↓
Enrich Task Context
       ↓
Execute Task with Memory Context
```

### 2. Task Execution
```
Task Processing
       ↓
Record Observations
       ↓
Make Decisions (with reasoning)
       ↓
Capture Key Facts
       ↓
Identify Significant Findings
```

### 3. Task Completion
```
Task Finished
       ↓
Save Observations to Working Memory
       ↓
Store Significant Findings in Long-term Memory
       ↓
Archive Completed Task Context
       ↓
Perform Memory Hygiene Cleanup
```

### 4. Memory Hygiene Cycle
```
Scheduled Cleanup (e.g., daily at 2 AM)
       ↓
Check Retention Policies
       ↓
Summarize Old Observations
       ↓
Archive to Long-term Memory
       ↓
Compress and Store Archives
       ↓
Clean Up Expired Memory
```

## Troubleshooting

### Common Issues

#### Memory Loading Failures
```bash
# Check memory directory permissions
ls -la .ai/

# Verify configuration
cat bmad-core/core-config.yaml | grep -A 20 memory:

# Test Qdrant connection
curl http://localhost:6333/health
```

#### Memory Corruption
```bash
# Backup corrupted memory
cp .ai/working_memory_agent.json .ai/backups/

# Reset agent memory (will reinitialize)
rm .ai/working_memory_agent.json

# Check memory integrity
node -e "JSON.parse(require('fs').readFileSync('.ai/working_memory_agent.json'))"
```

#### Performance Issues
```bash
# Check memory usage
du -sh .ai/

# Monitor Qdrant performance
curl http://localhost:6333/metrics

# Review retention policies
# Reduce maxObservations, maxDecisions if memory grows too large
```

### Debug Mode

Enable detailed memory logging:
```yaml
memory:
  debug: true
  verboseLogging: true
```

Set environment variables:
```bash
export BMAD_DEBUG=true
export BMAD_LOG_MEMORY_OPERATIONS=true
```

## Integration Examples

### Example 1: Story Creation Flow
```javascript
// SM creates story with full memory context
const smResult = await runner.executeWithMemory('sm', 'create-story', {
  epicId: 'epic-auth',
  storyId: 'story-login'
}, async (context) => {
  // Access previous epic work
  const epicMemories = context.memory.longTerm.filter(m => 
    m.epicId === 'epic-auth'
  );
  
  return {
    success: true,
    observation: 'Created comprehensive login story',
    significantFinding: 'Story requires OAuth2 integration',
    keyFact: {
      key: 'auth-requirements',
      content: 'Must support Google, GitHub, and email/password login'
    }
  };
});
```

### Example 2: Cross-Agent Context Sharing
```javascript
// Dev accesses SM context when implementing
const devResult = await runner.executeWithMemory('dev', 'implement-login', {
  storyId: 'story-login'
}, async (context) => {
  // Access SM's decisions and requirements
  const smContext = context.memory.longTerm.filter(m => 
    m.agent === 'sm' && m.storyId === 'story-login'
  );
  
  const requirements = smContext.find(m => 
    m.type === 'key-fact' && m.content.includes('auth-requirements')
  );
  
  return {
    success: true,
    observation: 'Implemented login with OAuth2 support',
    decision: 'Used Passport.js for authentication strategy'
  };
});
```

### Example 3: QA Review with Full Context
```javascript
// QA reviews with access to both SM and Dev context
const qaResult = await runner.executeWithMemory('qa', 'review-login', {
  storyId: 'story-login'
}, async (context) => {
  // Access both SM requirements and Dev implementation notes
  const storyContext = context.memory.longTerm.filter(m => 
    m.storyId === 'story-login'
  );
  
  const requirements = storyContext.filter(m => m.agent === 'sm');
  const implementation = storyContext.filter(m => m.agent === 'dev');
  
  return {
    success: true,
    observation: 'Reviewed login implementation against requirements',
    decision: 'Approved - all OAuth2 providers working correctly'
  };
});
```

## Testing

### Unit Tests
```bash
# Run memory management unit tests
npm test tests/unified-memory-manager.test.js
npm test tests/agent-runner.test.js
```

### Integration Tests
```bash
# Run end-to-end memory integration tests
npm test tests/integration/memory-integration.test.js
```

### Manual Testing
```bash
# Test memory system manually
node -e "
const runner = require('./bmad-core/utils/agent-runner');
const r = new runner();
r.executeWithMemory('test', 'manual-test', {}, async () => ({ success: true }))
  .then(console.log);
"
```

## Migration Guide

### From Legacy Memory System

1. **Update Configuration**: Add memory section to `core-config.yaml`
2. **Update Structured Tasks**: Run the migration script:
   ```bash
   node scripts/update-tasks-with-memory.js
   ```
3. **Update Agent Integrations**: Replace direct memory calls with AgentRunner
4. **Test**: Run integration tests to verify functionality

### Configuration Migration
```yaml
# Old configuration (deprecated)
devDebugLog: .ai/debug-log.md

# New configuration (recommended)
memory:
  enabled: true
  baseDirectory: ".ai"
  # ... full configuration as shown above
```

---

This memory management system provides a robust foundation for maintaining context and continuity across the BMAD framework, enabling more intelligent and context-aware agent operations.