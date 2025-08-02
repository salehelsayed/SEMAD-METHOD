/**
 * Function Registry for Structured Task Functions
 * 
 * Maps YAML function names to actual JavaScript function implementations
 * and handles parameter resolution and execution.
 */

const path = require('path');

// Dynamic module resolution helper
function resolveModule(moduleName, fallbackPath) {
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'bmad-core', moduleName),
    path.join(__dirname, '..', '..', '.bmad-core', moduleName),
    path.join(__dirname, '..', '..', moduleName)
  ];
  
  for (const modulePath of possiblePaths) {
    try {
      require.resolve(modulePath);
      return modulePath;
    } catch (e) {
      // Continue to next path
    }
  }
  
  // Try as npm package
  try {
    return require.resolve(`bmad-method/bmad-core/${moduleName}`);
  } catch (e) {
    return fallbackPath;
  }
}

// Import memory utilities
const {
  updateWorkingMemory,
  saveToLongTermMemory
} = require(resolveModule('utils/agent-memory-manager', '../../bmad-core/utils/agent-memory-manager'));

const {
  logMemoryInit,
  logWorkingMemory,
  logLongTermMemory,
  logMemoryRetrieval,
  logMemoryError,
  logTaskMemory,
  logSessionSummary
} = require(resolveModule('utils/memory-usage-logger', '../../bmad-core/utils/memory-usage-logger'));

/**
 * Registry of available functions that can be called from structured tasks
 */
const FUNCTION_REGISTRY = {
  // Memory logging functions
  logTaskMemory: async (agentName, taskName, operation, taskData, metadata = {}) => {
    try {
      await logTaskMemory(agentName, taskName, operation, taskData, metadata);
      return { success: true, logged: true, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error(`logTaskMemory failed: ${error.message}`);
      return { success: false, error: error.message, timestamp: new Date().toISOString() };
    }
  },

  logWorkingMemory: async (agentName, operation, memoryType, data, metadata = {}) => {
    try {
      await logWorkingMemory(agentName, operation, memoryType, data, metadata);
      return { success: true, logged: true, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error(`logWorkingMemory failed: ${error.message}`);
      return { success: false, error: error.message, timestamp: new Date().toISOString() };
    }
  },

  logLongTermMemory: async (agentName, operation, memoryContent, metadata = {}) => {
    try {
      await logLongTermMemory(agentName, operation, memoryContent, metadata);
      return { success: true, logged: true, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error(`logLongTermMemory failed: ${error.message}`);
      return { success: false, error: error.message, timestamp: new Date().toISOString() };
    }
  },

  // Working memory functions
  updateWorkingMemory: async (agentName, memoryType, data, metadata = {}) => {
    try {
      const updates = {};
      
      // Handle different memory types
      switch (memoryType) {
        case 'recentDecisions':
          if (data.decision && data.rationale) {
            updates.decision = data.decision;
            updates.reasoning = data.rationale;
          } else {
            updates.observation = JSON.stringify(data);
          }
          break;
        case 'completedTasks':
          if (typeof data === 'string') {
            updates.completedTask = data;
          } else {
            updates.completedTask = data.taskId || JSON.stringify(data);
          }
          break;
        case 'recentReviews':
          updates.observation = `Review completed: ${JSON.stringify(data)}`;
          break;
        case 'completedReviews':
          if (typeof data === 'string') {
            updates.completedTask = data;
          } else {
            updates.completedTask = data.reviewId || JSON.stringify(data);
          }
          break;
        default:
          // Generic observation
          updates.observation = typeof data === 'string' ? data : JSON.stringify(data);
      }
      
      const result = await updateWorkingMemory(agentName, updates);
      return { success: true, updated: true, timestamp: new Date().toISOString(), result };
    } catch (error) {
      console.error(`updateWorkingMemory failed: ${error.message}`);
      return { success: false, error: error.message, timestamp: new Date().toISOString() };
    }
  },

  updateWorkingMemoryAndExit: async (agentName, memoryType, data, metadata = {}) => {
    try {
      const result = await FUNCTION_REGISTRY.updateWorkingMemory(agentName, memoryType, data, metadata);
      
      // For subprocess execution, we would exit here
      // In the main process, we just return the result
      if (process.env.BMAD_SUBPROCESS === 'true') {
        console.log(JSON.stringify(result));
        process.exit(result.success ? 0 : 1);
      }
      
      return result;
    } catch (error) {
      console.error(`updateWorkingMemoryAndExit failed: ${error.message}`);
      const errorResult = { success: false, error: error.message, timestamp: new Date().toISOString() };
      
      if (process.env.BMAD_SUBPROCESS === 'true') {
        console.log(JSON.stringify(errorResult));
        process.exit(1);
      }
      
      return errorResult;
    }
  },

  // Long-term memory functions
  saveToLongTermMemory: async (agentName, memoryContent, metadata = {}) => {
    try {
      const result = await saveToLongTermMemory(agentName, memoryContent);
      return { 
        success: result?.saved || false, 
        memoryId: result?.memoryId,
        timestamp: result?.timestamp || new Date().toISOString(),
        result 
      };
    } catch (error) {
      console.error(`saveToLongTermMemory failed: ${error.message}`);
      return { success: false, error: error.message, timestamp: new Date().toISOString() };
    }
  },

  saveToLongTermMemoryAndExit: async (agentName, memoryContent, metadata = {}) => {
    try {
      const result = await FUNCTION_REGISTRY.saveToLongTermMemory(agentName, memoryContent, metadata);
      
      // For subprocess execution, we would exit here
      if (process.env.BMAD_SUBPROCESS === 'true') {
        console.log(JSON.stringify(result));
        process.exit(result.success ? 0 : 1);
      }
      
      return result;
    } catch (error) {
      console.error(`saveToLongTermMemoryAndExit failed: ${error.message}`);
      const errorResult = { success: false, error: error.message, timestamp: new Date().toISOString() };
      
      if (process.env.BMAD_SUBPROCESS === 'true') {
        console.log(JSON.stringify(errorResult));
        process.exit(1);
      }
      
      return errorResult;
    }
  }
};

/**
 * Execute a function with resolved parameters
 * @param {string} functionName - Name of the function to execute
 * @param {Object} parameters - Parameters to pass to the function
 * @param {Object} context - Execution context for template resolution
 * @returns {Promise<*>} Function execution result
 */
async function executeFunction(functionName, parameters, context) {
  if (!FUNCTION_REGISTRY[functionName]) {
    throw new Error(`Unknown function: ${functionName}. Available functions: ${Object.keys(FUNCTION_REGISTRY).join(', ')}`);
  }

  // Resolve template variables in parameters
  const resolvedParameters = resolveParameters(parameters, context);
  
  // Convert parameters object to function arguments
  const args = extractFunctionArguments(functionName, resolvedParameters);
  
  try {
    const result = await FUNCTION_REGISTRY[functionName](...args);
    return result;
  } catch (error) {
    console.error(`Function ${functionName} execution failed:`, error);
    throw error;
  }
}

/**
 * Resolve template variables in parameters
 * @param {Object} parameters - Parameters that may contain template variables
 * @param {Object} context - Context containing variable values
 * @returns {Object} Parameters with resolved template variables
 */
function resolveParameters(parameters, context) {
  if (!parameters || typeof parameters !== 'object') {
    return parameters;
  }

  const resolved = {};
  
  for (const [key, value] of Object.entries(parameters)) {
    resolved[key] = resolveValue(value, context);
  }
  
  return resolved;
}

/**
 * Recursively resolve template variables in a value
 * @param {*} value - Value that may contain template variables
 * @param {Object} context - Context containing variable values
 * @returns {*} Resolved value
 */
function resolveValue(value, context) {
  if (typeof value === 'string') {
    // Replace template variables {{variableName}}
    return value.replace(/{{([^}]+)}}/g, (match, path) => {
      const parts = path.split('.');
      let result = context;
      
      // Navigate the object path
      for (const part of parts) {
        if (result && result[part] !== undefined) {
          result = result[part];
        } else {
          // If not found in context, check direct inputs
          if (parts.length === 1 && context.inputs && context.inputs[path] !== undefined) {
            result = context.inputs[path];
          } else {
            // Return original match if not found
            return match;
          }
          break;
        }
      }
      
      return result !== undefined ? result : match;
    });
  } else if (Array.isArray(value)) {
    return value.map(item => resolveValue(item, context));
  } else if (value && typeof value === 'object') {
    const resolved = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveValue(val, context);
    }
    return resolved;
  }
  
  return value;
}

/**
 * Extract function arguments from resolved parameters based on function signature
 * @param {string} functionName - Name of the function
 * @param {Object} resolvedParameters - Resolved parameters object
 * @returns {Array} Array of arguments to pass to the function
 */
function extractFunctionArguments(functionName, resolvedParameters) {
  const parameterMappings = {
    logTaskMemory: ['agentName', 'taskName', 'operation', 'taskData', 'metadata'],
    logWorkingMemory: ['agentName', 'operation', 'memoryType', 'data', 'metadata'],
    logLongTermMemory: ['agentName', 'operation', 'memoryContent', 'metadata'],
    updateWorkingMemory: ['agentName', 'memoryType', 'data', 'metadata'],
    updateWorkingMemoryAndExit: ['agentName', 'memoryType', 'data', 'metadata'],
    saveToLongTermMemory: ['agentName', 'memoryContent', 'metadata'],
    saveToLongTermMemoryAndExit: ['agentName', 'memoryContent', 'metadata']
  };

  const expectedParams = parameterMappings[functionName];
  if (!expectedParams) {
    // Generic handling - convert object to array of values
    return Object.values(resolvedParameters);
  }

  // Map parameters to expected function signature
  return expectedParams.map(paramName => {
    const value = resolvedParameters[paramName];
    return value !== undefined ? value : {};
  });
}

/**
 * Get list of available functions
 * @returns {Array<string>} Array of function names
 */
function getAvailableFunctions() {
  return Object.keys(FUNCTION_REGISTRY);
}

/**
 * Check if a function exists in the registry
 * @param {string} functionName - Name of the function to check
 * @returns {boolean} True if function exists
 */
function hasFunction(functionName) {
  return FUNCTION_REGISTRY.hasOwnProperty(functionName);
}

module.exports = {
  executeFunction,
  getAvailableFunctions,
  hasFunction,
  FUNCTION_REGISTRY
};