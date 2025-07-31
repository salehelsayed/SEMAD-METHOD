const fs = require('fs');
const path = require('path');

/**
 * Simple logging utility with levels for dependency analysis system
 */

// Log levels (lower number = higher priority)
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

// Default configuration
const DEFAULT_CONFIG = {
  level: process.env.LOG_LEVEL || 'INFO',
  enableConsole: true,
  enableFile: false,
  logFile: process.env.LOG_FILE || 'dependency-analysis.log',
  enableTimestamp: true,
  enableColors: true,
  maxLogFileSize: 10 * 1024 * 1024, // 10MB
  context: process.env.LOG_CONTEXT || 'DEPENDENCY_ANALYSIS'
};

// ANSI color codes
const COLORS = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[32m', // Green
  TRACE: '\x1b[37m', // White
  RESET: '\x1b[0m'
};

class Logger {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentLevel = LOG_LEVELS[this.config.level.toUpperCase()] || LOG_LEVELS.INFO;
    
    // Ensure log directory exists if file logging is enabled
    if (this.config.enableFile) {
      const logDir = path.dirname(this.config.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  /**
   * Format log message with timestamp and level
   */
  formatMessage(level, message, context = null) {
    const timestamp = this.config.enableTimestamp 
      ? new Date().toISOString() 
      : '';
    
    const contextStr = context || this.config.context;
    const parts = [
      timestamp,
      `[${level}]`,
      `[${contextStr}]`,
      message
    ].filter(Boolean);
    
    return parts.join(' ');
  }

  /**
   * Write log to file (with rotation if needed)
   */
  writeToFile(formattedMessage) {
    if (!this.config.enableFile) return;
    
    try {
      // Check file size and rotate if needed
      if (fs.existsSync(this.config.logFile)) {
        const stats = fs.statSync(this.config.logFile);
        if (stats.size > this.config.maxLogFileSize) {
          this.rotateLogFile();
        }
      }
      
      fs.appendFileSync(this.config.logFile, formattedMessage + '\n');
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('Failed to write to log file:', error.message);
      console.log(formattedMessage);
    }
  }

  /**
   * Rotate log file when it gets too large
   */
  rotateLogFile() {
    try {
      const ext = path.extname(this.config.logFile);
      const base = path.basename(this.config.logFile, ext);
      const dir = path.dirname(this.config.logFile);
      const rotatedName = path.join(dir, `${base}-${Date.now()}${ext}`);
      
      fs.renameSync(this.config.logFile, rotatedName);
    } catch (error) {
      console.error('Failed to rotate log file:', error.message);
    }
  }

  /**
   * Main logging method
   */
  log(level, message, context = null, ...args) {
    const levelValue = LOG_LEVELS[level];
    if (levelValue > this.currentLevel) return; // Skip if below current log level
    
    // Format the message
    let fullMessage = message;
    if (args.length > 0) {
      fullMessage += ' ' + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
    }
    
    const formattedMessage = this.formatMessage(level, fullMessage, context);
    
    // Console output with colors
    if (this.config.enableConsole) {
      const colorCode = this.config.enableColors ? COLORS[level] || '' : '';
      const resetCode = this.config.enableColors ? COLORS.RESET : '';
      console.log(`${colorCode}${formattedMessage}${resetCode}`);
    }
    
    // File output (without colors)
    this.writeToFile(formattedMessage);
  }

  // Convenience methods
  error(message, context = null, ...args) {
    this.log('ERROR', message, context, ...args);
  }

  warn(message, context = null, ...args) {
    this.log('WARN', message, context, ...args);
  }

  info(message, context = null, ...args) {
    this.log('INFO', message, context, ...args);
  }

  debug(message, context = null, ...args) {
    this.log('DEBUG', message, context, ...args);
  }

  trace(message, context = null, ...args) {
    this.log('TRACE', message, context, ...args);
  }

  /**
   * Set log level dynamically
   */
  setLevel(level) {
    this.currentLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    this.config.level = level.toUpperCase();
  }

  /**
   * Enable/disable file logging
   */
  setFileLogging(enabled, logFile = null) {
    this.config.enableFile = enabled;
    if (logFile) {
      this.config.logFile = logFile;
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Create a child logger with additional context
   */
  child(context) {
    return new Logger({
      ...this.config,
      context: `${this.config.context}:${context}`
    });
  }
}

// Create default logger instance
const defaultLogger = new Logger();

// Export both the class and default instance
module.exports = {
  Logger,
  logger: defaultLogger,
  LOG_LEVELS
};