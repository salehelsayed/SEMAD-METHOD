/**
 * Verbose Logger for BMad Orchestrator
 * Provides configurable logging with multiple verbosity levels
 */

const chalk = require('chalk');

/**
 * VerboseLogger class for enhanced logging with configurable verbosity levels
 * @class VerboseLogger
 * @description Provides structured logging for BMad orchestrator with support for
 * different verbosity levels, colored output, progress indicators, and context sanitization
 */
class VerboseLogger {
  /**
   * Create a new VerboseLogger instance
   * @constructor
   * @param {Object} config - Configuration object
   * @param {boolean} [config.verbosity=true] - Enable/disable logging
   * @param {string} [config.verbosityLevel='normal'] - Log level (minimal, normal, detailed)
   * @param {string} [config.prefix='🎼'] - Prefix for log messages
   */
  constructor(config = {}) {
    this.enabled = config.verbosity !== false;
    this.level = config.verbosityLevel || 'normal';
    this.prefix = config.prefix || '🎼';
  }

  /**
   * Update logger configuration
   * @param {Object} config - Configuration object
   * @param {boolean} config.verbosity - Enable/disable logging
   * @param {string} config.verbosityLevel - Log level (minimal, normal, detailed)
   * @param {string} config.prefix - Prefix for log messages
   */
  configure(config) {
    if (config.verbosity !== undefined) {
      this.enabled = config.verbosity;
    }
    if (config.verbosityLevel !== undefined) {
      this.level = config.verbosityLevel;
    }
    if (config.prefix !== undefined) {
      this.prefix = config.prefix;
    }
  }

  /**
   * Check if a message should be logged based on level
   * @param {string} messageLevel - The level of the message to check
   * @returns {boolean} True if the message should be logged
   */
  shouldLog(messageLevel) {
    
    const levels = {
      minimal: 1,
      normal: 2,
      detailed: 3
    };
    
    const currentLevel = levels[this.level] || 2;
    const requiredLevel = levels[messageLevel] || 2;
    
    return currentLevel >= requiredLevel;
  }

  /**
   * Log a task start message
   * @param {string} taskName - Name of the task starting
   * @param {string} details - Optional details about the task
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  taskStart(taskName, details = '', level = 'normal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const icon = this.getTaskIcon(taskName);
    
    console.log(chalk.blue(`${this.prefix} [${timestamp}] ${icon} ${taskName}...`));
    if (details && this.level === 'detailed') {
      console.log(chalk.dim(`   ${details}`));
    }
  }

  /**
   * Log a task completion message
   * @param {string} taskName - Name of the task completed
   * @param {string} result - Optional result message
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  taskComplete(taskName, result = '', level = 'normal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const icon = '✓';
    
    console.log(chalk.green(`${this.prefix} [${timestamp}] ${icon} ${taskName} completed`));
    if (result && (this.level === 'detailed' || this.level === 'normal')) {
      console.log(chalk.dim(`   ${result}`));
    }
  }

  /**
   * Sanitize context objects to prevent exposure of sensitive data
   * @param {Object} context - Context object to sanitize
   * @returns {Object} Sanitized context object
   */
  sanitizeContext(context) {
    const sensitive = ['password', 'token', 'secret', 'key', 'credential', 'auth', 'api_key', 'apikey', 'private'];
    const visited = new WeakSet();
    
    const sanitize = (obj) => {
      // Handle primitives
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }
      
      // Handle circular references
      if (visited.has(obj)) {
        return '[Circular]';
      }
      visited.add(obj);
      
      // Handle special object types
      if (obj instanceof Date || obj instanceof RegExp) {
        return obj;
      }
      
      // Handle functions
      if (typeof obj === 'function') {
        return obj;
      }
      
      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item));
      }
      
      // Handle regular objects
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        const isSensitive = sensitive.some(s => {
          // Check if the key contains the sensitive word
          return lowerKey.includes(s);
        });
        
        if (isSensitive) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = sanitize(value);
        } else {
          sanitized[key] = value;
        }
      }
      
      return sanitized;
    };
    
    return sanitize(context);
  }

  /**
   * Log an agent action
   * @param {string} agentName - Name of the agent performing the action
   * @param {string} action - Description of the action
   * @param {Object} context - Optional context object
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  agentAction(agentName, action, context = {}, level = 'normal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const agentIcon = this.getAgentIcon(agentName);
    
    console.log(chalk.cyan(`${this.prefix} [${timestamp}] ${agentIcon} ${agentName} agent: ${action}`));
    
    if (this.level === 'detailed' && Object.keys(context).length > 0) {
      const sanitizedContext = this.sanitizeContext(context);
      console.log(chalk.dim(`   Context: ${JSON.stringify(sanitizedContext, null, 2).split('\n').join('\n   ')}`));
    }
  }

  /**
   * Log a workflow transition
   * @param {string} from - Source state/phase
   * @param {string} to - Destination state/phase
   * @param {string} reason - Optional reason for transition
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  workflowTransition(from, to, reason = '', level = 'normal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.magenta(`${this.prefix} [${timestamp}] → Workflow transition: ${from} → ${to}`));
    
    if (reason && this.level !== 'minimal') {
      console.log(chalk.dim(`   Reason: ${reason}`));
    }
  }

  /**
   * Log an iteration in Dev↔QA flow
   * @param {number} number - Iteration number
   * @param {string} phase - Current phase of iteration
   * @param {string} details - Optional details about the iteration
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  iteration(number, phase, details = '', level = 'normal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.yellow(`${this.prefix} [${timestamp}] 🔄 Iteration ${number}: ${phase}`));
    
    if (details && this.level === 'detailed') {
      console.log(chalk.dim(`   ${details}`));
    }
  }

  /**
   * Log a warning
   * @param {string} message - Warning message
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  warn(message, level = 'minimal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.yellow(`${this.prefix} [${timestamp}] ⚠️  Warning: ${message}`));
  }

  /**
   * Log an error
   * @param {string} message - Error message
   * @param {Error|null} error - Optional error object for stack trace
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  error(message, error = null, level = 'minimal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.red(`${this.prefix} [${timestamp}] ❌ Error: ${message}`));
    
    if (error && this.level === 'detailed') {
      console.log(chalk.red(`   ${error.stack || error.message}`));
    }
  }

  /**
   * Log a summary
   * @param {string} title - Summary title
   * @param {string[]} items - List of items to include in summary
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  summary(title, items = [], level = 'normal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.bold(`\n${this.prefix} [${timestamp}] 📊 ${title}`));
    
    items.forEach(item => {
      console.log(`   • ${item}`);
    });
    console.log('');
  }

  /**
   * Log a phase start
   * @param {string} phaseName - Name of the phase starting
   * @param {string} description - Optional description of the phase
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  phaseStart(phaseName, description = '', level = 'normal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.bold.blue(`\n${this.prefix} [${timestamp}] 🚀 Starting ${phaseName}`));
    
    if (description && this.level !== 'minimal') {
      console.log(chalk.dim(`   ${description}`));
    }
    console.log('');
  }

  /**
   * Log a phase completion
   * @param {string} phaseName - Name of the phase completed
   * @param {string} result - Optional result message
   * @param {string} level - Log level (minimal, normal, detailed)
   */
  phaseComplete(phaseName, result = '', level = 'normal') {
    if (!this.enabled || !this.shouldLog(level)) return;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.bold.green(`\n${this.prefix} [${timestamp}] ✅ Completed ${phaseName}`));
    
    if (result && this.level !== 'minimal') {
      console.log(chalk.dim(`   ${result}`));
    }
    console.log('');
  }

  /**
   * Get icon for different tasks
   * @param {string} taskName - Name of the task
   * @returns {string} Emoji icon for the task
   */
  getTaskIcon(taskName) {
    const icons = {
      'loading': '📂',
      'validating': '🔍',
      'executing': '⚡',
      'saving': '💾',
      'analyzing': '🔬',
      'configuring': '⚙️',
      'default': '📋'
    };
    
    const key = Object.keys(icons).find(k => taskName.toLowerCase().includes(k));
    return icons[key] || icons.default;
  }

  /**
   * Get icon for different agents
   * @param {string} agentName - Name of the agent
   * @returns {string} Emoji icon for the agent
   */
  getAgentIcon(agentName) {
    const icons = {
      'dev': '👨‍💻',
      'qa': '🧪',
      'analyst': '📊',
      'pm': '📝',
      'architect': '🏗️',
      'sm': '🏃',
      'po': '👔',
      'ux': '🎨',
      'default': '🤖'
    };
    
    return icons[agentName.toLowerCase()] || icons.default;
  }

  /**
   * Create a progress indicator for long-running tasks
   * @param {string} taskName - Name of the task being tracked
   * @param {number} totalSteps - Total number of steps to complete
   * @returns {Object} Progress indicator with update and complete methods
   */
  createProgressIndicator(taskName, totalSteps) {
    let currentStep = 0;
    let intervalId = null;
    let isCompleted = false;
    
    // Cleanup function to handle process termination
    const cleanup = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (!isCompleted && this.enabled) {
        process.stdout.write('\n');
        isCompleted = true;
      }
      
      // Remove event listeners to prevent memory leaks
      process.removeListener('SIGINT', cleanup);
      process.removeListener('exit', cleanup);
      process.removeListener('SIGTERM', cleanup);
    };
    
    // Register cleanup handlers
    process.on('SIGINT', cleanup);
    process.on('exit', cleanup);
    process.on('SIGTERM', cleanup);
    
    return {
      update: (step, message = '') => {
        if (!this.enabled || !this.shouldLog('normal') || isCompleted) return;
        
        currentStep = step;
        // Handle edge cases for percentage calculation
        const safeTotal = Math.max(totalSteps, 1);
        const percentage = Math.min(Math.round((currentStep / safeTotal) * 100), 100);
        const filled = Math.max(0, Math.min(20, Math.floor(percentage / 5)));
        const empty = Math.max(0, 20 - filled);
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        
        process.stdout.write(`\r${this.prefix} ${taskName}: [${bar}] ${percentage}% ${message}`);
        
        if (currentStep >= totalSteps && totalSteps > 0) {
          console.log(''); // New line when complete
          isCompleted = true;
          cleanup();
        }
      },
      complete: () => {
        if (!this.enabled || !this.shouldLog('normal') || isCompleted) return;
        console.log(''); // Ensure we're on a new line
        isCompleted = true;
        cleanup();
      }
    };
  }
}

module.exports = VerboseLogger;