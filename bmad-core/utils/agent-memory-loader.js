/**
 * Agent Memory Loader for BMAD Agents
 * Loads both short-term and long-term memory during agent activation
 */

// Import functions dynamically to avoid circular dependencies
const getMemoryManager = () => require('./agent-memory-manager');
const { 
  retrieveAgentStoryMemory, 
  retrieveAgentEpicMemory,
  retrieveTaskMemory 
} = require('./qdrant');

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
async function loadAgentMemoryContext(agentName, context = {}) {
  try {
    const { storyId, epicId, taskId, loadLongTerm = true } = context;
    
    console.log(`Loading memory context for agent: ${agentName}`);
    
    // Load or initialize working memory
    const { loadWorkingMemory, initializeWorkingMemory, getMemorySummary } = getMemoryManager();
    let workingMemory = await loadWorkingMemory(agentName);
    if (!workingMemory) {
      console.log(`No existing working memory found, initializing new memory for ${agentName}`);
      workingMemory = await initializeWorkingMemory(agentName, { storyId, epicId, taskId });
    } else {
      console.log(`Loaded existing working memory for ${agentName}`);
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
      longTermMemories = await loadRelevantLongTermMemories(agentName, workingMemory.currentContext);
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
    
    return memoryContext;
  } catch (error) {
    console.error(`Failed to load memory context for ${agentName}:`, error);
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
      const storyMemories = await retrieveAgentStoryMemory(
        agentName, 
        `story ${storyId} implementation observations decisions`,
        storyId,
        5
      );
      memories.push(...storyMemories.map(m => ({ ...m, source: 'story-context' })));
    }
    
    // Load epic-specific memories
    if (epicId) {
      const epicMemories = await retrieveAgentEpicMemory(
        agentName,
        `epic ${epicId} patterns lessons learned`,
        epicId,
        3
      );
      memories.push(...epicMemories.map(m => ({ ...m, source: 'epic-context' })));
    }
    
    // Load task-specific memories if available
    if (taskId) {
      const taskMemories = await retrieveTaskMemory(agentName, taskId, 3);
      memories.push(...taskMemories.map(m => ({ ...m, source: 'task-history' })));
    }
    
    // Load general agent memories for similar work
    const generalQuery = `${agentName} agent similar work patterns best practices`;
    const { retrieveRelevantMemories } = getMemoryManager();
    const generalMemories = await retrieveRelevantMemories(agentName, generalQuery, {
      topN: 3
    });
    memories.push(...generalMemories.map(m => ({ ...m, source: 'general-experience' })));
    
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

module.exports = {
  loadAgentMemoryContext,
  loadRelevantLongTermMemories,
  generateMemoryRecommendations,
  checkMemoryStatus,
  loadMemoryWithValidation
};