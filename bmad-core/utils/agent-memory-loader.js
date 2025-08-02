/**
 * Agent Memory Loader for BMAD Agents
 * Loads both short-term and long-term memory during agent activation
 */

// Import functions dynamically to avoid circular dependencies
const getMemoryManager = () => require('./agent-memory-manager');
const { 
  retrieveAgentStoryMemory, 
  retrieveAgentEpicMemory,
  retrieveTaskMemory,
  closeConnections 
} = require('./qdrant');
const { withTimeout } = require('./timeout-wrapper');
const {
  logMemoryInit,
  logMemoryRetrieval,
  logMemoryError,
  logLongTermMemory
} = require('./memory-usage-logger');
const { MemoryError, handleCriticalMemoryError, validateMemoryResult } = require('./memory-error-handler');

/**
 * Load comprehensive memory context for agent activation
 * @param {string} agentName - The name of the agent (sm, dev, qa)
 * @param {Object} context - Activation context
 * @param {string} context.storyId - Current story ID
 * @param {string} context.epicId - Current epic ID
 * @param {string} context.taskId - Current task ID
 * @param {boolean} context.loadLongTerm - Whether to load long-term memories
 * @returns {Object} Complete memory context for agent
 */
async function loadAgentMemoryContextInternal(agentName, context = {}) {
  try {
    const { storyId, epicId, taskId, loadLongTerm = true } = context;
    
    console.log(`Loading memory context for agent: ${agentName}`);
    
    // Log memory initialization start
    await logMemoryInit(agentName, 'load_context_start', { 
      storyId, 
      epicId, 
      taskId, 
      loadLongTerm 
    });
    
    // Load or initialize working memory
    const { loadWorkingMemory, initializeWorkingMemory, getMemorySummary } = getMemoryManager();
    let workingMemory = await loadWorkingMemory(agentName);
    if (!workingMemory) {
      console.log(`No existing working memory found, initializing new memory for ${agentName}`);
      await logMemoryInit(agentName, 'initialize_working_memory', { storyId, epicId, taskId });
      workingMemory = await initializeWorkingMemory(agentName, { storyId, epicId, taskId });
    } else {
      console.log(`Loaded existing working memory for ${agentName}`);
      await logMemoryInit(agentName, 'load_existing_working_memory', { 
        observationCount: workingMemory.observations?.length || 0,
        existingContext: workingMemory.currentContext
      });
      // Update context if provided
      if (storyId || epicId || taskId) {
        workingMemory.currentContext = {
          ...workingMemory.currentContext,
          ...(storyId && { storyId }),
          ...(epicId && { epicId }),
          ...(taskId && { taskId })
        };
      }
    }
    
    // Load long-term memories if requested
    let longTermMemories = [];
    if (loadLongTerm) {
      console.log(`Loading long-term memories for ${agentName}`);
      await logMemoryRetrieval(agentName, 'load_long_term_start', 'context-based search', 0, {
        context: workingMemory.currentContext
      });
      longTermMemories = await loadRelevantLongTermMemories(agentName, workingMemory.currentContext);
      await logMemoryRetrieval(agentName, 'load_long_term_complete', 'context-based search', longTermMemories.length, {
        context: workingMemory.currentContext
      });
    }
    
    // Get memory summary
    const memorySummary = await getMemorySummary(agentName);
    
    const memoryContext = {
      agentName,
      loadedAt: new Date().toISOString(),
      workingMemory,
      longTermMemories,
      memorySummary,
      context: workingMemory.currentContext,
      recommendations: generateMemoryRecommendations(workingMemory, longTermMemories)
    };
    
    console.log(`Memory context loaded for ${agentName}:`, {
      workingMemoryFound: !!workingMemory,
      observationCount: workingMemory.observations?.length || 0,
      longTermMemoryCount: longTermMemories.length,
      currentContext: workingMemory.currentContext
    });
    
    // Log successful memory context load
    await logMemoryInit(agentName, 'load_context_complete', {
      workingMemoryFound: !!workingMemory,
      observationCount: workingMemory.observations?.length || 0,
      longTermMemoryCount: longTermMemories.length,
      recommendationCount: memoryContext.recommendations.length
    });
    
    return memoryContext;
  } catch (error) {
    console.error(`Failed to load memory context for ${agentName}:`, error);
    
    // Log memory loading error
    await logMemoryError(agentName, 'load_context_failed', error, { context });
    
    return {
      agentName,
      loadedAt: new Date().toISOString(),
      error: error.message,
      workingMemory: null,
      longTermMemories: [],
      memorySummary: null,
      context: context,
      recommendations: ['Unable to load memory context - agent should request user clarification']
    };
  }
}

/**
 * Load relevant long-term memories based on current context
 * @param {string} agentName - The name of the agent
 * @param {Object} currentContext - Current working context
 * @returns {Array} Array of relevant long-term memories
 */
async function loadRelevantLongTermMemories(agentName, currentContext) {
  try {
    const memories = [];
    const { storyId, epicId, taskId } = currentContext;
    
    // Load story-specific memories
    if (storyId) {
      await logMemoryRetrieval(agentName, 'retrieve_story_memories', `story ${storyId}`, 0, { storyId });
      const storyMemories = await retrieveAgentStoryMemory(
        agentName, 
        `story ${storyId} implementation observations decisions`,
        storyId,
        5
      );
      memories.push(...storyMemories.map(m => ({ ...m, source: 'story-context' })));
      await logMemoryRetrieval(agentName, 'retrieve_story_memories_complete', `story ${storyId}`, storyMemories.length, { storyId });
    }
    
    // Load epic-specific memories
    if (epicId) {
      await logMemoryRetrieval(agentName, 'retrieve_epic_memories', `epic ${epicId}`, 0, { epicId });
      const epicMemories = await retrieveAgentEpicMemory(
        agentName,
        `epic ${epicId} patterns lessons learned`,
        epicId,
        3
      );
      memories.push(...epicMemories.map(m => ({ ...m, source: 'epic-context' })));
      await logMemoryRetrieval(agentName, 'retrieve_epic_memories_complete', `epic ${epicId}`, epicMemories.length, { epicId });
    }
    
    // Load task-specific memories if available
    if (taskId) {
      await logMemoryRetrieval(agentName, 'retrieve_task_memories', `task ${taskId}`, 0, { taskId });
      const taskMemories = await retrieveTaskMemory(agentName, taskId, 3);
      memories.push(...taskMemories.map(m => ({ ...m, source: 'task-history' })));
      await logMemoryRetrieval(agentName, 'retrieve_task_memories_complete', `task ${taskId}`, taskMemories.length, { taskId });
    }
    
    // Load general agent memories for similar work
    const generalQuery = `${agentName} agent similar work patterns best practices`;
    const { retrieveRelevantMemories } = getMemoryManager();
    
    // Set a shorter timeout for memory retrieval
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Memory retrieval timeout')), 5000) // 5 second timeout
    );
    
    try {
      const memoryResults = await Promise.race([
        retrieveRelevantMemories(agentName, generalQuery, { topN: 3 }),
        timeoutPromise
      ]);
      
      // Handle the results object structure
      if (memoryResults && memoryResults.longTerm && Array.isArray(memoryResults.longTerm)) {
        memories.push(...memoryResults.longTerm.map(m => ({ ...m, source: 'general-experience' })));
      }
      if (memoryResults && memoryResults.combined && Array.isArray(memoryResults.combined)) {
        memories.push(...memoryResults.combined.slice(0, 3).map(m => ({ ...m, source: 'general-experience' })));
      }
    } catch (timeoutError) {
      console.log('Memory retrieval timed out after 5 seconds - continuing with empty memories');
      // Continue without historical memories - not a fatal error
    }
    
    // Sort by relevance score and remove duplicates
    const uniqueMemories = memories
      .filter((memory, index, array) => 
        array.findIndex(m => m.id === memory.id) === index
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Limit to top 10 most relevant
    
    return uniqueMemories;
  } catch (error) {
    console.error(`Failed to load long-term memories for ${agentName}:`, error);
    await logMemoryError(agentName, 'load_long_term_memories_failed', error, { currentContext });
    return [];
  }
}

/**
 * Generate memory-based recommendations for agent
 * @param {Object} workingMemory - Current working memory
 * @param {Array} longTermMemories - Relevant long-term memories
 * @returns {Array} Array of recommendations
 */
function generateMemoryRecommendations(workingMemory, longTermMemories) {
  const recommendations = [];
  
  // Check for missing context
  const context = workingMemory.currentContext || {};
  if (!context.storyId) {
    recommendations.push('No story context available - request story assignment before proceeding');
  }
  if (!context.epicId) {
    recommendations.push('No epic context available - may need epic information for broader understanding');
  }
  
  // Check for blockers
  const activeBlockers = workingMemory.blockers?.filter(b => !b.resolved) || [];
  if (activeBlockers.length > 0) {
    recommendations.push(`${activeBlockers.length} unresolved blocker(s) - address before continuing`);
  }
  
  // Check for incomplete plan
  if (!workingMemory.plan || workingMemory.plan.length === 0) {
    recommendations.push('No execution plan available - create plan before starting work');
  }
  
  // Check for recent similar work
  const recentSimilarWork = longTermMemories.filter(m => 
    m.source === 'story-context' && m.score > 0.8
  );
  if (recentSimilarWork.length > 0) {
    recommendations.push(`Found ${recentSimilarWork.length} similar recent implementation(s) - review for patterns and lessons`);
  }
  
  // Check for epic patterns
  const epicPatterns = longTermMemories.filter(m => 
    m.source === 'epic-context' && m.score > 0.7
  );
  if (epicPatterns.length > 0) {
    recommendations.push(`Found ${epicPatterns.length} relevant epic pattern(s) - apply consistent approach`);
  }
  
  // Check observation count
  const observationCount = workingMemory.observations?.length || 0;
  if (observationCount === 0) {
    recommendations.push('No previous observations - this appears to be a fresh start');
  } else if (observationCount > 20) {
    recommendations.push(`${observationCount} observations recorded - consider archiving old observations to long-term memory`);
  }
  
  return recommendations;
}

/**
 * Quick memory status check for agent
 * @param {string} agentName - The name of the agent
 * @returns {Object} Memory status summary
 */
async function checkMemoryStatus(agentName) {
  try {
    const { loadWorkingMemory, getMemorySummary } = getMemoryManager();
    const workingMemory = await loadWorkingMemory(agentName);
    const summary = await getMemorySummary(agentName);
    
    return {
      agentName,
      hasWorkingMemory: !!workingMemory,
      lastUpdated: workingMemory?.lastUpdated || null,
      currentContext: workingMemory?.currentContext || {},
      observationCount: summary.observationCount || 0,
      blockerCount: summary.blockerCount || 0,
      status: !workingMemory ? 'no-memory' :
              summary.blockerCount > 0 ? 'has-blockers' :
              !workingMemory.currentContext?.storyId ? 'no-context' :
              'ready'
    };
  } catch (error) {
    return {
      agentName,
      hasWorkingMemory: false,
      error: error.message,
      status: 'error'
    };
  }
}

/**
 * Load memory context with context validation
 * @param {string} agentName - The name of the agent
 * @param {Object} context - Required context
 * @param {Array} requiredContext - Array of required context keys
 * @returns {Object} Memory context with validation results
 */
async function loadMemoryWithValidation(agentName, context, requiredContext = []) {
  const memoryContext = await loadAgentMemoryContext(agentName, context);
  
  // Validate required context
  const missing = [];
  const workingMemory = memoryContext.workingMemory;
  
  if (workingMemory) {
    for (const requirement of requiredContext) {
      if (requirement === 'storyId' && !workingMemory.currentContext?.storyId) {
        missing.push('storyId');
      } else if (requirement === 'epicId' && !workingMemory.currentContext?.epicId) {
        missing.push('epicId');
      } else if (requirement === 'plan' && (!workingMemory.plan || workingMemory.plan.length === 0)) {
        missing.push('plan');
      }
    }
  } else {
    missing.push(...requiredContext);
  }
  
  return {
    ...memoryContext,
    validation: {
      hasRequiredContext: missing.length === 0,
      missingContext: missing,
      canProceed: missing.length === 0 && memoryContext.memorySummary?.blockerCount === 0
    }
  };
}

// Create a timeout-wrapped version of the main function
const loadAgentMemoryContext = withTimeout(
  loadAgentMemoryContextInternal,
  8000, // 8 second total timeout for entire operation
  'Load Agent Memory Context'
);

/**
 * Load agent memory and ensure clean process exit
 * Use this when calling from a subprocess that needs to exit
 */
async function loadAgentMemoryContextAndExit(agentName, context = {}) {
  try {
    // Log the initialization
    await logMemoryInit(agentName, 'load_context_start', { context });
    
    const result = await loadAgentMemoryContext(agentName, context);
    
    // Log the completion
    await logMemoryInit(agentName, 'load_context_complete', { 
      sessionId: result.workingMemory?.sessionId,
      hasExistingMemory: !!(result.workingMemory?.observations?.length),
      recommendationsCount: result.recommendations?.length || 0
    });
    
    // Ensure clean exit by closing connections
    const { closeConnections } = require('./qdrant');
    await closeConnections();
    
    // Close connections and force exit after a short delay to ensure output is flushed
    setTimeout(async () => {
      await closeConnections();
      process.exit(0);
    }, 100);
    
    return result;
  } catch (error) {
    console.error('Memory load error:', error.message);
    await closeConnections();
    process.exit(1);
  }
}

/**
 * Retrieve relevant memories and ensure clean process exit
 * Use this when calling from a subprocess that needs to exit
 */
async function retrieveRelevantMemoriesAndExit(agentName, query, options = {}) {
  try {
    // Log the retrieval operation
    await logMemoryRetrieval(agentName, 'retrieve_memories_start', query, 0, { options });
    
    const { retrieveRelevantMemories } = getMemoryManager();
    const result = await retrieveRelevantMemories(agentName, query, options);
    
    // Log the completion with results count
    const resultsCount = result?.combined?.length || 0;
    await logMemoryRetrieval(agentName, 'retrieve_memories_complete', query, resultsCount, { 
      hasResults: resultsCount > 0 
    });
    
    // Print result to stdout for subprocess communication
    console.log(JSON.stringify(result, null, 2));
    
    // Ensure clean exit by closing connections
    const { closeConnections } = require('./qdrant');
    await closeConnections();
    
    // Close connections and force exit after a short delay to ensure output is flushed
    setTimeout(async () => {
      await closeConnections();
      process.exit(0);
    }, 100);
    
    return result;
  } catch (error) {
    console.error('Memory retrieval error:', error.message);
    await closeConnections();
    process.exit(1);
  }
}

/**
 * Update working memory and ensure clean process exit
 * Use this when calling from a subprocess that needs to exit
 */
async function updateWorkingMemoryAndExit(agentName, updates) {
  try {
    const { updateWorkingMemory } = getMemoryManager();
    const result = await updateWorkingMemory(agentName, updates);
    
    // Validate the result
    validateMemoryResult(result, 'updateWorkingMemory', agentName);
    
    // Print result to stdout for subprocess communication
    console.log(JSON.stringify(result, null, 2));
    
    // Log successful memory update
    console.log(`✅ Working memory successfully updated for ${agentName}`);
    
    // Ensure clean exit by closing connections
    await closeConnections();
    
    // Close connections and force exit after a short delay to ensure output is flushed
    setTimeout(async () => {
      await closeConnections();
      process.exit(0);
    }, 100);
    
    return result;
  } catch (error) {
    // Convert to MemoryError if not already
    const memoryError = error instanceof MemoryError ? error : new MemoryError(
      error.message || 'Failed to update working memory',
      'updateWorkingMemory',
      agentName,
      { originalError: error.name, updates }
    );
    
    await handleCriticalMemoryError(memoryError, 'Updating working memory');
    // handleCriticalMemoryError will exit the process
  }
}

/**
 * Save to long-term memory and ensure clean process exit
 * Use this when calling from a subprocess that needs to exit
 */
async function saveToLongTermMemoryAndExit(agentName, options = {}) {
  try {
    const { saveToLongTermMemory } = getMemoryManager();
    const result = await saveToLongTermMemory(agentName, options);
    
    // Validate the result
    validateMemoryResult(result, 'saveToLongTermMemory', agentName);
    
    // Print result to stdout for subprocess communication
    console.log(JSON.stringify(result, null, 2));
    
    // Log successful memory save
    console.log(`✅ Long-term memory successfully saved for ${agentName}`);
    
    // Ensure clean exit by closing connections
    await closeConnections();
    
    // Close connections and force exit after a short delay to ensure output is flushed
    setTimeout(async () => {
      await closeConnections();
      process.exit(0);
    }, 100);
    
    return result;
  } catch (error) {
    // Convert to MemoryError if not already
    const memoryError = error instanceof MemoryError ? error : new MemoryError(
      error.message || 'Failed to save to long-term memory',
      'saveToLongTermMemory',
      agentName,
      { originalError: error.name, options }
    );
    
    await handleCriticalMemoryError(memoryError, 'Saving to long-term memory');
    // handleCriticalMemoryError will exit the process
  }
}

module.exports = {
  loadAgentMemoryContext,
  loadAgentMemoryContextAndExit,
  loadRelevantLongTermMemories,
  generateMemoryRecommendations,
  checkMemoryStatus,
  loadMemoryWithValidation,
  retrieveRelevantMemoriesAndExit,
  updateWorkingMemoryAndExit,
  saveToLongTermMemoryAndExit
};

// Command-line interface
if (require.main === module) {
  const command = process.argv[2];
  const agentName = process.argv[3];
  const args = process.argv.slice(4);
  
  async function runCommand() {
    try {
      switch (command) {
        case 'loadAgentMemoryContextAndExit':
          await loadAgentMemoryContextAndExit(agentName);
          break;
          
        case 'retrieveRelevantMemoriesAndExit':
          const query = args[0] || 'general context';
          const topN = parseInt(args[1]) || 5;
          await retrieveRelevantMemoriesAndExit(agentName, query, { topN });
          break;
          
        case 'updateWorkingMemoryAndExit':
          const updates = args[0] ? JSON.parse(args[0]) : {};
          await updateWorkingMemoryAndExit(agentName, updates);
          break;
          
        case 'saveToLongTermMemoryAndExit':
          const memoryContent = args[0] ? JSON.parse(args[0]) : {};
          await saveToLongTermMemoryAndExit(agentName, memoryContent);
          break;
          
        default:
          console.error(`Unknown command: ${command}`);
          console.error('Available commands: loadAgentMemoryContextAndExit, retrieveRelevantMemoriesAndExit, updateWorkingMemoryAndExit, saveToLongTermMemoryAndExit');
          await closeConnections();
          process.exit(1);
      }
    } catch (error) {
      console.error(`Command failed: ${error.message}`);
      await closeConnections();
      process.exit(1);
    }
  }
  
  runCommand();
}