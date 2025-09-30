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
    path.join(__dirname, '..', '..', 'semad-core', moduleName),
    path.join(__dirname, '..', '..', '.semad-core', moduleName),
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
    return require.resolve(`semad-method/semad-core/${moduleName}`);
  } catch (e) {
    return fallbackPath;
  }
}

// Import simple tracker utilities
const SimpleTaskTracker = require(resolveModule('utils/simple-task-tracker', '../../semad-core/utils/simple-task-tracker'));
// simpleMemory removed - use simple-task-tracker directly

// Import QA utilities
const QAFindingsParser = require(resolveModule('utils/qa-findings-parser', '../../semad-core/utils/qa-findings-parser'));
const QAFixTracker = require(resolveModule('utils/qa-fix-tracker', '../../semad-core/utils/qa-fix-tracker'));
const { verifyQAFixes } = require(resolveModule('utils/verify-qa-fixes', '../../semad-core/utils/verify-qa-fixes'));
const { createUserInputHandler } = require('./elicit-handler');
// Unified memory removed - use simple-task-tracker and track-progress instead
const fs = require('fs');
const { execSync, execFileSync } = require('child_process');
const WorkflowOrchestrator = require(path.join(__dirname, '..', 'workflow-orchestrator'));

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
  // Memory functions now use simple-task-tracker directly
  'simpleMemory.saveContext': async (params) => {
    // Replaced with simple tracker
    const tracker = getTracker();
    if (params.agentName) tracker.setAgent(params.agentName);
    return { success: true };
  },
  
  'simpleMemory.logEntry': async (params) => {
    // Replaced with simple tracker
    const tracker = getTracker();
    tracker.log(params.content || '', params.type || 'info');
    return { success: true };
  },
  
  'simpleMemory.getProgress': async () => {
    // Replaced with simple tracker
    const tracker = getTracker();
    return tracker.getProgressReport();
  },
  
  'simpleMemory.getProgressReport': async () => {
    // Replaced with simple tracker
    const tracker = getTracker();
    return tracker.getProgressReport();
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

  'qaTracker.assertAllFixed': async () => {
    const tracker = getQATracker();

    if (!tracker.findings) {
      throw new Error('QA fix tracker is not initialized; run qaTracker.initialize before asserting completion.');
    }

    const report = tracker.generateFixReport();
    const pending = Array.isArray(report.pendingFixes) ? report.pendingFixes : [];

    if (report.completionRate < 100 || pending.length > 0) {
      const summary = pending
        .map(fix => {
          const location = fix.file ? ` (${fix.file})` : '';
          return `  - [${(fix.severity || 'unknown').toUpperCase()}] ${fix.id}${location}`;
        })
        .join('\n');

      const details = [
        `QA fixes incomplete — completion rate ${report.completionRate}%`,
        pending.length > 0 ? 'Pending fixes:\n' + summary : 'No pending fix details recorded'
      ].join('\n');

      const error = new Error(details);
      error.pendingFixes = pending;
      error.completionRate = report.completionRate;
      throw error;
    }

    return { success: true, completionRate: report.completionRate };
  },

  'fs.assertExists': async (relativePath) => {
    const fullPath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(process.cwd(), relativePath);

    if (!fs.existsSync(fullPath)) {
      const error = new Error(`Required file not found: ${relativePath}`);
      error.missingPath = relativePath;
      throw error;
    }

    return { success: true, path: fullPath };
  },

  // Memory manager functions now use simple tracking
  loadMemoryForTask: async (agentName, context) => {
    // Simplified - just initialize tracker
    const tracker = getTracker();
    tracker.setAgent(agentName);
    return { success: true, agentName, context };
  },
  saveAndCleanMemory: async (agentName, taskData) => {
    // Simplified - just log completion
    const tracker = getTracker();
    if (taskData && taskData.observation) {
      tracker.log(taskData.observation, 'info');
    }
    return { success: true, agentName };
  },

  // Orchestrator: Fully in-session Dev↔QA iterative loop (no Codex/Claude)
  'orchestrator.devQaIterativeSession': async (storyArg, maxIterations = 5, projectRoot = process.cwd()) => {
    function resolveCore(rel) {
      const cands = [
        path.join(projectRoot, '.semad-core', rel),
        path.join(projectRoot, 'semad-core', rel),
        path.join(projectRoot, '.semad-core', rel),
        path.join(projectRoot, 'semad-core', rel)
      ];
      for (const p of cands) { if (fs.existsSync(p)) return p; }
      return cands[0];
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
        } else {
          // Insert a Status section after the title or at top if missing
          if (/^#\s+/.test(content)) {
            content = content.replace(/^(#\s+.*\n)/, `$1\n## Status\n${status}\n\n`);
          } else {
            content = `## Status\n${status}\n\n` + content;
          }
        }
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
      } catch (_) { return false; }
    }

    function getStoryStatus(filePath) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(/##\s*Status\s*:?.*?\n([\s\S]*?)(?:\n#{1,6}\s|$)/i);
        if (!match) return null;
        const lines = match[1].split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        return lines.length ? lines[0] : null;
      } catch (_) {
        return null;
      }
    }

    function isApprovedStatus(status) {
      if (!status) return false;
      const normalized = status.trim().toLowerCase();
      return ['done', 'qa approved', 'approved', 'ready for done'].some(flag => normalized.includes(flag));
    }

    function requiresFixes(status) {
      return status ? /needs\s+fix(es)?/i.test(status) : false;
    }

    function hasFixTracking() {
      try {
        return fs.existsSync(path.join(projectRoot, '.ai', 'qa_fixes_checklist.json'));
      } catch (_) {
        return false;
      }
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
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    async function runQAReview() {
      const candidateTasks = [
        path.join('structured-tasks', 'review-story.yaml'),
        path.join('structured-tasks', 'qa-dev-handoff.yaml')
      ];
      let reviewTaskPath = null;
      for (const rel of candidateTasks) {
        const resolved = resolveCore(rel);
        if (fs.existsSync(resolved)) {
          reviewTaskPath = resolved;
          break;
        }
      }
      if (!reviewTaskPath) {
        return { success: false, reason: 'no_task' };
      }
      try {
        const TaskRunner = require(path.join(__dirname, '..', 'task-runner'));
        const runner = new TaskRunner(projectRoot);
        const userInputHandler = createUserInputHandler({ mode: 'auto', nonInteractive: true });
        const context = {
          storyPath,
          projectRoot,
          mode: 'review',
          reviewType: 'full',
          userInputHandler
        };
        const result = await runner.executeTask('qa', reviewTaskPath, context);
        const status = getStoryStatus(storyPath);
        return {
          success: !!result && result.success !== false,
          status,
          approved: isApprovedStatus(status),
          needsFixes: requiresFixes(status)
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    function runQAGateStrict() {
      const qaGateLocal = path.join(projectRoot, 'tools', 'orchestrator', 'gates', 'qa-gate.js');
      const qaGateCore = resolveCore(path.join('tools', 'orchestrator', 'gates', 'qa-gate.js'));
      try {
        const env = { ...process.env, CI: process.env.CI || '1', JEST_FORCE_COLOR: '0', FORCE_COLOR: '0' };
        if (fs.existsSync(qaGateLocal)) {
          execFileSync(process.execPath, [qaGateLocal, path.basename(storyPath)], { stdio: 'inherit', cwd: projectRoot, env });
          return true;
        }
        if (fs.existsSync(qaGateCore)) {
          execFileSync(process.execPath, [qaGateCore, path.basename(storyPath)], { stdio: 'inherit', cwd: projectRoot, env });
          return true;
        }
        // Fallback to npm scripts
        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
        if (pkg.scripts && pkg.scripts['gate:qa']) {
          execSync('npm run -s gate:qa', { stdio: 'inherit', cwd: projectRoot, env });
          return true;
        }
        if (pkg.scripts && pkg.scripts['test']) {
          execSync('npm test --silent', { stdio: 'inherit', cwd: projectRoot, env });
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

    const orchestrator = new WorkflowOrchestrator(projectRoot);
    orchestrator.nonInteractive = true;
    orchestrator.suppressDevLoadWarnings = true;

    try {
      await orchestrator.initialize();
    } catch (error) {
      console.warn('⚠️  Failed to initialize orchestrator context:', error.message);
    }

    orchestrator.logger.configure({ verbosity: true, verbosityLevel: 'detailed' });

    const logger = orchestrator.logger;
    const storyRelative = path.relative(projectRoot, storyPath);
    const storyDescriptor = {
      id: path.basename(storyPath).replace(/\.md$/i, '').toUpperCase(),
      name: path.basename(storyPath, path.extname(storyPath)),
      file: storyPath
    };

    const transcript = [];
    const record = (message) => {
      transcript.push(message);
      console.log(message);
    };

    logger.phaseStart('Dev↔QA Iterative Session', `Story: ${storyDescriptor.name}`);
    logger.summary('Story Context', [
      `Path: ${storyRelative}`,
      `Max Iterations: ${maxIterations || 5}`
    ]);

    record(`🔁 Starting Dev↔QA iterative session for ${storyRelative}`);

    const maxIters = Number(maxIterations) || 5;
    let qaTaskAvailable = true;
    let lastQAOutcome = null;

    const logHandoff = (handoff) => {
      if (!handoff) return;
      record(`\n🤝 Handoff ${handoff.sourceAgent} → ${handoff.targetAgent}`);
      if (handoff.recommendations && handoff.recommendations.length) {
        handoff.recommendations.forEach((rec, index) => {
          record(`  ${index + 1}. ${rec}`);
        });
      }
      if (handoff.error) {
        record(`  ⚠️  Handoff warning: ${handoff.error}`);
      }
    };

    for (let iter = 1; iter <= maxIters; iter++) {
      logger.iteration(iter, 'Starting iteration');
      record(`\nIteration ${iter}: Preparing Dev updates`);

      const handoffToDev = await orchestrator.consolidateContextForHandoff(
        iter === 1 ? 'orchestrator' : 'qa',
        'dev',
        'dev-qa-iterative',
        { storyPath: storyRelative, iteration: iter }
      );
      logHandoff(handoffToDev);
      logger.agentAction('dev', iter === 1 ? 'Implementing story' : 'Applying QA feedback', {
        story: storyRelative,
        iteration: iter
      });

      const devResult = await runDevFixes();
      if (!devResult.success && devResult.reason !== 'no_task') {
        setStoryStatus(storyPath, 'Needs Fixes');
        logger.warn(`Dev fixes task failed: ${devResult.error || 'Dev fixes task failed'}`);
        record(`  ⚠️  Dev fixes task failed: ${devResult.error || 'Dev fixes task failed'}`);
        logger.phaseComplete('Dev↔QA Iterative Session');
        return {
          success: false,
          iterations: iter,
          story: storyRelative,
          error: devResult.error || 'Dev fixes task failed',
          transcript
        };
      }
      record(`  ✅ Dev structured task complete (address-qa-feedback)`);

      const handoffToQA = await orchestrator.consolidateContextForHandoff(
        'dev',
        'qa',
        'dev-qa-iterative',
        { storyPath: storyRelative, iteration: iter }
      );
      logHandoff(handoffToQA);
      logger.agentAction('qa', 'Reviewing implementation', { iteration: iter, story: storyRelative });
      record(`  🔍 QA review in progress`);

      let qaOutcome = { success: false, approved: false, needsFixes: false, status: getStoryStatus(storyPath) };

      if (qaTaskAvailable) {
        qaOutcome = await runQAReview();
        if (qaOutcome.reason === 'no_task') {
          qaTaskAvailable = false;
          record('  ℹ️  No structured QA review task found; falling back to QA gate only');
        } else if (qaOutcome.success === false && qaOutcome.error) {
          console.warn(`QA review task failed: ${qaOutcome.error}`);
          record(`  ⚠️  QA review task failed: ${qaOutcome.error}`);
        }
      }

      const verified = verifyFixesStrict() || !hasFixTracking();
      const qaPassed = runQAGateStrict();
      record(`  🧪 QA gate ${qaPassed ? 'passed' : 'failed'} | Fix verification ${verified ? 'passed' : 'incomplete'}`);

      if (!qaTaskAvailable) {
        if (qaPassed && verified) {
          setStoryStatus(storyPath, 'Done');
          logger.agentAction('qa', 'QA gate passed (no structured review task)', { iteration: iter });
          record('  ✅ QA gate passed; story marked Done');
          logger.phaseComplete('Dev↔QA Iterative Session');
          return { success: true, iterations: iter, story: storyRelative, transcript };
        }

        setStoryStatus(storyPath, 'Needs Fixes');
        lastQAOutcome = qaOutcome;
        record('  🔁 Additional work required before approval');
        continue;
      }

      if (qaOutcome.success && qaOutcome.approved && qaPassed && verified) {
        setStoryStatus(storyPath, 'Done');
        logger.agentAction('qa', 'QA approved implementation', { iteration: iter });
        record('  ✅ QA approved implementation; story marked Done');
        logger.phaseComplete('Dev↔QA Iterative Session');
        return { success: true, iterations: iter, story: storyRelative, transcript };
      }

      setStoryStatus(storyPath, 'Needs Fixes');
      lastQAOutcome = qaOutcome;
      const statusNote = qaOutcome.status ? ` (status: ${qaOutcome.status})` : '';
      logger.warn(`QA review indicates additional work required${statusNote}`);
      record(`  🔁 QA indicates more work${statusNote}`);
      verifyFixesStrict();
    }

    logger.warn(`Maximum iterations reached (${maxIters}) for ${storyRelative}`);
    record(`⚠️  Maximum iterations reached (${maxIters}) without QA approval`);
    logger.phaseComplete('Dev↔QA Iterative Session');

    return { success: false, iterations: maxIters, story: storyRelative, transcript, qaOutcome: lastQAOutcome };
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
    'qaTracker.assertAllFixed': [],
    'fs.assertExists': ['relativePath'],
    'orchestrator.devQaIterativeSession': ['storyArg', 'maxIterations', 'projectRoot'],
    // Unified memory functions
    'loadMemoryForTask': ['agentName', 'context'],
    'saveAndCleanMemory': ['agentName', 'taskData']
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
