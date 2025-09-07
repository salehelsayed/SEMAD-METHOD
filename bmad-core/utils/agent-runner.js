/**
 * Agent Runner - Simplified version using only simple-task-tracker and track-progress
 * Orchestrates agent invocations with basic tracking
 */

const TaskTracker = require('./simple-task-tracker');
const VerboseLogger = require('./verbose-logger');
const { withTimeout } = require('./timeout-wrapper');
const fs = require('fs');
const path = require('path');

class AgentRunner {
  constructor(options = {}) {
    this.logger = new VerboseLogger(options.loggerConfig || {});
    this.memoryEnabled = options.memoryEnabled !== false;
    this.tracker = new TaskTracker();
    // Removed health monitoring - no longer needed
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

      // Here you would normally execute the actual agent command
      // For now, we'll just simulate it
      const commandResult = {
        success: true,
        output: `Command ${command} executed successfully`,
        agent: agentName
      };

      result.result = commandResult;
      result.success = true;

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
      result.error = error;
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

  /**
   * Get agent memory status (simplified)
   */
  async getAgentMemoryStatus(agentName) {
    if (!this.memoryEnabled) {
      return {
        available: false,
        reason: 'Memory disabled'
      };
    }
    
    return await this.getMemoryStatus(agentName);
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
}

module.exports = AgentRunner;
