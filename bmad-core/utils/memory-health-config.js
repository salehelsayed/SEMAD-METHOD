/**
 * Memory Health Configuration - Centralized configuration for memory health monitoring
 * Provides tunable settings for health check intervals, timeouts, and thresholds
 */

/**
 * Health monitoring configuration
 */
const HEALTH_CONFIG = {
  // Health check intervals and timeouts
  HEALTH_CHECK_INTERVAL: parseInt(process.env.BMAD_HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
  HEALTH_CHECK_TIMEOUT: parseInt(process.env.BMAD_HEALTH_CHECK_TIMEOUT) || 5000, // 5 seconds
  FILE_ACCESS_TIMEOUT: parseInt(process.env.BMAD_FILE_ACCESS_TIMEOUT) || 2000, // 2 seconds
  
  // History and status tracking
  MAX_HISTORY_ENTRIES: parseInt(process.env.BMAD_MAX_HEALTH_HISTORY) || 50,
  MAX_STATUS_ENTRIES_PER_AGENT: parseInt(process.env.BMAD_MAX_STATUS_ENTRIES) || 20,
  CLEANUP_INTERVAL: parseInt(process.env.BMAD_HEALTH_CLEANUP_INTERVAL) || 300000, // 5 minutes
  
  // Memory leak protection
  MAX_AGENTS_TRACKED: parseInt(process.env.BMAD_MAX_AGENTS_TRACKED) || 100,
  HISTORY_CLEANUP_AGE_MS: parseInt(process.env.BMAD_HISTORY_CLEANUP_AGE_MS) || 86400000, // 24 hours
  
  // Disk space thresholds
  DISK_SPACE_CRITICAL_MB: parseInt(process.env.BMAD_DISK_CRITICAL_MB) || 100,
  DISK_SPACE_WARNING_MB: parseInt(process.env.BMAD_DISK_WARNING_MB) || 500,
  
  // File permissions
  MEMORY_FILE_MODE: parseInt(process.env.BMAD_MEMORY_FILE_MODE) || 0o600, // Owner read/write only
  MEMORY_DIR_MODE: parseInt(process.env.BMAD_MEMORY_DIR_MODE) || 0o700,   // Owner full access only
  
  // Logging and monitoring
  ENABLE_VERBOSE_LOGGING: process.env.BMAD_HEALTH_VERBOSE === 'true',
  ENABLE_PERFORMANCE_TRACKING: process.env.BMAD_HEALTH_PERF_TRACKING === 'true',
  LOG_HEALTH_CHECKS: process.env.BMAD_LOG_HEALTH_CHECKS === 'true',
  
  // Periodic monitoring
  DEFAULT_MONITORING_INTERVAL: parseInt(process.env.BMAD_DEFAULT_MONITORING_INTERVAL) || 30000,
  MONITORING_STARTUP_DELAY: parseInt(process.env.BMAD_MONITORING_STARTUP_DELAY) || 1000,
  
  // Retry and resilience
  MAX_CHECK_RETRIES: parseInt(process.env.BMAD_MAX_CHECK_RETRIES) || 3,
  RETRY_DELAY_MS: parseInt(process.env.BMAD_RETRY_DELAY_MS) || 1000,
  
  // Security settings  
  ENABLE_TEMP_FILE_ENCRYPTION: process.env.BMAD_ENCRYPT_TEMP_FILES === 'true',
  TEMP_FILE_PREFIX: process.env.BMAD_TEMP_FILE_PREFIX || '.health_check_',
  
  // Feature flags
  ENABLE_QDRANT_CHECKS: process.env.BMAD_ENABLE_QDRANT_CHECKS !== 'false',
  ENABLE_OPERATION_TESTS: process.env.BMAD_ENABLE_OPERATION_TESTS !== 'false',
  ENABLE_DISK_SPACE_CHECKS: process.env.BMAD_ENABLE_DISK_SPACE_CHECKS !== 'false'
};

/**
 * Severity levels for health issues
 */
const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning', 
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Health check types
 */
const CHECK_TYPES = {
  WORKING_MEMORY_READ: 'working_memory_read',
  WORKING_MEMORY_WRITE: 'working_memory_write',
  QDRANT_CONNECTIVITY: 'qdrant_connectivity',
  QDRANT_OPERATIONS: 'qdrant_operations',
  DISK_SPACE: 'disk_space',
  MEMORY_DIRECTORY: 'memory_directory'
};

/**
 * Validate health configuration on startup
 */
function validateHealthConfig() {
  const errors = [];
  
  if (HEALTH_CONFIG.HEALTH_CHECK_INTERVAL < 1000) {
    errors.push('HEALTH_CHECK_INTERVAL must be at least 1000ms');
  }
  
  if (HEALTH_CONFIG.FILE_ACCESS_TIMEOUT > HEALTH_CONFIG.HEALTH_CHECK_TIMEOUT) {
    errors.push('FILE_ACCESS_TIMEOUT should not exceed HEALTH_CHECK_TIMEOUT');
  }
  
  if (HEALTH_CONFIG.MAX_HISTORY_ENTRIES < 1) {
    errors.push('MAX_HISTORY_ENTRIES must be at least 1');
  }
  
  if (HEALTH_CONFIG.MAX_AGENTS_TRACKED < 1) {
    errors.push('MAX_AGENTS_TRACKED must be at least 1');
  }
  
  if (errors.length > 0) {
    throw new Error(`Health configuration validation failed: ${errors.join(', ')}`);
  }
}

/**
 * Get health configuration summary for debugging
 * @returns {Object} Configuration summary
 */
function getHealthConfigSummary() {
  return {
    intervals: {
      healthCheck: HEALTH_CONFIG.HEALTH_CHECK_INTERVAL,
      cleanup: HEALTH_CONFIG.CLEANUP_INTERVAL,
      monitoring: HEALTH_CONFIG.DEFAULT_MONITORING_INTERVAL
    },
    timeouts: {
      healthCheck: HEALTH_CONFIG.HEALTH_CHECK_TIMEOUT,
      fileAccess: HEALTH_CONFIG.FILE_ACCESS_TIMEOUT
    },
    limits: {
      historyEntries: HEALTH_CONFIG.MAX_HISTORY_ENTRIES,
      statusEntries: HEALTH_CONFIG.MAX_STATUS_ENTRIES_PER_AGENT,
      maxAgents: HEALTH_CONFIG.MAX_AGENTS_TRACKED
    },
    diskSpace: {
      criticalMB: HEALTH_CONFIG.DISK_SPACE_CRITICAL_MB,
      warningMB: HEALTH_CONFIG.DISK_SPACE_WARNING_MB
    },
    features: {
      qdrantChecks: HEALTH_CONFIG.ENABLE_QDRANT_CHECKS,
      operationTests: HEALTH_CONFIG.ENABLE_OPERATION_TESTS,
      diskSpaceChecks: HEALTH_CONFIG.ENABLE_DISK_SPACE_CHECKS,
      verboseLogging: HEALTH_CONFIG.ENABLE_VERBOSE_LOGGING
    }
  };
}

// Validate configuration on module load
try {
  validateHealthConfig();
} catch (error) {
  console.warn('[MemoryHealthConfig] Configuration validation warning:', error.message);
}

module.exports = {
  HEALTH_CONFIG,
  SEVERITY,
  CHECK_TYPES,
  validateHealthConfig,
  getHealthConfigSummary
};