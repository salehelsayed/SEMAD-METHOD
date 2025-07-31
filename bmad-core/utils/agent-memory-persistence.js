/**
 * Agent Memory Persistence - Handles saving observations and summaries after agent actions
 * Automatically persists both short-term working memory and long-term summaries
 */

// Import functions dynamically to avoid circular dependencies
const getMemoryManager = () => require('./agent-memory-manager');
const { storeContextualMemory } = require('./qdrant');

/**
 * Persist agent observation after a significant action
 * @param {string} agentName - The name of the agent
 * @param {string} observation - The observation to record
 * @param {Object} options - Additional options
 * @param {string} options.actionType - Type of action performed
 * @param {string} options.taskId - Current task ID
 * @param {boolean} options.isSignificant - Whether this should go to long-term memory
 * @param {Object} options.metadata - Additional metadata
 * @returns {Object} Persistence result
 */
async function persistObservation(agentName, observation, options = {}) {
  try {
    const { actionType, taskId, isSignificant = true, metadata = {} } = options;
    
    console.log(`Persisting observation for ${agentName}: ${observation.substring(0, 100)}...`);
    
    // Update working memory with observation
    const { updateWorkingMemory } = getMemoryManager();
    const workingMemory = await updateWorkingMemory(agentName, {
      observation,
      currentContext: {
        ...(taskId && { taskId })
      }
    });
    
    let longTermMemoryId = null;
    
    // Store in long-term memory if significant
    if (isSignificant && workingMemory.currentContext) {
      const enhancedObservation = `${actionType ? `[${actionType}] ` : ''}${observation}`;
      
      longTermMemoryId = await storeContextualMemory(
        agentName,
        enhancedObservation,
        {
          storyId: workingMemory.currentContext.storyId,
          epicId: workingMemory.currentContext.epicId,
          taskId: workingMemory.currentContext.taskId,
          type: 'observation',
          actionType,
          ...metadata
        }
      );
      
      console.log(`Stored observation in long-term memory with ID: ${longTermMemoryId}`);
    }
    
    return {
      success: true,
      workingMemoryUpdated: true,
      longTermMemoryId,
      observationCount: workingMemory.observations?.length || 0
    };
  } catch (error) {
    console.error(`Failed to persist observation for ${agentName}:`, error);
    return {
      success: false,
      error: error.message,
      workingMemoryUpdated: false,
      longTermMemoryId: null
    };
  }
}

/**
 * Persist agent decision with reasoning
 * @param {string} agentName - The name of the agent
 * @param {string} decision - The decision made
 * @param {string} reasoning - Reasoning behind the decision
 * @param {Object} options - Additional options
 * @returns {Object} Persistence result
 */
async function persistDecision(agentName, decision, reasoning, options = {}) {
  try {
    console.log(`Persisting decision for ${agentName}: ${decision}`);
    
    // Update working memory with decision
    const { updateWorkingMemory } = getMemoryManager();
    const workingMemory = await updateWorkingMemory(agentName, {
      decision,
      reasoning
    });
    
    // Store significant decisions in long-term memory
    const decisionText = `Decision: ${decision}\nReasoning: ${reasoning}`;
    const longTermMemoryId = await storeContextualMemory(
      agentName,
      decisionText,
      {
        storyId: workingMemory.currentContext?.storyId,
        epicId: workingMemory.currentContext?.epicId,
        taskId: workingMemory.currentContext?.taskId,
        type: 'decision',
        ...options
      }
    );
    
    return {
      success: true,
      workingMemoryUpdated: true,
      longTermMemoryId,
      decisionCount: workingMemory.decisions?.length || 0
    };
  } catch (error) {
    console.error(`Failed to persist decision for ${agentName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Persist key fact or learning
 * @param {string} agentName - The name of the agent
 * @param {string} factKey - Key identifier for the fact
 * @param {string} factContent - Content of the fact
 * @param {Object} options - Additional options
 * @returns {Object} Persistence result
 */
async function persistKeyFact(agentName, factKey, factContent, options = {}) {
  try {
    console.log(`Persisting key fact for ${agentName}: ${factKey}`);
    
    // Update working memory with key fact
    const { updateWorkingMemory } = getMemoryManager();
    const workingMemory = await updateWorkingMemory(agentName, {
      keyFact: {
        key: factKey,
        content: factContent
      }
    });
    
    // Store in long-term memory
    const factText = `Key Fact [${factKey}]: ${factContent}`;
    const longTermMemoryId = await storeContextualMemory(
      agentName,
      factText,
      {
        storyId: workingMemory.currentContext?.storyId,
        epicId: workingMemory.currentContext?.epicId,
        taskId: workingMemory.currentContext?.taskId,
        type: 'key-fact',
        factKey,
        ...options
      }
    );
    
    return {
      success: true,
      workingMemoryUpdated: true,
      longTermMemoryId,
      keyFactCount: Object.keys(workingMemory.keyFacts || {}).length
    };
  } catch (error) {
    console.error(`Failed to persist key fact for ${agentName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Persist task completion and archive to long-term memory
 * @param {string} agentName - The name of the agent
 * @param {string} taskId - Completed task ID
 * @param {Object} options - Additional options
 * @returns {Object} Persistence result
 */
async function persistTaskCompletion(agentName, taskId, options = {}) {
  try {
    console.log(`Persisting task completion for ${agentName}: ${taskId}`);
    
    // Update working memory with completed task
    const { updateWorkingMemory, archiveTaskMemory } = getMemoryManager();
    const workingMemory = await updateWorkingMemory(agentName, {
      completedTask: taskId
    });
    
    // Archive task memory to long-term storage
    const archiveSuccess = await archiveTaskMemory(agentName, taskId);
    
    // Create completion summary
    const completionText = `Task Completed: ${taskId}`;
    const longTermMemoryId = await storeContextualMemory(
      agentName,
      completionText,
      {
        storyId: workingMemory.currentContext?.storyId,
        epicId: workingMemory.currentContext?.epicId,
        taskId,
        type: 'task-completion',
        ...options
      }
    );
    
    return {
      success: true,
      workingMemoryUpdated: true,
      taskArchived: archiveSuccess,
      longTermMemoryId,
      completedTaskCount: workingMemory.completedTasks?.length || 0
    };
  } catch (error) {
    console.error(`Failed to persist task completion for ${agentName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Persist blocker encountered during work
 * @param {string} agentName - The name of the agent
 * @param {string} blocker - Description of the blocker
 * @param {Object} options - Additional options
 * @returns {Object} Persistence result
 */
async function persistBlocker(agentName, blocker, options = {}) {
  try {
    console.log(`Persisting blocker for ${agentName}: ${blocker}`);
    
    // Update working memory with blocker
    const { updateWorkingMemory } = getMemoryManager();
    const workingMemory = await updateWorkingMemory(agentName, {
      blocker
    });
    
    // Store blocker in long-term memory for pattern analysis
    const blockerText = `BLOCKER: ${blocker}`;
    const longTermMemoryId = await storeContextualMemory(
      agentName,
      blockerText,
      {
        storyId: workingMemory.currentContext?.storyId,
        epicId: workingMemory.currentContext?.epicId,
        taskId: workingMemory.currentContext?.taskId,
        type: 'blocker',
        severity: options.severity || 'medium',
        ...options
      }
    );
    
    return {
      success: true,
      workingMemoryUpdated: true,
      longTermMemoryId,
      blockerCount: workingMemory.blockers?.filter(b => !b.resolved).length || 0
    };
  } catch (error) {
    console.error(`Failed to persist blocker for ${agentName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Persist blocker resolution
 * @param {string} agentName - The name of the agent
 * @param {string} blockerDescription - Description of resolved blocker
 * @param {string} resolution - How it was resolved
 * @param {Object} options - Additional options
 * @returns {Object} Persistence result
 */
async function persistBlockerResolution(agentName, blockerDescription, resolution, options = {}) {
  try {
    console.log(`Persisting blocker resolution for ${agentName}: ${blockerDescription}`);
    
    // Update working memory to resolve the blocker
    const { updateWorkingMemory } = getMemoryManager();
    const workingMemory = await updateWorkingMemory(agentName, {
      resolveBlocker: blockerDescription,
      resolution
    });
    
    // Store resolution in long-term memory
    const resolutionText = `BLOCKER RESOLVED: ${blockerDescription}\nResolution: ${resolution}`;
    const longTermMemoryId = await storeContextualMemory(
      agentName,
      resolutionText,
      {
        storyId: workingMemory.currentContext?.storyId,
        epicId: workingMemory.currentContext?.epicId,
        taskId: workingMemory.currentContext?.taskId,
        type: 'blocker-resolution',
        ...options
      }
    );
    
    return {
      success: true,
      workingMemoryUpdated: true,
      longTermMemoryId,
      remainingBlockers: workingMemory.blockers?.filter(b => !b.resolved).length || 0
    };
  } catch (error) {
    console.error(`Failed to persist blocker resolution for ${agentName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create comprehensive session summary for archival
 * @param {string} agentName - The name of the agent
 * @param {Object} options - Summary options
 * @returns {Object} Session summary
 */
async function createSessionSummary(agentName, options = {}) {
  try {
    const { loadWorkingMemory } = getMemoryManager();
    const workingMemory = await loadWorkingMemory(agentName);
    if (!workingMemory) {
      return {
        success: false,
        error: 'No working memory found'
      };
    }
    
    const summary = {
      agentName,
      sessionId: workingMemory.sessionId,
      timespan: {
        started: workingMemory.initialized,
        ended: new Date().toISOString()
      },
      context: workingMemory.currentContext,
      statistics: {
        observationCount: workingMemory.observations?.length || 0,
        decisionCount: workingMemory.decisions?.length || 0,
        keyFactCount: Object.keys(workingMemory.keyFacts || {}).length,
        completedTaskCount: workingMemory.completedTasks?.length || 0,
        blockerCount: workingMemory.blockers?.length || 0,
        resolvedBlockerCount: workingMemory.blockers?.filter(b => b.resolved).length || 0
      },
      keyHighlights: {
        recentObservations: workingMemory.observations?.slice(-3) || [],
        importantDecisions: workingMemory.decisions?.slice(-3) || [],
        criticalFacts: Object.entries(workingMemory.keyFacts || {}).slice(-3),
        unresolvedBlockers: workingMemory.blockers?.filter(b => !b.resolved) || []
      },
      ...options
    };
    
    // Store session summary in long-term memory
    const summaryText = `Session Summary for ${agentName}: Completed ${summary.statistics.completedTaskCount} tasks, made ${summary.statistics.decisionCount} decisions, recorded ${summary.statistics.observationCount} observations`;
    
    const longTermMemoryId = await storeContextualMemory(
      agentName,
      summaryText,
      {
        storyId: workingMemory.currentContext?.storyId,
        epicId: workingMemory.currentContext?.epicId,
        type: 'session-summary',
        sessionId: workingMemory.sessionId,
        summary
      }
    );
    
    return {
      success: true,
      summary,
      longTermMemoryId
    };
  } catch (error) {
    console.error(`Failed to create session summary for ${agentName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Batch persist multiple observations efficiently
 * @param {string} agentName - The name of the agent
 * @param {Array} observations - Array of observations to persist
 * @returns {Object} Batch persistence result
 */
async function batchPersistObservations(agentName, observations) {
  try {
    const results = [];
    
    for (const obs of observations) {
      const result = await persistObservation(
        agentName, 
        obs.observation, 
        {
          actionType: obs.actionType,
          isSignificant: obs.isSignificant !== false, // Default to true
          metadata: obs.metadata || {}
        }
      );
      results.push(result);
    }
    
    const successCount = results.filter(r => r.success).length;
    
    return {
      success: successCount === observations.length,
      successCount,
      totalCount: observations.length,
      results
    };
  } catch (error) {
    console.error(`Failed to batch persist observations for ${agentName}:`, error);
    return {
      success: false,
      error: error.message,
      successCount: 0,
      totalCount: observations.length
    };
  }
}

module.exports = {
  persistObservation,
  persistDecision,
  persistKeyFact,
  persistTaskCompletion,
  persistBlocker,
  persistBlockerResolution,
  createSessionSummary,
  batchPersistObservations
};