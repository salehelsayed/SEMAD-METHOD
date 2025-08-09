/**
 * File-based memory adapter
 * Factors logic from simple-memory.js into an adapter interface.
 */

const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(process.cwd(), '.ai');
const HISTORY_DIR = path.join(MEMORY_DIR, 'history');

async function ensureDirectories() {
  if (!existsSync(MEMORY_DIR)) {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
  }
  if (!existsSync(HISTORY_DIR)) {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
  }
}

async function loadContext(agent) {
  await ensureDirectories();
  const file = path.join(MEMORY_DIR, `${agent}_context.json`);
  if (!existsSync(file)) return null;
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (_) {
    return null;
  }
}

async function saveContext(agent, context) {
  await ensureDirectories();
  const file = path.join(MEMORY_DIR, `${agent}_context.json`);
  if (!context.lastUpdated) context.lastUpdated = new Date().toISOString();
  await fs.writeFile(file, JSON.stringify(context, null, 2), 'utf8');
}

async function logEntry(agent, type, content, metadata = {}) {
  await ensureDirectories();
  const file = path.join(HISTORY_DIR, `${agent}_log.jsonl`);
  const entry = { timestamp: new Date().toISOString(), type, content, ...metadata };
  await fs.appendFile(file, JSON.stringify(entry) + '\n', 'utf8');
}

async function getHistory(agent, filters = {}) {
  await ensureDirectories();
  const file = path.join(HISTORY_DIR, `${agent}_log.jsonl`);
  if (!existsSync(file)) return [];
  try {
    const data = await fs.readFile(file, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    const out = [];
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (filters.type && e.type !== filters.type) continue;
        if (filters.story && e.story !== filters.story) continue;
        if (filters.task && e.task !== filters.task) continue;
        if (filters.dateRange) {
          const d = new Date(e.timestamp);
          if (filters.dateRange.start && d < new Date(filters.dateRange.start)) continue;
          if (filters.dateRange.end && d > new Date(filters.dateRange.end)) continue;
        }
        out.push(e);
      } catch (_) {}
    }
    return out;
  } catch (_) {
    return [];
  }
}

async function clearContext(agent) {
  const file = path.join(MEMORY_DIR, `${agent}_context.json`);
  try { if (existsSync(file)) await fs.unlink(file); } catch (_) {}
}

async function getAgentSummary(agent, limit = 10) {
  const context = await loadContext(agent);
  const history = await getHistory(agent);
  const recentHistory = history.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,limit);
  return { currentContext: context, recentHistory, totalHistoryEntries: history.length };
}

async function migrateFromOldSystem() {
  await ensureDirectories();
  const flag = path.join(MEMORY_DIR, '.migrated');
  if (!existsSync(flag)) await fs.writeFile(flag, new Date().toISOString(), 'utf8');
}

module.exports = {
  loadContext,
  saveContext,
  logEntry,
  getHistory,
  clearContext,
  getAgentSummary,
  migrateFromOldSystem,
  MEMORY_DIR,
  HISTORY_DIR
};

