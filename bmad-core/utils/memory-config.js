/**
 * Memory Configuration - Centralized configuration for memory system
 * Provides consistent paths and settings across all memory utilities
 */

const path = require('path');

/**
 * Base memory directory - can be overridden by environment variable
 */
const MEMORY_BASE_DIR = process.env.BMAD_MEMORY_DIR || path.join(__dirname, '../../.ai');

/**
 * Memory system configuration
 */
const MEMORY_CONFIG = {
  // Directory paths
  BASE_DIR: MEMORY_BASE_DIR,
  WORKING_MEMORY_DIR: MEMORY_BASE_DIR,
  ARCHIVE_DIR: path.join(MEMORY_BASE_DIR, 'archive'),
  BACKUP_DIR: path.join(MEMORY_BASE_DIR, 'backups'),
  TEMP_DIR: path.join(MEMORY_BASE_DIR, 'temp'),
  
  // File patterns
  WORKING_MEMORY_PATTERN: 'working_memory_{agentName}.json',
  ARCHIVE_PATTERN: 'archive_{agentName}_{date}.json',
  BACKUP_PATTERN: 'backup_{agentName}_{timestamp}.json',
  
  // Memory limits and retention
  MAX_OBSERVATIONS: parseInt(process.env.BMAD_MAX_OBSERVATIONS) || 50,
  MAX_DECISIONS: parseInt(process.env.BMAD_MAX_DECISIONS) || 100,
  MAX_BLOCKERS: parseInt(process.env.BMAD_MAX_BLOCKERS) || 50,
  MAX_KEY_FACTS: parseInt(process.env.BMAD_MAX_KEY_FACTS) || 200,
  MAX_COMPLETED_TASKS: parseInt(process.env.BMAD_MAX_COMPLETED_TASKS) || 100,
  
  // Retention periods (in days)
  MEMORY_RETENTION_DAYS: parseInt(process.env.BMAD_MEMORY_RETENTION_DAYS) || 30,
  ARCHIVE_RETENTION_DAYS: parseInt(process.env.BMAD_ARCHIVE_RETENTION_DAYS) || 90,
  BACKUP_RETENTION_DAYS: parseInt(process.env.BMAD_BACKUP_RETENTION_DAYS) || 7,
  
  // File operation settings
  FILE_LOCK_TIMEOUT: parseInt(process.env.BMAD_FILE_LOCK_TIMEOUT) || 10000, // 10 seconds
  MAX_RETRY_ATTEMPTS: parseInt(process.env.BMAD_MAX_RETRY_ATTEMPTS) || 3,
  RETRY_DELAY: parseInt(process.env.BMAD_RETRY_DELAY) || 100, // milliseconds
  
  // Validation settings
  ENABLE_INPUT_VALIDATION: process.env.BMAD_ENABLE_INPUT_VALIDATION !== 'false',
  MAX_TEXT_LENGTH: parseInt(process.env.BMAD_MAX_TEXT_LENGTH) || 10000,
  MAX_AGENT_NAME_LENGTH: parseInt(process.env.BMAD_MAX_AGENT_NAME_LENGTH) || 50,
  
  // Vector database settings
  QDRANT_HOST: process.env.QDRANT_HOST || 'localhost',
  QDRANT_PORT: parseInt(process.env.QDRANT_PORT) || 6333,
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION || 'bmad_agent_memory',
  QDRANT_VECTOR_SIZE: parseInt(process.env.QDRANT_VECTOR_SIZE) || 384,
  QDRANT_HEALTH_CHECK_INTERVAL: parseInt(process.env.QDRANT_HEALTH_CHECK_INTERVAL) || 30000,
  
  // Performance settings
  ENABLE_MEMORY_COMPRESSION: process.env.BMAD_ENABLE_MEMORY_COMPRESSION === 'true',
  BATCH_OPERATION_SIZE: parseInt(process.env.BMAD_BATCH_OPERATION_SIZE) || 10,
  
  // Debug and logging
  ENABLE_DEBUG_LOGGING: process.env.BMAD_DEBUG === 'true',
  LOG_MEMORY_OPERATIONS: process.env.BMAD_LOG_MEMORY_OPERATIONS === 'true'
};

/**
 * Get the working memory file path for an agent
 * @param {string} agentName - Name of the agent
 * @returns {string} File path
 */
function getWorkingMemoryPath(agentName) {
  const filename = MEMORY_CONFIG.WORKING_MEMORY_PATTERN.replace('{agentName}', agentName);
  return path.join(MEMORY_CONFIG.WORKING_MEMORY_DIR, filename);
}

/**
 * Get the archive file path for an agent and date
 * @param {string} agentName - Name of the agent
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {string} File path
 */
function getArchivePath(agentName, date = null) {
  if (!date) {
    date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }
  const filename = MEMORY_CONFIG.ARCHIVE_PATTERN
    .replace('{agentName}', agentName)
    .replace('{date}', date);
  return path.join(MEMORY_CONFIG.ARCHIVE_DIR, filename);
}

/**
 * Get the backup file path for an agent and timestamp
 * @param {string} agentName - Name of the agent
 * @param {number} timestamp - Timestamp (optional)
 * @returns {string} File path
 */
function getBackupPath(agentName, timestamp = null) {
  if (!timestamp) {
    timestamp = Date.now();
  }
  const filename = MEMORY_CONFIG.BACKUP_PATTERN
    .replace('{agentName}', agentName)
    .replace('{timestamp}', timestamp);
  return path.join(MEMORY_CONFIG.BACKUP_DIR, filename);
}

/**
 * Get a temporary file path
 * @param {string} prefix - File prefix
 * @param {string} extension - File extension (default: .json)
 * @returns {string} File path
 */
function getTempPath(prefix = 'temp', extension = '.json') {
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`;
  return path.join(MEMORY_CONFIG.TEMP_DIR, filename);
}

/**
 * Validate agent name
 * @param {string} agentName - Agent name to validate
 * @throws {Error} If agent name is invalid
 */
function validateAgentName(agentName) {
  if (!agentName || typeof agentName !== 'string') {
    throw new Error('Agent name must be a non-empty string');
  }
  
  if (agentName.length > MEMORY_CONFIG.MAX_AGENT_NAME_LENGTH) {
    throw new Error(`Agent name too long (max ${MEMORY_CONFIG.MAX_AGENT_NAME_LENGTH} characters)`);
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(agentName)) {
    throw new Error('Agent name can only contain letters, numbers, underscores, and hyphens');
  }
}

/**
 * Validate text content
 * @param {string} text - Text to validate
 * @param {string} context - Context for error messages
 * @throws {Error} If text is invalid
 */
function validateTextContent(text, context = 'text') {
  if (!MEMORY_CONFIG.ENABLE_INPUT_VALIDATION) {
    return; // Validation disabled
  }
  
  if (typeof text !== 'string') {
    throw new Error(`${context} must be a string`);
  }
  
  if (text.length > MEMORY_CONFIG.MAX_TEXT_LENGTH) {
    throw new Error(`${context} too long (max ${MEMORY_CONFIG.MAX_TEXT_LENGTH} characters)`);
  }
  
  // Check for potentially malicious content
  const suspiciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /eval\s*\(/gi,
    /Function\s*\(/gi
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text)) {
      throw new Error(`${context} contains potentially malicious content`);
    }
  }
}

/**
 * Sanitize text content
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeTextContent(text) {
  if (typeof text !== 'string') {
    return String(text);
  }
  
  // Remove control characters (except newlines and tabs)
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit length
  if (sanitized.length > MEMORY_CONFIG.MAX_TEXT_LENGTH) {
    sanitized = sanitized.substring(0, MEMORY_CONFIG.MAX_TEXT_LENGTH) + '... [truncated]';
  }
  
  return sanitized;
}

/**
 * Get memory configuration for debugging
 * @returns {Object} Configuration object (safe for logging)
 */
function getMemoryConfigSummary() {
  return {
    memoryDir: MEMORY_CONFIG.BASE_DIR,
    limits: {
      maxObservations: MEMORY_CONFIG.MAX_OBSERVATIONS,
      maxDecisions: MEMORY_CONFIG.MAX_DECISIONS,
      maxBlockers: MEMORY_CONFIG.MAX_BLOCKERS,
      maxKeyFacts: MEMORY_CONFIG.MAX_KEY_FACTS
    },
    retention: {
      memoryDays: MEMORY_CONFIG.MEMORY_RETENTION_DAYS,
      archiveDays: MEMORY_CONFIG.ARCHIVE_RETENTION_DAYS,
      backupDays: MEMORY_CONFIG.BACKUP_RETENTION_DAYS
    },
    validation: {
      enabled: MEMORY_CONFIG.ENABLE_INPUT_VALIDATION,
      maxTextLength: MEMORY_CONFIG.MAX_TEXT_LENGTH
    },
    qdrant: {
      host: MEMORY_CONFIG.QDRANT_HOST,
      port: MEMORY_CONFIG.QDRANT_PORT,
      collection: MEMORY_CONFIG.QDRANT_COLLECTION
    }
  };
}

module.exports = {
  MEMORY_CONFIG,
  getWorkingMemoryPath,
  getArchivePath,
  getBackupPath,
  getTempPath,
  validateAgentName,
  validateTextContent,
  sanitizeTextContent,
  getMemoryConfigSummary
};