const EngineRunner = require('./task-runner/engine/runner');

class TaskRunner {
  constructor(rootDir) {
    this.runner = new EngineRunner(rootDir);
    this.taskLoader = this.runner.getTaskLoader();
    this.coreConfig = this.runner.getCoreConfig();
  }

  async executeTask(agentName, taskPath, context = {}) {
    return this.runner.executeTask(agentName, taskPath, context);
  }

  async executeSubTask(agentName, subTaskId) {
    return this.runner.executeSubTask(agentName, subTaskId);
  }

  async completeSubTask(agentName, subTaskId) {
    return this.runner.completeSubTask(agentName, subTaskId);
  }

  loadCoreConfig() {
    this.coreConfig = this.runner.reloadCoreConfig();
    return this.coreConfig;
  }

  getActionsRequiringInput(task) {
    return this.runner.getActionsRequiringInput(task);
  }

  validateElicitRequirements(task, context, options = {}) {
    return this.runner.validateElicitRequirements(task, context, options);
  }

  executeStepActions(step, agentName, context) {
    return this.runner.executeStepActions(step, agentName, context);
  }

  validateStepOutput(step, context) {
    return this.runner.validateStepOutput(step, context);
  }
}

module.exports = TaskRunner;
