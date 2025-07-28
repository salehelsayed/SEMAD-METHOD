/**
 * Task Recovery utilities for error handling and recovery
 */

const {
  TaskError,
  ValidationError,
  TaskExecutionError,
  MemoryStateError,
  ActionExecutionError,
  DependencyError,
  ConfigurationError
} = require('../errors/task-errors');

class TaskRecovery {
  constructor(memory, logger = console) {
    this.memory = memory;
    this.logger = logger;
  }

  /**
   * Recover from a task error based on error type
   * @param {Error} error - The error to recover from
   * @param {Object} context - Additional context for recovery
   * @returns {Object} Recovery result
   */
  async recoverFromError(error, context = {}) {
    const recoveryResult = {
      recovered: false,
      action: 'none',
      details: {}
    };

    try {
      if (error instanceof ValidationError) {
        // Validation errors typically can't be recovered automatically
        recoveryResult.action = 'validation_failed';
        recoveryResult.details = {
          validationErrors: error.validationErrors,
          suggestion: 'Fix validation errors and retry'
        };
      } else if (error instanceof TaskExecutionError) {
        // Try to recover from execution errors
        recoveryResult.action = 'execution_recovery';
        recoveryResult.details = await this.recoverPartialExecution(error, context);
        recoveryResult.recovered = recoveryResult.details.recovered;
      } else if (error instanceof MemoryStateError) {
        // Attempt memory state recovery
        recoveryResult.action = 'memory_recovery';
        recoveryResult.details = await this.recoverMemoryState(error, context);
        recoveryResult.recovered = recoveryResult.details.recovered;
      } else if (error instanceof ActionExecutionError) {
        // Action errors might be retryable
        recoveryResult.action = 'action_recovery';
        recoveryResult.details = {
          action: error.action,
          inputs: error.inputs,
          suggestion: 'Check action implementation and inputs'
        };
      } else if (error instanceof DependencyError) {
        // Dependency errors need manual intervention
        recoveryResult.action = 'dependency_error';
        recoveryResult.details = {
          dependency: error.dependency,
          suggestion: 'Ensure dependency is available and properly configured'
        };
      } else if (error instanceof ConfigurationError) {
        // Configuration errors need manual fixes
        recoveryResult.action = 'configuration_error';
        recoveryResult.details = {
          configPath: error.configPath,
          suggestion: 'Check configuration file and fix errors'
        };
      } else {
        // Unknown error type
        recoveryResult.action = 'unknown_error';
        recoveryResult.details = {
          errorType: error.constructor.name,
          message: error.message
        };
      }
    } catch (recoveryError) {
      this.logger.error('Recovery failed:', recoveryError);
      recoveryResult.action = 'recovery_failed';
      recoveryResult.details = {
        originalError: error.message,
        recoveryError: recoveryError.message
      };
    }

    return recoveryResult;
  }

  /**
   * Recover memory state after an error
   * @param {MemoryStateError} error - Memory state error
   * @param {Object} context - Recovery context
   * @returns {Object} Recovery details
   */
  async recoverMemoryState(error, context = {}) {
    const details = {
      recovered: false,
      actions: []
    };

    try {
      // Check if we have a backup state
      const backupState = context.backupState || this.memory.get('_backup_state');
      
      if (backupState) {
        // Restore from backup
        this.memory.clear();
        for (const [key, value] of Object.entries(backupState)) {
          if (key !== '_backup_state') {
            this.memory.set(key, value);
          }
        }
        details.actions.push('Restored from backup state');
        details.recovered = true;
      }

      // Reset any in-progress tasks
      const currentTask = this.memory.get('current_task');
      if (currentTask && currentTask.status === 'in_progress') {
        currentTask.status = 'failed';
        currentTask.error = error.message;
        this.memory.set('current_task', currentTask);
        details.actions.push('Reset in-progress task status');
      }

      // Clear any temporary data
      const keysToClean = ['_temp', '_processing', '_transaction'];
      for (const prefix of keysToClean) {
        const allKeys = Object.keys(this.memory.getAll());
        const tempKeys = allKeys.filter(key => key.startsWith(prefix));
        tempKeys.forEach(key => this.memory.delete(key));
        if (tempKeys.length > 0) {
          details.actions.push(`Cleared ${tempKeys.length} temporary keys with prefix ${prefix}`);
        }
      }

    } catch (recoveryError) {
      details.error = recoveryError.message;
      details.recovered = false;
    }

    return details;
  }

  /**
   * Recover from partial execution failure
   * @param {TaskExecutionError} error - Execution error
   * @param {Object} context - Recovery context
   * @returns {Object} Recovery details
   */
  async recoverPartialExecution(error, context = {}) {
    const details = {
      recovered: false,
      actions: [],
      failedStep: error.step
    };

    try {
      // Get task execution state
      const executionState = this.memory.get('task_execution_state') || {};
      
      // Mark failed step
      if (executionState.steps && error.step) {
        const stepIndex = executionState.steps.findIndex(s => s.id === error.step.id);
        if (stepIndex !== -1) {
          executionState.steps[stepIndex].status = 'failed';
          executionState.steps[stepIndex].error = error.message;
          details.actions.push(`Marked step ${error.step.id} as failed`);
        }
      }

      // Rollback any partial changes from the failed step
      if (context.rollbackActions) {
        for (const rollbackAction of context.rollbackActions) {
          try {
            await rollbackAction();
            details.actions.push(`Executed rollback: ${rollbackAction.description || 'unnamed'}`);
          } catch (rollbackError) {
            details.actions.push(`Rollback failed: ${rollbackError.message}`);
          }
        }
      }

      // Save recovery state
      this.memory.set('task_execution_state', executionState);
      this.memory.set('last_error', {
        type: 'TaskExecutionError',
        message: error.message,
        step: error.step,
        timestamp: new Date().toISOString()
      });

      details.recovered = true;
    } catch (recoveryError) {
      details.error = recoveryError.message;
      details.recovered = false;
    }

    return details;
  }

  /**
   * Create a recovery checkpoint
   * @param {Object} state - State to checkpoint (for async memory)
   * @returns {string} Checkpoint ID
   */
  createCheckpoint(state = null) {
    const checkpointId = `checkpoint_${Date.now()}`;
    
    // For async memory interfaces, state must be passed in
    // For sync interfaces, we can get it directly
    const currentState = state || (this.memory.getAll ? this.memory.getAll() : {});
    
    const checkpointData = {
      id: checkpointId,
      timestamp: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(currentState))
    };
    
    // Store checkpoint in memory if possible
    if (this.memory.set) {
      this.memory.set(`_checkpoint_${checkpointId}`, checkpointData);
    }
    
    return checkpointId;
  }

  /**
   * Restore from a checkpoint
   * @param {string} checkpointId - Checkpoint to restore from
   * @param {Object} checkpointData - Checkpoint data (for async memory)
   * @returns {boolean} Success status
   */
  async restoreCheckpoint(checkpointId, checkpointData = null) {
    // Get checkpoint data
    const checkpoint = checkpointData || 
      (this.memory.get ? this.memory.get(`_checkpoint_${checkpointId}`) : null);
    
    if (!checkpoint || !checkpoint.state) {
      throw new MemoryStateError(
        `Checkpoint ${checkpointId} not found or invalid`,
        { checkpointId }
      );
    }
    
    // For async memory, restoration should be handled externally
    // For sync memory, we can do it here
    if (this.memory.clear && this.memory.set) {
      // Clear current state
      this.memory.clear();
      
      // Restore checkpoint state
      for (const [key, value] of Object.entries(checkpoint.state)) {
        this.memory.set(key, value);
      }
    }
    
    return true;
  }
}

module.exports = { TaskRecovery };