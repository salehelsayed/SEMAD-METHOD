/**
 * Memory Error Handler (relocated)
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

function validateMemoryResult(result, operationName = 'unknown', agentName = 'unknown') {
  if (result == null) {
    throw new MemoryError('Memory operation returned null/undefined', operationName, agentName);
  }
  if (typeof result === 'object' && 'success' in result && result.success === false) {
    throw new MemoryError('Memory operation reported failure', operationName, agentName, { result });
  }
  return true;
}

function handleCriticalMemoryError(error) {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Critical memory error:', message);
  return { critical: true, message };
}

module.exports = { MemoryError, validateMemoryResult, handleCriticalMemoryError };

