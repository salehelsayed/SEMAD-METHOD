/**
 * Workflow Monitor for BMad Method
 * Monitors workflow execution and provides warnings for failures
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const ErrorHandler = require('./error-handler');

class WorkflowMonitor {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.workflowDir = path.join(rootDir, 'bmad-core', 'workflows');
    this.executionLog = [];
    this.warningThreshold = 3; // Number of failures before critical warning
  }
  
  /**
   * Monitor workflow execution
   * @param {string} workflowId - Workflow identifier
   * @param {Object} context - Execution context
   * @returns {Object} Monitoring result
   */
  async monitorExecution(workflowId, context = {}) {
    const startTime = Date.now();
    const result = {
      workflowId,
      startTime: new Date(startTime).toISOString(),
      status: 'pending',
      warnings: [],
      errors: [],
      duration: 0
    };
    
    try {
      // Check if workflow exists
      const workflowPath = path.join(this.workflowDir, `${workflowId}.yaml`);
      const workflowExists = await this.checkFileExists(workflowPath);
      
      if (!workflowExists) {
        result.status = 'failed';
        result.errors.push(`Workflow not found: ${workflowId}`);
        ErrorHandler.warn(`Workflow ${workflowId} not found`, [
          `Expected location: ${workflowPath}`,
          'Ensure the workflow file exists and is properly named'
        ]);
        return result;
      }
      
      // Load and validate workflow
      const workflow = await this.loadWorkflow(workflowPath);
      const validation = this.validateWorkflow(workflow, workflowId);
      
      if (!validation.valid) {
        result.status = 'failed';
        result.errors = validation.errors;
        result.warnings = validation.warnings;
        
        ErrorHandler.handle(
          new Error(`Workflow validation failed: ${validation.errors.join(', ')}`),
          { operation: `Workflow ${workflowId} validation` }
        );
        return result;
      }
      
      // Check dependencies
      const depCheck = await this.checkDependencies(workflow, context);
      if (!depCheck.allPresent) {
        result.warnings.push(...depCheck.missing.map(dep => 
          `Missing dependency: ${dep.type}/${dep.name}`
        ));
        
        if (depCheck.critical) {
          result.status = 'failed';
          result.errors.push('Critical dependencies missing');
          
          ErrorHandler.warn('Critical workflow dependencies missing', 
            depCheck.missing.map(dep => `${dep.type}/${dep.name}`)
          );
          return result;
        }
      }
      
      // Monitor execution steps
      if (workflow.steps) {
        for (const [index, step] of workflow.steps.entries()) {
          const stepResult = await this.monitorStep(step, index, context);
          
          if (stepResult.error) {
            result.errors.push(stepResult.error);
            result.warnings.push(`Step ${index + 1} failed: ${step.name || 'unnamed'}`);
            
            if (step.critical !== false) {
              result.status = 'failed';
              ErrorHandler.warn(`Critical workflow step failed`, [
                `Workflow: ${workflowId}`,
                `Step: ${step.name || `Step ${index + 1}`}`,
                `Error: ${stepResult.error}`
              ]);
              break;
            }
          }
          
          if (stepResult.warnings) {
            result.warnings.push(...stepResult.warnings);
          }
        }
      }
      
      // Set final status
      if (result.status === 'pending') {
        result.status = result.errors.length > 0 ? 'failed' : 'success';
      }
      
      result.duration = Date.now() - startTime;
      result.endTime = new Date().toISOString();
      
      // Log execution
      this.logExecution(result);
      
      // Check failure patterns
      await this.checkFailurePatterns(workflowId);
      
      return result;
      
    } catch (error) {
      result.status = 'failed';
      result.errors.push(error.message);
      result.duration = Date.now() - startTime;
      
      ErrorHandler.handle(error, {
        operation: `Workflow ${workflowId} monitoring`,
        showStack: true
      });
      
      return result;
    }
  }
  
  /**
   * Load workflow definition
   * @param {string} workflowPath - Path to workflow file
   * @returns {Object} Workflow definition
   */
  async loadWorkflow(workflowPath) {
    try {
      const content = await fs.readFile(workflowPath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      if (error.name === 'YAMLException') {
        throw new Error(`Invalid YAML in workflow: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Validate workflow structure
   * @param {Object} workflow - Workflow definition
   * @param {string} workflowId - Workflow identifier
   * @returns {Object} Validation result
   */
  validateWorkflow(workflow, workflowId) {
    const errors = [];
    const warnings = [];
    
    // Check required fields
    if (!workflow.name) {
      warnings.push('Workflow missing name field');
    }
    
    if (!workflow.steps || !Array.isArray(workflow.steps)) {
      errors.push('Workflow must have a steps array');
    }
    
    // Validate steps
    if (workflow.steps) {
      workflow.steps.forEach((step, index) => {
        if (!step.action && !step.workflow) {
          errors.push(`Step ${index + 1} missing action or workflow reference`);
        }
        
        if (step.inputs && typeof step.inputs !== 'object') {
          errors.push(`Step ${index + 1} has invalid inputs format`);
        }
      });
    }
    
    // Check for circular dependencies
    if (workflow.steps) {
      const subWorkflows = workflow.steps
        .filter(step => step.workflow)
        .map(step => step.workflow);
        
      if (subWorkflows.includes(workflowId)) {
        errors.push('Circular workflow dependency detected');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Check workflow dependencies
   * @param {Object} workflow - Workflow definition
   * @param {Object} context - Execution context
   * @returns {Object} Dependency check result
   */
  async checkDependencies(workflow, context) {
    const missing = [];
    let critical = false;
    
    // Check required inputs
    if (workflow.inputs) {
      for (const [key, config] of Object.entries(workflow.inputs)) {
        if (config.required && !context.inputs?.[key]) {
          missing.push({
            type: 'input',
            name: key,
            required: true
          });
          critical = true;
        }
      }
    }
    
    // Check required files
    if (workflow.requires?.files) {
      for (const file of workflow.requires.files) {
        const exists = await this.checkFileExists(
          path.isAbsolute(file) ? file : path.join(this.rootDir, file)
        );
        
        if (!exists) {
          missing.push({
            type: 'file',
            name: file,
            required: true
          });
        }
      }
    }
    
    // Check required tools
    if (workflow.requires?.tools) {
      for (const tool of workflow.requires.tools) {
        // This is a simplified check - in production you'd verify actual availability
        const toolMissing = !context.availableTools?.includes(tool);
        
        if (toolMissing) {
          missing.push({
            type: 'tool',
            name: tool,
            required: workflow.requires.critical?.includes(tool)
          });
          
          if (workflow.requires.critical?.includes(tool)) {
            critical = true;
          }
        }
      }
    }
    
    return {
      allPresent: missing.length === 0,
      missing,
      critical
    };
  }
  
  /**
   * Monitor individual step execution
   * @param {Object} step - Step definition
   * @param {number} index - Step index
   * @param {Object} context - Execution context
   * @returns {Object} Step monitoring result
   */
  async monitorStep(step, index, context) {
    const result = {
      index,
      name: step.name || `Step ${index + 1}`,
      warnings: []
    };
    
    try {
      // Check step timeout
      if (step.timeout && context.stepDuration > step.timeout) {
        result.warnings.push(`Step exceeded timeout (${step.timeout}ms)`);
      }
      
      // Check retry count
      if (context.retryCount?.[index] > (step.maxRetries || 3)) {
        result.error = 'Maximum retries exceeded';
      }
      
      // Validate outputs if schema provided
      if (step.outputs && step.schema) {
        const outputValidation = this.validateOutputs(
          context.outputs?.[index], 
          step.schema
        );
        
        if (!outputValidation.valid) {
          result.warnings.push('Output validation failed');
          result.validationErrors = outputValidation.errors;
        }
      }
      
      return result;
      
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }
  
  /**
   * Check for workflow failure patterns
   * @param {string} workflowId - Workflow identifier
   */
  async checkFailurePatterns(workflowId) {
    // Get recent executions for this workflow
    const recentExecutions = this.executionLog
      .filter(log => log.workflowId === workflowId)
      .slice(-10); // Last 10 executions
    
    const failures = recentExecutions.filter(log => log.status === 'failed');
    const failureRate = failures.length / recentExecutions.length;
    
    // Warn if failure rate is high
    if (failureRate > 0.5 && recentExecutions.length >= 5) {
      ErrorHandler.warn(
        `High failure rate detected for workflow ${workflowId}`,
        [
          `Failed ${failures.length} out of last ${recentExecutions.length} executions`,
          'Review workflow configuration and dependencies',
          'Check logs for common failure patterns'
        ]
      );
    }
    
    // Check for repeated errors
    const errorMessages = failures
      .flatMap(f => f.errors)
      .filter(Boolean);
      
    const errorCounts = {};
    errorMessages.forEach(msg => {
      errorCounts[msg] = (errorCounts[msg] || 0) + 1;
    });
    
    const repeatedErrors = Object.entries(errorCounts)
      .filter(([_, count]) => count >= this.warningThreshold)
      .map(([msg, count]) => ({ message: msg, count }));
      
    if (repeatedErrors.length > 0) {
      ErrorHandler.warn(
        `Repeated errors in workflow ${workflowId}`,
        repeatedErrors.map(e => `"${e.message}" (${e.count} times)`)
      );
    }
  }
  
  /**
   * Log workflow execution
   * @param {Object} result - Execution result
   */
  logExecution(result) {
    this.executionLog.push(result);
    
    // Keep only recent logs to prevent memory issues
    if (this.executionLog.length > 1000) {
      this.executionLog = this.executionLog.slice(-500);
    }
  }
  
  /**
   * Validate outputs against schema
   * @param {*} outputs - Step outputs
   * @param {Object} schema - Output schema
   * @returns {Object} Validation result
   */
  validateOutputs(outputs, schema) {
    // Simplified validation - in production use a proper schema validator
    const errors = [];
    
    if (!outputs && schema.required) {
      errors.push('Required outputs missing');
    }
    
    if (schema.type && outputs) {
      const actualType = Array.isArray(outputs) ? 'array' : typeof outputs;
      if (actualType !== schema.type) {
        errors.push(`Expected ${schema.type}, got ${actualType}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Check if file exists
   * @param {string} filePath - File path
   * @returns {boolean} True if exists
   */
  async checkFileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get execution summary
   * @returns {Object} Summary of all executions
   */
  getExecutionSummary() {
    const summary = {
      total: this.executionLog.length,
      successful: 0,
      failed: 0,
      warnings: 0,
      byWorkflow: {}
    };
    
    this.executionLog.forEach(log => {
      if (log.status === 'success') {
        summary.successful++;
      } else if (log.status === 'failed') {
        summary.failed++;
      }
      
      if (log.warnings.length > 0) {
        summary.warnings++;
      }
      
      // Group by workflow
      if (!summary.byWorkflow[log.workflowId]) {
        summary.byWorkflow[log.workflowId] = {
          total: 0,
          successful: 0,
          failed: 0,
          avgDuration: 0
        };
      }
      
      const wf = summary.byWorkflow[log.workflowId];
      wf.total++;
      if (log.status === 'success') wf.successful++;
      if (log.status === 'failed') wf.failed++;
      
      // Update average duration
      wf.avgDuration = ((wf.avgDuration * (wf.total - 1)) + log.duration) / wf.total;
    });
    
    return summary;
  }
}

module.exports = WorkflowMonitor;