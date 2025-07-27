# Working Memory & Scratchboard Implementation

## Overview

This implementation adds working memory and scratchboard functionality to all BMAD agents, enabling them to maintain context across sessions and learn from previous interactions.

## Components Implemented

### 1. Core Memory Functions (`bmad-core/agents/index.js`)

- **initializeWorkingMemory(agentName)**: Creates a new memory file for an agent session
- **updateWorkingMemory(agentName, updates)**: Updates the agent's working memory with new information
- **recordObservation(agentName, stepId, observation)**: Records observations during task execution
- **getWorkingMemory(agentName)**: Retrieves the current working memory state

### 2. Qdrant Integration (`bmad-core/utils/qdrant.js`)

- **storeMemorySnippet(agentName, text, metadata)**: Stores text snippets as vector embeddings
- **retrieveMemory(query, topN)**: Performs similarity search to retrieve relevant memories
- Uses a simple hash-based embedding for demonstration (replace with proper embeddings in production)

### 3. Memory Tasks

#### update-working-memory.yaml
- Updates agent's working memory during task execution
- Accepts taskId, currentStep, plan, and context updates
- Preserves existing data while merging new information

#### retrieve-context.yaml
- Retrieves relevant context from long-term memory
- Uses Qdrant similarity search
- Returns top N matching memories with relevance scores

### 4. Enhanced Workflows

Modified the following tasks to include memory functionality:
- **create-next-story.yaml**: Initializes memory, retrieves previous context, updates progress, stores completion
- **review-story.yaml**: Loads QA review patterns, records findings for future reviews

## Usage Examples

### Initialize Memory for Agent Session
```javascript
const { initializeWorkingMemory } = require('./bmad-core/agents');
await initializeWorkingMemory('dev');
```

### Update Working Memory
```javascript
await updateWorkingMemory('dev', {
  taskId: 'TASK-123',
  currentStep: 'implementation',
  context: { feature: 'authentication' }
});
```

### Store Long-term Memory
```javascript
await storeMemorySnippet('dev', 'Implemented user authentication using JWT', {
  type: 'implementation',
  epic: 'security'
});
```

### Retrieve Relevant Context
```javascript
const memories = await retrieveMemory('authentication implementation', 5);
// Returns top 5 relevant memories
```

## Memory File Structure

Working memory files are stored in `bmad-core/ai/` with the naming pattern `working_memory_{agentName}.json`:

```json
{
  "taskId": "TASK-123",
  "plan": ["analyze", "implement", "test"],
  "currentStep": "implement",
  "context": {
    "feature": "authentication",
    "epic": "security"
  },
  "observations": [
    {
      "stepId": "analyze",
      "observation": "Found existing auth framework",
      "timestamp": "2025-01-07T..."
    }
  ]
}
```

## Testing

Run tests with:
```bash
npm test                  # Run all tests
npm run test:memory      # Run only memory tests
npm run test:watch       # Run tests in watch mode
```

## Future Enhancements

1. **Real Embeddings**: Replace hash-based embeddings with proper text embeddings (OpenAI, HuggingFace, etc.)
2. **Automatic Memory Cleanup**: Implement memory pruning for old/irrelevant memories
3. **Memory Sharing**: Allow agents to share memories for collaborative learning
4. **Memory Visualization**: Create tools to visualize and manage agent memories
5. **Advanced Retrieval**: Implement more sophisticated retrieval strategies (hybrid search, re-ranking)

## Prerequisites

- Qdrant running locally on port 6333
- Node.js 20+
- @qdrant/js-client-rest package installed

## Integration Notes

- Memory functionality is optional - agents will function normally if Qdrant is unavailable
- Memory files are gitignored by default (add `bmad-core/ai/` to .gitignore)
- Each agent maintains its own memory namespace
- Memory updates are asynchronous and non-blocking