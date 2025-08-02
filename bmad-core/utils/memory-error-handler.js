/**
 * Memory Error Handler
 * 
 * Provides consistent error handling and reporting for memory operations
 * Ensures agents stop execution when memory updates fail
 */

// Use ANSI color codes instead of chalk for better compatibility
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  redBold: (text) => `\x1b[31m\x1b[1m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  yellowBold: (text) => `\x1b[33m\x1b[1m${text}\x1b[0m`,
  white: (text) => `\x1b[37m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  grayBold: (text) => `\x1b[90m\x1b[1m${text}\x1b[0m`
};

class MemoryError extends Error {
  constructor(message, operation, agentName, details = {}) {
    super(message);
    this.name = 'MemoryError';
    this.operation = operation;
    this.agentName = agentName;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Formats and displays a memory error in a clear, visible way
 * @param {Error} error - The error to display
 * @param {string} context - Additional context about what was being attempted
 */
function displayMemoryError(error, context = '') {
  console.error('\n' + colors.red('═'.repeat(80)));
  console.error(colors.redBold('🚨 CRITICAL MEMORY ERROR - AGENT EXECUTION HALTED 🚨'));
  console.error(colors.red('═'.repeat(80)) + '\n');
  
  console.error(colors.yellowBold('Error Type:'), error.name || 'Unknown');
  console.error(colors.yellowBold('Operation:'), error.operation || context || 'Memory Operation');
  console.error(colors.yellowBold('Agent:'), error.agentName || 'Unknown');
  console.error(colors.yellowBold('Timestamp:'), error.timestamp || new Date().toISOString());
  
  console.error('\n' + colors.redBold('Error Message:'));
  console.error(colors.white(error.message));
  
  if (error.details && Object.keys(error.details).length > 0) {
    console.error('\n' + colors.yellowBold('Error Details:'));
    console.error(JSON.stringify(error.details, null, 2));
  }
  
  if (error.stack) {
    console.error('\n' + colors.grayBold('Stack Trace:'));
    console.error(colors.gray(error.stack));
  }
  
  console.error('\n' + colors.red('═'.repeat(80)));
  console.error(colors.redBold('AGENT CANNOT CONTINUE WITHOUT SUCCESSFUL MEMORY UPDATE'));
  console.error(colors.red('═'.repeat(80)) + '\n');
}

/**
 * Wraps a memory function with comprehensive error handling
 * @param {Function} memoryFunction - The memory function to wrap
 * @param {string} operationName - Name of the operation for error reporting
 * @param {string} agentName - Name of the agent performing the operation
 * @returns {Function} Wrapped function that handles errors properly
 */
function wrapMemoryOperation(memoryFunction, operationName, agentName) {
  return async function(...args) {
    try {
      const result = await memoryFunction(...args);
      
      // Check if the result indicates failure
      if (result && result.error) {
        throw new MemoryError(
          result.error,
          operationName,
          agentName,
          { result }
        );
      }
      
      // Check for other failure indicators
      if (result === null || result === undefined) {
        throw new MemoryError(
          'Memory operation returned null or undefined',
          operationName,
          agentName,
          { args }
        );
      }
      
      if (result.saved === false || result.success === false) {
        throw new MemoryError(
          result.message || 'Memory operation failed',
          operationName,
          agentName,
          { result }
        );
      }
      
      return result;
    } catch (error) {
      // If it's already a MemoryError, enhance it
      if (error instanceof MemoryError) {
        error.agentName = error.agentName || agentName;
        error.operation = error.operation || operationName;
        throw error;
      }
      
      // Convert other errors to MemoryError
      throw new MemoryError(
        error.message || 'Unknown memory error',
        operationName,
        agentName,
        {
          originalError: error.name,
          stack: error.stack
        }
      );
    }
  };
}

/**
 * Critical error handler that ensures the agent stops
 * @param {Error} error - The error that occurred
 * @param {string} context - Context about what was being done
 */
async function handleCriticalMemoryError(error, context = '') {
  displayMemoryError(error, context);
  
  // Try to close any open connections
  try {
    const { closeConnections } = require('./qdrant');
    await closeConnections();
  } catch (closeError) {
    console.error(colors.yellow('Warning: Failed to close connections:'), closeError.message);
  }
  
  // Log to memory usage log if possible
  try {
    const { logMemoryError } = require('./memory-usage-logger');
    await logMemoryError(
      error.agentName || 'unknown',
      error.operation || 'unknown',
      error.message,
      {
        errorType: error.name,
        details: error.details,
        context
      }
    );
  } catch (logError) {
    console.error(colors.yellow('Warning: Failed to log error:'), logError.message);
  }
  
  // Force exit with error code
  process.exit(1);
}

/**
 * Validates memory operation result and throws if invalid
 * @param {*} result - The result to validate
 * @param {string} operation - The operation name
 * @param {string} agentName - The agent name
 */
function validateMemoryResult(result, operation, agentName) {
  if (!result) {
    throw new MemoryError(
      'Memory operation returned no result',
      operation,
      agentName
    );
  }
  
  if (result.error || result.saved === false || result.success === false) {
    throw new MemoryError(
      result.error || result.message || 'Memory operation failed',
      operation,
      agentName,
      { result }
    );
  }
  
  return result;
}

module.exports = {
  MemoryError,
  displayMemoryError,
  wrapMemoryOperation,
  handleCriticalMemoryError,
  validateMemoryResult
};