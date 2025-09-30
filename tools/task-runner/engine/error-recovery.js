const { resolveModule } = require('../utils');

const {
  TaskError,
  ValidationError,
  TaskExecutionError,
  ActionExecutionError,
  DependencyError,
  ConfigurationError
} = require(resolveModule('errors/task-errors', '../semad-core/errors/task-errors'));

class ErrorRecovery {
  constructor(memoryManager) {
    this.memoryManager = memoryManager;
  }

  async handle(error, agentName, taskPath, context) {
    const taskRecovery = this.memoryManager.ensureTaskRecovery();
    const recoveryResult = await taskRecovery.recoverFromError(error, {
      agentName,
      taskPath,
      context,
      rollbackActions: []
    });

    const cleanupResults = await this.memoryManager.executeCleanup();
    return this.formatErrorResponse(error, cleanupResults, recoveryResult);
  }

  formatErrorResponse(error, cleanupResults, recoveryResult) {
    let errorResponse = {
      success: false,
      error: error.message,
      errorType: error.constructor.name,
      errorCode: error.code || 'UNKNOWN_ERROR',
      recovery: recoveryResult
    };

    if (error instanceof TaskError) {
      errorResponse.context = error.context;
      errorResponse.timestamp = error.timestamp;

      if (error instanceof ValidationError) {
        errorResponse.validationErrors = error.validationErrors;
      } else if (error instanceof TaskExecutionError) {
        errorResponse.failedStep = error.step;
      } else if (error instanceof ActionExecutionError) {
        errorResponse.failedAction = error.action;
        errorResponse.actionInputs = error.inputs;
      } else if (error instanceof DependencyError) {
        errorResponse.dependency = error.dependency;
        errorResponse.originalError = error.originalError?.message;
      } else if (error instanceof ConfigurationError) {
        errorResponse.configPath = error.configPath;
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      errorResponse.stack = error.stack;
    }

    const failedCleanups = cleanupResults.filter(r => r.status === 'failed');
    if (failedCleanups.length > 0) {
      errorResponse.cleanupFailures = failedCleanups;
    }

    return errorResponse;
  }
}

module.exports = ErrorRecovery;
