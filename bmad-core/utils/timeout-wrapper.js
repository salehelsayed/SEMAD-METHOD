/**
 * Timeout Wrapper Utility
 * Prevents long waits during agent operations by adding configurable timeouts
 */

/**
 * Wraps an async function with a timeout
 * @param {Function} asyncFn - The async function to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of the operation for logging
 * @returns {Function} Wrapped function that times out
 */
function withTimeout(asyncFn, timeoutMs = 5000, operationName = 'Operation') {
  return async function(...args) {
    let timeoutId;
    
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`${operationName} timed out after ${timeoutMs}ms`);
        error.name = 'TimeoutError';
        error.operationName = operationName;
        error.timeoutMs = timeoutMs;
        error.args = args;
        reject(error);
      }, timeoutMs);
    });

    try {
      // Race between the actual function and the timeout
      const result = await Promise.race([
        asyncFn.apply(this, args),
        timeoutPromise
      ]);
      
      // Clear the timeout if operation completed
      clearTimeout(timeoutId);
      
      return result;
    } catch (error) {
      // Clear timeout on any error
      clearTimeout(timeoutId);
      
      // If it's a timeout, enhance the error with context
      if (error.name === 'TimeoutError') {
        console.log(`⚡ ${operationName} timed out - continuing without waiting`);
        
        // Create enhanced error with full context
        const timeoutError = new Error(error.message);
        timeoutError.name = 'TimeoutError';
        timeoutError.operationName = operationName;
        timeoutError.timeoutMs = timeoutMs;
        timeoutError.originalError = error;
        
        // Return a safe default based on the operation
        if (operationName.includes('Session Summary')) {
          return {
            success: false,
            reason: 'timeout',
            duration: timeoutMs,
            error: timeoutError
          };
        }
        
        // For critical operations, throw the enhanced error
        if (operationName.includes('memory') || operationName.includes('Memory')) {
          throw timeoutError;
        }
        
        return null;
      }
      
      // Enhance non-timeout errors with operation context
      error.operationName = operationName;
      error.operationContext = {
        function: asyncFn.name || 'anonymous',
        args: args
      };
      
      // Re-throw enhanced error
      throw error;
    }
  };
}

/**
 * Quick execution wrapper - executes function but doesn't wait for result
 * @param {Function} asyncFn - The async function to execute
 * @param {string} operationName - Name of the operation for logging
 * @returns {Function} Wrapped function that returns immediately
 */
function fireAndForget(asyncFn, operationName = 'Operation') {
  return function(...args) {
    // Start the async operation but don't wait
    asyncFn.apply(this, args).catch(error => {
      console.log(`⚡ ${operationName} failed in background:`, error.message);
    });
    
    // Return immediately with success indicator
    return {
      started: true,
      operation: operationName,
      note: 'Operation started in background'
    };
  };
}

module.exports = {
  withTimeout,
  fireAndForget
};