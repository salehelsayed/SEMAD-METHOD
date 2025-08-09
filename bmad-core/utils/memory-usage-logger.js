/**
 * Memory Usage Logger
 * Minimal logger for memory-related errors and audit trails.
 */

const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Append a memory error entry to the audit log under .ai
 * @param {string} agentName
 * @param {string} operationName
 * @param {Error} error
 * @param {object} meta
 */
function logMemoryError(agentName, operationName, error, meta = {}) {
  try {
    const aiDir = path.join(process.cwd(), '.ai');
    ensureDir(aiDir);
    const logDir = path.join(aiDir, 'logs');
    ensureDir(logDir);

    const logFile = path.join(logDir, `memory-errors-${new Date().toISOString().slice(0, 10)}.log`);
    const entry = {
      timestamp: new Date().toISOString(),
      agent: agentName,
      operation: operationName,
      error: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : undefined,
      meta
    };
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to log memory error:', e.message);
  }
}

module.exports = {
  logMemoryError
};

