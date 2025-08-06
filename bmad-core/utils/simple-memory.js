/**
 * Simple file-based memory system for BMad agents
 * Replaces complex Qdrant-based system with lightweight JSON/JSONL files
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync, createWriteStream } = require('fs');

// Constants
const MEMORY_DIR = '.ai';
const HISTORY_DIR = path.join(MEMORY_DIR, 'history');

// Ensure memory directories exist
async function ensureDirectories() {
  try {
    if (!existsSync(MEMORY_DIR)) {
      await fs.mkdir(MEMORY_DIR, { recursive: true });
    }
    if (!existsSync(HISTORY_DIR)) {
      await fs.mkdir(HISTORY_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create memory directories:', error);
  }
}

/**
 * Load current context for an agent
 * @param {string} agentName - Name of the agent (dev, qa, sm, etc.)
 * @returns {Object|null} Current context or null if not found
 */
async function loadContext(agentName) {
  await ensureDirectories();
  
  const contextFile = path.join(MEMORY_DIR, `${agentName}_context.json`);
  
  try {
    if (existsSync(contextFile)) {
      const data = await fs.readFile(contextFile, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error(`Failed to load context for ${agentName}:`, error);
    return null;
  }
}

/**
 * Save current context for an agent
 * @param {string} agentName - Name of the agent
 * @param {Object} context - Context object to save
 */
async function saveContext(agentName, context) {
  await ensureDirectories();
  
  const contextFile = path.join(MEMORY_DIR, `${agentName}_context.json`);
  
  try {
    // Add timestamp if not provided
    if (!context.lastUpdated) {
      context.lastUpdated = new Date().toISOString();
    }
    
    await fs.writeFile(
      contextFile, 
      JSON.stringify(context, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error(`Failed to save context for ${agentName}:`, error);
    throw error;
  }
}

/**
 * Append an entry to agent's history log
 * @param {string} agentName - Name of the agent
 * @param {string} type - Type of entry (decision, observation, completion, etc.)
 * @param {string} content - Content of the entry
 * @param {Object} metadata - Additional metadata (story, task, files, etc.)
 */
async function logEntry(agentName, type, content, metadata = {}) {
  await ensureDirectories();
  
  const historyFile = path.join(HISTORY_DIR, `${agentName}_log.jsonl`);
  
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    content,
    ...metadata
  };
  
  try {
    // Append to JSONL file (one JSON per line)
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(historyFile, line, 'utf8');
  } catch (error) {
    console.error(`Failed to log entry for ${agentName}:`, error);
    throw error;
  }
}

/**
 * Read history for an agent with optional filters
 * @param {string} agentName - Name of the agent
 * @param {Object} filters - Optional filters (type, story, task, dateRange)
 * @returns {Array} Array of history entries
 */
async function getHistory(agentName, filters = {}) {
  await ensureDirectories();
  
  const historyFile = path.join(HISTORY_DIR, `${agentName}_log.jsonl`);
  const entries = [];
  
  try {
    if (!existsSync(historyFile)) {
      return entries;
    }
    
    const data = await fs.readFile(historyFile, 'utf8');
    const lines = data.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        
        // Apply filters
        if (filters.type && entry.type !== filters.type) continue;
        if (filters.story && entry.story !== filters.story) continue;
        if (filters.task && entry.task !== filters.task) continue;
        
        // Date range filter
        if (filters.dateRange) {
          const entryDate = new Date(entry.timestamp);
          if (filters.dateRange.start && entryDate < new Date(filters.dateRange.start)) continue;
          if (filters.dateRange.end && entryDate > new Date(filters.dateRange.end)) continue;
        }
        
        entries.push(entry);
      } catch (parseError) {
        // Skip malformed lines
        console.warn('Skipping malformed history entry:', line);
      }
    }
    
    return entries;
  } catch (error) {
    console.error(`Failed to read history for ${agentName}:`, error);
    return entries;
  }
}

/**
 * Clear context for an agent (useful for testing or reset)
 * @param {string} agentName - Name of the agent
 */
async function clearContext(agentName) {
  const contextFile = path.join(MEMORY_DIR, `${agentName}_context.json`);
  
  try {
    if (existsSync(contextFile)) {
      await fs.unlink(contextFile);
    }
  } catch (error) {
    console.error(`Failed to clear context for ${agentName}:`, error);
  }
}

/**
 * Get summary of agent's recent activity
 * @param {string} agentName - Name of the agent
 * @param {number} limit - Number of recent entries to include
 * @returns {Object} Summary with context and recent history
 */
async function getAgentSummary(agentName, limit = 10) {
  const context = await loadContext(agentName);
  const history = await getHistory(agentName);
  
  // Get most recent entries
  const recentHistory = history
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  
  return {
    currentContext: context,
    recentHistory,
    totalHistoryEntries: history.length
  };
}

/**
 * Migrate data from old memory system if needed
 * This is a placeholder for migration logic
 */
async function migrateFromOldSystem() {
  // Check if migration is needed
  const migrationFlag = path.join(MEMORY_DIR, '.migrated');
  
  if (existsSync(migrationFlag)) {
    return; // Already migrated
  }
  
  // TODO: Add migration logic here if old Qdrant data exists
  // For now, just mark as migrated
  await ensureDirectories();
  await fs.writeFile(migrationFlag, new Date().toISOString(), 'utf8');
}

/**
 * Compatibility wrapper for old saveToLongTermMemoryAndExit function
 * @param {Object} params - Parameters from old function call
 */
async function saveToLongTermMemoryAndExit(params) {
  const { agent, type = 'observation', content, metadata = {} } = params;
  
  // Log to history
  await logEntry(agent, type, content, metadata);
  
  // Update context if relevant
  if (metadata.story || metadata.task) {
    const context = await loadContext(agent) || {};
    context.currentStory = metadata.story || context.currentStory;
    context.currentTask = metadata.task || context.currentTask;
    await saveContext(agent, context);
  }
  
  return { success: true };
}

/**
 * Compatibility wrapper for old updateWorkingMemoryAndExit function
 * @param {Object} params - Parameters from old function call
 */
async function updateWorkingMemoryAndExit(params) {
  const { agent, context } = params;
  
  await saveContext(agent, context);
  
  return { success: true };
}

// Export all functions
module.exports = {
  // Core functions
  loadContext,
  saveContext,
  logEntry,
  getHistory,
  clearContext,
  getAgentSummary,
  migrateFromOldSystem,
  
  // Compatibility wrappers
  saveToLongTermMemoryAndExit,
  updateWorkingMemoryAndExit,
  
  // Constants
  MEMORY_DIR,
  HISTORY_DIR
};