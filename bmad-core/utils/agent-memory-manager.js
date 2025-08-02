/**
 * Agent Memory Manager - Comprehensive memory management for BMAD agents
 * Provides consistent short-term and long-term memory operations for SM, Dev, and QA agents
 */

const fs = require('fs').promises;
const path = require('path');
const { storeMemorySnippet, retrieveMemory, closeConnections } = require('./qdrant');
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
const { withTimeout, fireAndForget } = require('./timeout-wrapper');
const {
  logMemoryInit,
  logWorkingMemory,
  logLongTermMemory,
  logMemoryRetrieval,
  logMemoryError,
  logTaskMemory,
  logSessionSummary
} = require('./memory-usage-logger');

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
    
    // Log memory initialization start
    await logMemoryInit(agentName, 'initialize_start', { options });
    
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
    
    // Log successful initialization
    await logMemoryInit(agentName, 'initialize_complete', {
      sessionId: memory.sessionId,
      hasExistingMemory: Object.keys(existingMemory).length > 0,
      contextKeys: Object.keys(memory.currentContext).filter(k => memory.currentContext[k])
    });
    
    return memory;
  } catch (error) {
    console.error(`Failed to initialize working memory for ${agentName}:`, error);
    await logMemoryError(agentName, 'initialize_failed', error, { options });
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
    const memory = await safeReadJson(memoryPath, null);
    
    if (memory) {
      await logWorkingMemory(agentName, 'load_success', 'working_memory', memory, {
        observationCount: memory.observations?.length || 0,
        sessionId: memory.sessionId
      });
    }
    
    return memory;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`No working memory found for agent ${agentName}, will initialize new memory`);
      await logWorkingMemory(agentName, 'load_not_found', 'working_memory', null, { reason: 'file_not_found' });
      return null;
    }
    console.error(`Failed to load working memory for ${agentName}:`, error.message);
    await logMemoryError(agentName, 'load_failed', error);
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
    
    // Log the memory update start
    await logWorkingMemory(agentName, 'update_start', 'working_memory', updates, {
      updateKeys: Object.keys(updates)
    });
    
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
    
    // Log successful memory update
    await logWorkingMemory(agentName, 'update_complete', 'working_memory', updatedMemory, {
      observationCount: updatedMemory.observations?.length || 0,
      decisionCount: updatedMemory.decisions?.length || 0,
      blockerCount: updatedMemory.blockers?.filter(b => !b.resolved).length || 0
    });
    
    // Use setImmediate to ensure we return quickly
    setImmediate(() => {
      // Any post-update operations can happen here
    });
    
    return {
      success: true,
      memory: updatedMemory,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Failed to update working memory for ${agentName}:`, error);
    await logMemoryError(agentName, 'update_failed', error, { updates });
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
    
    // Log memory retrieval start
    await logMemoryRetrieval(agentName, 'retrieve_start', query, 0, { 
      storyId, 
      epicId, 
      topN, 
      shortTermOnly, 
      longTermOnly 
    });
    
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
    if (!longTermOnly) {
      try {
        // Quick check if collection has any data with timeout
        const { getCollectionPointCount } = require('./qdrant');
        const pointCount = await withTimeout(
          getCollectionPointCount,
          2000,
          'Get Collection Point Count'
        )();
        
        if (!pointCount || pointCount === 0) {
          console.log('Qdrant collection is empty or unavailable - skipping long-term memory search');
          results.longTerm = [];
        } else {
          // Create context-aware query for Qdrant
          let contextQuery = query;
          if (storyId) {
            contextQuery += ` story:${storyId}`;
          }
          if (epicId) {
            contextQuery += ` epic:${epicId}`;
          }
          contextQuery += ` agent:${agentName}`;
          
          // Wrap retrieveMemory with timeout
          const longTermMemories = await withTimeout(
            () => retrieveMemory(contextQuery, topN),
            3000,
            'Retrieve Long-term Memory'
          )() || [];
          
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
        }
      } catch (longTermError) {
        console.warn(`Failed to retrieve long-term memories for ${agentName}:`, longTermError.message);
        results.longTermError = longTermError.message;
        results.longTerm = []; // Ensure empty array on error
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

    // Log successful retrieval
    const combinedCount = results.combined.length;
    const shortTermCount = Object.values(results.shortTerm).reduce((sum, arr) => sum + arr.length, 0);
    const longTermCount = results.longTerm.length;
    
    await logMemoryRetrieval(agentName, 'retrieve_complete', query, combinedCount, {
      shortTermCount,
      longTermCount,
      hasError: !!results.longTermError
    });
    
    return results;
  } catch (error) {
    console.error(`Failed to retrieve memories for ${agentName}:`, error);
    await logMemoryError(agentName, 'retrieve_failed', error, { query, options });
    
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
    // Ensure content is a string
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    
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
    
    // Log long-term memory storage
    await logLongTermMemory(agentName, 'store_start', { content: contentStr, metadata: enhancedMetadata }, {
      contentLength: contentStr.length,
      memoryType: enhancedMetadata.type
    });
    
    const memoryId = await storeMemorySnippet(agentName, contentStr, enhancedMetadata);
    
    if (memoryId) {
      await logLongTermMemory(agentName, 'store_complete', { content: contentStr, metadata: enhancedMetadata }, {
        memoryId,
        contentLength: contentStr.length,
        memoryType: enhancedMetadata.type
      });
    } else {
      await logMemoryError(agentName, 'store_failed', new Error('Store returned null'), { content: contentStr, metadata });
    }
    
    return memoryId;
  } catch (error) {
    console.error(`Failed to store memory snippet for ${agentName}:`, error);
    await logMemoryError(agentName, 'store_snippet_failed', error, { content, metadata });
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
    // Wrap memory loading with timeout to prevent hanging
    const memory = await withTimeout(
      loadWorkingMemory,
      3000,
      'Load Working Memory for Context Check'
    )(agentName);
    
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

// Convenience functions for agents that expect specific persist functions
async function persistObservation(agentName, observation, metadata = {}) {
  return updateWorkingMemory(agentName, {
    observation: observation
  });
}

async function persistDecision(agentName, decision, rationale, metadata = {}) {
  return updateWorkingMemory(agentName, {
    decision: decision,
    reasoning: rationale
  });
}

async function persistBlocker(agentName, blocker, metadata = {}) {
  return updateWorkingMemory(agentName, {
    blocker: blocker
  });
}

async function persistBlockerResolution(agentName, blockerId, resolution) {
  const memory = await loadWorkingMemory(agentName);
  const blockerIndex = memory.blockers.findIndex(b => b.blocker === blockerId || b.timestamp === blockerId);
  if (blockerIndex >= 0) {
    memory.blockers[blockerIndex].resolution = resolution;
    memory.blockers[blockerIndex].resolvedAt = new Date().toISOString();
    memory.blockers[blockerIndex].status = 'resolved';
    await updateWorkingMemory(agentName, memory);
  }
}

async function persistTaskCompletion(agentName, taskId, details = {}) {
  await updateWorkingMemory(agentName, {
    completedTasks: [taskId],
    observations: [{
      observation: `Completed task: ${taskId}`,
      timestamp: new Date().toISOString(),
      taskId,
      ...details
    }]
  });
  // Also archive to long-term memory
  return archiveTaskMemory(agentName, taskId);
}

async function persistKeyFact(agentName, fact, metadata = {}) {
  const factKey = `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Use fire-and-forget for key fact persistence to avoid blocking
  fireAndForget(
    async () => updateWorkingMemory(agentName, {
      keyFacts: {
        [factKey]: {
          content: fact,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      }
    }),
    'Persist Key Fact'
  )();
  
  // Return immediately with the fact key
  return factKey;
}

// Add long-term memory save function
async function saveToLongTermMemory(agentName, memoryContent) {
  try {
    // Validate input
    if (!memoryContent || !memoryContent.content) {
      console.warn('saveToLongTermMemory called with invalid content');
      return { saved: false, error: 'Invalid memory content', timestamp: new Date().toISOString() };
    }
    
    await logLongTermMemory(agentName, 'save_start', memoryContent, {
      memoryType: memoryContent.memoryType,
      hasContent: !!memoryContent.content
    });
    
    // Execute the actual save operation synchronously to ensure proper error handling
    const result = await storeMemorySnippetWithContext(agentName, memoryContent.content, {
      ...memoryContent.metadata,
      memoryType: memoryContent.memoryType || 'general'
    });
    
    if (!result) {
      throw new Error('Failed to store memory snippet - no result returned');
    }
    
    await logLongTermMemory(agentName, 'save_complete', memoryContent, {
      memoryId: result,
      memoryType: memoryContent.memoryType
    });
    
    // Return success with the memory ID
    return { 
      saved: true, 
      memoryId: result,
      timestamp: new Date().toISOString() 
    };
  } catch (error) {
    await logMemoryError(agentName, 'save_long_term_failed', error, { memoryContent });
    return { saved: false, error: error.message, timestamp: new Date().toISOString() };
  }
}

// Add missing validation and summary functions
async function loadMemoryWithValidation(agentName, context = {}) {
  const memory = await loadWorkingMemory(agentName);
  const sufficiency = await checkContextSufficiency(agentName, context);
  
  return {
    memory,
    validation: {
      hasSufficientContext: sufficiency.hasSufficientContext,
      recommendations: sufficiency.recommendations || []
    }
  };
}

async function createSessionSummary(agentName, sessionDetails = {}) {
  try {
    await logSessionSummary(agentName, 'create_start', sessionDetails, { hasDetails: Object.keys(sessionDetails).length > 0 });
    
    // Load memory with timeout
    const memory = await withTimeout(
      loadWorkingMemory,
      2000,
      'Load Working Memory'
    )(agentName) || {};
    
    const summary = {
      agentName,
      sessionEnd: new Date().toISOString(),
      tasksCompleted: memory.completedTasks || [],
      decisionsMode: memory.decisions?.length || 0,
      observationsMade: memory.observations?.length || 0,
      blockersEncountered: memory.blockers?.filter(b => b.status === 'active').length || 0,
      ...sessionDetails
    };
    
    await logSessionSummary(agentName, 'create_complete', summary, {
      taskCount: summary.tasksCompleted.length,
      decisionCount: summary.decisionsMode,
      observationCount: summary.observationsMade
    });
    
    // Fire and forget the persist operation - don't wait for it
    fireAndForget(
      async () => persistKeyFact(agentName, `Session Summary: ${JSON.stringify(summary)}`, {
        type: 'session-summary',
        sessionEnd: summary.sessionEnd
      }),
      'Persist Session Summary'
    )();
    
    return summary;
  } catch (error) {
    console.log(`⚡ Session summary creation failed: ${error.message}`);
    await logMemoryError(agentName, 'create_session_summary_failed', error, { sessionDetails });
    
    // Return minimal summary on error
    return {
      agentName,
      sessionEnd: new Date().toISOString(),
      error: error.message,
      ...sessionDetails
    };
  }
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
  // Add the missing persist functions
  persistObservation,
  persistDecision,
  persistBlocker,
  persistBlockerResolution,
  persistTaskCompletion,
  persistKeyFact,
  saveToLongTermMemory,
  loadMemoryWithValidation,
  createSessionSummary,
  // Export configuration for backward compatibility
  MEMORY_DIR: MEMORY_CONFIG.BASE_DIR,
  MAX_OBSERVATIONS: MEMORY_CONFIG.MAX_OBSERVATIONS
};

// Command-line interface
if (require.main === module) {
  const command = process.argv[2];
  const agentName = process.argv[3];
  
  async function runCommand() {
    try {
      switch (command) {
        case 'checkContextSufficiency': {
          if (!agentName) {
            console.error('Error: Agent name is required');
            await closeConnections();
            process.exit(1);
          }
          
          // Parse required context from additional arguments
          const requiredContext = process.argv.slice(4);
          
          console.log(`Checking context sufficiency for agent: ${agentName}`);
          const result = await checkContextSufficiency(agentName, requiredContext);
          
          // Output result as JSON for parsing
          console.log(JSON.stringify(result, null, 2));
          
          // Exit with appropriate code
          await closeConnections();
          process.exit(result.sufficient ? 0 : 1);
          break;
        }
        
        case 'initializeWorkingMemory': {
          if (!agentName) {
            console.error('Error: Agent name is required');
            await closeConnections();
            process.exit(1);
          }
          
          console.log(`Initializing working memory for agent: ${agentName}`);
          const result = await initializeWorkingMemory(agentName);
          console.log(JSON.stringify(result, null, 2));
          await closeConnections();
          process.exit(0);
          break;
        }
        
        case 'getMemorySummary': {
          if (!agentName) {
            console.error('Error: Agent name is required');
            await closeConnections();
            process.exit(1);
          }
          
          console.log(`Getting memory summary for agent: ${agentName}`);
          const result = await getMemorySummary(agentName);
          console.log(JSON.stringify(result, null, 2));
          await closeConnections();
          process.exit(0);
          break;
        }
        
        case 'updateWorkingMemoryAndExit':
        case 'saveToLongTermMemoryAndExit':
          console.error(`Error: Command '${command}' is not available in agent-memory-manager.js`);
          console.error('These commands are only available in agent-memory-loader.js');
          console.error('Please use: node .bmad-core/utils/agent-memory-loader.js ' + command);
          await closeConnections();
          process.exit(1);
          break;
          
        default:
          console.error(`Error: Unknown command '${command}'`);
          console.error('Available commands: checkContextSufficiency, initializeWorkingMemory, getMemorySummary');
          console.error('Note: updateWorkingMemoryAndExit and saveToLongTermMemoryAndExit are only available in agent-memory-loader.js');
          await closeConnections();
          process.exit(1);
      }
    } catch (error) {
      console.error(`Command failed: ${error.message}`);
      console.error(error.stack);
      await closeConnections();
      process.exit(1);
    }
  }
  
  // Add timeout for the entire command execution
  const timeout = setTimeout(async () => {
    console.error('Command timed out after 10 seconds');
    await closeConnections();
    process.exit(1);
  }, 10000);
  
  runCommand().finally(() => {
    clearTimeout(timeout);
  });
}