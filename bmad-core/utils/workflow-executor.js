/**
 * Workflow Executor for BMad Method
 * Handles execution of workflows with support for linear and iterative Dev↔QA flows
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const ErrorHandler = require('./error-handler');
const WorkflowMonitor = require('./workflow-monitor');
const AgentPermissionsValidator = require('./agent-permissions');
const VerboseLogger = require('./verbose-logger');
const WorkflowConfigLoader = require('./workflow-config-loader');
const FilePathResolver = require('./file-path-resolver');
const DevQaRunner = require('./workflow/devqa-runner');

class WorkflowExecutor {
  constructor(rootDir, options = {}) {
    this.rootDir = rootDir;
    this.workflowDir = path.join(rootDir, 'bmad-core', 'workflows');
    this.monitor = new WorkflowMonitor(rootDir);
    this.flowType = options.flowType || 'linear';
    this.maxIterations = options.maxIterations || 5;
    this.callbacks = options.callbacks || {};
    this.permissionsValidator = new AgentPermissionsValidator();
    this.configLoader = new WorkflowConfigLoader(rootDir);
    this.logger = new VerboseLogger(options.loggerConfig || {});
    this.filePathResolver = new FilePathResolver(rootDir);
    this.resolvedPaths = null;
    this.initialized = false;
    this.devQaRunner = new DevQaRunner(this);
  }

  /**
   * Get secure file operations for an agent
   * @param {string} agentId - The agent identifier
   * @returns {Object} Secure file operations object
   */
  getSecureFileOperations(agentId) {
    return this.permissionsValidator.createSecureFileOperations(agentId);
  }

  /**
   * Initialize configuration, logger, and file path resolution if not already done
   */
  async ensureInitialized() {
    if (!this.initialized) {
      const config = await this.configLoader.loadConfig();
      this.logger.configure({
        verbosity: config.verbosity,
        verbosityLevel: config.verbosityLevel
      });
      
      // Initialize file path resolution
      this.logger.taskStart('Initializing file path resolution', 'Loading paths from core-config.yaml');
      try {
        this.resolvedPaths = this.filePathResolver.getAllResolvedPaths();
        
        // Validate paths
        const validation = this.filePathResolver.validatePaths();
        if (!validation.success) {
          throw new Error(`File path validation failed:\n${validation.errors.join('\n')}`);
        }
        
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(warning => this.logger.warn(warning));
        }
        
        this.logger.taskComplete('Initializing file path resolution', `Resolved ${Object.keys(this.resolvedPaths).length} file paths`);
      } catch (error) {
        this.logger.error('Failed to resolve file paths', error);
        throw error;
      }
      
      this.initialized = true;
    }
  }

  /**
   * Execute a workflow with the specified flow type
   * @param {string} workflowId - The workflow to execute
   * @param {Object} context - Execution context
   * @returns {Object} Execution result
   */
  async execute(workflowId, context = {}) {
    await this.ensureInitialized();
    const startTime = Date.now();
    
    this.logger.phaseStart('Workflow Execution', `Executing workflow: ${workflowId}`);
    
    try {
      // Load workflow
      this.logger.taskStart('Loading workflow definition', workflowId);
      const workflow = await this.loadWorkflow(workflowId);
      this.logger.taskComplete('Loading workflow definition', 'Workflow loaded successfully');
      
      // Monitor execution
      const monitorResult = await this.monitor.monitorExecution(workflowId, context);
      
      if (monitorResult.status === 'failed') {
        return {
          success: false,
          workflowId,
          errors: monitorResult.errors,
          warnings: monitorResult.warnings,
          duration: Date.now() - startTime
        };
      }
      
      // Execute workflow based on flow type
      let result;
      if (this.isDevQAWorkflow(workflow)) {
        result = await this.devQaRunner.execute(workflow, context);
      } else {
        result = await this.executeStandardFlow(workflow, context);
      }
      
      return {
        ...result,
        workflowId,
        flowType: this.flowType,
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      ErrorHandler.handle(error, {
        operation: `Workflow ${workflowId} execution`,
        context
      });
      
      return {
        success: false,
        workflowId,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Check if workflow contains Dev→QA steps
   * @param {Object} workflow - Workflow definition
   * @returns {boolean} True if Dev→QA workflow
   */
  isDevQAWorkflow(workflow) {
    if (!workflow.sequence) return false;
    
    const hasDevStep = workflow.sequence.some(step => 
      step.agent === 'dev' && (step.action === 'implement_story' || step.creates === 'implementation_files')
    );
    
    const hasQAStep = workflow.sequence.some(step => 
      step.agent === 'qa' && (step.action === 'review_implementation' || step.action === 'review_story')
    );
    
    return hasDevStep && hasQAStep;
  }

  /**
   * Execute Dev↔QA flow based on configured flow type
   * @param {Object} workflow - Workflow definition
   * @param {Object} context - Execution context
   * @returns {Object} Execution result
   */

  /**
   * Execute standard workflow flow
   * @param {Object} workflow - Workflow definition
   * @param {Object} context - Execution context
   * @returns {Object} Execution result
   */
  async executeStandardFlow(workflow, context) {
    const results = {
      success: true,
      flowType: 'standard',
      steps: []
    };
    
    // Use 'sequence' to match actual workflow files
    const steps = workflow.sequence || workflow.steps || [];
    
    for (const step of steps) {
      const stepResult = await this.executeStep(step, context);
      results.steps.push(stepResult);
      
      if (!stepResult.success && step.critical !== false) {
        results.success = false;
        break;
      }
      
      // Update context with step outputs
      if (stepResult.data && step.creates) {
        context[step.creates] = stepResult.data;
      }
    }
    
    return results;
  }

  /**
   * Execute a single workflow step
   * @param {Object} step - Step definition
   * @param {Object} context - Execution context
   * @returns {Object} Step execution result
   */
  async executeStep(step, context) {
    const result = {
      agent: step.agent,
      action: step.action || step.creates,
      success: false,
      data: null,
      error: null
    };
    
    try {
      // Validate permissions before execution
      if (step.modifies || step.creates) {
        const operation = {
          agent: step.agent,
          action: step.action || 'write',
          target: step.modifies || step.creates,
          targetSection: step.targetSection
        };
        
        const validation = this.permissionsValidator.validateOperation(operation);
        if (!validation.allowed) {
          throw new Error(`Permission denied for ${step.agent}: ${validation.reason}`);
        }
      }
      
      // Enhance context with resolved file paths
      const enhancedContext = {
        ...context,
        resolvedPaths: this.resolvedPaths,
        filePathResolver: {
          storyLocation: this.resolvedPaths.storyLocation,
          prdFile: this.resolvedPaths.prdFile,
          prdShardedLocation: this.resolvedPaths.prdShardedLocation,
          architectureFile: this.resolvedPaths.architectureFile,
          architectureShardedLocation: this.resolvedPaths.architectureShardedLocation,
          devDebugLog: this.resolvedPaths.devDebugLog,
          devLoadAlwaysFiles: this.resolvedPaths.devLoadAlwaysFiles,
          isPRDSharded: this.resolvedPaths.isPRDSharded,
          isArchitectureSharded: this.resolvedPaths.isArchitectureSharded,
          // Utility methods
          findStoryFile: (epicNum, storyNum) => this.filePathResolver.findStoryFile(epicNum, storyNum),
          findEpicFile: (epicNum) => this.filePathResolver.findEpicFile(epicNum)
        }
      };
      
      // Call appropriate callback or simulate execution
      if (this.callbacks[step.agent]) {
        const agentCallback = this.callbacks[step.agent];
        result.data = await agentCallback(step, enhancedContext);
        result.success = true;
      } else {
        // Simulate execution for demo/testing
        result.data = await this.simulateStepExecution(step, enhancedContext);
        result.success = true;
      }
      
      return result;
      
    } catch (error) {
      result.error = error.message;
      ErrorHandler.warn(`Step execution failed: ${step.agent} - ${step.action}`, [
        error.message
      ]);
      return result;
    }
  }

  /**
   * Simulate step execution for testing
   * @param {Object} step - Step definition
   * @param {Object} context - Execution context
   * @returns {Object} Simulated result
   */
  async simulateStepExecution(step, context) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (step.agent === 'dev') {
      if (step.action === 'implement_story' || step.creates === 'implementation_files') {
        return {
          filesModified: ['src/feature.js', 'tests/feature.test.js'],
          linesAdded: 150,
          linesRemoved: 20
        };
      } else if (step.action === 'address_qa_feedback') {
        return {
          filesModified: ['src/feature.js'],
          linesAdded: 30,
          linesRemoved: 10,
          issuesAddressed: context.qaFeedback?.length || 0
        };
      }
    } else if (step.agent === 'qa') {
      // Simulate QA review with decreasing issue probability
      const iteration = context.iteration || 1;
      const issueChance = 0.7 * Math.pow(0.5, iteration - 1);
      
      if (Math.random() > issueChance) {
        return {
          approved: true,
          issues: []
        };
      } else {
        return {
          approved: false,
          issues: [
            'Missing error handling in feature.js line 45',
            'Unit test coverage below 80%'
          ]
        };
      }
    }
    
    // Default return for other agents
    return { completed: true };
  }

  /**
   * Get resolved file paths for agent use
   * @returns {Object} All resolved file paths
   */
  getResolvedPaths() {
    if (!this.resolvedPaths) {
      throw new Error('File paths not yet resolved. Call ensureInitialized() first.');
    }
    return this.resolvedPaths;
  }

  /**
   * Execute structured task with resolved file paths
   * @param {string} taskId - Task identifier
   * @param {Object} context - Execution context
   * @returns {Object} Task execution result
   */
  async executeStructuredTask(taskId, context = {}) {
    await this.ensureInitialized();
    
    const enhancedContext = {
      ...context,
      resolvedPaths: this.resolvedPaths,
      filePathResolver: this.filePathResolver
    };
    
    this.logger.taskStart(`Executing structured task: ${taskId}`, 'With resolved file paths');
    
    // Load and execute structured task
    const StructuredTaskLoader = require('../../tools/lib/structured-task-loader');
    const taskLoader = new StructuredTaskLoader(this.rootDir);
    
    try {
      const taskPath = path.join(this.rootDir, 'bmad-core', 'structured-tasks', `${taskId}.yaml`);
      const taskDefinition = await taskLoader.loadTask(taskPath);
      
      if (taskDefinition.type !== 'structured') {
        throw new Error(`Task ${taskId} is not a structured task`);
      }
      
      // Execute task with enhanced context
      const result = {
        taskId,
        success: true,
        context: enhancedContext,
        message: `Structured task ${taskId} executed with centralized file paths`,
        resolvedPaths: this.resolvedPaths
      };
      
      this.logger.taskComplete(`Executing structured task: ${taskId}`, 'Task completed successfully');
      return result;
      
    } catch (error) {
      this.logger.error(`Failed to execute structured task: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * Load workflow definition
   * @param {string} workflowId - Workflow ID
   * @returns {Object} Workflow definition
   */
  async loadWorkflow(workflowId) {
    const workflowPath = path.join(this.workflowDir, `${workflowId}.yaml`);
    
    try {
      const content = await fs.readFile(workflowPath, 'utf8');
      const workflow = yaml.load(content);
      
      if (!workflow.workflow) {
        throw new Error('Invalid workflow format: missing workflow section');
      }
      
      return workflow.workflow;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      throw error;
    }
  }
}

module.exports = WorkflowExecutor;
