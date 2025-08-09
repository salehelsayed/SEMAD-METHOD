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
      this.config = config;
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
        result = await this.executeDevQAFlow(workflow, context);
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
  async executeDevQAFlow(workflow, context) {
    if (this.flowType === 'iterative') {
      // Prefer state machine if enabled in options or config
      const useSM = (this.useStateMachine !== false) && (this.config?.workflow?.useStateMachine !== false);
      if (useSM) {
        const DevQAStateMachine = require('./workflow/devqa-state-machine');
        const sm = new DevQAStateMachine({ maxIterations: this.maxIterations, logger: this.logger });
        return await sm.run(workflow, context, this.executeStep.bind(this));
      }
      return await this.executeIterativeDevQAFlow(workflow, context);
    } else {
      return await this.executeLinearDevQAFlow(workflow, context);
    }
  }

  /**
   * Execute linear Dev→QA flow (single pass)
   * @param {Object} workflow - Workflow definition
   * @param {Object} context - Execution context
   * @returns {Object} Execution result
   */
  async executeLinearDevQAFlow(workflow, context) {
    const results = {
      success: true,
      flowType: 'linear',
      steps: [],
      devResult: null,
      qaResult: null
    };
    
    // Find Dev and QA steps
    const devStepIndex = workflow.sequence.findIndex(step => 
      step.agent === 'dev' && (step.action === 'implement_story' || step.creates === 'implementation_files')
    );
    
    const qaStepIndex = workflow.sequence.findIndex(step => 
      step.agent === 'qa' && (step.action === 'review_implementation' || step.action === 'review_story')
    );
    
    // Execute all steps up to and including Dev
    for (let i = 0; i <= devStepIndex && i < workflow.sequence.length; i++) {
      const step = workflow.sequence[i];
      const stepResult = await this.executeStep(step, context);
      results.steps.push(stepResult);
      
      if (step.agent === 'dev') {
        results.devResult = stepResult;
      }
      
      if (!stepResult.success) {
        results.success = false;
        return results;
      }
    }
    
    // Execute QA step if present
    if (qaStepIndex > devStepIndex && qaStepIndex < workflow.sequence.length) {
      const qaStep = workflow.sequence[qaStepIndex];
      const qaResult = await this.executeStep(qaStep, {
        ...context,
        devImplementation: results.devResult
      });
      
      results.steps.push(qaResult);
      results.qaResult = qaResult;
      
      if (!qaResult.success) {
        results.success = false;
      }
    }
    
    // Execute remaining steps after QA
    for (let i = qaStepIndex + 1; i < workflow.sequence.length; i++) {
      const step = workflow.sequence[i];
      const stepResult = await this.executeStep(step, context);
      results.steps.push(stepResult);
      
      if (!stepResult.success && step.critical !== false) {
        results.success = false;
        break;
      }
    }
    
    return results;
  }

  /**
   * Execute iterative Dev↔QA flow (loop until approved)
   * @param {Object} workflow - Workflow definition
   * @param {Object} context - Execution context
   * @returns {Object} Execution result
   */
  async executeIterativeDevQAFlow(workflow, context) {
    const results = {
      success: false,
      flowType: 'iterative',
      iterations: [],
      totalIterations: 0,
      qaApproved: false
    };
    
    // Find Dev and QA steps
    const devStepIndex = workflow.sequence.findIndex(step => 
      step.agent === 'dev' && (step.action === 'implement_story' || step.creates === 'implementation_files')
    );
    
    const qaStepIndex = workflow.sequence.findIndex(step => 
      step.agent === 'qa' && (step.action === 'review_implementation' || step.action === 'review_story')
    );
    
    const devFixStepIndex = workflow.sequence.findIndex(step => 
      step.agent === 'dev' && step.action === 'address_qa_feedback'
    );
    
    // Execute steps before Dev
    const preDevSteps = [];
    for (let i = 0; i < devStepIndex && i < workflow.sequence.length; i++) {
      const step = workflow.sequence[i];
      const stepResult = await this.executeStep(step, context);
      preDevSteps.push(stepResult);
      
      if (!stepResult.success) {
        results.success = false;
        results.error = 'Failed during pre-development steps';
        return results;
      }
    }
    
    // Iterative Dev↔QA loop
    let iteration = 1;
    let qaApproved = false;
    let devResult = null;
    let qaFeedback = null;
    
    while (!qaApproved && iteration <= this.maxIterations) {
      const iterationResult = {
        iteration,
        devResult: null,
        qaResult: null
      };
      
      // Dev phase
      if (iteration === 1) {
        // Initial implementation
        const devStep = workflow.sequence[devStepIndex];
        devResult = await this.executeStep(devStep, context);
        iterationResult.devResult = devResult;
      } else {
        // Fix based on QA feedback
        const fixStep = devFixStepIndex >= 0 
          ? workflow.sequence[devFixStepIndex]
          : { agent: 'dev', action: 'address_qa_feedback' };
          
        devResult = await this.executeStep(fixStep, {
          ...context,
          qaFeedback,
          previousImplementation: devResult
        });
        iterationResult.devResult = devResult;
      }
      
      if (!devResult.success) {
        iterationResult.error = 'Dev implementation failed';
        results.iterations.push(iterationResult);
        break;
      }
      
      // QA phase
      const qaStep = workflow.sequence[qaStepIndex];
      const qaResult = await this.executeStep(qaStep, {
        ...context,
        devImplementation: devResult,
        iteration
      });
      
      iterationResult.qaResult = qaResult;
      results.iterations.push(iterationResult);
      
      if (qaResult.success && qaResult.data?.approved) {
        qaApproved = true;
        results.qaApproved = true;
        results.success = true;
      } else if (qaResult.data?.issues) {
        qaFeedback = qaResult.data.issues;
        
        // Check if we should continue
        if (iteration >= this.maxIterations) {
          if (this.callbacks.onMaxIterationsReached) {
            const shouldContinue = await this.callbacks.onMaxIterationsReached(iteration, qaFeedback);
            if (!shouldContinue) {
              break;
            }
            // Reset max iterations for next round
            this.maxIterations += 5;
          } else {
            break;
          }
        }
      }
      
      iteration++;
    }
    
    results.totalIterations = iteration - 1;
    
    // Execute post-QA steps if approved
    if (qaApproved) {
      for (let i = qaStepIndex + 1; i < workflow.sequence.length; i++) {
        const step = workflow.sequence[i];
        
        // Skip the fix step since we're already approved
        if (step.agent === 'dev' && step.action === 'address_qa_feedback') {
          continue;
        }
        
        const stepResult = await this.executeStep(step, context);
        if (!stepResult.success && step.critical !== false) {
          results.success = false;
          results.error = 'Failed during post-QA steps';
          break;
        }
      }
    }
    
    return results;
  }

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
      
      // Enhance context with resolved file paths and optional output schema
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
        },
        ...this._schemaForStep(step)
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

  _schemaForStep(step) {
    // Provide output schema hints per agent/action
    if (step.agent === 'dev' && (step.action === 'implement_story' || step.creates === 'implementation_files')) {
      return { outputSchemaId: 'agents/dev.implement_story.output', validationOptions: { retries: 1 } };
    }
    if (step.agent === 'qa' && (step.action === 'review_implementation' || step.action === 'review_story')) {
      return { outputSchemaId: 'agents/qa.review_implementation.output', validationOptions: { retries: 0 } };
    }
    if (step.agent === 'analyst' && (step.action === 'create_prd' || step.creates === 'prd')) {
      return { outputSchemaId: 'agents/analyst.prd.output', validationOptions: { retries: 0 } };
    }
    return {};
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
