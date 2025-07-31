/**
 * Unified Memory Manager - Provides standardized memory operations for structured tasks
 * Integrates with existing memory utilities to provide consistent memory management
 * across all agents and tasks in the BMAD framework
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

// Configuration caching
let configCache = null;
let configCacheTimestamp = null;
const CONFIG_CACHE_TTL = 60000; // 1 minute

// Dependency validation
let agentMemoryManager = null;
let memoryConfig = null;
let qdrantModule = null;

// Memory operation lock to prevent race conditions
const memoryLocks = new Map();

/**
 * Initialize dependencies with existence checks
 */
function initializeDependencies() {
  try {
    agentMemoryManager = require('./agent-memory-manager');
  } catch (error) {
    console.warn('agent-memory-manager not available, some functionality will be limited:', error.message);
    agentMemoryManager = {
      initializeWorkingMemory: () => Promise.resolve(null),
      loadWorkingMemory: () => Promise.resolve(null),
      updateWorkingMemory: () => Promise.resolve(true),
      retrieveRelevantMemories: () => Promise.resolve([]),
      storeMemorySnippetWithContext: () => Promise.resolve(null),
      archiveTaskMemory: () => Promise.resolve(false),
      getMemorySummary: () => Promise.resolve({}),
      clearWorkingMemory: () => Promise.resolve(true)
    };
  }
  
  try {
    memoryConfig = require('./memory-config');
  } catch (error) {
    console.warn('memory-config not available, using defaults:', error.message);
    memoryConfig = { MEMORY_CONFIG: {} };
  }
  
  try {
    qdrantModule = require('./qdrant');
  } catch (error) {
    console.warn('qdrant module not available, vector search will be disabled:', error.message);
    qdrantModule = {
      storeMemorySnippet: () => Promise.resolve(null),
      retrieveMemory: () => Promise.resolve([])
    };
  }
}

// Initialize dependencies on module load
initializeDependencies();

const { 
  initializeWorkingMemory,
  loadWorkingMemory,
  updateWorkingMemory,
  retrieveRelevantMemories,
  storeMemorySnippetWithContext,
  archiveTaskMemory,
  getMemorySummary,
  clearWorkingMemory
} = agentMemoryManager;
const { MEMORY_CONFIG } = memoryConfig;
const { storeMemorySnippet, retrieveMemory } = qdrantModule;

/**
 * Validate input parameters
 * @param {string} agentName - Agent name to validate
 * @param {Object} context - Context object to validate
 * @throws {Error} If validation fails
 */
function validateInputs(agentName, context = {}) {
  if (!agentName || typeof agentName !== 'string' || agentName.trim().length === 0) {
    throw new Error('Invalid agentName: must be a non-empty string');
  }
  
  // Sanitize agent name
  const sanitizedName = agentName.replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitizedName !== agentName) {
    throw new Error(`Invalid agentName format: ${agentName}. Only letters, numbers, hyphens and underscores allowed.`);
  }
  
  if (typeof context !== 'object' || context === null) {
    throw new Error('Invalid context: must be an object');
  }
  
  // Validate context properties if present
  if (context.taskId && typeof context.taskId !== 'string') {
    throw new Error('Invalid context.taskId: must be a string');
  }
  if (context.storyId && typeof context.storyId !== 'string') {
    throw new Error('Invalid context.storyId: must be a string');
  }
  if (context.epicId && typeof context.epicId !== 'string') {
    throw new Error('Invalid context.epicId: must be a string');
  }
}

/**
 * Acquire memory lock to prevent race conditions
 * @param {string} agentName - Agent name
 * @returns {Promise<Function>} Release function
 */
async function acquireMemoryLock(agentName) {
  const lockKey = `memory_${agentName}`;
  
  // Wait for existing lock to be released
  while (memoryLocks.has(lockKey)) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // Acquire lock
  const lockTimestamp = Date.now();
  memoryLocks.set(lockKey, lockTimestamp);
  
  // Return release function
  return () => {
    if (memoryLocks.get(lockKey) === lockTimestamp) {
      memoryLocks.delete(lockKey);
    }
  };
}

/**
 * Load and merge memory configuration from core-config.yaml with caching
 * @returns {Object} Memory configuration with defaults
 */
async function loadMemoryConfig() {
  try {
    // Check cache first
    const now = Date.now();
    if (configCache && configCacheTimestamp && (now - configCacheTimestamp) < CONFIG_CACHE_TTL) {
      return configCache;
    }
    
    const configPath = path.join(process.cwd(), 'bmad-core', 'core-config.yaml');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = yaml.load(configContent);
    
    // Build memory config with fallback to defaults
    const memoryConfigResult = {
      enabled: config.memory?.enabled ?? true,
      baseDirectory: config.memory?.baseDirectory ?? '.ai',
      debug: {
        enabled: config.memory?.debug?.enabled ?? false,
        logLevel: config.memory?.debug?.logLevel ?? 'info',
        logFile: config.memory?.debug?.logFile ?? '.ai/memory-debug.log'
      },
      retentionPolicies: {
        workingMemory: {
          maxAgeDays: config.memory?.retentionPolicies?.workingMemory?.maxAgeDays ?? 7,
          maxObservations: config.memory?.retentionPolicies?.workingMemory?.maxObservations ?? 100,
          maxDecisions: config.memory?.retentionPolicies?.workingMemory?.maxDecisions ?? 50,
          maxKeyFacts: config.memory?.retentionPolicies?.workingMemory?.maxKeyFacts ?? 200,
          maxBlockers: config.memory?.retentionPolicies?.workingMemory?.maxBlockers ?? 25,
          autoCleanup: config.memory?.retentionPolicies?.workingMemory?.autoCleanup ?? true
        },
        longTermMemory: {
          maxAgeDays: config.memory?.retentionPolicies?.longTermMemory?.maxAgeDays ?? 90,
          autoArchive: config.memory?.retentionPolicies?.longTermMemory?.autoArchive ?? true,
          summarizationThreshold: config.memory?.retentionPolicies?.longTermMemory?.summarizationThreshold ?? 1000,
          compressionEnabled: config.memory?.retentionPolicies?.longTermMemory?.compressionEnabled ?? true
        },
        archiveMemory: {
          maxAgeDays: config.memory?.retentionPolicies?.archiveMemory?.maxAgeDays ?? 365,
          autoDelete: config.memory?.retentionPolicies?.archiveMemory?.autoDelete ?? false
        }
      },
      hygiene: {
        enableAutoSummarization: config.memory?.hygiene?.enableAutoSummarization ?? true,
        summarizationInterval: config.memory?.hygiene?.summarizationInterval ?? 'daily',
        cleanupSchedule: config.memory?.hygiene?.cleanupSchedule ?? '0 2 * * *',
        maxMemorySize: config.memory?.hygiene?.maxMemorySize ?? '100MB'
      },
      tagging: {
        includeStoryId: config.memory?.tagging?.includeStoryId ?? true,
        includeEpicId: config.memory?.tagging?.includeEpicId ?? true,
        includeAgentRole: config.memory?.tagging?.includeAgentRole ?? true,
        includeTimestamp: config.memory?.tagging?.includeTimestamp ?? true,
        customTags: config.memory?.tagging?.customTags ?? []
      },
      qdrant: {
        enabled: config.memory?.qdrant?.enabled ?? true,
        host: config.memory?.qdrant?.host ?? 'localhost',
        port: config.memory?.qdrant?.port ?? 6333,
        collection: config.memory?.qdrant?.collection ?? 'bmad_agent_memory',
        vectorSize: config.memory?.qdrant?.vectorSize ?? 384,
        healthCheckInterval: config.memory?.qdrant?.healthCheckInterval ?? 30000
      },
      delays: {
        memoryLockTimeout: config.memory?.delays?.memoryLockTimeout ?? 5000,
        batchTaskDelay: config.memory?.delays?.batchTaskDelay ?? 500,
        retryDelay: config.memory?.delays?.retryDelay ?? 1000
      }
    };
    
    // Cache the result
    configCache = memoryConfigResult;
    configCacheTimestamp = now;
    
    return memoryConfigResult;
  } catch (error) {
    console.warn('Could not load memory config from core-config.yaml, using defaults:', error.message);
    const defaultConfig = {
      enabled: true,
      baseDirectory: '.ai',
      debug: { enabled: false, logLevel: 'info', logFile: '.ai/memory-debug.log' },
      retentionPolicies: {
        workingMemory: { maxAgeDays: 7, maxObservations: 100, maxDecisions: 50, maxKeyFacts: 200, maxBlockers: 25, autoCleanup: true },
        longTermMemory: { maxAgeDays: 90, autoArchive: true, summarizationThreshold: 1000, compressionEnabled: true },
        archiveMemory: { maxAgeDays: 365, autoDelete: false }
      },
      hygiene: { enableAutoSummarization: true, summarizationInterval: 'daily', cleanupSchedule: '0 2 * * *', maxMemorySize: '100MB' },
      tagging: { includeStoryId: true, includeEpicId: true, includeAgentRole: true, includeTimestamp: true, customTags: [] },
      qdrant: { enabled: true, host: 'localhost', port: 6333, collection: 'bmad_agent_memory', vectorSize: 384, healthCheckInterval: 30000 },
      delays: { memoryLockTimeout: 5000, batchTaskDelay: 500, retryDelay: 1000 }
    };
    
    // Cache the default config
    configCache = defaultConfig;
    configCacheTimestamp = Date.now();
    
    return defaultConfig;
  }
}

/**
 * Load memory for structured task execution
 * This is the standardized entry point for all structured tasks
 * @param {string} agentName - Name of the agent (sm, dev, qa, etc.)
 * @param {Object} context - Task context information
 * @param {string} context.taskId - Current task identifier
 * @param {string} context.storyId - Current story identifier
 * @param {string} context.epicId - Current epic identifier
 * @returns {Object} Combined memory object with short-term and relevant long-term memories
 */
async function loadMemoryForTask(agentName, context = {}) {
  // Validate inputs
  try {
    validateInputs(agentName, context);
  } catch (validationError) {
    throw new Error(`Input validation failed: ${validationError.message}`);
  }
  
  const releaseLock = await acquireMemoryLock(agentName);
  
  try {
    const memoryConfig = await loadMemoryConfig();
    
    if (!memoryConfig.enabled) {
      console.log('Memory system is disabled in configuration');
      return { shortTerm: null, longTerm: [], config: memoryConfig };
    }

    // Load or initialize short-term memory
    let shortTermMemory = await loadWorkingMemory(agentName);
    if (!shortTermMemory) {
      console.log(`No existing memory found for ${agentName}, initializing new memory`);
      shortTermMemory = await initializeWorkingMemory(agentName, context);
    } else {
      // Update context if provided
      if (context.taskId || context.storyId || context.epicId) {
        await updateWorkingMemory(agentName, { currentContext: context });
        shortTermMemory = await loadWorkingMemory(agentName);
      }
    }

    // Query long-term memory if enabled
    let longTermMemories = [];
    if (memoryConfig.qdrant.enabled) {
      try {
        const query = buildContextQuery(agentName, context);
        longTermMemories = await retrieveRelevantMemories(agentName, query, {
          storyId: context.storyId,
          epicId: context.epicId,
          topN: 10
        });
      } catch (qdrantError) {
        console.warn(`Failed to retrieve long-term memories: ${qdrantError.message}`);
        longTermMemories = [];
      }
    }

    return {
      shortTerm: shortTermMemory,
      longTerm: longTermMemories,
      config: memoryConfig
    };
  } catch (error) {
    const errorMessage = `Failed to load memory for task (agent: ${agentName}): ${error.message}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  } finally {
    releaseLock();
  }
}

/**
 * Save and clean memory after structured task execution
 * This implements the memory hygiene policies defined in configuration
 * @param {string} agentName - Name of the agent
 * @param {Object} taskData - Task execution data to save
 * @param {Object} options - Additional options
 * @returns {Object} Operation result
 */
async function saveAndCleanMemory(agentName, taskData = {}, options = {}) {
  // Validate inputs
  try {
    validateInputs(agentName, taskData.context || {});
  } catch (validationError) {
    throw new Error(`Input validation failed: ${validationError.message}`);
  }
  
  const releaseLock = await acquireMemoryLock(agentName);
  
  try {
    const memoryConfig = await loadMemoryConfig();
    
    if (!memoryConfig.enabled) {
      console.log('Memory system is disabled in configuration');
      return { success: true, message: 'Memory system disabled' };
    }

    const results = {
      success: true,
      operations: [],
      warnings: []
    };

    // Save task observations to short-term memory
    if (taskData.observation) {
      await updateWorkingMemory(agentName, {
        observation: taskData.observation,
        currentContext: taskData.context || {}
      });
      results.operations.push('Saved observation to short-term memory');
    }

    // Save decisions and key facts
    if (taskData.decision) {
      await updateWorkingMemory(agentName, {
        decision: taskData.decision,
        reasoning: taskData.reasoning,
        currentContext: taskData.context || {}
      });
      results.operations.push('Saved decision to short-term memory');
    }

    if (taskData.keyFact) {
      await updateWorkingMemory(agentName, {
        keyFact: taskData.keyFact,
        currentContext: taskData.context || {}
      });
      results.operations.push('Saved key fact to short-term memory');
    }

    // Archive to long-term memory if task is completed
    if (taskData.taskCompleted && taskData.taskId) {
      const archived = await archiveTaskMemory(agentName, taskData.taskId);
      if (archived) {
        results.operations.push('Archived task to long-term memory');
      } else {
        results.warnings.push('Failed to archive task to long-term memory');
      }
    }

    // Store significant findings in Qdrant if enabled
    if (memoryConfig.qdrant.enabled && taskData.significantFinding) {
      const metadata = buildMemoryTags(agentName, taskData.context || {}, memoryConfig.tagging);
      const memoryId = await storeMemorySnippetWithContext(
        agentName,
        taskData.significantFinding,
        { ...metadata, type: 'significant-finding' }
      );
      if (memoryId) {
        results.operations.push('Stored significant finding in long-term memory');
      } else {
        results.warnings.push('Failed to store finding in long-term memory');
      }
    }

    // Perform memory hygiene based on policies
    if (memoryConfig.retentionPolicies.workingMemory.autoCleanup) {
      const cleanupResult = await performMemoryCleanup(agentName, memoryConfig);
      if (cleanupResult.cleaned) {
        results.operations.push(`Memory cleanup: ${cleanupResult.itemsCleaned} items cleaned`);
      }
    }

    return results;
  } catch (error) {
    const errorMessage = `Failed to save and clean memory for ${agentName}: ${error.message}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  } finally {
    releaseLock();
  }
}

/**
 * Build context query for long-term memory retrieval
 * @param {string} agentName - Agent name
 * @param {Object} context - Task context
 * @returns {string} Query string
 */
function buildContextQuery(agentName, context) {
  const queryParts = [];
  
  if (context.storyId) {
    queryParts.push(`story:${context.storyId}`);
  }
  if (context.epicId) {
    queryParts.push(`epic:${context.epicId}`);
  }
  if (context.taskType) {
    queryParts.push(`task:${context.taskType}`);
  }
  
  queryParts.push(`agent:${agentName}`);
  
  return queryParts.join(' ');
}

/**
 * Build memory tags based on configuration
 * @param {string} agentName - Agent name
 * @param {Object} context - Task context
 * @param {Object} taggingConfig - Tagging configuration
 * @returns {Object} Tags metadata
 */
function buildMemoryTags(agentName, context, taggingConfig) {
  const tags = {};
  
  if (taggingConfig.includeAgentRole) {
    tags.agent = agentName;
  }
  if (taggingConfig.includeStoryId && context.storyId) {
    tags.storyId = context.storyId;
  }
  if (taggingConfig.includeEpicId && context.epicId) {
    tags.epicId = context.epicId;
  }
  if (taggingConfig.includeTimestamp) {
    tags.timestamp = new Date().toISOString();
  }
  
  // Add custom tags if configured
  if (taggingConfig.customTags && taggingConfig.customTags.length > 0) {
    taggingConfig.customTags.forEach(tag => {
      if (context[tag]) {
        tags[tag] = context[tag];
      }
    });
  }
  
  return tags;
}

/**
 * Perform memory cleanup based on retention policies
 * @param {string} agentName - Agent name
 * @param {Object} memoryConfig - Memory configuration
 * @returns {Object} Cleanup result
 */
async function performMemoryCleanup(agentName, memoryConfig) {
  try {
    const memory = await loadWorkingMemory(agentName);
    if (!memory) {
      return { cleaned: false, itemsCleaned: 0 };
    }

    let itemsCleaned = 0;
    const policies = memoryConfig.retentionPolicies.workingMemory;
    
    // Clean old observations
    if (memory.observations && memory.observations.length > policies.maxObservations) {
      const originalCount = memory.observations.length;
      const keepCount = policies.maxObservations;
      memory.observations = memory.observations.slice(-keepCount);
      itemsCleaned += originalCount - keepCount;
    }
    
    // Clean old decisions
    if (memory.decisions && memory.decisions.length > policies.maxDecisions) {
      const originalCount = memory.decisions.length;
      const keepCount = policies.maxDecisions;
      memory.decisions = memory.decisions.slice(-keepCount);
      itemsCleaned += originalCount - keepCount;
    }
    
    // Clean old blockers (only resolved ones older than retention period)
    if (memory.blockers && memory.blockers.length > policies.maxBlockers) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policies.maxAgeDays);
      
      const keptBlockers = memory.blockers.filter(blocker => {
        if (!blocker.resolved) return true; // Keep unresolved blockers
        const blockerDate = new Date(blocker.timestamp);
        return blockerDate > cutoffDate; // Keep recent resolved blockers
      });
      
      itemsCleaned += memory.blockers.length - keptBlockers.length;
      memory.blockers = keptBlockers;
    }
    
    // Clean old key facts
    if (memory.keyFacts && Object.keys(memory.keyFacts).length > policies.maxKeyFacts) {
      const factEntries = Object.entries(memory.keyFacts);
      factEntries.sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));
      
      const keptFacts = {};
      factEntries.slice(0, policies.maxKeyFacts).forEach(([key, fact]) => {
        keptFacts[key] = fact;
      });
      
      itemsCleaned += Object.keys(memory.keyFacts).length - Object.keys(keptFacts).length;
      memory.keyFacts = keptFacts;
    }
    
    // Save cleaned memory if any changes were made
    if (itemsCleaned > 0) {
      memory.lastCleaned = new Date().toISOString();
      await updateWorkingMemory(agentName, memory);
    }
    
    return { cleaned: itemsCleaned > 0, itemsCleaned };
  } catch (error) {
    console.error(`Memory cleanup failed for ${agentName}:`, error);
    return { cleaned: false, itemsCleaned: 0, error: error.message };
  }
}

/**
 * Summarize and archive old memories
 * @param {string} agentName - Agent name
 * @returns {Object} Summarization result
 */
async function summarizeAndArchiveMemories(agentName) {
  try {
    const memoryConfig = await loadMemoryConfig();
    const memory = await loadWorkingMemory(agentName);
    
    if (!memory || !memoryConfig.hygiene.enableAutoSummarization) {
      return { success: false, message: 'Summarization disabled or no memory found' };
    }
    
    // Get old observations for summarization
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - memoryConfig.retentionPolicies.workingMemory.maxAgeDays);
    
    const oldObservations = (memory.observations || []).filter(obs => 
      new Date(obs.timestamp) < cutoffDate
    );
    
    if (oldObservations.length < 5) {
      return { success: false, message: 'Not enough old observations to summarize' };
    }
    
    // Create summary of old observations
    const summary = {
      agentName,
      summaryType: 'automated-cleanup',
      period: {
        start: oldObservations[0].timestamp,
        end: oldObservations[oldObservations.length - 1].timestamp
      },
      observationCount: oldObservations.length,
      keyThemes: extractKeyThemes(oldObservations),
      significantEvents: oldObservations.filter(obs => 
        obs.content.includes('ERROR') || 
        obs.content.includes('SUCCESS') || 
        obs.content.includes('CRITICAL')
      ).slice(0, 5),
      summarizedAt: new Date().toISOString()
    };
    
    // Store summary in long-term memory
    if (memoryConfig.qdrant.enabled) {
      const metadata = buildMemoryTags(agentName, {}, memoryConfig.tagging);
      await storeMemorySnippetWithContext(
        agentName,
        JSON.stringify(summary),
        { ...metadata, type: 'automated-summary' }
      );
    }
    
    // Remove summarized observations from working memory
    memory.observations = memory.observations.filter(obs => 
      new Date(obs.timestamp) >= cutoffDate
    );
    
    memory.lastSummarized = new Date().toISOString();
    await updateWorkingMemory(agentName, memory);
    
    return {
      success: true,
      summarizedObservations: oldObservations.length,
      summaryStored: true
    };
  } catch (error) {
    console.error(`Memory summarization failed for ${agentName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Extract key themes from observations for summarization
 * @param {Array} observations - Array of observation objects
 * @returns {Array} Array of key themes
 */
function extractKeyThemes(observations) {
  const themes = new Map();
  
  observations.forEach(obs => {
    const content = obs.content.toLowerCase();
    
    // Simple keyword extraction for themes
    if (content.includes('error') || content.includes('fail')) {
      themes.set('errors', (themes.get('errors') || 0) + 1);
    }
    if (content.includes('success') || content.includes('complete')) {
      themes.set('successes', (themes.get('successes') || 0) + 1);
    }
    if (content.includes('implement') || content.includes('develop')) {
      themes.set('implementation', (themes.get('implementation') || 0) + 1);
    }
    if (content.includes('test') || content.includes('verify')) {
      themes.set('testing', (themes.get('testing') || 0) + 1);
    }
    if (content.includes('review') || content.includes('check')) {
      themes.set('reviews', (themes.get('reviews') || 0) + 1);
    }
  });
  
  // Return top themes
  return Array.from(themes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme, count]) => ({ theme, count }));
}

/**
 * Get memory status and statistics
 * @param {string} agentName - Agent name
 * @returns {Object} Memory status
 */
async function getMemoryStatus(agentName) {
  try {
    const memoryConfig = await loadMemoryConfig();
    const summary = await getMemorySummary(agentName);
    
    return {
      agent: agentName,
      enabled: memoryConfig.enabled,
      workingMemory: summary,
      config: {
        retentionDays: memoryConfig.retentionPolicies.workingMemory.maxAgeDays,
        maxObservations: memoryConfig.retentionPolicies.workingMemory.maxObservations,
        autoCleanup: memoryConfig.retentionPolicies.workingMemory.autoCleanup,
        qdrantEnabled: memoryConfig.qdrant.enabled
      }
    };
  } catch (error) {
    return {
      agent: agentName,
      enabled: false,
      error: error.message
    };
  }
}

module.exports = {
  loadMemoryForTask,
  saveAndCleanMemory,
  summarizeAndArchiveMemories,
  getMemoryStatus,
  loadMemoryConfig,
  
  // Re-export existing functions for backward compatibility
  initializeWorkingMemory,
  loadWorkingMemory,
  updateWorkingMemory,
  clearWorkingMemory,
  archiveTaskMemory
};