const ActionDispatcher = require('./action-dispatcher');
const MemoryManager = require('./memory-manager');
const PlanAdapter = require('./plan-adapter');
const ErrorRecovery = require('./error-recovery');
const TaskExecutionEngine = require('./task-execution');
const { TaskConfigLoader, loadCoreConfig } = require('../config/task-config-loader');

class EngineRunner {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.configLoader = new TaskConfigLoader(rootDir);
    this.coreConfig = this.configLoader.getCoreConfig();
    this.memoryManager = new MemoryManager(rootDir);
    this.actionDispatcher = new ActionDispatcher(rootDir);
    this.planAdapter = new PlanAdapter();
    this.errorRecovery = new ErrorRecovery(this.memoryManager);

    this.executionEngine = new TaskExecutionEngine({
      rootDir,
      coreConfig: this.coreConfig,
      memoryManager: this.memoryManager,
      actionDispatcher: this.actionDispatcher,
      planAdapter: this.planAdapter,
      errorRecovery: this.errorRecovery,
      taskConfigLoader: this.configLoader
    });
  }

  async executeTask(agentName, taskPath, context = {}) {
    return this.executionEngine.executeTask(agentName, taskPath, context);
  }

  async executeSubTask(agentName, subTaskId) {
    return this.executionEngine.executeSubTask(agentName, subTaskId);
  }

  async completeSubTask(agentName, subTaskId) {
    return this.executionEngine.completeSubTask(agentName, subTaskId);
  }

  getTaskLoader() {
    return this.configLoader.getTaskLoader();
  }

  getCoreConfig() {
    return this.coreConfig;
  }

  reloadCoreConfig() {
    this.coreConfig = this.configLoader.reloadCoreConfig();
    return this.coreConfig;
  }

  getActionsRequiringInput(task) {
    return this.actionDispatcher.collectElicitActions(task);
  }

  validateElicitRequirements(task, context, options = {}) {
    return this.actionDispatcher.validateElicitRequirements(task, context, options);
  }

  executeStepActions(step, agentName, context) {
    return this.executionEngine.executeStepActions(step, agentName, context);
  }

  validateStepOutput(step, context) {
    return this.executionEngine.validateStepOutput(step, context);
  }
}

module.exports = EngineRunner;
