const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs').promises;

const agentMemoryManager = require('./agent-memory-manager');

const DEFAULT_HYGIENE_CONFIG = {
  enableAutoCleanup: true,
  workingMemoryLimits: {
    maxObservations: 50,
    maxDecisions: 30,
    maxKeyFacts: 40,
    maxBlockers: 20,
    maxAgeHours: 24
  },
  cleanupTriggers: {
    runAfterEachAction: false,
    runOnMemoryThreshold: 0.7,
    runOnAgeThreshold: true
  },
  archivalRules: {
    summarizeBeforeDelete: true,
    retainCriticalFacts: true,
    preserveActiveBlockers: true,
    minimumEntriesBeforeCleanup: 2
  }
};

async function loadHygieneConfig() {
  try {
    const configPaths = [
      path.join(process.cwd(), '.semad-core', 'core-config.yaml'),
      path.join(process.cwd(), 'semad-core', 'core-config.yaml'),
      path.join(process.cwd(), 'core-config.yaml')
    ];

    for (const configPath of configPaths) {
      try {
        const file = await fs.readFile(configPath, 'utf8');
        const parsed = yaml.load(file) || {};
        if (parsed.memory && parsed.memory.hygiene) {
          return mergeConfigs(DEFAULT_HYGIENE_CONFIG, parsed.memory.hygiene);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          // Ignore other parsing errors so defaults are used
          continue;
        }
      }
    }
  } catch (_) {
    // Fall back to defaults
  }

  return { ...DEFAULT_HYGIENE_CONFIG };
}

function mergeConfigs(base, overrides) {
  if (!overrides || typeof overrides !== 'object') {
    return { ...base };
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeConfigs(base[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function analyzeMemoryUsage(memory, config = DEFAULT_HYGIENE_CONFIG) {
  const limits = config.workingMemoryLimits || DEFAULT_HYGIENE_CONFIG.workingMemoryLimits;

  const observations = memory?.observations || [];
  const decisions = memory?.decisions || [];
  const keyFacts = memory?.keyFacts ? Object.keys(memory.keyFacts) : [];
  const blockers = memory?.blockers || [];

  const usage = {
    observations: buildUsage(observations.length, limits.maxObservations),
    decisions: buildUsage(decisions.length, limits.maxDecisions),
    keyFacts: buildUsage(keyFacts.length, limits.maxKeyFacts),
    blockers: buildUsage(blockers.length, limits.maxBlockers)
  };

  const threshold = config.cleanupTriggers?.runOnMemoryThreshold ?? 0.7;
  const cleanupNeeded = Object.values(usage).some(section => section.ratio >= threshold && section.limit > 0);

  const recommendations = [];
  if (usage.observations.ratio >= threshold && usage.observations.current > 0) {
    recommendations.push({
      section: 'observations',
      action: 'archive_oldest',
      reason: 'Observation memory above threshold'
    });
  }
  if (usage.decisions.ratio >= threshold && usage.decisions.current > 0) {
    recommendations.push({
      section: 'decisions',
      action: 'summarize',
      reason: 'Decision history above threshold'
    });
  }
  if (usage.keyFacts.ratio >= threshold && usage.keyFacts.current > 0) {
    recommendations.push({
      section: 'keyFacts',
      action: 'compress',
      reason: 'Too many key facts stored'
    });
  }

  return {
    usage,
    cleanupNeeded,
    recommendations
  };
}

function buildUsage(current, limit) {
  const safeLimit = limit || 0;
  const ratio = safeLimit > 0 ? current / safeLimit : current > 0 ? 1 : 0;
  return { current, limit: safeLimit, ratio: Number(ratio.toFixed(3)) };
}

async function shouldRunMemoryHygiene(agentName, triggerType = 'threshold') {
  const memory = await agentMemoryManager.loadWorkingMemory(agentName);
  if (!memory) {
    return false;
  }

  const config = await loadHygieneConfig();
  const analysis = analyzeMemoryUsage(memory, config);

  if (triggerType === 'action') {
    return Boolean(config.cleanupTriggers?.runAfterEachAction);
  }

  if (triggerType === 'threshold') {
    return analysis.cleanupNeeded;
  }

  if (triggerType === 'age') {
    if (!config.cleanupTriggers?.runOnAgeThreshold) {
      return false;
    }
    const maxAgeHours = config.workingMemoryLimits?.maxAgeHours || 24;
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const lastUpdated = new Date(memory.lastUpdated || memory.createdAt || Date.now()).getTime();
    return lastUpdated < cutoff;
  }

  return false;
}

async function performMemoryHygiene(agentName, options = {}) {
  const memory = await agentMemoryManager.loadWorkingMemory(agentName);
  if (!memory) {
    return {
      success: false,
      skipped: true,
      reason: 'No working memory found'
    };
  }

  const config = options.config || await loadHygieneConfig();
  const analysis = analyzeMemoryUsage(memory, config);

  if (!options.force && !analysis.cleanupNeeded) {
    return {
      success: true,
      skipped: true,
      cleanupNeeded: false,
      analysis,
      cleanupActions: []
    };
  }

  const cleanupActions = [];
  const limits = config.workingMemoryLimits || {};

  const trimList = (list, limit, descriptor) => {
    if (!Array.isArray(list) || limit <= 0) return list;
    while (list.length > limit && list.length > (config.archivalRules?.minimumEntriesBeforeCleanup || 0)) {
      const removed = list.shift();
      cleanupActions.push({ section: descriptor, action: 'remove_oldest', removed });
    }
    return list;
  };

  memory.observations = trimList(memory.observations, limits.maxObservations || memory.observations.length, 'observations');
  memory.decisions = trimList(memory.decisions, limits.maxDecisions || memory.decisions.length, 'decisions');
  memory.reasoning = trimList(memory.reasoning, limits.maxDecisions || memory.reasoning.length, 'reasoning');

  const factLimit = limits.maxKeyFacts || Object.keys(memory.keyFacts).length;
  const factKeys = Object.keys(memory.keyFacts || {});
  if (factLimit > 0 && factKeys.length > factLimit) {
    const sortedFacts = factKeys
      .map(key => ({ key, value: memory.keyFacts[key] }))
      .sort((a, b) => new Date(a.value?.timestamp || 0) - new Date(b.value?.timestamp || 0));

    while (sortedFacts.length > factLimit) {
      const candidate = sortedFacts.shift();
      if (candidate.value?.critical && config.archivalRules?.retainCriticalFacts) {
        sortedFacts.push(candidate);
        break;
      }
      delete memory.keyFacts[candidate.key];
      cleanupActions.push({ section: 'keyFacts', action: 'remove', removed: candidate.key });
    }
  }

  const blockerLimit = limits.maxBlockers || memory.blockers.length;
  if (blockerLimit > 0 && memory.blockers.length > blockerLimit) {
    const retained = [];
    for (const blocker of memory.blockers) {
      if (!blocker.resolved || (config.archivalRules?.preserveActiveBlockers && !blocker.resolved)) {
        retained.push(blocker);
        continue;
      }
      if (retained.length < blockerLimit) {
        retained.push(blocker);
      } else {
        cleanupActions.push({ section: 'blockers', action: 'archive', removed: blocker.blocker });
      }
    }
    memory.blockers = retained;
  }

  memory.lastCleanup = now();
  await agentMemoryManager.saveWorkingMemory(agentName, memory);

  return {
    success: true,
    cleanupNeeded: analysis.cleanupNeeded,
    cleanupActions,
    analysis,
    duration: cleanupActions.length,
    agentName
  };
}

async function getMemoryHygieneStatus(agentName) {
  const memory = await agentMemoryManager.loadWorkingMemory(agentName);
  if (!memory) {
    return {
      agentName,
      status: 'no_memory',
      message: 'No working memory found'
    };
  }

  const config = await loadHygieneConfig();
  const analysis = analyzeMemoryUsage(memory, config);

  return {
    agentName,
    status: analysis.cleanupNeeded ? 'needs_cleanup' : 'healthy',
    analysis,
    config
  };
}

function now() {
  return new Date().toISOString();
}

async function performAgentMemoryHygiene(agentName, options = {}) {
  return performMemoryHygiene(agentName, options);
}

module.exports = {
  loadHygieneConfig,
  analyzeMemoryUsage,
  shouldRunMemoryHygiene,
  performMemoryHygiene,
  getMemoryHygieneStatus,
  performAgentMemoryHygiene
};
