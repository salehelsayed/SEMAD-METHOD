#!/usr/bin/env node

/**
 * Lightweight Unified Memory Manager (portable stub)
 *
 * Provides a minimal, file-based implementation so AgentRunner works
 * in projects that don't ship the heavier memory subsystem. Safe for
 * local development and CI. Data is stored under .ai/.
 */

const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

function historyFile(agentName) {
  const dir = path.join(process.cwd(), '.ai', 'history');
  ensureDir(dir);
  return path.join(dir, `${agentName}_log.jsonl`);
}

// Load a simple memory context for the task
async function loadMemoryForTask(agentName, { taskId, storyId, epicId, taskType } = {}) {
  try {
    const file = historyFile(agentName);
    let lastObservations = [];
    if (fs.existsSync(file)) {
      // Read last up to 20 entries for short term
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
      const tail = lines.slice(-20).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      lastObservations = tail;
    }
    return {
      shortTerm: { observations: lastObservations },
      longTerm: [],
      meta: { agentName, taskId, storyId, epicId, taskType, loadedAt: new Date().toISOString() }
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Append an observation and return a simple result
async function saveAndCleanMemory(agentName, taskData = {}) {
  try {
    const file = historyFile(agentName);
    const payload = {
      agent: agentName,
      timestamp: new Date().toISOString(),
      ...taskData
    };
    fs.appendFileSync(file, JSON.stringify(payload) + '\n', 'utf8');

    // Basic retention: keep only latest ~2000 lines to avoid unbounded files
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const lines = raw.trim().split('\n');
      const max = 2000;
      if (lines.length > max) {
        const trimmed = lines.slice(lines.length - max).join('\n') + '\n';
        fs.writeFileSync(file, trimmed, 'utf8');
      }
    } catch (_) {}

    return { success: true, operations: ['append'], warnings: [] };
  } catch (error) {
    return { success: false, error: error.message, operations: [], warnings: [] };
  }
}

// Report a minimal status
async function getMemoryStatus(agentName) {
  const file = historyFile(agentName);
  const exists = fs.existsSync(file);
  return {
    enabled: true,
    healthy: true,
    entries: exists ? (fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).length) : 0
  };
}

// Optional config used by AgentRunner for batch delays
async function loadMemoryConfig() {
  return {
    delays: {
      batchTaskDelay: 500
    }
  };
}

module.exports = {
  loadMemoryForTask,
  saveAndCleanMemory,
  getMemoryStatus,
  loadMemoryConfig
};

