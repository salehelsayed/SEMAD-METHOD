/**
 * File-based memory adapter
 * Factors logic from simple-memory.js into an adapter interface.
 */

const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const { acquireLock, releaseLock, writeJsonAtomic, appendJsonlAtomic } = require('../../file-safety');

const MEMORY_DIR = path.join(process.cwd(), '.ai');
const HISTORY_DIR = path.join(MEMORY_DIR, 'history');

let MIGRATION_ATTEMPTED = false;
async function maybeMigrate() {
  if (!MIGRATION_ATTEMPTED) {
    MIGRATION_ATTEMPTED = true;
    try { await migrateFromOldSystem(); } catch (_) {}
  }
}

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
  await maybeMigrate();
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
  await maybeMigrate();
  const file = path.join(MEMORY_DIR, `${agent}_context.json`);
  if (!context.lastUpdated) context.lastUpdated = new Date().toISOString();
  let token;
  try {
    token = await acquireLock(file);
    await writeJsonAtomic(file, context, { spaces: 2 });
  } finally {
    if (token) await releaseLock(file, token);
  }
}

async function logEntry(agent, type, content, metadata = {}) {
  await ensureDirectories();
  await maybeMigrate();
  const file = path.join(HISTORY_DIR, `${agent}_log.jsonl`);
  const entry = { timestamp: new Date().toISOString(), type, content, ...metadata };
  let token;
  try {
    token = await acquireLock(file);
    await appendJsonlAtomic(file, entry);
  } finally {
    if (token) await releaseLock(file, token);
  }
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

  // If migration already flagged, exit fast
  if (existsSync(flag)) return;

  const oldDir = path.join(process.cwd(), 'bmad-core', 'ai');
  let moved = 0;
  try {
    // Migrate working memory files from old location
    const exists = require('fs').existsSync(oldDir);
    if (exists) {
      const entries = await fs.readdir(oldDir, { withFileTypes: true });
      for (const e of entries) {
        try {
          if (e.isFile() && /^working_memory_.*\.json$/.test(e.name)) {
            const src = path.join(oldDir, e.name);
            const dest = path.join(MEMORY_DIR, e.name);
            try {
              await fs.rename(src, dest);
            } catch (err) {
              if (err.code === 'EXDEV') {
                const data = await fs.readFile(src);
                await fs.writeFile(dest, data);
                await fs.unlink(src);
              } else {
                throw err;
              }
            }
            moved++;
          } else if (e.isDirectory() && e.name === 'history') {
            // Move history directory contents
            const oldHist = path.join(oldDir, 'history');
            const newHist = HISTORY_DIR;
            const histEntries = await fs.readdir(oldHist, { withFileTypes: true }).catch(() => []);
            for (const h of histEntries) {
              if (h.isFile() && /_log\.jsonl$/.test(h.name)) {
                const src = path.join(oldHist, h.name);
                const dest = path.join(newHist, h.name);
                try {
                  await fs.rename(src, dest);
                } catch (err) {
                  if (err.code === 'EXDEV') {
                    const data = await fs.readFile(src, 'utf8');
                    await fs.writeFile(dest, data, 'utf8');
                    await fs.unlink(src);
                  } // else ignore
                }
                moved++;
              }
            }
          }
        } catch (_) { /* continue */ }
      }
    }
  } catch (_) { /* best effort migration */ }

  try {
    const payload = {
      migratedAt: new Date().toISOString(),
      movedItems: moved,
      source: 'bmad-core/ai',
      target: '.ai'
    };
    await fs.writeFile(flag, JSON.stringify(payload, null, 2), 'utf8');
  } catch (_) { /* ignore */ }
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
