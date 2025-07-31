/**
 * Memory Hygiene Manager - Automatic cleanup and maintenance of agent short-term memory
 * Prevents hallucination by managing memory size and relevance, archiving old entries to long-term storage
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { storeContextualMemory, retrieveMemory } = require('./qdrant');
const { createSessionSummary } = require('./memory-summarizer');
const { getWorkingMemoryPath, MEMORY_CONFIG } = require('./memory-config');
const { safeReadJson, safeWriteJson } = require('./safe-file-operations');
const VerboseLogger = require('./verbose-logger');

// Initialize logger
const logger = new VerboseLogger({
  verbosity: true,
  prefix: '🧹'
});

/**
 * Load memory hygiene configuration
 * @returns {Promise<Object>} Hygiene configuration
 */
async function loadHygieneConfig() {
  try {
    // Try multiple config file locations following established patterns
    const configPaths = [
      path.join(process.cwd(), 'bmad-core', 'core-config.yaml'),
      path.join(process.cwd(), '.bmad-workflow.yaml'),
      path.join(process.cwd(), 'bmad-workflow.config.yaml')
    ];
    
    let config = null;
    
    for (const configPath of configPaths) {
      try {
        // Use fs.promises.access instead of synchronous operations
        await fs.access(configPath);
        const configContent = await fs.readFile(configPath, 'utf8');
        const loadedConfig = yaml.load(configContent);
        if (loadedConfig?.memory?.hygiene) {
          config = loadedConfig.memory.hygiene;
          break;
        }
      } catch (pathError) {
        // Continue to next path
        continue;
      }
    }
    
    // Return loaded config or defaults
    return config || getDefaultHygieneConfig();
  } catch (error) {
    logger.warn('Failed to load hygiene config, using defaults:', error.message);
    return getDefaultHygieneConfig();
  }
}

/**
 * Get default hygiene configuration
 * @returns {Object} Default hygiene configuration
 */
function getDefaultHygieneConfig() {
  return {
    enableAutoCleanup: true,
    workingMemoryLimits: {
      maxObservations: 100,
      maxDecisions: 50,
      maxKeyFacts: 200,
      maxBlockers: 25,
      maxAgeHours: 168
    },
    cleanupTriggers: {
      runAfterEachAction: true,
      runOnMemoryThreshold: 0.8,
      runOnAgeThreshold: true
    },
    archivalRules: {
      summarizeBeforeDelete: true,
      retainCriticalFacts: true,
      preserveActiveBlockers: true,
      minimumEntriesBeforeCleanup: 10
    }
  };
}

/**
 * Analyze memory usage and determine if cleanup is needed
 * @param {Object} workingMemory - Agent's working memory
 * @param {Object} config - Hygiene configuration
 * @returns {Object} Analysis result with cleanup recommendations
 */
function analyzeMemoryUsage(workingMemory, config) {
  const limits = config.workingMemoryLimits;
  const triggers = config.cleanupTriggers;
  
  const usage = {
    observations: {
      current: workingMemory.observations?.length || 0,
      limit: limits.maxObservations,
      ratio: (workingMemory.observations?.length || 0) / limits.maxObservations
    },
    decisions: {
      current: workingMemory.decisions?.length || 0,
      limit: limits.maxDecisions,
      ratio: (workingMemory.decisions?.length || 0) / limits.maxDecisions
    },
    keyFacts: {
      current: Object.keys(workingMemory.keyFacts || {}).length,
      limit: limits.maxKeyFacts,
      ratio: Object.keys(workingMemory.keyFacts || {}).length / limits.maxKeyFacts
    },
    blockers: {
      current: workingMemory.blockers?.length || 0,
      limit: limits.maxBlockers,
      ratio: (workingMemory.blockers?.length || 0) / limits.maxBlockers
    }
  };

  // Check age-based cleanup needs
  const memoryAge = workingMemory.initialized ? 
    (Date.now() - new Date(workingMemory.initialized).getTime()) / (1000 * 60 * 60) : 0;
  const ageCleanupNeeded = triggers.runOnAgeThreshold && memoryAge > limits.maxAgeHours;

  // Check threshold-based cleanup needs
  const maxRatio = Math.max(usage.observations.ratio, usage.decisions.ratio, usage.keyFacts.ratio, usage.blockers.ratio);
  const thresholdCleanupNeeded = maxRatio >= triggers.runOnMemoryThreshold;

  // Determine which sections need cleanup
  const sectionsNeedingCleanup = [];
  if (usage.observations.ratio >= triggers.runOnMemoryThreshold) sectionsNeedingCleanup.push('observations');
  if (usage.decisions.ratio >= triggers.runOnMemoryThreshold) sectionsNeedingCleanup.push('decisions');
  if (usage.keyFacts.ratio >= triggers.runOnMemoryThreshold) sectionsNeedingCleanup.push('keyFacts');
  if (usage.blockers.ratio >= triggers.runOnMemoryThreshold) sectionsNeedingCleanup.push('blockers');

  return {
    usage,
    memoryAge,
    cleanupNeeded: ageCleanupNeeded || thresholdCleanupNeeded,
    reasons: {
      ageThreshold: ageCleanupNeeded,
      memoryThreshold: thresholdCleanupNeeded,
      maxRatio
    },
    sectionsNeedingCleanup,
    recommendations: generateCleanupRecommendations(usage, config)
  };
}

/**
 * Generate cleanup recommendations based on usage analysis
 * @param {Object} usage - Memory usage analysis
 * @param {Object} config - Hygiene configuration
 * @returns {Array} Array of recommendations
 */
function generateCleanupRecommendations(usage, config) {
  const recommendations = [];
  const threshold = config.cleanupTriggers.runOnMemoryThreshold;

  if (usage.observations.ratio >= threshold) {
    const excess = usage.observations.current - Math.floor(usage.observations.limit * threshold);
    recommendations.push({
      section: 'observations',
      action: 'archive_oldest',
      count: excess,
      reason: `Observations at ${Math.round(usage.observations.ratio * 100)}% of limit`
    });
  }

  if (usage.decisions.ratio >= threshold) {
    const excess = usage.decisions.current - Math.floor(usage.decisions.limit * threshold);
    recommendations.push({
      section: 'decisions',
      action: 'archive_oldest',
      count: excess,
      reason: `Decisions at ${Math.round(usage.decisions.ratio * 100)}% of limit`
    });
  }

  if (usage.keyFacts.ratio >= threshold) {
    const excess = usage.keyFacts.current - Math.floor(usage.keyFacts.limit * threshold);
    recommendations.push({
      section: 'keyFacts',
      action: 'archive_non_critical',
      count: excess,
      reason: `Key facts at ${Math.round(usage.keyFacts.ratio * 100)}% of limit`
    });
  }

  if (usage.blockers.ratio >= threshold) {
    const excess = usage.blockers.current - Math.floor(usage.blockers.limit * threshold);
    recommendations.push({
      section: 'blockers',
      action: 'archive_resolved',
      count: excess,
      reason: `Blockers at ${Math.round(usage.blockers.ratio * 100)}% of limit`
    });
  }

  return recommendations;
}

/**
 * Archive entries to long-term memory before cleanup
 * @param {string} agentName - Agent name
 * @param {Array} entriesToArchive - Entries to archive
 * @param {string} section - Memory section being archived
 * @param {Object} context - Current context
 * @returns {Promise<string>} Archive operation result
 */
async function archiveEntriesToLongTermMemory(agentName, entriesToArchive, section, context = {}) {
  try {
    if (!entriesToArchive || entriesToArchive.length === 0) {
      return 'No entries to archive';
    }

    // Create a summary of entries being archived
    const archiveText = createArchiveSummary(entriesToArchive, section, agentName);
    
    // Store in Qdrant with appropriate metadata
    const archiveId = await storeContextualMemory(
      agentName,
      archiveText,
      {
        storyId: context.storyId,
        epicId: context.epicId,
        type: `archived-${section}`,
        archiveTimestamp: new Date().toISOString(),
        agentName,
        entryCount: entriesToArchive.length,
        originalSection: section
      }
    );

    logger.taskComplete(`Archive ${section}`, `${entriesToArchive.length} entries archived (ID: ${archiveId})`);
    return `Archived ${entriesToArchive.length} entries to long-term memory`;

  } catch (error) {
    logger.error(`Failed to archive ${section} entries for ${agentName}:`, error);
    throw new Error(`Archive operation failed: ${error.message}`);
  }
}

/**
 * Create a structured summary of archived entries
 * @param {Array} entries - Entries to summarize
 * @param {string} section - Memory section
 * @param {string} agentName - Agent name
 * @returns {string} Archive summary text
 */
function createArchiveSummary(entries, section, agentName) {
  const timestamp = new Date().toISOString();
  
  let summary = `${section.toUpperCase()} ARCHIVE - ${agentName} - ${timestamp}\n\n`;
  
  if (section === 'observations') {
    summary += `Archived ${entries.length} observations:\n`;
    entries.forEach((obs, index) => {
      summary += `${index + 1}. [${obs.timestamp}] ${obs.content}\n`;
      if (obs.context?.storyId) summary += `   Story: ${obs.context.storyId}\n`;
    });
  } else if (section === 'decisions') {
    summary += `Archived ${entries.length} decisions:\n`;
    entries.forEach((decision, index) => {
      summary += `${index + 1}. [${decision.timestamp}] ${decision.decision}\n`;
      if (decision.reasoning) summary += `   Reasoning: ${decision.reasoning}\n`;
    });
  } else if (section === 'keyFacts') {
    summary += `Archived ${entries.length} key facts:\n`;
    Object.entries(entries).forEach(([key, fact], index) => {
      summary += `${index + 1}. ${key}: ${fact.content}\n`;
      if (fact.context) summary += `   Context: ${JSON.stringify(fact.context)}\n`;
    });
  } else if (section === 'blockers') {
    summary += `Archived ${entries.length} blockers:\n`;
    entries.forEach((blocker, index) => {
      summary += `${index + 1}. [${blocker.timestamp}] ${blocker.blocker}\n`;
      if (blocker.resolved) summary += `   Resolved: ${blocker.resolution} (${blocker.resolvedAt})\n`;
    });
  }
  
  return summary;
}

/**
 * Clean up specific memory section based on recommendations
 * @param {Object} workingMemory - Agent's working memory
 * @param {Object} recommendation - Cleanup recommendation
 * @param {Object} config - Hygiene configuration
 * @param {string} agentName - Agent name
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupMemorySection(workingMemory, recommendation, config, agentName) {
  const { section, action, count, reason } = recommendation;
  const archivalRules = config.archivalRules;
  
  let entriesToArchive = [];
  let entriesToKeep = [];
  let cleanupResult = {
    section,
    action,
    originalCount: 0,
    archivedCount: 0,
    remainingCount: 0,
    reason
  };

  try {
    if (section === 'observations') {
      const observations = workingMemory.observations || [];
      cleanupResult.originalCount = observations.length;
      
      if (observations.length > archivalRules.minimumEntriesBeforeCleanup) {
        // Sort by timestamp, keep most recent
        const sorted = observations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        entriesToKeep = sorted.slice(0, observations.length - count);
        entriesToArchive = sorted.slice(observations.length - count);
        
        workingMemory.observations = entriesToKeep;
      }
    } else if (section === 'decisions') {
      const decisions = workingMemory.decisions || [];
      cleanupResult.originalCount = decisions.length;
      
      if (decisions.length > archivalRules.minimumEntriesBeforeCleanup) {
        // Sort by timestamp, keep most recent
        const sorted = decisions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        entriesToKeep = sorted.slice(0, decisions.length - count);
        entriesToArchive = sorted.slice(decisions.length - count);
        
        workingMemory.decisions = entriesToKeep;
      }
    } else if (section === 'keyFacts') {
      const keyFacts = workingMemory.keyFacts || {};
      cleanupResult.originalCount = Object.keys(keyFacts).length;
      
      if (Object.keys(keyFacts).length > archivalRules.minimumEntriesBeforeCleanup) {
        // Sort by timestamp, keep most recent and critical facts
        const factEntries = Object.entries(keyFacts)
          .sort(([,a], [,b]) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const criticalFacts = archivalRules.retainCriticalFacts ? 
          factEntries.filter(([,fact]) => fact.critical || fact.importance === 'high') : [];
        
        const nonCriticalFacts = factEntries.filter(([,fact]) => !fact.critical && fact.importance !== 'high');
        
        const factsToArchive = nonCriticalFacts.slice(0, count);
        entriesToArchive = Object.fromEntries(factsToArchive);
        
        // Remove archived facts from working memory
        factsToArchive.forEach(([key]) => delete keyFacts[key]);
        workingMemory.keyFacts = keyFacts;
      }
    } else if (section === 'blockers') {
      const blockers = workingMemory.blockers || [];
      cleanupResult.originalCount = blockers.length;
      
      if (blockers.length > archivalRules.minimumEntriesBeforeCleanup) {
        // Archive resolved blockers, keep active ones
        if (archivalRules.preserveActiveBlockers) {
          entriesToArchive = blockers.filter(b => b.resolved);
          entriesToKeep = blockers.filter(b => !b.resolved);
        } else {
          // Sort by timestamp, keep most recent
          const sorted = blockers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          entriesToKeep = sorted.slice(0, blockers.length - count);
          entriesToArchive = sorted.slice(blockers.length - count);
        }
        
        workingMemory.blockers = entriesToKeep;
      }
    }

    // Archive entries if configured to do so
    if (archivalRules.summarizeBeforeDelete && entriesToArchive.length > 0) {
      const archiveResult = await archiveEntriesToLongTermMemory(
        agentName,
        entriesToArchive,
        section,
        workingMemory.currentContext
      );
      cleanupResult.archiveResult = archiveResult;
    }

    cleanupResult.archivedCount = Array.isArray(entriesToArchive) ? entriesToArchive.length : Object.keys(entriesToArchive).length;
    cleanupResult.remainingCount = section === 'keyFacts' ? 
      Object.keys(workingMemory[section] || {}).length : 
      (workingMemory[section] || []).length;

    logger.taskComplete(`Cleanup ${section}`, `${cleanupResult.archivedCount} archived, ${cleanupResult.remainingCount} remaining`);
    
    return cleanupResult;

  } catch (error) {
    logger.error(`Failed to cleanup ${section} for ${agentName}:`, error);
    cleanupResult.error = error.message;
    return cleanupResult;
  }
}

/**
 * Perform comprehensive memory hygiene cleanup
 * @param {string} agentName - Agent name
 * @param {Object} options - Cleanup options
 * @returns {Promise<Object>} Cleanup results
 */
async function performMemoryHygiene(agentName, options = {}) {
  const startTime = Date.now();
  const config = await loadHygieneConfig();
  
  // Skip cleanup if disabled
  if (!config.enableAutoCleanup && !options.force) {
    return {
      agentName,
      skipped: true,
      reason: 'Auto cleanup disabled',
      timestamp: new Date().toISOString()
    };
  }

  const results = {
    agentName,
    timestamp: new Date().toISOString(),
    config: {
      limits: config.workingMemoryLimits,
      triggers: config.cleanupTriggers
    },
    analysis: null,
    cleanupActions: [],
    sessionSummary: null,
    success: false,
    duration: 0,
    errors: []
  };

  try {
    // Load working memory
    const memoryPath = getWorkingMemoryPath(agentName);
    const workingMemory = await safeReadJson(memoryPath, null);
    
    if (!workingMemory) {
      results.skipped = true;
      results.reason = 'No working memory found';
      return results;
    }

    logger.taskStart(`Memory hygiene for ${agentName}`);

    // Analyze memory usage
    results.analysis = analyzeMemoryUsage(workingMemory, config);
    
    // Skip cleanup if not needed (unless forced)
    if (!results.analysis.cleanupNeeded && !options.force) {
      results.skipped = true;
      results.reason = 'Cleanup not needed based on current thresholds';
      results.success = true;
      return results;
    }

    logger.taskStart(`Memory cleanup for ${agentName}`, `Reasons: ${JSON.stringify(results.analysis.reasons)}`);

    // Create session summary before cleanup if configured
    if (config.archivalRules.summarizeBeforeDelete) {
      try {
        const summaryResult = await createSessionSummary(agentName);
        if (summaryResult.success) {
          results.sessionSummary = {
            created: true,
            memoryId: summaryResult.memoryId
          };
          logger.taskComplete(`Session summary for ${agentName}`, `Created before cleanup`);
        }
      } catch (summaryError) {
        logger.warn(`Failed to create session summary for ${agentName}:`, summaryError.message);
        results.sessionSummary = { 
          created: false, 
          error: summaryError.message 
        };
      }
    }

    // Perform cleanup for each recommended section
    for (const recommendation of results.analysis.recommendations) {
      try {
        const cleanupResult = await cleanupMemorySection(
          workingMemory, 
          recommendation, 
          config, 
          agentName
        );
        results.cleanupActions.push(cleanupResult);
      } catch (cleanupError) {
        logger.error(`Cleanup failed for ${recommendation.section}:`, cleanupError);
        results.errors.push(`${recommendation.section}: ${cleanupError.message}`);
      }
    }

    // Update working memory file with cleaned data
    workingMemory.lastUpdated = new Date().toISOString();
    workingMemory.lastCleanup = new Date().toISOString();
    await safeWriteJson(memoryPath, workingMemory);

    results.success = results.errors.length === 0;
    results.duration = Date.now() - startTime;

    const totalArchived = results.cleanupActions.reduce((sum, action) => sum + action.archivedCount, 0);
    logger.taskComplete(`Memory hygiene for ${agentName}`, `${totalArchived} entries archived in ${results.duration}ms`);

    return results;

  } catch (error) {
    logger.error(`Memory hygiene failed for ${agentName}:`, error);
    results.success = false;
    results.error = error.message;
    results.duration = Date.now() - startTime;
    return results;
  }
}

/**
 * Check if memory hygiene should run based on triggers
 * @param {string} agentName - Agent name
 * @param {string} trigger - Trigger type ('action', 'threshold', 'age', 'scheduled')
 * @returns {Promise<boolean>} Whether cleanup should run
 */
async function shouldRunMemoryHygiene(agentName, trigger = 'action') {
  try {
    const config = await loadHygieneConfig();
    
    if (!config.enableAutoCleanup) {
      return false;
    }

    const triggers = config.cleanupTriggers;
    const memoryPath = getWorkingMemoryPath(agentName);
    const workingMemory = await safeReadJson(memoryPath, null);
    
    if (!workingMemory) {
      return false;
    }

    // Check trigger-specific conditions
    if (trigger === 'action' && !triggers.runAfterEachAction) {
      return false;
    }

    if (trigger === 'threshold' || trigger === 'action') {
      const analysis = analyzeMemoryUsage(workingMemory, config);
      return analysis.cleanupNeeded;
    }

    if (trigger === 'age') {
      const memoryAge = workingMemory.initialized ? 
        (Date.now() - new Date(workingMemory.initialized).getTime()) / (1000 * 60 * 60) : 0;
      return memoryAge > config.workingMemoryLimits.maxAgeHours;
    }

    // Default to running cleanup
    return true;

  } catch (error) {
    logger.warn(`Failed to check hygiene triggers for ${agentName}:`, error.message);
    return false;
  }
}

/**
 * Get memory hygiene status for an agent
 * @param {string} agentName - Agent name
 * @returns {Promise<Object>} Hygiene status
 */
async function getMemoryHygieneStatus(agentName) {
  try {
    const config = await loadHygieneConfig();
    const memoryPath = getWorkingMemoryPath(agentName);
    const workingMemory = await safeReadJson(memoryPath, null);
    
    if (!workingMemory) {
      return {
        agentName,
        status: 'no_memory',
        message: 'No working memory found'
      };
    }

    const analysis = analyzeMemoryUsage(workingMemory, config);
    
    return {
      agentName,
      status: analysis.cleanupNeeded ? 'needs_cleanup' : 'healthy',
      timestamp: new Date().toISOString(),
      lastCleanup: workingMemory.lastCleanup || 'never',
      analysis: {
        usage: analysis.usage,
        age: `${Math.round(analysis.memoryAge)} hours`,
        cleanupNeeded: analysis.cleanupNeeded,
        reasons: analysis.reasons
      },
      recommendations: analysis.recommendations.length,
      config: {
        autoCleanup: config.enableAutoCleanup,
        limits: config.workingMemoryLimits
      }
    };

  } catch (error) {
    return {
      agentName,
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  performMemoryHygiene,
  shouldRunMemoryHygiene,
  getMemoryHygieneStatus,
  analyzeMemoryUsage,
  cleanupMemorySection,
  archiveEntriesToLongTermMemory,
  loadHygieneConfig
};