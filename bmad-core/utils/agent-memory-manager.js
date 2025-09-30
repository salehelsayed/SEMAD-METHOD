const fs = require('fs').promises;
const path = require('path');

const WORKING_MEMORY_PREFIX = 'working_memory_';
const AI_DIRECTORY = path.join(process.cwd(), '.ai');

function now() {
  return new Date().toISOString();
}

async function ensureAiDirectory() {
  await fs.mkdir(AI_DIRECTORY, { recursive: true });
}

function getMemoryPath(agentName) {
  return path.join(AI_DIRECTORY, `${WORKING_MEMORY_PREFIX}${agentName}.json`);
}

function createBaseMemory(agentName, context = {}) {
  const timestamp = now();
  return {
    agentName,
    createdAt: timestamp,
    lastUpdated: timestamp,
    lastCleanup: null,
    currentContext: { ...context },
    contextHistory: Object.keys(context || {}).length ? [context] : [],
    observations: [],
    decisions: [],
    reasoning: [],
    keyFacts: {},
    blockers: [],
    qaFeedback: [],
    metadata: {}
  };
}

async function loadWorkingMemory(agentName) {
  try {
    const file = await fs.readFile(getMemoryPath(agentName), 'utf8');
    const data = JSON.parse(file);
    return normalizeMemory(agentName, data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function normalizeMemory(agentName, memory) {
  if (!memory || typeof memory !== 'object') {
    return createBaseMemory(agentName);
  }

  return {
    agentName: memory.agentName || agentName,
    createdAt: memory.createdAt || now(),
    lastUpdated: memory.lastUpdated || now(),
    lastCleanup: memory.lastCleanup || null,
    currentContext: memory.currentContext || {},
    contextHistory: Array.isArray(memory.contextHistory) ? memory.contextHistory : [],
    observations: Array.isArray(memory.observations) ? memory.observations : [],
    decisions: Array.isArray(memory.decisions) ? memory.decisions : [],
    reasoning: Array.isArray(memory.reasoning) ? memory.reasoning : [],
    keyFacts: memory.keyFacts || {},
    blockers: Array.isArray(memory.blockers) ? memory.blockers : [],
    qaFeedback: Array.isArray(memory.qaFeedback) ? memory.qaFeedback : [],
    metadata: memory.metadata || {}
  };
}

async function initializeWorkingMemory(agentName, context = {}) {
  await ensureAiDirectory();
  const base = createBaseMemory(agentName, context);
  await fs.writeFile(getMemoryPath(agentName), JSON.stringify(base, null, 2));
  return base;
}

async function saveWorkingMemory(agentName, memory) {
  await ensureAiDirectory();
  const normalized = normalizeMemory(agentName, memory);
  normalized.lastUpdated = now();
  await fs.writeFile(getMemoryPath(agentName), JSON.stringify(normalized, null, 2));
  return normalized;
}

async function updateWorkingMemory(agentName, update = {}) {
  let memory = await loadWorkingMemory(agentName);
  if (!memory) {
    memory = await initializeWorkingMemory(agentName);
  }

  const timestamp = now();

  if (update.context || update.currentContext) {
    const newContext = { ...(update.context || update.currentContext) };
    memory.currentContext = { ...memory.currentContext, ...newContext };
    if (Object.keys(newContext).length) {
      memory.contextHistory.push({ ...memory.currentContext, timestamp });
    }
  }

  if (update.observation) {
    memory.observations.push({
      id: `${agentName}-observation-${memory.observations.length + 1}`,
      text: update.observation,
      timestamp,
      metadata: update.context || null
    });
  }

  if (update.decision) {
    memory.decisions.push({
      text: update.decision,
      timestamp,
      reasoning: update.reasoning || null
    });
  }

  if (update.reasoning && !update.decision) {
    memory.reasoning.push({ text: update.reasoning, timestamp });
  }

  if (update.keyFact) {
    const fact = { ...update.keyFact, timestamp };
    const key = update.keyFact.key || `fact_${Object.keys(memory.keyFacts).length + 1}`;
    memory.keyFacts[key] = fact;
  }

  if (update.blocker) {
    memory.blockers.push({
      blocker: update.blocker,
      timestamp,
      resolved: false,
      resolution: null
    });
  }

  if (update.resolveBlocker) {
    const blocker = memory.blockers.find(b => b.blocker === update.resolveBlocker && !b.resolved);
    if (blocker) {
      blocker.resolved = true;
      blocker.resolution = update.resolution || 'Resolved';
      blocker.resolvedAt = timestamp;
    }
  }

  if (update.qaFeedback) {
    memory.qaFeedback.push({ ...update.qaFeedback, timestamp });
  }

  if (update.metadata) {
    memory.metadata = { ...memory.metadata, ...update.metadata };
  }

  return saveWorkingMemory(agentName, memory);
}

async function checkContextSufficiency(agentName, required = []) {
  const memory = await loadWorkingMemory(agentName);
  if (!memory) {
    return { sufficient: false, missing: required.slice() };
  }

  const missing = required.filter(key => memory.currentContext[key] === undefined);
  return {
    sufficient: missing.length === 0,
    missing
  };
}

async function retrieveRelevantMemories(agentName, query, options = {}) {
  const memory = await loadWorkingMemory(agentName);
  if (!memory) return [];

  const matcher = typeof query === 'string'
    ? (text) => text && text.toLowerCase().includes(query.toLowerCase())
    : (text) => Boolean(text);

  const matches = [];

  for (const obs of memory.observations) {
    if (matcher(obs.text)) {
      matches.push({ type: 'observation', content: obs.text, timestamp: obs.timestamp });
    }
  }

  for (const decision of memory.decisions) {
    if (matcher(decision.text)) {
      matches.push({ type: 'decision', content: decision.text, timestamp: decision.timestamp });
    }
  }

  for (const [key, fact] of Object.entries(memory.keyFacts)) {
    const factText = typeof fact === 'string' ? fact : fact.content;
    if (matcher(factText)) {
      matches.push({ type: 'keyfact', key, content: factText, timestamp: fact.timestamp });
    }
  }

  const topN = options.topN || matches.length;
  return matches
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, topN);
}

async function performAgentMemoryHygiene(agentName, options = {}) {
  const { performMemoryHygiene } = require('./memory-hygiene');
  return performMemoryHygiene(agentName, options);
}

module.exports = {
  initializeWorkingMemory,
  loadWorkingMemory,
  updateWorkingMemory,
  saveWorkingMemory,
  checkContextSufficiency,
  retrieveRelevantMemories,
  performAgentMemoryHygiene
};
