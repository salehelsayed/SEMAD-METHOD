# Memory Hygiene Guide

## Overview

Memory hygiene is a critical system feature that automatically manages agent short-term memory to prevent hallucination and confusion while maintaining essential context. The system automatically archives outdated entries to long-term storage and prunes working memory based on configurable retention policies.

## How Memory Hygiene Prevents Hallucination

### The Problem
Without proper memory management, agents can experience:
- **Context Overflow**: Too much information in short-term memory leads to difficulty focusing on current tasks
- **Outdated Context**: Old, irrelevant information influences current decisions inappropriately
- **Memory Fragmentation**: Inconsistent or contradictory information from different time periods
- **Performance Degradation**: Large memory files slow down context retrieval and processing

### The Solution
Memory hygiene addresses these issues by:
1. **Automatic Cleanup**: Periodically reviewing and pruning outdated entries
2. **Intelligent Archival**: Summarizing old information before deletion and storing it in long-term memory
3. **Context Preservation**: Retaining critical facts and active blockers while removing noise
4. **Size Management**: Enforcing configurable limits on different memory sections

## Configuration

Memory hygiene is configured in `bmad-core/core-config.yaml` under the `memory.hygiene` section:

```yaml
memory:
  hygiene:
    enableAutoCleanup: true              # Enable automatic cleanup
    enableAutoSummarization: true        # Create summaries before deletion
    summarizationInterval: "daily"       # How often to create summaries
    cleanupSchedule: "0 2 * * *"        # Cron schedule for cleanup
    maxMemorySize: "100MB"              # Maximum memory file size
    
    workingMemoryLimits:
      maxObservations: 100              # Maximum observations to keep
      maxDecisions: 50                  # Maximum decisions to keep
      maxKeyFacts: 200                  # Maximum key facts to keep
      maxBlockers: 25                   # Maximum blockers to keep
      maxAgeHours: 168                  # Maximum age (7 days) before cleanup
    
    cleanupTriggers:
      runAfterEachAction: true          # Cleanup after every memory update
      runOnMemoryThreshold: 0.8         # Cleanup when 80% of limits reached
      runOnAgeThreshold: true           # Cleanup based on age limits
    
    archivalRules:
      summarizeBeforeDelete: true       # Create summaries before deletion
      retainCriticalFacts: true         # Keep facts marked as critical
      preserveActiveBlockers: true      # Don't archive unresolved blockers
      minimumEntriesBeforeCleanup: 10   # Minimum entries required before cleanup
```

## Memory Sections and Cleanup Logic

### Observations
- **Cleanup Strategy**: Remove oldest entries first
- **Archival**: Summarize observations by timestamp and context
- **Preservation**: Recent observations (last 20% of limit) are always preserved

### Decisions
- **Cleanup Strategy**: Remove oldest decisions with minimal reasoning
- **Archival**: Include decision rationale in archived summaries
- **Preservation**: Decisions with detailed reasoning are prioritized for retention

### Key Facts
- **Cleanup Strategy**: Archive non-critical facts first
- **Archival**: Preserve fact relationships and context
- **Preservation**: Facts marked as `critical: true` or `importance: 'high'` are retained

### Blockers
- **Cleanup Strategy**: Archive resolved blockers, preserve active ones
- **Archival**: Include resolution details and timelines
- **Preservation**: Unresolved blockers are never archived automatically

## Cleanup Process

### 1. Analysis Phase
The system analyzes current memory usage:
```javascript
const analysis = analyzeMemoryUsage(workingMemory, config);
// Returns: usage ratios, age analysis, cleanup recommendations
```

### 2. Archival Phase
Before deletion, entries are archived to long-term storage:
- **Session Summaries**: High-level overview of agent session
- **Structured Archives**: Detailed entries organized by type and context
- **Metadata Tagging**: Stories, epics, timestamps, and agent information

### 3. Cleanup Phase
Outdated entries are removed from working memory:
- **Selective Removal**: Only non-critical, old entries are removed
- **Context Preservation**: Current story/epic context is always preserved
- **Graceful Degradation**: Cleanup failures don't break agent functionality

### 4. Verification Phase
The system verifies cleanup success:
- **Size Validation**: Ensures memory limits are respected
- **Context Integrity**: Verifies essential context remains intact
- **Error Handling**: Logs and reports any cleanup issues

## Memory Retrieval Integration

Agents now query both short-term and long-term memory:

```javascript
const memories = await retrieveRelevantMemories(agentName, query, {
  storyId: 'current-story',
  topN: 10,
  shortTermOnly: false,  // Include both sources
  longTermOnly: false    // Include both sources
});

// Returns structured result:
// {
//   shortTerm: { observations: [], decisions: [], keyFacts: [], blockers: [], plan: [] },
//   longTerm: [],
//   combined: [],  // Merged and sorted by relevance
//   query: "search terms",
//   timestamp: "2024-01-01T00:00:00.000Z"
// }
```

## Manual Operations

### Trigger Manual Cleanup
```javascript
const agentMemoryManager = require('./bmad-core/utils/agent-memory-manager');

// Force cleanup for specific agent
const results = await agentMemoryManager.performAgentMemoryHygiene('sm', {
  force: true
});
```

### Check Memory Status
```javascript
const { getMemoryHygieneStatus } = require('./bmad-core/utils/memory-hygiene');

const status = await getMemoryHygieneStatus('dev');
// Returns: usage analysis, cleanup recommendations, configuration
```

### Query Memory Sources
```javascript
// Query only short-term memory
const shortTerm = await retrieveRelevantMemories('qa', 'test results', {
  shortTermOnly: true
});

// Query only long-term memory
const longTerm = await retrieveRelevantMemories('qa', 'test results', {
  longTermOnly: true
});
```

## Recommended Settings

### Development Environment
```yaml
workingMemoryLimits:
  maxObservations: 50    # Smaller limits for faster feedback
  maxDecisions: 25
  maxKeyFacts: 100
  maxBlockers: 15
  maxAgeHours: 48        # 2 days
cleanupTriggers:
  runOnMemoryThreshold: 0.7  # More aggressive cleanup
```

### Production Environment
```yaml
workingMemoryLimits:
  maxObservations: 150   # Larger limits for complex projects
  maxDecisions: 75
  maxKeyFacts: 300
  maxBlockers: 40
  maxAgeHours: 336       # 14 days
cleanupTriggers:
  runOnMemoryThreshold: 0.85  # Less aggressive cleanup
```

### High-Volume Environment
```yaml
workingMemoryLimits:
  maxObservations: 75    # Balanced limits
  maxDecisions: 40
  maxKeyFacts: 150
  maxBlockers: 20
  maxAgeHours: 72        # 3 days
cleanupTriggers:
  runAfterEachAction: false    # Cleanup on schedule only
  runOnMemoryThreshold: 0.9
archivalRules:
  minimumEntriesBeforeCleanup: 20  # Allow more buildup before cleanup
```

## Troubleshooting

### Common Issues

#### Memory Not Cleaning Up
1. Check if `enableAutoCleanup` is set to `true`
2. Verify memory usage is above `runOnMemoryThreshold`
3. Ensure minimum entry requirements are met
4. Check for Qdrant connectivity issues

#### Long-Term Memory Not Accessible
1. Verify Qdrant is running and accessible
2. Check collection configuration in core-config.yaml
3. Validate network connectivity to Qdrant host/port
4. Review archival logs for storage failures

#### Performance Issues
1. Reduce `maxObservations` and other limits
2. Increase `runOnMemoryThreshold` to cleanup less frequently
3. Set `runAfterEachAction: false` for batch processing
4. Monitor disk space and Qdrant performance

### Debugging Commands

```bash
# Check memory files
ls -la .ai/working_memory_*.json

# View recent cleanup activity
grep "Memory hygiene" .ai/memory-debug.log

# Test Qdrant connectivity
curl http://localhost:6333/health
```

### Configuration Validation

The system validates configuration on startup:
- Ensures all required fields are present
- Validates numeric limits are positive
- Checks cron schedule syntax
- Verifies Qdrant connection settings

## Best Practices

1. **Start Conservative**: Begin with smaller limits and increase as needed
2. **Monitor Performance**: Watch for cleanup frequency and duration
3. **Preserve Critical Context**: Mark important facts as critical
4. **Regular Archival**: Don't disable summarization - it prevents data loss
5. **Environment-Specific Settings**: Tune settings based on project complexity
6. **Backup Strategy**: Ensure Qdrant data is backed up for long-term memory preservation

## Integration Points

Memory hygiene integrates with:
- **Agent Memory Manager**: Automatic cleanup after memory updates
- **Task Runner**: Cleanup scheduling and execution
- **Qdrant**: Long-term storage and retrieval
- **Memory Health Monitor**: Status reporting and alerts
- **Structured Tasks**: Memory operations in workflows

This system ensures agents maintain focused, relevant context while preserving important historical information for future reference.