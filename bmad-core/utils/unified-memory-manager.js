/**
 * Unified Memory Manager (facade)
 * Bridges AgentRunner with the simple file-based memory system.
 * Provides a stable API: loadMemoryForTask, saveAndCleanMemory,
 * getMemoryStatus, loadMemoryConfig.
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

// Reuse simple file-based primitives
const simpleMemory = require('./simple-memory');

const DEFAULT_CONFIG = Object.freeze({
  delays: { batchTaskDelay: 500 },
  limits: { maxObservations: 100, maxHistoryLines: 5000 }
});

function aiDir() {
  return path.join(process.cwd(), '.ai');
}

function workingMemoryPath(agentName) {
  return path.join(aiDir(), `working_memory_${agentName}.json`);
}

async function loadJSONIfExists(filePath) {
  try {
    const data = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

/**
 * Load memory context for a task.
 * Returns structure compatible with AgentRunner expectations.
 */
async function loadMemoryForTask(agentName, params = {}) {
  try {
    const ctx = await simpleMemory.loadContext(agentName);
    const hist = await simpleMemory.getHistory(agentName);

    // Try to read working memory for short-term observations
    const wm = await loadJSONIfExists(workingMemoryPath(agentName));
    const observations = Array.isArray(wm?.observations) ? wm.observations : [];

    return {
      agent: agentName,
      task: params.taskId,
      context: ctx || {},
      shortTerm: { observations },
      longTerm: hist || []
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Save task-related memory and perform basic cleanup.
 */
async function saveAndCleanMemory(agentName, taskData = {}) {
  const operations = [];
  const warnings = [];
  try {
    // Persist observation to long-term history
    if (taskData.observation) {
      await simpleMemory.logEntry(agentName, 'observation', taskData.observation, {
        story: taskData.context?.storyId,
        task: taskData.taskId,
        taskType: taskData.context?.taskType,
        success: taskData.taskCompleted === true
      });
      operations.push('logged_observation');
    }

    // Update working context (lightweight)
    const ctx = await simpleMemory.loadContext(agentName) || {};
    ctx.lastUpdated = new Date().toISOString();
    if (taskData.keyFact) ctx.keyFact = taskData.keyFact;
    if (taskData.significantFinding) ctx.significantFinding = taskData.significantFinding;
    await simpleMemory.saveContext(agentName, ctx);
    operations.push('saved_context');

    // Append to working memory observations if file exists or create minimal one
    const wmFile = workingMemoryPath(agentName);
    let wm = await loadJSONIfExists(wmFile);
    if (!wm) {
      wm = { agentName, observations: [] };
    }
    if (taskData.observation) {
      wm.observations.push({
        observation: taskData.observation,
        timestamp: new Date().toISOString()
      });
      // Enforce cap
      const cap = (await loadMemoryConfig()).limits?.maxObservations || DEFAULT_CONFIG.limits.maxObservations;
      if (wm.observations.length > cap) {
        wm.observations = wm.observations.slice(-cap);
        warnings.push('observations_trimmed');
      }
    }
    await fsp.mkdir(aiDir(), { recursive: true });
    await fsp.writeFile(wmFile, JSON.stringify(wm, null, 2), 'utf8');
    operations.push('updated_working_memory');

    return { success: true, operations, warnings };
  } catch (error) {
    return { success: false, error: error.message, operations, warnings };
  }
}

/**
 * Get a lightweight status snapshot for an agent's memory.
 */
async function getMemoryStatus(agentName) {
  try {
    const status = {
      agent: agentName,
      workingMemoryExists: false,
      workingMemorySizeBytes: 0,
      historyEntries: 0,
      contextExists: false,
      lastUpdated: null
    };

    const wmFile = workingMemoryPath(agentName);
    if (fs.existsSync(wmFile)) {
      status.workingMemoryExists = true;
      status.workingMemorySizeBytes = fs.statSync(wmFile).size;
    }

    const ctx = await simpleMemory.loadContext(agentName);
    if (ctx) {
      status.contextExists = true;
      status.lastUpdated = ctx.lastUpdated || null;
    }

    const hist = await simpleMemory.getHistory(agentName);
    status.historyEntries = Array.isArray(hist) ? hist.length : 0;

    return status;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Load memory configuration from .ai/memory-config.json if present.
 */
async function loadMemoryConfig() {
  try {
    const cfgPath = path.join(aiDir(), 'memory-config.json');
    const raw = await fsp.readFile(cfgPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (_e) {
    return DEFAULT_CONFIG;
  }
}

module.exports = {
  loadMemoryForTask,
  saveAndCleanMemory,
  getMemoryStatus,
  loadMemoryConfig
};

