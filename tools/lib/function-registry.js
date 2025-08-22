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
const fs = require('fs');
const { execSync, execFileSync } = require('child_process');
const path = require('path');

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
  },

  // Orchestrator: Fully in-session Dev↔QA iterative loop (no Codex/Claude)
  'orchestrator.devQaIterativeSession': async (storyArg, maxIterations = 5, projectRoot = process.cwd()) => {
    function resolveCore(rel) {
      const p1 = path.join(projectRoot, '.bmad-core', rel);
      if (fs.existsSync(p1)) return p1;
      return path.join(projectRoot, 'bmad-core', rel);
    }

    function findStoryById(id) {
      const storiesDir = path.join(projectRoot, 'docs', 'stories');
      if (!fs.existsSync(storiesDir)) return null;
      const walk = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) { const r = walk(p); if (r) return r; }
          else if (e.isFile() && p.endsWith('.md')) {
            const txt = fs.readFileSync(p, 'utf8');
            const re = new RegExp(`(^|\n)\s*StoryContract:\\s*[\\s\\S]*?story_id:\\s*\"?${id}\"?`, 'm');
            if (re.test(txt)) return p;
          }
        }
        return null;
      };
      return walk(storiesDir);
    }

    function resolveStoryPath(arg) {
      const abs = path.isAbsolute(arg) ? arg : path.join(projectRoot, arg);
      if (fs.existsSync(abs)) return abs;
      return findStoryById(String(arg));
    }

    function setStoryStatus(filePath, status) {
      try {
        let content = fs.readFileSync(filePath, 'utf8');
        const re = /(##\s*Status\s*\n\s*)(.+)/i;
        if (re.test(content)) {
          content = content.replace(re, `$1${status}`);
          fs.writeFileSync(filePath, content, 'utf8');
          return true;
        }
        return false;
      } catch (_) { return false; }
    }

    const storyPath = resolveStoryPath(storyArg);
    if (!storyPath) {
      return { success: false, error: `Could not resolve story from: ${storyArg}` };
    }

    // Helper: run structured task for Dev fixes if present
    async function runDevFixes() {
      const fixTask = resolveCore(path.join('structured-tasks', 'address-qa-feedback.yaml'));
      if (!fs.existsSync(fixTask)) return { success: false, reason: 'no_task' };
      try {
        const TaskRunner = require(path.join(__dirname, '..', 'task-runner'));
        const tr = new TaskRunner(projectRoot);
        const res = await tr.executeTask('dev', fixTask, { storyPath, allowMissingUserInput: true });
        return { success: !!res?.success };
      } catch (e) { return { success: false, error: e.message }; }
    }

    function runQAGateStrict() {
      const qaGateLocal = path.join(projectRoot, 'tools', 'orchestrator', 'gates', 'qa-gate.js');
      const qaGateCore = resolveCore(path.join('tools', 'orchestrator', 'gates', 'qa-gate.js'));
      try {
        if (fs.existsSync(qaGateLocal)) {
          execFileSync(process.execPath, [qaGateLocal, path.basename(storyPath)], { stdio: 'inherit', cwd: projectRoot });
          return true;
        }
        if (fs.existsSync(qaGateCore)) {
          execFileSync(process.execPath, [qaGateCore, path.basename(storyPath)], { stdio: 'inherit', cwd: projectRoot });
          return true;
        }
        // Fallback to npm scripts
        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
        if (pkg.scripts && pkg.scripts['gate:qa']) {
          execSync('npm run -s gate:qa', { stdio: 'inherit', cwd: projectRoot });
          return true;
        }
        if (pkg.scripts && pkg.scripts['test']) {
          execSync('npm test --silent', { stdio: 'inherit', cwd: projectRoot });
          return true;
        }
        return false;
      } catch (_) { return false; }
    }

    function verifyFixesStrict() {
      try {
        const report = verifyQAFixes(path.join(projectRoot, '.ai'));
        return !!(report && report.completionRate === 100);
      } catch (_) { return false; }
    }

    const maxIters = Number(maxIterations) || 5;
    for (let iter = 1; iter <= maxIters; iter++) {
      // Dev phase (structured fixes if available)
      await runDevFixes();

      // Verify
      const verified = verifyFixesStrict();

      // QA phase
      const qaPassed = runQAGateStrict();

      if (qaPassed && verified) {
        setStoryStatus(storyPath, 'Done');
        return { success: true, iterations: iter, story: path.relative(projectRoot, storyPath) };
      }
    }
    return { success: false, iterations: maxIters, story: path.relative(projectRoot, storyPath) };
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
    'qaTracker.verify': ['directory'],
    'orchestrator.devQaIterativeSession': ['storyArg', 'maxIterations', 'projectRoot']
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
