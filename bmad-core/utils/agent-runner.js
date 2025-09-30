/**
 * Agent Runner - Simplified version using only simple-task-tracker and track-progress
 * Orchestrates agent invocations with basic tracking
 */

const TaskTracker = require('./simple-task-tracker');
const VerboseLogger = require('./verbose-logger');
const { withTimeout } = require('./timeout-wrapper');
const fs = require('fs');
const path = require('path');
const WorkflowExecutor = require('./workflow-executor');

const UnifiedMemoryManager = require('./unified-memory-manager');
const COMMAND_TASK_MAP = {
  'implement-next-story': path.join('semad-core', 'structured-tasks', 'implement-next-story.yaml'),
  'develop-story': path.join('semad-core', 'structured-tasks', 'develop-story.yaml')
};

class AgentRunner {
  constructor(options = {}) {
    this.logger = new VerboseLogger(options.loggerConfig || {});
    this.memoryEnabled = options.memoryEnabled !== false;
    this.tracker = new TaskTracker();
    // Removed health monitoring - no longer needed
    this._taskRunner = null;
    this._workflowExecutor = null;
    this.agentDefinitions = new Map();
  }

  get taskRunner() {
    if (!this._taskRunner) {
      const TaskRunner = require('../../tools/task-runner');
      this._taskRunner = new TaskRunner(process.cwd());
    }
    return this._taskRunner;
  }

  get workflowExecutor() {
    if (!this._workflowExecutor) {
      this._workflowExecutor = new WorkflowExecutor(process.cwd(), { flowType: 'linear' });
    }
    return this._workflowExecutor;
  }

  ensureAgentDefinition(agentName) {
    if (this.agentDefinitions.has(agentName)) {
      return this.agentDefinitions.get(agentName);
    }

    const rootDir = process.cwd();
    const agentPath = path.join(rootDir, 'semad-core', 'agents', `${agentName}.md`);
    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent definition not found: ${agentPath}`);
    }

    const content = fs.readFileSync(agentPath, 'utf8');
    this.agentDefinitions.set(agentName, { path: agentPath, content });
    return this.agentDefinitions.get(agentName);
  }

  configureLogger(config = {}) {
    if (typeof this.logger.configure === 'function') {
      this.logger.configure(config);
    }
  }

  /**
   * Perform a simplified startup health check
   */
  async performStartupHealthCheck(agentName, options = {}) {
    const result = {
      healthy: true,
      issues: [],
      errors: [],
      warnings: [],
      recommendations: []
    };

    // Just check if .ai directory is writable
    const aiDir = path.join(process.cwd(), '.ai');
    try {
      if (!fs.existsSync(aiDir)) {
        fs.mkdirSync(aiDir, { recursive: true });
      }
      // Test write
      const testFile = path.join(aiDir, '.test-write');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error) {
      result.healthy = false;
      result.errors.push({
        component: 'filesystem',
        message: `Cannot write to .ai directory: ${error.message}`,
        severity: 'ERROR'
      });
    }

    return result;
  }

  /**
   * Simplified memory status
   */
  async getMemoryStatus(agentName) {
    const progressFile = path.join(process.cwd(), '.ai', `${agentName}_progress.json`);
    
    try {
      if (fs.existsSync(progressFile)) {
        const data = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        return {
          available: true,
          hasProgress: true,
          lastUpdate: data.lastUpdate || null,
          observations: (data.observations || []).length
        };
      }
    } catch (error) {
      // Ignore errors
    }

    return {
      available: true,
      hasProgress: false,
      lastUpdate: null,
      observations: 0
    };
  }

  /**
   * Main agent invocation method
   */
  async invokeAgent(agentName, command, context = {}) {
    const startTime = Date.now();
    this.logger.agentAction(agentName, `invoke: ${command}`, context, 'normal');

    const result = {
      success: false,
      result: null,
      error: null,
      memoryState: null,
      healthCheck: null,
      duration: 0
    };

    // Set default timeouts
    const healthCheckTimeout = context.healthCheckTimeout || 30000;
    const executionTimeout = context.executionTimeout || 300000;

    let healthCheckResult = null;

    try {
      // Phase 0: Perform simplified health check
      const performHealthCheckWithTimeout = withTimeout(
        this.performStartupHealthCheck.bind(this),
        healthCheckTimeout,
        'Health check'
      );
      
      healthCheckResult = await this.performStartupHealthCheck(agentName, {
        skipOperations: context.skipHealthOperations !== false
      });

      result.healthCheck = healthCheckResult;

      if (!healthCheckResult.healthy && context.requireHealthy !== false) {
        throw new Error(`Agent ${agentName} failed health check: ${healthCheckResult.errors[0]?.message || 'Unknown error'}`);
      }

      // Phase 1: Initialize tracker
      if (this.memoryEnabled) {
        this.tracker.setAgent(agentName);
        this.logger.phaseStart('memory', `Initialized tracker for agent ${agentName}`);
        this.logger.phaseComplete('memory');
      }

      // Phase 2: Execute agent command
      this.logger.phaseStart('execution', `Executing command: ${command}`);

      const commandResult = await this.executeCommand(agentName, command, context);

      result.result = commandResult;
      result.success = commandResult?.success === false ? false : true;

      // Phase 3: Log to track-progress if enabled
      if (this.memoryEnabled) {
        const trackProgressPath = path.join(__dirname, 'track-progress.js');
        if (fs.existsSync(trackProgressPath)) {
          try {
            const trackProgress = require(trackProgressPath);
            // Log an observation about the command execution
            if (typeof trackProgress === 'function') {
              trackProgress('observation', agentName, `Executed command: ${command}`);
            }
          } catch (e) {
            // Silently ignore tracking errors
          }
        }
      }

      // Get final memory status
      result.memoryState = await this.getMemoryStatus(agentName);

    } catch (error) {
      this.logger.error('Agent invocation failed', error);
      result.error = error?.message || error;
      result.success = false;

      // Try to save error state
      if (this.memoryEnabled) {
        try {
          const errorFile = path.join(process.cwd(), '.ai', `${agentName}_error.json`);
          fs.writeFileSync(errorFile, JSON.stringify({
            error: error.message,
            stack: error.stack,
            command: command,
            timestamp: new Date().toISOString()
          }, null, 2));
        } catch (saveError) {
          this.logger.warn(`Failed to save error state: ${saveError.message}`);
        }
      }
    } finally {
      result.duration = Date.now() - startTime;
      this.logger.phaseComplete('execution', `Total duration: ${result.duration}ms`);
    }

    return result;
  }

  async executeCommand(agentName, command, context = {}) {
    const mappedTask = COMMAND_TASK_MAP[command];

    if (mappedTask) {
      this.ensureAgentDefinition(agentName);

      const taskId = path.basename(mappedTask).replace(/\.ya?ml$/i, '');
      const execContext = {
        ...context,
        agentName,
        command
      };

      const taskResult = await this.workflowExecutor.executeStructuredTask(taskId, execContext);

      return {
        success: taskResult?.success !== false,
        output: taskResult,
        agent: agentName
      };
    }

    // Default no-op command execution for unhandled commands
    return {
      success: true,
      output: `Command ${command} executed (no structured task mapping)`
    };
  }

  /**
   * Get agent memory status (simplified)
   */
  async getAgentMemoryStatus(agentName) {
    if (!this.memoryEnabled) {
      return {
        available: false,
        enabled: false,
        message: 'Memory system disabled'
      };
    }
    const status = await UnifiedMemoryManager.getMemoryStatus(agentName);
    return { ...status, enabled: true };
  }

  /**
   * Execute a structured task for an agent using TaskRunner
   */
  async runStructuredTask(agentName, taskPath, context = {}) {
    const TaskRunner = require('../../tools/task-runner');
    const runner = new TaskRunner(process.cwd());
    return runner.executeTask(agentName, taskPath, context);
  }

  /**
   * Convenience wrapper to invoke an agent with a task name
   */
  async runAgent(agentName, context = {}) {
    const command = context.task || 'implement-next-story';
    return this.invokeAgent(agentName, command, context);
  }

  surfaceMemoryHealthIssues(agentName, healthResult) {
    if (!healthResult || healthResult.healthy) {
      return;
    }

    const issues = healthResult.errors && healthResult.errors.length
      ? healthResult.errors.map(err => err.message).join('; ')
      : 'Unknown memory health issue';

    console.warn(`[Memory][${agentName}] ${issues}`);
  }

  async executeWithMemory(agentName, taskId, context = {}, taskExecutor) {
    const start = Date.now();
    const response = {
      agentName,
      taskId,
      success: false,
      executionResult: null,
      memoryContext: null,
      memoryResult: null,
      healthCheckResult: null,
      duration: 0
    };

    try {
      const healthCheck = await this.performStartupHealthCheck(agentName, context.healthOptions || {});
      response.healthCheckResult = healthCheck;
      if (!healthCheck.healthy && context.requireHealthy !== false) {
        throw new Error(healthCheck.errors[0]?.message || 'Agent failed health check');
      }

      let memoryContext = null;
      if (this.memoryEnabled) {
        const memoryMetadata = {
          taskId,
          taskType: context.taskType,
          storyId: context.storyId,
          epicId: context.epicId
        };
        memoryContext = await UnifiedMemoryManager.loadMemoryForTask(
          agentName,
          { ...context, ...memoryMetadata }
        );
      }

      const executionContext = {
        ...context,
        agentName,
        taskId,
        memory: memoryContext,
        memoryConfig: memoryContext?.config
      };

      const executionResult = await taskExecutor(executionContext);
      response.executionResult = executionResult;
      response.success = executionResult?.success !== false;
      response.memoryContext = memoryContext;

      if (this.memoryEnabled) {
        try {
          response.memoryResult = await UnifiedMemoryManager.saveAndCleanMemory(agentName, {
            taskId,
            observation: executionResult?.observation,
            decision: executionResult?.decision,
            reasoning: executionResult?.reasoning,
            keyFact: executionResult?.keyFact,
            significantFinding: executionResult?.significantFinding,
            qaFeedback: executionResult?.qaFeedback,
            blocker: executionResult?.blocker,
            taskCompleted: response.success,
            context: {
              ...context,
              executionTime: Date.now() - start
            }
          });
        } catch (error) {
          response.memoryResult = { success: false, error: error.message };
          response.success = false;
          response.error = error.message;
        }
      }

    } catch (error) {
      response.success = false;
      response.error = error.message;
      if (this.memoryEnabled) {
        try {
          await UnifiedMemoryManager.saveAndCleanMemory(agentName, {
            taskId,
            observation: `Task ${taskId} failed: ${error.message}`,
            taskCompleted: false,
            context: { ...context, error: error.message }
          });
        } catch (_) {
          // ignore secondary errors
        }
      }
    }

    response.duration = Math.max(Date.now() - start, 1);
    return response;
  }

  async execute(agentName, taskId, context = {}, executor) {
    if (typeof executor !== 'function') {
      throw new Error('Executor function is required');
    }

    const executionId = `${taskId}-${Date.now()}`;
    const wrappedExecutor = (execContext) => {
      const mergedContext = { ...context, ...execContext };
      return executor(taskId, mergedContext);
    };

    const result = await this.executeWithMemory(agentName, taskId, context, wrappedExecutor);
    result.taskId = executionId;
    return result;
  }

  async executeStructuredTask(agentName, taskDefinition, context = {}, stepExecutor) {
    const steps = Array.isArray(taskDefinition?.steps) ? taskDefinition.steps : [];
    const stepContext = { ...context, agentName };
    const stepResults = [];
    let fatalFailure = false;
    let fatalError = null;

    for (const step of steps) {
      try {
        const result = await stepExecutor(step, { ...stepContext });
        stepContext[`step_${step.id}_result`] = result;
        const success = result?.success !== false;
        stepResults.push({ stepId: step.id, success, data: result });

        if (!success && step.required !== false) {
          fatalFailure = true;
          fatalError = `Required step failed: ${step.name}`;
          break;
        }
      } catch (error) {
        stepResults.push({ stepId: step.id, success: false, error: error.message });
        if (step.required !== false) {
          fatalFailure = true;
          fatalError = `Required step failed: ${step.name}`;
          break;
        }
      }
    }

    if (fatalFailure) {
      return {
        success: false,
        agentName,
        taskId: taskDefinition?.id || 'structured-task',
        error: fatalError,
        executionResult: null,
        stepResults
      };
    }

    const allSuccessful = stepResults.every(result => result.success);
    return {
      success: allSuccessful,
      agentName,
      taskId: taskDefinition?.id || 'structured-task',
      executionResult: { stepResults },
      stepResults
    };
  }

  async batchExecute(tasks = []) {
    const results = [];

    for (const task of tasks) {
      const { agentName, taskId, context = {}, executor } = task;
      const result = await this.executeWithMemory(agentName, taskId, context, async (execContext) => {
        const mergedContext = { ...context, ...execContext };
        return executor(mergedContext);
      });
      results.push(result);
    }

    return results;
  }
}

module.exports = AgentRunner;
