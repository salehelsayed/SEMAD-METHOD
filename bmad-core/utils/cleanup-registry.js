/**
 * Cleanup Registry for managing cleanup actions
 */

const { ValidationError } = require('../errors/task-errors');

class CleanupRegistry {
  constructor() {
    this.cleanupActions = [];
  }

  /**
   * Register a cleanup action
   * @param {Function} action - Cleanup function to execute
   * @param {string} description - Description of the cleanup action
   */
  register(action, description = 'Unnamed cleanup action') {
    if (typeof action !== 'function') {
      throw new ValidationError('register', {
        action: 'must be a function',
        provided: typeof action
      });
    }
    
    this.cleanupActions.push({
      action,
      description,
      registered: new Date().toISOString()
    });
  }

  /**
   * Execute all cleanup actions
   * @returns {Array} Array of cleanup results
   */
  async executeAll() {
    const results = [];
    
    // Execute cleanups in reverse order (LIFO)
    const actionsToExecute = [...this.cleanupActions].reverse();
    
    for (const { action, description } of actionsToExecute) {
      try {
        await action();
        results.push({
          description,
          status: 'success'
        });
      } catch (error) {
        // Continue with other cleanups even if one fails
        results.push({
          description,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Clear all registered cleanup actions
   */
  clear() {
    this.cleanupActions = [];
  }

  /**
   * Get count of registered cleanup actions
   * @returns {number} Number of registered actions
   */
  size() {
    return this.cleanupActions.length;
  }

  /**
   * Execute cleanups and clear the registry
   * @returns {Array} Array of cleanup results
   */
  async executeAndClear() {
    const results = await this.executeAll();
    this.clear();
    return results;
  }
}

module.exports = { CleanupRegistry };