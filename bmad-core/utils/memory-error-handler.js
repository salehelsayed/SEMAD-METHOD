/**
 * Memory Error Handler
 * Minimal implementation to satisfy current imports and provide
 * structured errors for memory operations.
 */

class MemoryError extends Error {
  constructor(message, operationName = 'unknown', agentName = 'unknown', details = {}) {
    super(message);
    this.name = 'MemoryError';
    this.operationName = operationName;
    this.agentName = agentName;
    this.details = details;
  }
}

/**
 * Validate memory operation result. Throws MemoryError if invalid.
 *
 * @param {any} result - Result from a memory operation
 * @param {string} operationName - Operation identifier
 * @param {string} agentName - Agent name
 */
function validateMemoryResult(result, operationName = 'unknown', agentName = 'unknown') {
  if (result == null) {
    throw new MemoryError('Memory operation returned null/undefined', operationName, agentName);
  }
  if (typeof result === 'object' && 'success' in result && result.success === false) {
    throw new MemoryError('Memory operation reported failure', operationName, agentName, { result });
  }
  return true;
}

/**
 * Handle critical memory errors (placeholder for future escalation/integration).
 * Logs the error and returns a standardized object.
 */
function handleCriticalMemoryError(error) {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Critical memory error:', message);
  return { critical: true, message };
}

module.exports = {
  MemoryError,
  validateMemoryResult,
  handleCriticalMemoryError
};

