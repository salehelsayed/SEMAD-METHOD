const fs = require('fs').promises;
const path = require('path');

/**
 * Memory Lifecycle Management for BMAD Agents
 * Handles memory cleanup, persistence, and size management
 */

const MEMORY_DIR = path.join(__dirname, '../../ai');
const MAX_OBSERVATIONS = 50;
const MAX_PLAN_ITEMS = 20;
const MEMORY_RETENTION_DAYS = 30;

/**
 * Clean up old memory files based on retention policy
 */
async function cleanupOldMemory() {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const files = await fs.readdir(MEMORY_DIR);
    const now = new Date();
    
    for (const file of files) {
      if (!file.startsWith('working_memory_') || !file.endsWith('.json')) {
        continue;
      }
      
      const filePath = path.join(MEMORY_DIR, file);
      const stats = await fs.stat(filePath);
      const daysSinceModified = (now - stats.mtime) / (1000 * 60 * 60 * 24);
      
      if (daysSinceModified > MEMORY_RETENTION_DAYS) {
        await fs.unlink(filePath);
        console.log(`Cleaned up old memory file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up old memory:', error);
  }
}

/**
 * Trim memory to maintain size limits
 */
async function trimMemory(agentName) {
  try {
    const memoryPath = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
    const exists = await fs.access(memoryPath).then(() => true).catch(() => false);
    
    if (!exists) return;
    
    const content = await fs.readFile(memoryPath, 'utf8');
    let memory = JSON.parse(content);
    
    // Trim observations to latest MAX_OBSERVATIONS
    if (memory.observations && memory.observations.length > MAX_OBSERVATIONS) {
      memory.observations = memory.observations.slice(-MAX_OBSERVATIONS);
    }
    
    // Trim plan items if exceeded
    if (memory.plan && memory.plan.length > MAX_PLAN_ITEMS) {
      memory.plan = memory.plan.slice(0, MAX_PLAN_ITEMS);
    }
    
    await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2));
  } catch (error) {
    console.error(`Error trimming memory for ${agentName}:`, error);
  }
}

/**
 * Export memory for backup or analysis
 */
async function exportMemory(agentName, exportPath) {
  try {
    const memoryPath = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
    const exists = await fs.access(memoryPath).then(() => true).catch(() => false);
    
    if (!exists) {
      throw new Error(`No memory found for agent ${agentName}`);
    }
    
    const memory = await fs.readFile(memoryPath, 'utf8');
    const exportData = {
      agent: agentName,
      exportDate: new Date().toISOString(),
      memory: JSON.parse(memory)
    };
    
    await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
    return exportPath;
  } catch (error) {
    console.error(`Error exporting memory for ${agentName}:`, error);
    throw error;
  }
}

/**
 * Import memory from backup
 */
async function importMemory(agentName, importPath) {
  try {
    const importContent = await fs.readFile(importPath, 'utf8');
    const importData = JSON.parse(importContent);
    
    if (importData.agent !== agentName) {
      throw new Error(`Import data is for agent ${importData.agent}, not ${agentName}`);
    }
    
    const memoryPath = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
    await fs.writeFile(memoryPath, JSON.stringify(importData.memory, null, 2));
    
    return true;
  } catch (error) {
    console.error(`Error importing memory for ${agentName}:`, error);
    throw error;
  }
}

/**
 * Clear all memory for a specific agent
 */
async function clearAgentMemory(agentName) {
  try {
    const memoryPath = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
    const exists = await fs.access(memoryPath).then(() => true).catch(() => false);
    
    if (exists) {
      await fs.unlink(memoryPath);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error clearing memory for ${agentName}:`, error);
    throw error;
  }
}

/**
 * Get memory statistics for monitoring
 */
async function getMemoryStats() {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const files = await fs.readdir(MEMORY_DIR);
    const stats = {
      totalAgents: 0,
      totalSize: 0,
      agentStats: {}
    };
    
    for (const file of files) {
      if (!file.startsWith('working_memory_') || !file.endsWith('.json')) {
        continue;
      }
      
      const agentName = file.replace('working_memory_', '').replace('.json', '');
      const filePath = path.join(MEMORY_DIR, file);
      const fileStats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf8');
      const memory = JSON.parse(content);
      
      stats.totalAgents++;
      stats.totalSize += fileStats.size;
      stats.agentStats[agentName] = {
        size: fileStats.size,
        lastModified: fileStats.mtime,
        observationCount: memory.observations ? memory.observations.length : 0,
        planItemCount: memory.plan ? memory.plan.length : 0,
        hasActiveTask: !!memory.taskId
      };
    }
    
    return stats;
  } catch (error) {
    console.error('Error getting memory stats:', error);
    throw error;
  }
}

/**
 * Archive completed task memory to Qdrant
 */
async function archiveCompletedTask(agentName) {
  try {
    const memoryPath = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
    const exists = await fs.access(memoryPath).then(() => true).catch(() => false);
    
    if (!exists) return;
    
    const content = await fs.readFile(memoryPath, 'utf8');
    const memory = JSON.parse(content);
    
    if (memory.taskId && memory.observations.length > 0) {
      // Store task summary in Qdrant
      const { storeMemorySnippet } = require('./qdrant');
      
      const summary = {
        taskId: memory.taskId,
        plan: memory.plan,
        observationCount: memory.observations.length,
        keyObservations: memory.observations.slice(-5), // Last 5 observations
        context: memory.context,
        completedAt: new Date().toISOString()
      };
      
      await storeMemorySnippet(
        agentName,
        JSON.stringify(summary),
        {
          agent: agentName,
          taskId: memory.taskId,
          type: 'task-completion',
          timestamp: new Date().toISOString()
        }
      );
      
      // Clear working memory after archiving
      memory.taskId = null;
      memory.plan = [];
      memory.currentStep = null;
      memory.observations = [];
      memory.context = {};
      
      await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2));
    }
  } catch (error) {
    console.error(`Error archiving task for ${agentName}:`, error);
  }
}

/**
 * Schedule periodic memory maintenance
 */
function scheduleMemoryMaintenance() {
  // Run cleanup daily
  setInterval(async () => {
    console.log('Running scheduled memory maintenance...');
    await cleanupOldMemory();
    
    // Trim all agent memories
    const files = await fs.readdir(MEMORY_DIR);
    for (const file of files) {
      if (file.startsWith('working_memory_') && file.endsWith('.json')) {
        const agentName = file.replace('working_memory_', '').replace('.json', '');
        await trimMemory(agentName);
      }
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
}

module.exports = {
  cleanupOldMemory,
  trimMemory,
  exportMemory,
  importMemory,
  clearAgentMemory,
  getMemoryStats,
  archiveCompletedTask,
  scheduleMemoryMaintenance,
  MAX_OBSERVATIONS,
  MAX_PLAN_ITEMS,
  MEMORY_RETENTION_DAYS
};