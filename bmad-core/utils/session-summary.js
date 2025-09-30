const fs = require('fs');
const path = require('path');

const AI_ROOT = path.join(process.cwd(), '.ai');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureHistory(agentName) {
  ensureDir(AI_ROOT);
  const historyDir = path.join(AI_ROOT, 'history');
  ensureDir(historyDir);
  return path.join(historyDir, `${agentName}_log.jsonl`);
}

function loadJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeDetails(value) {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') return { message: value };
  if (Array.isArray(value)) return { notes: value };
  if (typeof value === 'object') return { ...value };
  return { value };
}

function normalizeSummary(value) {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') return { note: value };
  if (Array.isArray(value)) return { notes: value };
  if (typeof value === 'object') return { ...value };
  return { value };
}

function appendHistory(agentName, entry) {
  const historyFile = ensureHistory(agentName);
  fs.appendFileSync(historyFile, JSON.stringify(entry) + '\n');
}

function updateContext(agentName, updates = {}) {
  const contextFile = path.join(AI_ROOT, `${agentName}_context.json`);
  const existing = loadJsonSafe(contextFile, {});
  const merged = { ...existing, ...updates, lastUpdated: new Date().toISOString() };
  writeJson(contextFile, merged);
  return merged;
}

function logActivation(agentName, details = {}) {
  if (!agentName) throw new Error('agentName is required');
  const timestamp = new Date().toISOString();
  const activationDetails = normalizeDetails(details);
  const entry = {
    timestamp,
    agent: agentName,
    operation: 'activation',
    details: activationDetails
  };

  appendHistory(agentName, entry);
  updateContext(agentName, {
    lastActivation: timestamp,
    activationDetails,
    initializedAt: activationDetails.initializedAt || timestamp
  });

  return entry;
}

function createSessionSummary(agentName, summaryData = {}) {
  if (!agentName) throw new Error('agentName is required');
  const timestamp = new Date().toISOString();
  const contextFile = path.join(AI_ROOT, `${agentName}_context.json`);
  const context = loadJsonSafe(contextFile, {});
  const summaryExtras = normalizeSummary(summaryData);
  const lastDecision = Array.isArray(context.decisions) && context.decisions.length
    ? context.decisions[context.decisions.length - 1]
    : null;

  return {
    agent: agentName,
    generatedAt: timestamp,
    startedAt: context.lastActivation || context.initializedAt || null,
    lastObservation: context.lastObservation || null,
    lastDecision,
    ...summaryExtras
  };
}

function logSessionSummary(agentName, operation, summaryData = {}, details = {}) {
  if (!agentName) throw new Error('agentName is required');
  const timestamp = new Date().toISOString();
  const summary = createSessionSummary(agentName, summaryData);
  const entry = {
    timestamp,
    agent: agentName,
    operation: operation || 'session_summary',
    summary,
    details: normalizeDetails(details)
  };

  appendHistory(agentName, entry);

  const summaryFile = path.join(AI_ROOT, 'history', `${agentName}_session_summary.json`);
  writeJson(summaryFile, entry);
  updateContext(agentName, {
    lastSessionSummary: {
      timestamp,
      operation: entry.operation,
      summary: entry.summary
    }
  });

  return entry;
}

module.exports = {
  logActivation,
  createSessionSummary,
  logSessionSummary
};
