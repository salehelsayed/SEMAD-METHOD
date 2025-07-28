/**
 * Comprehensive error handler for BMad Method
 * Provides consistent error reporting and user-friendly messages
 */

const chalk = require('chalk');

class ErrorHandler {
  /**
   * Handle and display errors with appropriate context
   * @param {Error} error - The error to handle
   * @param {Object} context - Additional context
   * @returns {void}
   */
  static handle(error, context = {}) {
    const { operation = 'Operation', showStack = process.env.DEBUG } = context;
    
    // Display main error
    console.error(chalk.red(`\n\u274c ${operation} failed:`), error.message);
    
    // Provide specific guidance based on error type
    this.provideGuidance(error, context);
    
    // Show stack trace if requested
    if (showStack && error.stack) {
      console.error(chalk.dim('\nStack trace:'));
      console.error(chalk.dim(error.stack));
    } else if (!showStack) {
      console.error(chalk.dim('\nRun with DEBUG=1 for stack trace'));
    }
  }
  
  /**
   * Provide specific guidance based on error type
   * @param {Error} error - The error
   * @param {Object} context - Additional context
   */
  static provideGuidance(error, context = {}) {
    const message = error.message.toLowerCase();
    const code = error.code;
    
    // File system errors
    if (code === 'ENOENT' || message.includes('no such file') || message.includes('not found')) {
      console.error(chalk.yellow('\n\u26a0\ufe0f  File or directory not found'));
      if (context.path) {
        console.error(chalk.dim(`  Path: ${context.path}`));
      }
      console.error(chalk.dim('  Ensure the file/directory exists and the path is correct'));
    }
    
    else if (code === 'EACCES' || message.includes('permission denied')) {
      console.error(chalk.yellow('\n\u26a0\ufe0f  Permission denied'));
      console.error(chalk.dim('  Check file/directory permissions'));
      console.error(chalk.dim('  You may need elevated permissions (sudo/admin)'));
    }
    
    else if (code === 'ENOSPC' || message.includes('no space')) {
      console.error(chalk.yellow('\n\u26a0\ufe0f  No space left on device'));
      console.error(chalk.dim('  Free up disk space and try again'));
    }
    
    // YAML/JSON errors
    else if (message.includes('yaml') || message.includes('json')) {
      console.error(chalk.yellow('\n\u26a0\ufe0f  Configuration parsing error'));
      console.error(chalk.dim('  Check for:'));
      console.error(chalk.dim('    - Proper indentation (YAML is indentation-sensitive)'));
      console.error(chalk.dim('    - Matching quotes and brackets'));
      console.error(chalk.dim('    - Valid syntax for the format'));
      
      if (message.includes('duplicate')) {
        console.error(chalk.dim('    - Duplicate keys in the configuration'));
      }
    }
    
    // Dependency errors
    else if (message.includes('dependency') || message.includes('module')) {
      console.error(chalk.yellow('\n\u26a0\ufe0f  Dependency resolution failed'));
      console.error(chalk.dim('  Ensure all required dependencies are:'));
      console.error(chalk.dim('    - Properly defined in configuration files'));
      console.error(chalk.dim('    - Present in their expected locations'));
      console.error(chalk.dim('    - Not circular or conflicting'));
    }
    
    // Network errors
    else if (code === 'ECONNREFUSED' || message.includes('network')) {
      console.error(chalk.yellow('\n\u26a0\ufe0f  Network connection failed'));
      console.error(chalk.dim('  Check your internet connection'));
      console.error(chalk.dim('  Verify any proxy or firewall settings'));
    }
    
    // Validation errors
    else if (message.includes('validation') || message.includes('invalid')) {
      console.error(chalk.yellow('\n\u26a0\ufe0f  Validation error'));
      console.error(chalk.dim('  Check that your data matches the expected format'));
      console.error(chalk.dim('  Refer to schema documentation for requirements'));
    }
    
    // Memory errors
    else if (message.includes('heap') || message.includes('memory')) {
      console.error(chalk.yellow('\n\u26a0\ufe0f  Memory allocation failed'));
      console.error(chalk.dim('  Try:'));
      console.error(chalk.dim('    - Processing smaller batches'));
      console.error(chalk.dim('    - Increasing Node.js memory limit'));
      console.error(chalk.dim('    - node --max-old-space-size=4096 <script>'));
    }
  }
  
  /**
   * Create a user-friendly error message
   * @param {string} technical - Technical error message
   * @param {string} friendly - User-friendly explanation
   * @param {Array<string>} suggestions - Suggestions to fix
   * @returns {Error} Enhanced error object
   */
  static createError(technical, friendly, suggestions = []) {
    const error = new Error(technical);
    error.friendlyMessage = friendly;
    error.suggestions = suggestions;
    return error;
  }
  
  /**
   * Log warning with consistent formatting
   * @param {string} message - Warning message
   * @param {Array<string>} details - Additional details
   */
  static warn(message, details = []) {
    console.warn(chalk.yellow(`\u26a0\ufe0f  ${message}`));
    details.forEach(detail => {
      console.warn(chalk.dim(`   ${detail}`));
    });
  }
  
  /**
   * Log success with consistent formatting
   * @param {string} message - Success message
   */
  static success(message) {
    console.log(chalk.green(`\u2713 ${message}`));
  }
  
  /**
   * Log info with consistent formatting
   * @param {string} message - Info message
   */
  static info(message) {
    console.log(chalk.cyan(`\u2139 ${message}`));
  }
  
  /**
   * Format multiple errors for display
   * @param {Array} errors - Array of errors
   * @returns {string} Formatted error string
   */
  static formatMultipleErrors(errors) {
    return errors.map((err, index) => {
      const num = index + 1;
      if (typeof err === 'string') {
        return `  ${num}. ${err}`;
      } else if (err.message) {
        return `  ${num}. ${err.message}`;
      } else {
        return `  ${num}. ${JSON.stringify(err)}`;
      }
    }).join('\n');
  }
  
  /**
   * Check if error is recoverable
   * @param {Error} error - The error to check
   * @returns {boolean} True if recoverable
   */
  static isRecoverable(error) {
    const recoverableCodes = ['EEXIST', 'EAGAIN', 'EBUSY'];
    const recoverableMessages = ['already exists', 'retry', 'temporary'];
    
    if (recoverableCodes.includes(error.code)) {
      return true;
    }
    
    const message = error.message.toLowerCase();
    return recoverableMessages.some(msg => message.includes(msg));
  }
}

module.exports = ErrorHandler;