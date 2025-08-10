/**
 * Agent Runner - Orchestrates agent invocations with unified memory management
 * Handles memory loading/saving around agent task execution
 * Includes memory health monitoring and startup verification
 */

// Simple stubs for memory functions - replaced with file-based tracking
const loadMemoryForTask = async () => ({ observations: [], decisions: [], facts: [] });
const saveAndCleanMemory = async () => ({ saved: true });
const getMemoryStatus = async () => ({ healthy: true });

// File adapter for simple tracking
const fileMemoryAdapter = require('./memory/adapters/file');

// Health check stubs
const performHealthCheck = async () => ({ healthy: true });
const getCurrentHealthStatus = () => ({ healthy: true });
const startPeriodicMonitoring = () => {};
const SEVERITY = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

const VerboseLogger = require('./verbose-logger');
const { withTimeout } = require('./timeout-wrapper');
const { applyUnifiedDiff, parsePatch } = require('./patcher');
const { assertPathsExist, assertModulesResolvable, assertNoDangerousOps } = require('./guardrails/grounding-checks');
const { validate: validateSchema } = require('./validators/schema-validator');
const { logValidationFailure } = require('./validation-enforcer');

class AgentRunner {
  constructor(options = {}) {
    this.logger = new VerboseLogger(options.loggerConfig || {});
    this.memoryEnabled = options.memoryEnabled !== false;
    this.healthMonitoringEnabled = options.healthMonitoringEnabled !== false;
    this.periodicHealthChecks = new Map(); // Track periodic monitoring for agents
    this.startupHealthChecks = new Map(); // Cache startup health checks
  }

  /**
   * Configure logger settings
   */
  configureLogger(config) {
    this.logger.configure(config);
  }

  /**
   * Perform startup memory health check for an agent
   * @param {string} agentName - Name of the agent
   * @param {Object} options - Health check options
   * @returns {Object} Health check result with warnings/errors
   */
  async performStartupHealthCheck(agentName, options = {}) {
    if (!this.healthMonitoringEnabled) {
      return { healthy: true, message: 'Health monitoring disabled' };
    }

    // Check if we already performed startup check for this agent
    const cacheKey = `${agentName}`;
    if (this.startupHealthChecks.has(cacheKey)) {
      const cached = this.startupHealthChecks.get(cacheKey);
      // Use cached result if recent (within 5 minutes)
      if (Date.now() - cached.timestamp < 300000) {
        return cached.result;
      }
    }

    this.logger.taskStart('Memory health check', `Verifying memory systems for ${agentName}`, 'minimal');

    try {
      const healthResult = await performHealthCheck(agentName, {
        skipOperations: options.skipOperations !== false, // Skip operations by default for startup
        ...options
      });

      const result = {
        healthy: healthResult.overallStatus === 'healthy',
        status: healthResult.overallStatus,
        warnings: [],
        errors: [],
        recommendations: healthResult.recommendations || [],
        details: healthResult.summary,
        timestamp: Date.now()
      };

      // Process health check results into user-friendly messages
      Object.entries(healthResult.checks || {}).forEach(([checkName, checkResult]) => {
        if (checkResult.severity === SEVERITY.ERROR || checkResult.severity === SEVERITY.CRITICAL) {
          result.errors.push({
            component: checkResult.component || checkName,
            message: checkResult.message,
            severity: checkResult.severity
          });
        } else if (checkResult.severity === SEVERITY.WARNING) {
          result.warnings.push({
            component: checkResult.component || checkName,
            message: checkResult.message,
            severity: checkResult.severity
          });
        }
      });

      // Cache the result
      this.startupHealthChecks.set(cacheKey, { result, timestamp: Date.now() });

      // Log appropriate level based on health status
      if (result.healthy) {
        this.logger.taskComplete('Memory health check', `All memory systems healthy for ${agentName}`, 'minimal');
      } else if (result.status === 'degraded') {
        this.logger.warning(`Memory health degraded for ${agentName}: ${result.warnings.length} warnings`);
      } else {
        this.logger.error(`Memory health unhealthy for ${agentName}: ${result.errors.length} errors`);
      }

      return result;

    } catch (error) {
      const errorResult = {
        healthy: false,
        status: 'unhealthy',
        warnings: [],
        errors: [{ 
          component: 'health_check_system', 
          message: `Health check failed: ${error.message}`,
          severity: SEVERITY.ERROR
        }],
        recommendations: [`Fix health check error: ${error.message}`],
        details: { total: 0, healthy: 0, degraded: 0, unhealthy: 1 },
        timestamp: Date.now()
      };

      this.logger.error(`Memory health check failed for ${agentName}`, error);
      return errorResult;
    }
  }

  /**
   * Start periodic health monitoring for an agent
   * @param {string} agentName - Name of the agent
   * @param {number} intervalMs - Check interval in milliseconds
   * @returns {Function} Stop monitoring function
   */
  startPeriodicHealthMonitoring(agentName, intervalMs = 30000) {
    if (!this.healthMonitoringEnabled) {
      return () => {}; // Return no-op function
    }

    // Stop existing monitoring if any
    this.stopPeriodicHealthMonitoring(agentName);

    this.logger.taskStart('Starting periodic health monitoring', `Agent: ${agentName}, Interval: ${intervalMs}ms`, 'detailed');

    const stopMonitoring = startPeriodicMonitoring(agentName, intervalMs, {
      skipOperations: true // Skip expensive operations for periodic checks
    });

    this.periodicHealthChecks.set(agentName, stopMonitoring);

    this.logger.taskComplete('Periodic health monitoring started', `Agent: ${agentName}`, 'detailed');

    return stopMonitoring;
  }

  /**
   * Stop periodic health monitoring for an agent
   * @param {string} agentName - Name of the agent
   */
  stopPeriodicHealthMonitoring(agentName) {
    const existingMonitoring = this.periodicHealthChecks.get(agentName);
    if (existingMonitoring) {
      existingMonitoring();
      this.periodicHealthChecks.delete(agentName);
      this.logger.taskComplete('Stopped periodic health monitoring', `Agent: ${agentName}`, 'detailed');
    }
  }

  /**
   * Get current memory health status for an agent
   * @param {string} agentName - Name of the agent
   * @returns {Object|null} Current health status or null if not available
   */
  getCurrentMemoryHealth(agentName) {
    if (!this.healthMonitoringEnabled) {
      return { available: false, message: 'Health monitoring disabled' };
    }

    const healthStatus = getCurrentHealthStatus(agentName);
    return healthStatus ? {
      available: true,
      ...healthStatus
    } : {
      available: false,
      message: 'No health data available yet'
    };
  }

  /**
   * Surface memory health issues to user
   * @param {string} agentName - Name of the agent
   * @param {Object} healthResult - Health check result
   */
  surfaceMemoryHealthIssues(agentName, healthResult) {
    if (!healthResult || healthResult.healthy) {
      return; // No issues to surface
    }

    const issues = [...(healthResult.errors || []), ...(healthResult.warnings || [])];
    
    if (issues.length === 0) {
      return; // No specific issues to surface
    }

    console.log(`\n⚠️  Memory Health Issues for Agent '${agentName}':`);
    
    // Group by severity
    const criticalIssues = issues.filter(i => i.severity === SEVERITY.CRITICAL);
    const errorIssues = issues.filter(i => i.severity === SEVERITY.ERROR);
    const warningIssues = issues.filter(i => i.severity === SEVERITY.WARNING);

    if (criticalIssues.length > 0) {
      console.log(`\n🚨 CRITICAL (${criticalIssues.length}):`);
      criticalIssues.forEach(issue => {
        console.log(`   • ${issue.message}`);
      });
    }

    if (errorIssues.length > 0) {
      console.log(`\n❌ ERRORS (${errorIssues.length}):`);
      errorIssues.forEach(issue => {
        console.log(`   • ${issue.message}`);
      });
    }

    if (warningIssues.length > 0) {
      console.log(`\n⚠️  WARNINGS (${warningIssues.length}):`);
      warningIssues.forEach(issue => {
        console.log(`   • ${issue.message}`);
      });
    }

    if (healthResult.recommendations && healthResult.recommendations.length > 0) {
      console.log(`\n💡 RECOMMENDATIONS:`);
      healthResult.recommendations.forEach(rec => {
        console.log(`   • ${rec}`);
      });
    }

    console.log(`\nMemory System Status: ${healthResult.status.toUpperCase()}\n`);
  }

  /**
   * Execute an agent task with full memory lifecycle management
   * @param {string} agentName - Name of the agent (sm, dev, qa, etc.)
   * @param {string} taskId - Task identifier
   * @param {Object} context - Task execution context
   * @param {Function} taskExecutor - Function that executes the actual task
   * @returns {Object} Task execution result with memory information
   */
  async executeWithMemory(agentName, taskId, context = {}, taskExecutor) {
    const startTime = Date.now();
    
    // Extract timeout configuration from context
    const {
      executionTimeout = 300000, // 5 minutes default
      memoryTimeout = 30000,     // 30 seconds for memory operations
      healthCheckTimeout = 15000  // 15 seconds for health checks
    } = context.timeouts || {};
    
    this.logger.taskStart(`Agent ${agentName} execution`, `Task: ${taskId}`, 'detailed');
    
    let memoryContext = null;
    let executionResult = null;
    let memoryResult = null;
    let healthCheckResult = null;
    let retriedForSchema = false;
    let retriedForPatch = false;
    
    try {
      // Perform migration at agent startup; fail fast if it encounters critical errors
      try { await fileMemoryAdapter.migrateFromOldSystem(); } catch (e) {
        this.logger.error('Memory migration failed at agent startup', e);
        throw e;
      }
      // Phase 0: Perform startup memory health check with timeout
      const performHealthCheckWithTimeout = withTimeout(
        this.performStartupHealthCheck.bind(this),
        healthCheckTimeout,
        'Health check'
      );
      
      healthCheckResult = await performHealthCheckWithTimeout(agentName, {
        skipOperations: context.skipHealthOperations !== false
      });
      
      // Surface health issues to user if any
      if (!healthCheckResult.healthy) {
        this.surfaceMemoryHealthIssues(agentName, healthCheckResult);
      }
      
      // Start periodic monitoring if not already started (for major tasks)
      if (context.enablePeriodicHealthChecks !== false && !this.periodicHealthChecks.has(agentName)) {
        this.startPeriodicHealthMonitoring(agentName);
      }
      
      // Phase 1: Load memory if enabled
      if (this.memoryEnabled) {
        this.logger.taskStart('Loading agent memory', `Loading context for ${agentName}`, 'minimal');
        
        const loadMemoryWithTimeout = withTimeout(
          loadMemoryForTask,
          memoryTimeout,
          'Memory loading'
        );
        
        memoryContext = await loadMemoryWithTimeout(agentName, {
          taskId,
          storyId: context.storyId,
          epicId: context.epicId,
          taskType: context.taskType
        });
        
        if (memoryContext.error) {
          this.logger.warning(`Memory loading failed: ${memoryContext.error}`);
        } else {
          this.logger.taskComplete('Memory loaded successfully', {
            shortTermObservations: memoryContext.shortTerm?.observations?.length || 0,
            longTermMemories: memoryContext.longTerm?.length || 0
          }, 'minimal');
        }
      }
      
      // Phase 2: Execute the actual task with memory context
      this.logger.taskStart('Executing agent task', `Running ${taskId}`, 'detailed');
      
      const enrichedContext = {
        ...context,
        memory: memoryContext,
        agentName,
        taskId
      };
      
      // Execute task with timeout
      const executeTaskWithTimeout = withTimeout(
        taskExecutor,
        executionTimeout,
        `Agent ${agentName} task execution`
      );
      
      executionResult = await executeTaskWithTimeout(enrichedContext);

      // Optional: validate agent output against schema to reduce hallucinations
      if (context.outputSchemaId) {
        const parsedResult = this._coerceToJSONObject(executionResult);
        const validation = validateSchema(context.outputSchemaId, parsedResult);
        if (!validation.valid) {
          // Log for audit trail
          try {
            await logValidationFailure('AgentOutput', `${agentName}:${taskId}`, validation.errors.map(m => ({ message: m })));
          } catch (_) {}

          // Optionally retry with feedback
          const retries = (context.validationOptions && context.validationOptions.retries) || 0;
          if (retries > 0 && typeof taskExecutor === 'function') {
            this.logger.warning(`Output validation failed for ${agentName}:${taskId}. Retrying (${retries}) with feedback.`);
            const feedbackContext = {
              ...enrichedContext,
              validationFeedback: {
                schemaId: context.outputSchemaId,
                errors: validation.errors
              },
              // Decrement retries for any further nested calls
              validationOptions: { ...(context.validationOptions || {}), retries: retries - 1 }
            };
            executionResult = await executeTaskWithTimeout(feedbackContext);
            retriedForSchema = true;

            // Re-validate once
            const reParsed = this._coerceToJSONObject(executionResult);
            const recheck = validateSchema(context.outputSchemaId, reParsed);
            if (!recheck.valid) {
              throw new Error(`Output still invalid after retry: ${recheck.errors.join('; ')}`);
            }
          } else {
            throw new Error(`Output validation failed: ${validation.errors.join('; ')}`);
          }
        }
      }

      // Optional: run grounding checks and patch flow if patch is provided
      const patchCarrier = (executionResult && (executionResult.patch || executionResult.data?.patch)) ?
        (typeof executionResult.patch === 'string' ? executionResult : executionResult.data) : null;

      if (patchCarrier && typeof patchCarrier.patch === 'string') {
        this.logger.taskStart('Validating patch (dry-run)', `Agent: ${agentName}`, 'detailed');
        const patchText = patchCarrier.patch;

        // Guardrails: optional modules/commands assertions if provided
        if (Array.isArray(patchCarrier.modules)) {
          assertModulesResolvable(patchCarrier.modules);
        }
        if (Array.isArray(patchCarrier.commands)) {
          assertNoDangerousOps(patchCarrier.commands);
        }

        // Guardrails: paths in update/delete must exist before applying
        try {
          const ops = parsePatch(patchText);
          const mustExist = ops
            .filter(op => op.type === 'update' || op.type === 'delete')
            .map(op => op.file);
          if (mustExist.length) assertPathsExist(mustExist);
        } catch (e) {
          // If path assertion fails, provide feedback/retry or throw
          const retries = (context.validationOptions && context.validationOptions.retries) || 0;
          if (retries > 0 && typeof taskExecutor === 'function') {
            const feedbackContext = {
              ...enrichedContext,
              validationFeedback: {
                ...(enrichedContext.validationFeedback || {}),
                patchErrors: [e.message]
              },
              validationOptions: { ...(context.validationOptions || {}), retries: retries - 1 }
            };
            executionResult = await executeTaskWithTimeout(feedbackContext);
            retriedForPatch = true;
          } else {
            throw new Error(`Patch grounding failed: ${e.message}`);
          }
        }

        const dry = await applyUnifiedDiff(patchText, { dryRun: true, baseDir: process.cwd() });
        if (!dry.success) {
          const msg = `Patch dry-run failed: ${dry.errors.join('; ')}`;
          const retries = (context.validationOptions && context.validationOptions.retries) || 0;
          if (retries > 0 && typeof taskExecutor === 'function') {
            this.logger.warning(msg);
            const feedbackContext = {
              ...enrichedContext,
              validationFeedback: {
                ...(enrichedContext.validationFeedback || {}),
                patchErrors: dry.errors
              },
              validationOptions: { ...(context.validationOptions || {}), retries: retries - 1 }
            };
            executionResult = await executeTaskWithTimeout(feedbackContext);
            retriedForPatch = true;

            // Re-evaluate patch after retry if provided again
            const retryCarrier = (executionResult && (executionResult.patch || executionResult.data?.patch)) ?
              (typeof executionResult.patch === 'string' ? executionResult : executionResult.data) : null;
            if (!retryCarrier || typeof retryCarrier.patch !== 'string') {
              throw new Error('Agent retry did not return a patch.');
            }
            const dry2 = await applyUnifiedDiff(retryCarrier.patch, { dryRun: true, baseDir: process.cwd() });
            if (!dry2.success) {
              throw new Error(`Patch still invalid after retry: ${dry2.errors.join('; ')}`);
            }
            await applyUnifiedDiff(retryCarrier.patch, { dryRun: false, baseDir: process.cwd() });
            this.logger.taskComplete('Patch applied', `Agent: ${agentName}`, 'detailed');
          } else {
            throw new Error(msg);
          }
        } else {
          // Apply for real
          await applyUnifiedDiff(patchText, { dryRun: false, baseDir: process.cwd() });
          this.logger.taskComplete('Patch applied', `Agent: ${agentName}`, 'detailed');
        }
      }
      
      // Evidence tags + confidence scoring
      const evidence = this._checkEvidence(executionResult);
      const confidence = this._computeConfidence({ retriedForSchema, retriedForPatch, evidenceValid: evidence.valid });
      executionResult.confidence = confidence.score;
      executionResult.confidenceLevel = confidence.level;
      
      this.logger.taskComplete('Task execution completed', {
        success: executionResult.success,
        duration: Date.now() - startTime
      }, 'detailed');
      
      // Phase 3: Save memory and perform cleanup if enabled
      if (this.memoryEnabled) {
        this.logger.taskStart('Saving agent memory', `Updating memory for ${agentName}`, 'minimal');
        
        const taskData = {
          observation: executionResult.observation || `Completed ${taskId}`,
          decision: executionResult.decision,
          reasoning: executionResult.reasoning,
          keyFact: executionResult.keyFact,
          significantFinding: executionResult.significantFinding,
          taskCompleted: executionResult.success,
          taskId,
          context: {
            storyId: context.storyId,
            epicId: context.epicId,
            taskType: context.taskType,
            executionTime: Date.now() - startTime
          }
        };
        
        const saveMemoryWithTimeout = withTimeout(
          saveAndCleanMemory,
          memoryTimeout,
          'Memory saving'
        );
        
        memoryResult = await saveMemoryWithTimeout(agentName, taskData);
        
        if (memoryResult.success) {
          this.logger.taskComplete('Memory saved successfully', {
            operations: memoryResult.operations.length,
            warnings: memoryResult.warnings.length
          }, 'minimal');
        } else {
          this.logger.warning(`Memory save failed: ${memoryResult.error}`);
        }
      }
      
      return {
        success: true,
        executionResult,
        memoryContext,
        memoryResult,
        healthCheckResult,
        duration: Date.now() - startTime,
        agentName,
        taskId
      };
      
    } catch (error) {
      const isTimeout = error.name === 'TimeoutError';
      
      this.logger.error(`Agent execution failed for ${agentName}:${taskId}`, error);
      
      // Try to save error information to memory if possible
      if (this.memoryEnabled) {
        try {
          // Use quick timeout for error saving
          const saveErrorWithTimeout = withTimeout(
            saveAndCleanMemory,
            5000, // 5 second timeout for error save
            'Error memory save'
          );
          
          await saveErrorWithTimeout(agentName, {
            observation: `Task ${taskId} failed: ${error.message}`,
            taskCompleted: false,
            taskId,
            context: {
              error: error.message,
              errorType: error.name,
              isTimeout,
              taskType: context.taskType,
              errorTimestamp: new Date().toISOString()
            }
          });
        } catch (memoryError) {
          this.logger.warning(`Could not save error to memory: ${memoryError.message}`);
        }
      }
      
      // Return standardized error response
      const errorResponse = {
        success: false,
        error: error.message,
        errorType: error.name || 'UnknownError',
        isTimeout,
        executionResult: null,
        memoryContext,
        memoryResult: null,
        healthCheckResult,
        duration: Date.now() - startTime,
        agentName,
        taskId
      };
      
      // For timeout errors, add additional context
      if (isTimeout) {
        errorResponse.timeoutDetails = {
          operation: error.operationName,
          timeoutMs: error.timeoutMs,
          suggestion: 'Consider increasing timeout or optimizing the operation'
        };
      }
      
      // Re-throw for proper error propagation in some contexts
      if (context.throwOnError) {
        throw new Error(`Agent execution failed: ${error.message}`);
      }
      
      return errorResponse;
    }
  }

  _coerceToJSONObject(result) {
    if (result == null) return {};
    if (typeof result === 'object') return result;
    if (typeof result === 'string') {
      // Attempt to extract fenced JSON
      const fence = result.match(/```json\s*([\s\S]*?)\s*```/i);
      const raw = fence ? fence[1] : result;
      try { return JSON.parse(raw); } catch (_) { return { raw }; }
    }
    return { value: result };
  }

  _checkEvidence(result) {
    try {
      const data = typeof result === 'object' ? result : {};
      const listFrom = (arr) => arr.map(f => (typeof f === 'string' ? f : f?.path)).filter(Boolean);
      const files = (data.evidence && Array.isArray(data.evidence.files) && data.evidence.files)
        || (Array.isArray(data.files) && listFrom(data.files))
        || (Array.isArray(data.data?.files) && listFrom(data.data.files))
        || [];
      if (files.length === 0) return { valid: true };
      const { assertPathsExist } = require('./guardrails/grounding-checks');
      assertPathsExist(files);
      return { valid: true };
    } catch (e) {
      this.logger.warning(`Evidence check failed: ${e.message}`);
      return { valid: false, error: e.message };
    }
  }

  _computeConfidence({ retriedForSchema = false, retriedForPatch = false, evidenceValid = true }) {
    let score = 0.7;
    if (!retriedForSchema) score += 0.15; else score -= 0.1;
    if (!retriedForPatch) score += 0.1; else score -= 0.1;
    if (evidenceValid) score += 0.05; else score -= 0.2;
    if (score > 1) score = 1;
    if (score < 0) score = 0;
    const level = score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low';
    return { score, level };
  }

  /**
   * Execute a simple agent task without full memory lifecycle (for backwards compatibility)
   * @param {string} agentName - Name of the agent
   * @param {string} action - Action to perform
   * @param {Object} context - Execution context
   * @param {Function} executor - Task executor function
   * @returns {Object} Execution result
   */
  async execute(agentName, action, context = {}, executor) {
    const taskId = `${action}-${Date.now()}`;
    
    const simpleExecutor = async (enrichedContext) => {
      const result = await executor(action, enrichedContext);
      return {
        success: true,
        ...result
      };
    };
    
    return this.executeWithMemory(agentName, taskId, context, simpleExecutor);
  }

  /**
   * Get memory status for an agent
   * @param {string} agentName - Name of the agent
   * @returns {Object} Memory status
   */
  async getAgentMemoryStatus(agentName) {
    if (!this.memoryEnabled) {
      return { enabled: false, message: 'Memory system disabled' };
    }
    
    return await getMemoryStatus(agentName);
  }

  /**
   * Batch execute multiple agent tasks with memory management and proper error handling
   * @param {Array} tasks - Array of task definitions
   * @returns {Array} Array of execution results
   */
  async batchExecute(tasks) {
    const results = [];
    let memoryManagerConfig = null;
    
    // Simple config stub - no longer loading from memory manager
    memoryManagerConfig = { delays: { batchTaskDelay: 500 } };
    
    const batchDelay = memoryManagerConfig?.delays?.batchTaskDelay || 500;
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const { agentName, taskId, context, executor } = task;
      
      try {
        this.logger.taskStart(`Batch task ${i + 1}/${tasks.length}`, `${agentName}:${taskId}`, 'minimal');
        
        const result = await this.executeWithMemory(agentName, taskId, context, executor);
        results.push({
          taskIndex: i,
          success: true,
          result
        });
        
        this.logger.taskComplete(`Batch task ${i + 1} completed`, { success: result.success }, 'minimal');
      } catch (taskError) {
        this.logger.error(`Batch task ${i + 1} failed`, taskError);
        results.push({
          taskIndex: i,
          success: false,
          error: taskError.message,
          agentName,
          taskId
        });
      }
      
      // Add configurable delay between tasks to prevent memory conflicts
      if (i < tasks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    this.logger.taskComplete('Batch execution completed', {
      total: tasks.length,
      successful: successCount,
      failed: tasks.length - successCount
    }, 'detailed');
    
    return results;
  }

  /**
   * Execute structured task with memory management
   * This is specifically for YAML-defined structured tasks
   * @param {string} agentName - Name of the agent
   * @param {Object} structuredTask - Parsed structured task definition
   * @param {Object} context - Execution context
   * @param {Function} stepExecutor - Function to execute individual steps
   * @returns {Object} Execution result
   */
  async executeStructuredTask(agentName, structuredTask, context = {}, stepExecutor) {
    const taskId = structuredTask.id;
    
    const taskExecutor = async (enrichedContext) => {
      const results = [];
      let currentContext = { ...enrichedContext };
      
      // Execute each step in the structured task
      for (const step of structuredTask.steps) {
        this.logger.taskStart(`Executing step: ${step.name}`, step.description, 'detailed');
        
        try {
          const stepResult = await stepExecutor(step, currentContext);
          results.push({
            stepId: step.id,
            stepName: step.name,
            success: true,
            result: stepResult
          });
          
          // Update context with step results
          currentContext = {
            ...currentContext,
            [`step_${step.id}_result`]: stepResult
          };
          
          this.logger.taskComplete(`Step completed: ${step.name}`, stepResult, 'detailed');
        } catch (stepError) {
          this.logger.error(`Step failed: ${step.name}`, stepError);
          
          const stepResult = {
            stepId: step.id,
            stepName: step.name,
            success: false,
            error: stepError.message,
            errorType: stepError.name || 'StepExecutionError'
          };
          
          results.push(stepResult);
          
          // Decide whether to continue or stop based on step configuration
          if (step.required !== false) {
            const requiredStepError = new Error(`Required step failed: ${step.name} - ${stepError.message}`);
            requiredStepError.stepId = step.id;
            requiredStepError.stepName = step.name;
            throw requiredStepError;
          }
        }
      }
      
      const overallSuccess = results.every(r => r.success);
      const summary = results.map(r => `${r.stepName}: ${r.success ? '✓' : '✗'}`).join(', ');
      
      return {
        success: overallSuccess,
        stepResults: results,
        observation: `Structured task ${taskId} completed. Steps: ${summary}`,
        significantFinding: overallSuccess ? 
          `Successfully completed all steps in ${taskId}` : 
          `Some steps failed in ${taskId}: ${results.filter(r => !r.success).map(r => r.stepName).join(', ')}`
      };
    };
    
    return this.executeWithMemory(agentName, taskId, context, taskExecutor);
  }
}

module.exports = AgentRunner;
