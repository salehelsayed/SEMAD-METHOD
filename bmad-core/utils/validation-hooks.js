/**
 * Validation Hooks
 * 
 * Provides automatic validation hooks for memory and story operations.
 * Ensures validation runs automatically at appropriate points without manual invocation.
 */

const StoryContractValidator = require('./story-contract-validator');
const MemoryOperationValidator = require('./memory-operation-validator');
const fs = require('fs');
const path = require('path');

class ValidationHooks {
  constructor() {
    this.storyValidator = new StoryContractValidator();
    this.memoryValidator = new MemoryOperationValidator();
    this.hooks = new Map();
    this.validationResults = new Map();
  }

  /**
   * Register a validation hook
   * @param {string} hookName - Name of the hook (e.g., 'beforeMemorySave', 'afterStoryLoad')
   * @param {Function} validator - Validation function that returns { valid: boolean, errors: Array }
   */
  registerHook(hookName, validator) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName).push(validator);
  }

  /**
   * Execute validation hooks for a given event
   * @param {string} hookName - Name of the hook to execute
   * @param {Object} data - Data to validate
   * @returns {Object} Combined validation result
   */
  async executeHooks(hookName, data) {
    const validators = this.hooks.get(hookName) || [];
    const results = {
      valid: true,
      errors: [],
      warnings: []
    };

    for (const validator of validators) {
      try {
        const result = await validator(data);
        if (!result.valid) {
          results.valid = false;
          results.errors.push(...(result.errors || []));
        }
        if (result.warnings) {
          results.warnings.push(...result.warnings);
        }
      } catch (error) {
        results.valid = false;
        results.errors.push({
          type: 'VALIDATION_ERROR',
          message: `Validation hook failed: ${error.message}`,
          hook: hookName
        });
      }
    }

    // Store results for later retrieval
    this.validationResults.set(`${hookName}_${Date.now()}`, results);

    return results;
  }

  /**
   * Validate memory operation before save
   * @param {Object} memoryData - Memory data to validate
   * @returns {Object} Validation result
   */
  async validateMemoryBeforeSave(memoryData) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check required fields
    if (!memoryData.agentName) {
      validation.valid = false;
      validation.errors.push({
        type: 'MISSING_FIELD',
        field: 'agentName',
        message: 'Agent name is required for memory operations'
      });
    }

    if (!memoryData.content && !memoryData.text) {
      validation.valid = false;
      validation.errors.push({
        type: 'MISSING_FIELD',
        field: 'content',
        message: 'Memory content is required'
      });
    }

    // Validate content size
    const content = memoryData.content || memoryData.text || '';
    if (content.length > 50000) {
      validation.warnings.push({
        type: 'CONTENT_SIZE',
        message: 'Memory content exceeds recommended size (50KB)',
        size: content.length
      });
    }

    // Validate metadata structure
    if (memoryData.metadata) {
      if (memoryData.metadata.storyId && !this.isValidId(memoryData.metadata.storyId)) {
        validation.errors.push({
          type: 'INVALID_FORMAT',
          field: 'metadata.storyId',
          message: 'Invalid story ID format'
        });
      }
    }

    return validation;
  }

  /**
   * Validate story after load
   * @param {Object} storyData - Loaded story data
   * @returns {Object} Validation result
   */
  async validateStoryAfterLoad(storyData) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check if story has required structure
    if (!storyData.frontMatter) {
      validation.warnings.push({
        type: 'MISSING_STRUCTURE',
        message: 'Story missing YAML front matter'
      });
    }

    // Validate StoryContract if present
    if (storyData.frontMatter && storyData.frontMatter.StoryContract) {
      const contractValidation = this.storyValidator.validateContract(storyData.frontMatter.StoryContract);
      if (!contractValidation.valid) {
        validation.valid = false;
        validation.errors.push({
          type: 'INVALID_CONTRACT',
          message: 'StoryContract validation failed',
          details: contractValidation.errors
        });
      }
    }

    // Check for memory operation records
    if (storyData.content) {
      const hasDevMemory = storyData.content.includes('dev-save-memory');
      const hasQAMemory = storyData.content.includes('qa-save-memory');
      
      if (!hasDevMemory && !hasQAMemory) {
        validation.warnings.push({
          type: 'MISSING_MEMORY_OPS',
          message: 'No memory operations found in story'
        });
      }
    }

    return validation;
  }

  /**
   * Helper to validate ID format
   * @param {string} id - ID to validate
   * @returns {boolean} True if valid
   */
  isValidId(id) {
    // Basic ID validation - alphanumeric with hyphens
    return /^[A-Z0-9-]+$/i.test(id);
  }

  /**
   * Initialize default hooks
   */
  initializeDefaultHooks() {
    // Memory validation hooks
    this.registerHook('beforeMemorySave', async (data) => {
      return await this.validateMemoryBeforeSave(data);
    });

    // Story validation hooks
    this.registerHook('afterStoryLoad', async (data) => {
      return await this.validateStoryAfterLoad(data);
    });

    // Task execution hooks
    this.registerHook('beforeTaskExecute', async (data) => {
      const validation = { valid: true, errors: [], warnings: [] };
      
      if (!data.taskPath || !fs.existsSync(data.taskPath)) {
        validation.valid = false;
        validation.errors.push({
          type: 'INVALID_TASK',
          message: 'Task file not found',
          path: data.taskPath
        });
      }
      
      return validation;
    });

    // Workflow execution hooks
    this.registerHook('beforeWorkflowStep', async (data) => {
      const validation = { valid: true, errors: [], warnings: [] };
      
      if (!data.stepId) {
        validation.warnings.push({
          type: 'MISSING_STEP_ID',
          message: 'Workflow step missing ID'
        });
      }
      
      return validation;
    });
  }

  /**
   * Get validation results history
   * @param {number} limit - Maximum number of results to return
   * @returns {Array} Recent validation results
   */
  getValidationHistory(limit = 10) {
    const results = Array.from(this.validationResults.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, limit)
      .map(([key, value]) => ({
        timestamp: key.split('_').pop(),
        hook: key.split('_')[0],
        ...value
      }));
    
    return results;
  }

  /**
   * Clear old validation results to prevent memory buildup
   * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
   */
  cleanupOldResults(maxAge = 3600000) {
    const cutoff = Date.now() - maxAge;
    for (const [key, value] of this.validationResults.entries()) {
      const timestamp = parseInt(key.split('_').pop());
      if (timestamp < cutoff) {
        this.validationResults.delete(key);
      }
    }
  }
}

// Create singleton instance
const validationHooks = new ValidationHooks();
validationHooks.initializeDefaultHooks();

// Schedule periodic cleanup
setInterval(() => {
  validationHooks.cleanupOldResults();
}, 300000); // Clean up every 5 minutes

module.exports = validationHooks;