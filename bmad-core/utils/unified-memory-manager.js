const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const yaml = require('js-yaml');

const agentMemoryManager = require('./agent-memory-manager');
const memoryHygiene = require('./memory-hygiene');

const DEFAULT_MEMORY_CONFIG = {
  enabled: true,
  baseDirectory: path.join(process.cwd(), '.ai', 'memory'),
  retentionPolicies: {
    workingMemory: {
      maxObservations: 50,
      maxDecisions: 30,
      autoCleanup: true,
      maxAgeDays: 7
    },
    longTermMemory: {
      maxAgeDays: 30,
      autoArchive: true
    }
  },
  qdrant: {
    enabled: false
  }
};

async function loadMemoryConfig() {
  const configPaths = [
    path.join(process.cwd(), '.semad-core', 'core-config.yaml'),
    path.join(process.cwd(), 'semad-core', 'core-config.yaml'),
    path.join(process.cwd(), 'core-config.yaml')
  ];

  for (const configPath of configPaths) {
    try {
      const content = await fsPromises.readFile(configPath, 'utf8');
      const parsed = yaml.load(content) || {};
      if (parsed.memory) {
        return mergeConfig(DEFAULT_MEMORY_CONFIG, parsed.memory);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // Ignore parsing errors and continue to defaults
        continue;
      }
    }
  }

  return { ...DEFAULT_MEMORY_CONFIG };
}

function mergeConfig(base, overrides) {
  if (!overrides || typeof overrides !== 'object') {
    return { ...base };
  }

  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeConfig(base[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function ensureDirectory(dir) {
  await fsPromises.mkdir(dir, { recursive: true });
}

async function loadMemoryForTask(agentName, metadata = {}) {
  const config = await loadMemoryConfig();
  const workingMemory = await agentMemoryManager.loadWorkingMemory(agentName) 
    || await agentMemoryManager.initializeWorkingMemory(agentName, metadata);

  return {
    success: true,
    agentName,
    config,
    shortTerm: workingMemory,
    longTerm: [],
    metadata
  };
}

async function saveAndCleanMemory(agentName, taskData = {}) {
  try {
    const config = await loadMemoryConfig();

    await agentMemoryManager.updateWorkingMemory(agentName, {
      observation: taskData.observation,
      decision: taskData.decision,
      reasoning: taskData.reasoning,
      keyFact: taskData.keyFact,
      metadata: taskData.context,
      qaFeedback: taskData.qaFeedback,
      blocker: taskData.blocker,
      resolveBlocker: taskData.resolveBlocker ? taskData.resolveBlocker.blocker : undefined,
      context: taskData.context
    });

    if (config.retentionPolicies?.workingMemory?.autoCleanup) {
      await memoryHygiene.performMemoryHygiene(agentName, {
        config: await memoryHygiene.loadHygieneConfig()
      });
    }

    return {
      success: true,
      agentName
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function getMemoryStatus(agentName) {
  const memory = await agentMemoryManager.loadWorkingMemory(agentName);
  if (!memory) {
    return {
      agent: agentName,
      enabled: true,
      workingMemory: {
        hasMemory: false,
        observations: 0,
        decisions: 0,
        lastUpdated: null
      }
    };
  }

  return {
    agent: agentName,
    enabled: true,
    workingMemory: {
      hasMemory: true,
      observations: memory.observations.length,
      decisions: memory.decisions.length,
      lastUpdated: memory.lastUpdated
    }
  };
}

async function recordObservation(agentName, observation, context = {}) {
  await agentMemoryManager.updateWorkingMemory(agentName, {
    observation,
    context
  });
  return { success: true };
}

async function resetMemory(agentName) {
  const filePath = path.join(process.cwd(), '.ai', `working_memory_${agentName}.json`);
  try {
    await fsPromises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  return initializeAgentMemory(agentName);
}

async function initializeAgentMemory(agentName, context = {}) {
  return agentMemoryManager.initializeWorkingMemory(agentName, context);
}

module.exports = {
  loadMemoryConfig,
  loadMemoryForTask,
  saveAndCleanMemory,
  getMemoryStatus,
  recordObservation,
  resetMemory,
  initializeAgentMemory
};
