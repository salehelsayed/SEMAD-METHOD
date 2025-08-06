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

// Import simple tracker utilities
const SimpleTaskTracker = require(resolveModule('utils/simple-task-tracker', '../../bmad-core/utils/simple-task-tracker'));
const simpleMemory = require(resolveModule('utils/simpleMemory', '../../bmad-core/utils/simpleMemory'));

// Import QA utilities
const QAFindingsParser = require(resolveModule('utils/qa-findings-parser', '../../bmad-core/utils/qa-findings-parser'));
const QAFixTracker = require(resolveModule('utils/qa-fix-tracker', '../../bmad-core/utils/qa-fix-tracker'));
const { verifyQAFixes } = require(resolveModule('utils/verify-qa-fixes', '../../bmad-core/utils/verify-qa-fixes'));

// Create a singleton instance of the tracker
let trackerInstance = null;
const getTracker = () => {
  if (!trackerInstance) {
    trackerInstance = new SimpleTaskTracker();
  }
  return trackerInstance;
};

// Create a singleton instance of the QA tracker
let qaTrackerInstance = null;
const getQATracker = () => {
  if (!qaTrackerInstance) {
    qaTrackerInstance = new QAFixTracker();
  }
  return qaTrackerInstance;
};

/**
 * Registry of available functions that can be called from structured tasks
 */
const FUNCTION_REGISTRY = {
  // Simple memory functions for structured tasks
  'simpleMemory.saveContext': async (params) => {
    return await simpleMemory.saveContext(params);
  },
  
  'simpleMemory.logEntry': async (params) => {
    return await simpleMemory.logEntry(params);
  },
  
  'simpleMemory.getProgress': async () => {
    return await simpleMemory.getProgress();
  },
  
  'simpleMemory.getProgressReport': async () => {
    return await simpleMemory.getProgressReport();
  },
  
  // Direct tracker functions
  trackProgress: async (workflow, task, status, notes) => {
    const tracker = getTracker();
    
    if (!tracker.workflow) {
      // Initialize workflow if not already started
      tracker.startWorkflow(workflow, [{ name: task }]);
    }
    
    if (status === 'completed') {
      return { success: tracker.completeCurrentTask(notes), timestamp: new Date().toISOString() };
    } else if (status === 'skipped') {
      return { success: tracker.skipCurrentTask(notes), timestamp: new Date().toISOString() };
    } else {
      tracker.log(`Task ${task}: ${status}`, 'info');
      return { success: true, timestamp: new Date().toISOString() };
    }
  },
  
  saveDebugLog: async (directory = '.ai') => {
    const tracker = getTracker();
    const filepath = tracker.saveDebugLog(directory);
    return { success: true, filepath, timestamp: new Date().toISOString() };
  },
  
  // QA tracking functions
  'qaParser.parse': async (storyContent) => {
    const parser = new QAFindingsParser();
    return parser.parseQAResults(storyContent);
  },
  
  'qaTracker.initialize': async (findings) => {
    const tracker = getQATracker();
    tracker.initializeFromFindings(findings);
    return { success: true, taskCount: tracker.getTasks().length };
  },
  
  'qaTracker.completeFix': async (fixId, verification) => {
    const tracker = getQATracker();
    const result = tracker.completeFix(fixId, verification);
    return { success: result !== null, fix: result };
  },
  
  'qaTracker.getReport': async () => {
    const tracker = getQATracker();
    return tracker.generateFixReport();
  },
  
  'qaTracker.save': async (directory = '.ai') => {
    const tracker = getQATracker();
    const filepath = tracker.saveFixTracking(directory);
    return { success: true, filepath };
  },
  
  'qaTracker.load': async (directory = '.ai') => {
    const tracker = getQATracker();
    const loaded = tracker.loadFixTracking(directory);
    return { success: loaded, taskCount: loaded ? tracker.getTasks().length : 0 };
  },
  
  'qaTracker.verify': async (directory = '.ai') => {
    return verifyQAFixes(directory);
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
    'simpleMemory.saveContext': ['params'],
    'simpleMemory.logEntry': ['params'],
    'simpleMemory.getProgress': [],
    'simpleMemory.getProgressReport': [],
    'trackProgress': ['workflow', 'task', 'status', 'notes'],
    'saveDebugLog': ['directory'],
    'qaParser.parse': ['storyContent'],
    'qaTracker.initialize': ['findings'],
    'qaTracker.completeFix': ['fixId', 'verification'],
    'qaTracker.getReport': [],
    'qaTracker.save': ['directory'],
    'qaTracker.load': ['directory'],
    'qaTracker.verify': ['directory']
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