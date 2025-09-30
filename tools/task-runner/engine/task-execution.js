const path = require('path');
const fs = require('fs');

const StructuredTaskLoader = require('../../lib/structured-task-loader');
const { resolveModule } = require('../utils');
const StoryContractValidator = require(resolveModule('utils/story-contract-validator', '../semad-core/utils/story-contract-validator'));
const ModuleResolver = require(resolveModule('utils/module-resolver', '../semad-core/utils/module-resolver'));
const validationHooks = require(resolveModule('utils/validation-hooks', '../semad-core/utils/validation-hooks'));

const {
  TaskError,
  ValidationError,
  TaskExecutionError,
  MemoryStateError
} = require(resolveModule('errors/task-errors', '../semad-core/errors/task-errors'));

const ExecutionContext = require('./execution-context');
const { ContextKeys, ErrorCodes } = require('./constants');

class TaskExecutionEngine {
  constructor({ rootDir, coreConfig, memoryManager, actionDispatcher, planAdapter, errorRecovery, taskConfigLoader = null }) {
    this.rootDir = rootDir;
    this.coreConfig = coreConfig;
    this.memoryManager = memoryManager;
    this.actionDispatcher = actionDispatcher;
    this.planAdapter = planAdapter;
    this.errorRecovery = errorRecovery;
    this.taskConfigLoader = taskConfigLoader;
    this.taskLoader = taskConfigLoader ? taskConfigLoader.getTaskLoader() : new StructuredTaskLoader(rootDir);
    this.storyContractValidator = null;
  }

  async executeTask(agentName, taskPath, initialContext = {}) {
    this.memoryManager.ensureTaskRecovery();
    const executionContext = new ExecutionContext({ agentName, baseContext: initialContext });
    let checkpointId = null;

    try {
      this.memoryManager.registerCleanup(async () => {
        const mem = await this.memoryManager.fetchWorkingMemory(agentName);
        if (mem && Object.prototype.hasOwnProperty.call(mem, ContextKeys.EXECUTION_STATE)) {
          const cleaned = { ...mem };
          delete cleaned[ContextKeys.EXECUTION_STATE];
          await this.memoryManager.persistWorkingMemory(agentName, cleaned);
        }
      }, 'Clear task execution state');

      const preValidation = await validationHooks.executeHooks('beforeTaskExecute', {
        taskPath,
        agentName,
        context: executionContext.getState()
      });

      if (!preValidation.valid && executionContext.get(ContextKeys.IGNORE_VALIDATION) !== true) {
        throw new ValidationError('Task pre-execution validation failed', preValidation.errors);
      }

      const taskData = this.taskConfigLoader
        ? await this.taskConfigLoader.loadTask(taskPath)
        : await this.taskLoader.loadTask(taskPath);

      let task;
      if (taskData.type === 'structured') {
        task = taskData.data;
      } else {
        task = {
          name: path.basename(taskPath, path.extname(taskPath)),
          description: taskData.raw.split('\n')[0],
          steps: this.extractStepsFromMarkdown(taskData.raw)
        };
      }

      executionContext.setTask(task);

      const contextState = executionContext.getState();
      const elicitValidation = this.actionDispatcher.validateElicitRequirements(task, contextState);
      const allowMissing = executionContext.get(ContextKeys.ALLOW_MISSING_USER_INPUT) === true;
      const explicitOverride = allowMissing || executionContext.get('agentPolicy') === 'override';

      if (!elicitValidation.valid && !explicitOverride) {
        return {
          success: false,
          error: elicitValidation.error || 'Task requires user input but no handler provided',
          missingInputs: elicitValidation.missingInputs,
          taskName: task.name,
          requiresUserInput: true,
          errorCode: ErrorCodes.USER_INPUT_REQUIRED
        };
      }

      if (!elicitValidation.valid && explicitOverride) {
        console.warn('\nℹ️  Proceeding with explicit override: required user inputs will be skipped.');
      }

      let memory = await this.memoryManager.fetchWorkingMemory(agentName);
      executionContext.attachMemory(memory);

      if (!memory) {
        try {
          memory = await this.memoryManager.initializeWorkingMemory(agentName);
          executionContext.attachMemory(memory);
        } catch (initError) {
          throw new MemoryStateError(
            `Failed to initialize working memory for agent ${agentName}`,
            'INITIALIZE',
            { agentName, error: initError.message }
          );
        }
      }

      const currentMemory = JSON.parse(JSON.stringify(memory || {}));
      checkpointId = `checkpoint_${Date.now()}`;

      if (memory) {
        this.memoryManager.createCheckpoint(agentName, checkpointId, currentMemory);

        this.memoryManager.registerCleanup(async () => {
          const snapshot = this.memoryManager.getCheckpoint(agentName, checkpointId);
          if (snapshot) {
            await this.memoryManager.persistWorkingMemory(agentName, snapshot);
            this.memoryManager.clearCheckpoint(agentName, checkpointId);
          }
        }, `Restore checkpoint ${checkpointId}`);

        memory.taskId = task.id || task.name;
        memory.context = executionContext.getState();
        memory = await this.memoryManager.persistWorkingMemory(agentName, memory);
      } else {
        memory = {
          taskId: task.id || task.name,
          context: executionContext.getState(),
          plan: [],
          subTasks: []
        };
        memory = await this.memoryManager.persistWorkingMemory(agentName, memory);
        executionContext.attachMemory(memory);
      }

      const adaptedMemory = this.planAdapter.adaptPlan(memory, task);
      await this.memoryManager.persistWorkingMemory(agentName, adaptedMemory);

      if (adaptedMemory.subTasks && adaptedMemory.subTasks.length > 0) {
        console.log(`Task "${task.name}" was split into ${adaptedMemory.subTasks.length} sub-tasks`);
      }

      const stepsWithValidation = await this.processStepsWithValidation(task, agentName, executionContext);

      await this.memoryManager.persistWorkingMemory(agentName, {
        context: executionContext.getState()
      });

      await this.memoryManager.executeCleanup();

      return {
        success: true,
        taskName: task.name,
        originalSteps: task.steps ? task.steps.length : 0,
        subTasks: adaptedMemory.subTasks,
        adaptedPlan: adaptedMemory.plan,
        memory: adaptedMemory,
        stepsValidation: stepsWithValidation,
        context: executionContext.toJSON()
      };
    } catch (error) {
      if (checkpointId) {
        const snapshot = this.memoryManager.getCheckpoint(agentName, checkpointId);
        if (snapshot) {
          await this.memoryManager.persistWorkingMemory(agentName, snapshot);
          this.memoryManager.clearCheckpoint(agentName, checkpointId);
        }
      }

      return this.errorRecovery.handle(error, agentName, taskPath, executionContext.getState());
    }
  }

  async executeSubTask(agentName, subTaskId) {
    try {
      const memory = await this.memoryManager.fetchWorkingMemory(agentName);
      if (!memory || !memory.subTasks) {
        throw new MemoryStateError('No sub-tasks found in memory', 'READ', { agentName, operation: 'executeSubTask' });
      }

      const subTask = memory.subTasks.find(st => st.id === subTaskId);
      if (!subTask) {
        throw new TaskExecutionError(
          `Sub-task ${subTaskId} not found`,
          { id: subTaskId, name: 'Unknown Sub-task' },
          { availableSubTasks: memory.subTasks.map(st => st.id) }
        );
      }

      await this.memoryManager.persistWorkingMemory(agentName, { [ContextKeys.CURRENT_STEP]: subTaskId });
      subTask.status = 'in_progress';
      await this.memoryManager.persistWorkingMemory(agentName, { subTasks: memory.subTasks });

      return { success: true, subTask };
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      }
      throw new TaskExecutionError(
        `Failed to execute sub-task: ${error.message}`,
        { id: subTaskId, name: 'Sub-task Execution' },
        { originalError: error.message }
      );
    }
  }

  async completeSubTask(agentName, subTaskId) {
    try {
      const memory = await this.memoryManager.fetchWorkingMemory(agentName);
      if (!memory || !memory.subTasks) {
        throw new MemoryStateError('No sub-tasks found in memory', 'READ', { agentName, operation: 'completeSubTask' });
      }

      const subTask = memory.subTasks.find(st => st.id === subTaskId);
      if (!subTask) {
        throw new TaskExecutionError(
          `Sub-task ${subTaskId} not found`,
          { id: subTaskId, name: 'Unknown Sub-task' },
          { availableSubTasks: memory.subTasks.map(st => st.id) }
        );
      }

      subTask.status = 'completed';
      const planItem = memory.plan.find(item => item.id === subTaskId);
      if (planItem) {
        planItem.status = 'completed';
      }

      await this.memoryManager.persistWorkingMemory(agentName, {
        subTasks: memory.subTasks,
        plan: memory.plan
      });

      return {
        success: true,
        completedSubTask: subTask
      };
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      }
      throw new TaskExecutionError(
        `Failed to complete sub-task: ${error.message}`,
        { id: subTaskId, name: 'Sub-task Completion' },
        { originalError: error.message }
      );
    }
  }

  async executeStepActions(step, agentName, context) {
    const executionContext = context instanceof ExecutionContext
      ? context
      : new ExecutionContext({ agentName, baseContext: context });

    return this.actionDispatcher.executeStepActions(step, agentName, executionContext.getState());
  }

  extractStepsFromMarkdown(markdown) {
    const steps = [];
    const lines = markdown.split('\n');
    const stepPattern = /^(?:#{2,3}\s+)?(\d+)\.\s+(.+)/;
    const bulletPattern = /^[-*]\s+(.+)/;
    let currentStep = null;

    for (const line of lines) {
      const stepMatch = line.match(stepPattern);
      const bulletMatch = line.match(bulletPattern);

      if (stepMatch) {
        if (currentStep) {
          steps.push(currentStep);
        }
        currentStep = {
          name: stepMatch[2].trim(),
          description: ''
        };
      } else if (bulletMatch && currentStep) {
        currentStep.description += (currentStep.description ? '\n' : '') + '- ' + bulletMatch[1];
      } else if (currentStep && line.trim() && !line.startsWith('#')) {
        currentStep.description += (currentStep.description ? '\n' : '') + line.trim();
      }
    }

    if (currentStep) {
      steps.push(currentStep);
    }

    return steps;
  }

  async processStepsWithValidation(task, agentName, executionContext, executeSteps = true) {
    if (!task.steps || task.steps.length === 0) {
      return [];
    }

    const stepResults = [];
    const context = executionContext.getState();

    for (const step of task.steps) {
      const stepResult = {
        id: step.id,
        name: step.name,
        hasSchema: !!step.schema,
        validation: null
      };

      if (executeSteps) {
        let shouldExecute = true;
        if (step.outputs) {
          shouldExecute = Object.values(step.outputs).some(outputKey => !context[outputKey]);
        } else if (step.output) {
          shouldExecute = !context[step.output];
        }

        if (shouldExecute) {
          const outputData = await this.actionDispatcher.executeStepActions(step, agentName, context);
          if (outputData !== undefined && step.output) {
            executionContext.set(step.output, outputData);
          }
        }
      }

      if (step.schema && step.output) {
        const validationResult = await this.validateStepOutput(step, executionContext);
        stepResult.validation = validationResult;

        if (!validationResult.valid) {
          const errorMessage = `Step "${step.name}" validation failed:\n${this.formatValidationErrors(validationResult.errors)}`;
          console.error(errorMessage);
          throw new ValidationError(errorMessage, validationResult.errors);
        }
      }

      stepResults.push(stepResult);
    }

    return stepResults;
  }

  async validateStepOutput(step, context) {
    const executionContext = context instanceof ExecutionContext
      ? context
      : new ExecutionContext({ baseContext: context });

    const state = executionContext.getState();

    if (step.schema === 'storyContractSchema') {
      if (!this.storyContractValidator) {
        this.storyContractValidator = new StoryContractValidator();
      }

      const outputData = state[step.output] || null;
      if (!outputData) {
        return {
          valid: false,
          errors: [{ message: `No output data found for '${step.output}'` }]
        };
      }

      return this.storyContractValidator.validateContract(outputData);
    }

    let schemaPath = ModuleResolver.resolveSchemaPath(step.schema, this.rootDir);
    if (!schemaPath && this.coreConfig && this.coreConfig.validationSchemas && this.coreConfig.validationSchemas[step.schema]) {
      const configSchemaPath = this.coreConfig.validationSchemas[step.schema];
      schemaPath = path.isAbsolute(configSchemaPath)
        ? configSchemaPath
        : path.join(this.rootDir, configSchemaPath);
    }

    if (schemaPath) {
      try {
        const Ajv = require('ajv');
        const addFormats = require('ajv-formats');
        const ajv = new Ajv();
        addFormats(ajv);
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const validate = ajv.compile(schema);
        const outputData = state[step.output] || null;
        const valid = validate(outputData);
        return { valid, errors: valid ? [] : validate.errors };
      } catch (error) {
        return {
          valid: false,
          errors: [{ message: `Failed to load schema ${step.schema}: ${error.message}` }]
        };
      }
    }

    return {
      valid: true,
      errors: []
    };
  }

  formatValidationErrors(errors) {
    if (!errors || errors.length === 0) {
      return 'No errors';
    }

    if (this.storyContractValidator) {
      return this.storyContractValidator.formatErrors(errors);
    }

    return errors.map(err => {
      const errorPath = err.instancePath || '/';
      const message = err.message || 'Unknown error';
      return `${errorPath}: ${message}`;
    }).join('\n');
  }
}

module.exports = TaskExecutionEngine;
