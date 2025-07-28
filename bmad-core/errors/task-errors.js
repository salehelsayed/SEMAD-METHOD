/**
 * Custom error classes for BMad task execution
 */

/**
 * Base error class for all task-related errors
 */
class TaskError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Error thrown when task validation fails
 */
class ValidationError extends TaskError {
  constructor(message, validationErrors = []) {
    super(message, 'VALIDATION_ERROR', { validationErrors });
    this.validationErrors = validationErrors;
  }
}

/**
 * Error thrown during task execution
 */
class TaskExecutionError extends TaskError {
  constructor(message, step, context = {}) {
    super(message, 'TASK_EXECUTION_ERROR', { step, ...context });
    this.step = step;
  }
}

/**
 * Error thrown when memory state operations fail
 */
class MemoryStateError extends TaskError {
  constructor(message, operation, context = {}) {
    super(message, 'MEMORY_STATE_ERROR', { operation, ...context });
    this.operation = operation;
  }
}

/**
 * Error thrown when action execution fails
 */
class ActionExecutionError extends TaskError {
  constructor(message, action, inputs, context = {}) {
    super(message, 'ACTION_EXECUTION_ERROR', { action, inputs, ...context });
    this.action = action;
    this.inputs = inputs;
  }
}

/**
 * Error thrown when dependency resolution fails
 */
class DependencyError extends TaskError {
  constructor(message, dependency, originalError = null) {
    super(message, 'DEPENDENCY_ERROR', { dependency, originalError: originalError?.message });
    this.dependency = dependency;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when configuration is invalid
 */
class ConfigurationError extends TaskError {
  constructor(message, configPath, context = {}) {
    super(message, 'CONFIGURATION_ERROR', { configPath, ...context });
    this.configPath = configPath;
  }
}

module.exports = {
  TaskError,
  ValidationError,
  TaskExecutionError,
  MemoryStateError,
  ActionExecutionError,
  DependencyError,
  ConfigurationError
};