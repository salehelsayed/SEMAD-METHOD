/**
 * Agent Memory Manager - Comprehensive memory management for BMAD agents
 * Provides consistent short-term and long-term memory operations for SM, Dev, and QA agents
 */

const fs = require('fs').promises;
const path = require('path');
const { storeMemorySnippet, retrieveMemory } = require('./qdrant');
const { MemoryTransaction } = require('./memory-transaction');
const { safeReadJson, safeWriteJson, updateJsonFile } = require('./safe-file-operations');
const { 
  MEMORY_CONFIG, 
  getWorkingMemoryPath, 
  validateAgentName, 
  validateTextContent, 
  sanitizeTextContent 
} = require('./memory-config');
const { 
  performMemoryHygiene, 
  shouldRunMemoryHygiene 
} = require('./memory-hygiene');

// Queue to prevent concurrent memory hygiene operations per agent
const hygieneQueue = new Map();

/**
 * Initialize working memory for an agent session
 * @param {string} agentName - The name of the agent (sm, dev, qa)
 * @param {Object} options - Additional options
 * @param {string} options.storyId - Current story ID
 * @param {string} options.epicId - Current epic ID
 * @param {string} options.taskId - Current task ID
 * @returns {Object} Initialized memory structure
 */
async function initializeWorkingMemory(agentName, options = {}) {
  try {
    // Validate agent name
    validateAgentName(agentName);
    
    // Ensure memory directory exists
    await fs.mkdir(MEMORY_CONFIG.BASE_DIR, { recursive: true });
    
    // Get centralized memory path
    const memoryPath = getWorkingMemoryPath(agentName);
    
    // Check if memory file already exists using safe operations
    const existingMemory = await safeReadJson(memoryPath, {});
    
    const memory = {
      agentName,
      sessionId: Date.now().toString(),
      initialized: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentContext: {
        storyId: options.storyId || existingMemory.currentContext?.storyId || null,
        epicId: options.epicId || existingMemory.currentContext?.epicId || null,
        taskId: options.taskId || existingMemory.currentContext?.taskId || null
      },
      observations: existingMemory.observations || [],
      plan: existingMemory.plan || [],
      currentStep: existingMemory.currentStep || null,
      keyFacts: existingMemory.keyFacts || {},
      decisions: existingMemory.decisions || [],
      blockers: existingMemory.blockers || [],
      completedTasks: existingMemory.completedTasks || [],
      ...existingMemory
    };
    
    await safeWriteJson(memoryPath, memory);
    
    console.log(`Initialized working memory for agent: ${agentName}`);
    return memory;
  } catch (error) {
    console.error(`Failed to initialize working memory for ${agentName}:`, error);
    throw error;
  }
}

/**
 * Load working memory for an agent
 * @param {string} agentName - The name of the agent
 * @returns {Object|null} Memory object or null if not found
 */
async function loadWorkingMemory(agentName) {
  try {
    // Validate agent name
    validateAgentName(agentName);
    
    const memoryPath = getWorkingMemoryPath(agentName);
    return await safeReadJson(memoryPath, null);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`No working memory found for agent ${agentName}, will initialize new memory`);
      return null;
    }
    console.error(`Failed to load working memory for ${agentName}:`, error.message);
    return null;
  }
}

/**
 * Update working memory with new information
 * @param {string} agentName - The name of the agent
 * @param {Object} updates - Updates to apply to memory
 * @returns {Object} Updated memory state
 */
async function updateWorkingMemory(agentName, updates) {
  try {
    // Validate inputs
    validateAgentName(agentName);
    
    // Validate and sanitize text content in updates
    if (updates.observation) {
      validateTextContent(updates.observation, 'observation');
      updates.observation = sanitizeTextContent(updates.observation);
    }
    if (updates.decision) {
      validateTextContent(updates.decision, 'decision');
      updates.decision = sanitizeTextContent(updates.decision);
    }
    if (updates.reasoning) {
      validateTextContent(updates.reasoning, 'reasoning');
      updates.reasoning = sanitizeTextContent(updates.reasoning);
    }
    if (updates.blocker) {
      validateTextContent(updates.blocker, 'blocker');
      updates.blocker = sanitizeTextContent(updates.blocker);
    }
    if (updates.keyFact?.content) {
      validateTextContent(updates.keyFact.content, 'key fact content');
      updates.keyFact.content = sanitizeTextContent(updates.keyFact.content);
    }
    
    const memoryPath = getWorkingMemoryPath(agentName);
    
    // Use atomic update operation to prevent corruption
    const updatedMemory = await updateJsonFile(
      memoryPath,
      async (memory) => {
        // Initialize memory if it doesn't exist
        if (!memory || Object.keys(memory).length === 0) {
          memory = {
            agentName,
            sessionId: Date.now().toString(),
            initialized: new Date().toISOString(),
            currentContext: {},
            observations: [],
            plan: [],
            currentStep: null,
            keyFacts: {},
            decisions: [],
            blockers: [],
            completedTasks: []
          };
        }
        
        // Apply updates
        memory.lastUpdated = new Date().toISOString();
        
        if (updates.currentContext) {
          memory.currentContext = { ...memory.currentContext, ...updates.currentContext };
        }
        
        if (updates.observation) {
          memory.observations = memory.observations || [];
          memory.observations.push({
            timestamp: new Date().toISOString(),
            content: updates.observation,
            context: memory.currentContext
          });
          
          // Trim observations if needed
          if (memory.observations.length > MEMORY_CONFIG.MAX_OBSERVATIONS) {
            memory.observations = memory.observations.slice(-MEMORY_CONFIG.MAX_OBSERVATIONS);
          }
        }
        
        if (updates.plan) {
          memory.plan = updates.plan;
        }
        
        if (updates.currentStep !== undefined) {
          memory.currentStep = updates.currentStep;
        }
        
        if (updates.keyFact) {
          memory.keyFacts = memory.keyFacts || {};
          const factKey = updates.keyFact.key || Date.now().toString();
          memory.keyFacts[factKey] = {
            content: updates.keyFact.content,
            timestamp: new Date().toISOString(),
            context: memory.currentContext
          };
        }
        
        if (updates.decision) {
          memory.decisions = memory.decisions || [];
          memory.decisions.push({
            timestamp: new Date().toISOString(),
            decision: updates.decision,
            reasoning: updates.reasoning || '',
            context: memory.currentContext
          });
          
          // Trim decisions if needed to prevent memory leaks
          if (memory.decisions.length > MEMORY_CONFIG.MAX_DECISIONS) {
            memory.decisions = memory.decisions.slice(-MEMORY_CONFIG.MAX_DECISIONS);
          }
        }
        
        if (updates.blocker) {
          memory.blockers = memory.blockers || [];
          memory.blockers.push({
            timestamp: new Date().toISOString(),
            blocker: updates.blocker,
            context: memory.currentContext,
            resolved: false
          });
          
          // Trim blockers if needed to prevent memory leaks
          if (memory.blockers.length > MEMORY_CONFIG.MAX_BLOCKERS) {
            memory.blockers = memory.blockers.slice(-MEMORY_CONFIG.MAX_BLOCKERS);
          }
        }
        
        if (updates.resolveBlocker) {
          memory.blockers = memory.blockers || [];
          const blocker = memory.blockers.find(b => !b.resolved && b.blocker.includes(updates.resolveBlocker));
          if (blocker) {
            blocker.resolved = true;
            blocker.resolution = updates.resolution || 'Resolved';
            blocker.resolvedAt = new Date().toISOString();
          }
        }
        
        if (updates.completedTask) {
          memory.completedTasks = memory.completedTasks || [];
          memory.completedTasks.push({
            timestamp: new Date().toISOString(),
            taskId: updates.completedTask,
            context: memory.currentContext
          });
          
          // Trim completed tasks if needed to prevent memory leaks
          if (memory.completedTasks.length > MEMORY_CONFIG.MAX_COMPLETED_TASKS) {
            memory.completedTasks = memory.completedTasks.slice(-MEMORY_CONFIG.MAX_COMPLETED_TASKS);
          }
        }
        
        // Trim key facts if needed to prevent memory leaks
        if (memory.keyFacts && Object.keys(memory.keyFacts).length > MEMORY_CONFIG.MAX_KEY_FACTS) {
          const factEntries = Object.entries(memory.keyFacts);
          factEntries.sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));
          
          const trimmedFacts = {};
          factEntries.slice(0, MEMORY_CONFIG.MAX_KEY_FACTS).forEach(([key, fact]) => {
            trimmedFacts[key] = fact;
          });
          memory.keyFacts = trimmedFacts;
        }
        
        return memory;
      },
      {} // Default empty object
    );
    
    // Perform memory hygiene if configured to run after each action
    // Use a proper async queue to prevent race conditions
    performMemoryHygieneAsync(agentName);
    
    return updatedMemory;
  } catch (error) {
    console.error(`Failed to update working memory for ${agentName}:`, error);
    throw error;
  }
}

/**
 * Retrieve relevant memories from both short-term and long-term storage
 * @param {string} agentName - The name of the agent
 * @param {string} query - Query string for memory search
 * @param {Object} options - Search options
 * @param {string} options.storyId - Filter by story ID
 * @param {string} options.epicId - Filter by epic ID
 * @param {number} options.topN - Number of results to return from long-term storage
 * @param {boolean} options.shortTermOnly - Only return short-term memories
 * @param {boolean} options.longTermOnly - Only return long-term memories
 * @returns {Object} Combined memories from both sources with detailed breakdown
 */
async function retrieveRelevantMemories(agentName, query, options = {}) {
  try {
    const { storyId, epicId, topN = 5, shortTermOnly = false, longTermOnly = false } = options;
    
    const results = {
      shortTerm: {
        observations: [],
        decisions: [],
        keyFacts: [],
        blockers: [],
        plan: []
      },
      longTerm: [],
      combined: [],
      query,
      timestamp: new Date().toISOString()
    };

    // Retrieve short-term memory if not excluded
    if (!longTermOnly) {
      const workingMemory = await loadWorkingMemory(agentName);
      if (workingMemory) {
        // Filter and search short-term memory
        const queryLower = query.toLowerCase();
        
        // Search observations
        results.shortTerm.observations = (workingMemory.observations || [])
          .filter(obs => {
            const matchesQuery = obs.content.toLowerCase().includes(queryLower);
            const matchesStory = !storyId || obs.context?.storyId === storyId;
            const matchesEpic = !epicId || obs.context?.epicId === epicId;
            return matchesQuery && matchesStory && matchesEpic;
          })
          .slice(0, 10) // Limit short-term results
          .map(obs => ({
            ...obs,
            source: 'short-term',
            type: 'observation'
          }));

        // Search decisions
        results.shortTerm.decisions = (workingMemory.decisions || [])
          .filter(decision => {
            const matchesQuery = (decision.decision + ' ' + (decision.reasoning || '')).toLowerCase().includes(queryLower);
            const matchesStory = !storyId || decision.context?.storyId === storyId;
            const matchesEpic = !epicId || decision.context?.epicId === epicId;
            return matchesQuery && matchesStory && matchesEpic;
          })
          .slice(0, 5)
          .map(decision => ({
            ...decision,
            source: 'short-term',
            type: 'decision'
          }));

        // Search key facts
        results.shortTerm.keyFacts = Object.entries(workingMemory.keyFacts || {})
          .filter(([key, fact]) => {
            const content = key + ' ' + fact.content;
            const matchesQuery = content.toLowerCase().includes(queryLower);
            const matchesStory = !storyId || fact.context?.storyId === storyId;
            const matchesEpic = !epicId || fact.context?.epicId === epicId;
            return matchesQuery && matchesStory && matchesEpic;
          })
          .slice(0, 10)
          .map(([key, fact]) => ({
            key,
            ...fact,
            source: 'short-term',
            type: 'key-fact'
          }));

        // Search blockers
        results.shortTerm.blockers = (workingMemory.blockers || [])
          .filter(blocker => {
            const content = blocker.blocker + ' ' + (blocker.resolution || '');
            const matchesQuery = content.toLowerCase().includes(queryLower);
            const matchesStory = !storyId || blocker.context?.storyId === storyId;
            const matchesEpic = !epicId || blocker.context?.epicId === epicId;
            return matchesQuery && matchesStory && matchesEpic;
          })
          .slice(0, 5)
          .map(blocker => ({
            ...blocker,
            source: 'short-term',
            type: 'blocker'
          }));

        // Include current plan if relevant
        if (workingMemory.plan && workingMemory.plan.length > 0) {
          const planContent = workingMemory.plan.join(' ').toLowerCase();
          if (planContent.includes(queryLower)) {
            results.shortTerm.plan = [{
              content: workingMemory.plan,
              currentStep: workingMemory.currentStep,
              source: 'short-term',
              type: 'plan',
              timestamp: workingMemory.lastUpdated
            }];
          }
        }
      }
    }

    // Retrieve long-term memory if not excluded
    if (!shortTermOnly) {
      try {
        // Create context-aware query for Qdrant
        let contextQuery = query;
        if (storyId) {
          contextQuery += ` story:${storyId}`;
        }
        if (epicId) {
          contextQuery += ` epic:${epicId}`;
        }
        contextQuery += ` agent:${agentName}`;
        
        const longTermMemories = await retrieveMemory(contextQuery, topN);
        
        // Filter and format long-term memories
        results.longTerm = longTermMemories
          .filter(memory => {
            if (memory.agentName && memory.agentName !== agentName) return false;
            if (storyId && memory.storyId && memory.storyId !== storyId) return false;
            if (epicId && memory.epicId && memory.epicId !== epicId) return false;
            return true;
          })
          .map(memory => ({
            ...memory,
            source: 'long-term',
            type: memory.type || 'archived-memory'
          }));
      } catch (longTermError) {
        console.warn(`Failed to retrieve long-term memories for ${agentName}:`, longTermError.message);
        results.longTermError = longTermError.message;
      }
    }

    // Combine all memories and sort by relevance and recency
    results.combined = [
      ...results.shortTerm.observations,
      ...results.shortTerm.decisions,
      ...results.shortTerm.keyFacts,
      ...results.shortTerm.blockers,
      ...results.shortTerm.plan,
      ...results.longTerm
    ].sort((a, b) => {
      // Prioritize short-term memories slightly
      if (a.source === 'short-term' && b.source === 'long-term') return -1;
      if (a.source === 'long-term' && b.source === 'short-term') return 1;
      
      // Sort by timestamp (most recent first)
      const aTime = new Date(a.timestamp || a.created_at || 0);
      const bTime = new Date(b.timestamp || b.created_at || 0);
      return bTime - aTime;
    });

    return results;
  } catch (error) {
    console.error(`Failed to retrieve memories for ${agentName}:`, error);
    return {
      shortTerm: { observations: [], decisions: [], keyFacts: [], blockers: [], plan: [] },
      longTerm: [],
      combined: [],
      error: error.message,
      query,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Store a memory snippet in long-term storage (Qdrant)
 * @param {string} agentName - The name of the agent
 * @param {string} content - Content to store
 * @param {Object} metadata - Additional metadata
 * @returns {string} Memory ID
 */
async function storeMemorySnippetWithContext(agentName, content, metadata = {}) {
  try {
    // Load current context from working memory
    const workingMemory = await loadWorkingMemory(agentName);
    const context = workingMemory?.currentContext || {};
    
    const enhancedMetadata = {
      agent: agentName,
      storyId: context.storyId,
      epicId: context.epicId,
      taskId: context.taskId,
      timestamp: new Date().toISOString(),
      type: 'agent-observation',
      ...metadata
    };
    
    return await storeMemorySnippet(agentName, content, enhancedMetadata);
  } catch (error) {
    console.error(`Failed to store memory snippet for ${agentName}:`, error);
    return null;
  }
}

/**
 * Archive completed task to long-term memory
 * @param {string} agentName - The name of the agent
 * @param {string} taskId - Task identifier
 * @returns {boolean} Success status
 */
async function archiveTaskMemory(agentName, taskId) {
  try {
    const memory = await loadWorkingMemory(agentName);
    if (!memory) return false;
    
    // Create task summary
    const taskObservations = memory.observations.filter(obs => 
      obs.context?.taskId === taskId
    );
    
    const taskDecisions = memory.decisions.filter(dec => 
      dec.context?.taskId === taskId
    );
    
    const summary = {
      taskId,
      storyId: memory.currentContext?.storyId,
      epicId: memory.currentContext?.epicId,
      agentName,
      observationCount: taskObservations.length,
      keyObservations: taskObservations.slice(-5), // Last 5 observations
      decisions: taskDecisions,
      keyFacts: Object.entries(memory.keyFacts || {})
        .filter(([key, fact]) => fact.context?.taskId === taskId)
        .reduce((acc, [key, fact]) => ({ ...acc, [key]: fact }), {}),
      completedAt: new Date().toISOString()
    };
    
    await storeMemorySnippetWithContext(
      agentName,
      JSON.stringify(summary),
      {
        type: 'task-archive',
        taskId,
        storyId: memory.currentContext?.storyId,
        epicId: memory.currentContext?.epicId
      }
    );
    
    return true;
  } catch (error) {
    console.error(`Failed to archive task memory for ${agentName}:`, error);
    return false;
  }
}

/**
 * Check if agent has sufficient context to proceed
 * @param {string} agentName - The name of the agent
 * @param {Array} requiredContext - Array of required context keys
 * @returns {Object} Context check result
 */
async function checkContextSufficiency(agentName, requiredContext = []) {
  try {
    const memory = await loadWorkingMemory(agentName);
    if (!memory) {
      return {
        sufficient: false,
        missing: requiredContext,
        message: 'No working memory found'
      };
    }
    
    const missing = [];
    const available = {};
    
    for (const contextKey of requiredContext) {
      if (contextKey === 'storyId' && !memory.currentContext?.storyId) {
        missing.push('storyId');
      } else if (contextKey === 'epicId' && !memory.currentContext?.epicId) {
        missing.push('epicId');
      } else if (contextKey === 'taskId' && !memory.currentContext?.taskId) {
        missing.push('taskId');
      } else if (contextKey === 'plan' && (!memory.plan || memory.plan.length === 0)) {
        missing.push('plan');
      } else if (contextKey.startsWith('keyFact:')) {
        const factKey = contextKey.replace('keyFact:', '');
        if (!memory.keyFacts?.[factKey]) {
          missing.push(contextKey);
        } else {
          available[contextKey] = memory.keyFacts[factKey];
        }
      } else {
        // Context key is available
        if (contextKey === 'storyId') available.storyId = memory.currentContext.storyId;
        if (contextKey === 'epicId') available.epicId = memory.currentContext.epicId;
        if (contextKey === 'taskId') available.taskId = memory.currentContext.taskId;
        if (contextKey === 'plan') available.plan = memory.plan;
      }
    }
    
    return {
      sufficient: missing.length === 0,
      missing,
      available,
      message: missing.length === 0 
        ? 'All required context is available'
        : `Missing required context: ${missing.join(', ')}`
    };
  } catch (error) {
    console.error(`Failed to check context sufficiency for ${agentName}:`, error);
    return {
      sufficient: false,
      missing: requiredContext,
      message: `Error checking context: ${error.message}`
    };
  }
}

/**
 * Get memory summary for agent
 * @param {string} agentName - The name of the agent
 * @returns {Object} Memory summary
 */
async function getMemorySummary(agentName) {
  try {
    const memory = await loadWorkingMemory(agentName);
    if (!memory) {
      return {
        agentName,
        hasMemory: false,
        message: 'No working memory found'
      };
    }
    
    return {
      agentName,
      hasMemory: true,
      sessionId: memory.sessionId,
      initialized: memory.initialized,
      lastUpdated: memory.lastUpdated,
      currentContext: memory.currentContext,
      observationCount: memory.observations?.length || 0,
      planItems: memory.plan?.length || 0,
      currentStep: memory.currentStep,
      keyFactCount: Object.keys(memory.keyFacts || {}).length,
      decisionCount: memory.decisions?.length || 0,
      blockerCount: memory.blockers?.filter(b => !b.resolved).length || 0,
      completedTaskCount: memory.completedTasks?.length || 0
    };
  } catch (error) {
    console.error(`Failed to get memory summary for ${agentName}:`, error);
    return {
      agentName,
      hasMemory: false,
      error: error.message
    };
  }
}

/**
 * Clear working memory for an agent
 * @param {string} agentName - The name of the agent
 * @param {boolean} preserveContext - Whether to preserve current context
 * @returns {boolean} Success status
 */
async function clearWorkingMemory(agentName, preserveContext = false) {
  try {
    validateAgentName(agentName);
    const memoryPath = getWorkingMemoryPath(agentName);
    
    if (preserveContext) {
      const memory = await loadWorkingMemory(agentName);
      const context = memory?.currentContext || {};
      await initializeWorkingMemory(agentName, context);
    } else {
      await fs.unlink(memoryPath);
    }
    
    console.log(`Cleared working memory for agent: ${agentName}`);
    return true;
  } catch (error) {
    console.error(`Failed to clear working memory for ${agentName}:`, error);
    return false;
  }
}

/**
 * Perform manual memory hygiene for an agent
 * @param {string} agentName - The name of the agent
 * @param {Object} options - Hygiene options
 * @returns {Promise<Object>} Hygiene results
 */
async function performAgentMemoryHygiene(agentName, options = {}) {
  try {
    validateAgentName(agentName);
    console.log(`Starting manual memory hygiene for agent: ${agentName}`);
    
    const results = await performMemoryHygiene(agentName, { 
      force: true, 
      ...options 
    });
    
    if (results.success) {
      console.log(`Memory hygiene completed successfully for ${agentName}`);
    } else {
      console.warn(`Memory hygiene completed with errors for ${agentName}:`, results.errors);
    }
    
    return results;
  } catch (error) {
    console.error(`Manual memory hygiene failed for ${agentName}:`, error);
    return {
      agentName,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Safely perform memory hygiene in background without blocking
 * @param {string} agentName - The name of the agent
 */
function performMemoryHygieneAsync(agentName) {
  // Check if hygiene is already running for this agent
  if (hygieneQueue.has(agentName)) {
    return; // Skip if already running
  }
  
  // Mark as running
  hygieneQueue.set(agentName, true);
  
  // Run in background with proper error handling
  setImmediate(async () => {
    try {
      const shouldRun = await shouldRunMemoryHygiene(agentName, 'action');
      if (shouldRun) {
        const results = await performMemoryHygiene(agentName);
        if (!results.success && results.errors?.length > 0) {
          console.warn(`Background memory hygiene completed with issues for ${agentName}:`, results.errors);
        }
      }
    } catch (hygieneError) {
      console.error(`Background memory hygiene failed for ${agentName}:`, {
        error: hygieneError.message,
        stack: hygieneError.stack,
        agentName,
        timestamp: new Date().toISOString()
      });
    } finally {
      // Always remove from queue to allow future runs
      hygieneQueue.delete(agentName);
    }
  });
}

module.exports = {
  initializeWorkingMemory,
  loadWorkingMemory,
  updateWorkingMemory,
  retrieveRelevantMemories,
  storeMemorySnippetWithContext,
  archiveTaskMemory,
  checkContextSufficiency,
  getMemorySummary,
  clearWorkingMemory,
  performAgentMemoryHygiene,
  // Export configuration for backward compatibility
  MEMORY_DIR: MEMORY_CONFIG.BASE_DIR,
  MAX_OBSERVATIONS: MEMORY_CONFIG.MAX_OBSERVATIONS
};