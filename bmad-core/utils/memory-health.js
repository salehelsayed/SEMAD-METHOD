/**
 * Memory Health Monitor - Monitors and reports the health of short-term and long-term memory systems
 * Provides startup verification, periodic health checks, and status reporting for both
 * working memory files (.ai/ directory) and Qdrant vector database connectivity
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const VerboseLogger = require('./verbose-logger');

// Import configuration with fallback
let healthConfig;
try {
  healthConfig = require('./memory-health-config');
} catch (error) {
  // Fallback configuration if config file is missing
  healthConfig = {
    HEALTH_CONFIG: {
      MAX_HISTORY_ENTRIES: 50,
      MAX_STATUS_ENTRIES_PER_AGENT: 20,
      MAX_AGENTS_TRACKED: 100,
      CLEANUP_INTERVAL: 300000,
      HISTORY_CLEANUP_AGE_MS: 86400000,
      DISK_SPACE_CRITICAL_MB: 100,
      DISK_SPACE_WARNING_MB: 500,
      MEMORY_FILE_MODE: 0o600,
      MEMORY_DIR_MODE: 0o700,
      ENABLE_VERBOSE_LOGGING: false,
      HEALTH_CHECK_INTERVAL: 30000,
      FILE_ACCESS_TIMEOUT: 2000,
      TEMP_FILE_PREFIX: '.health_check_'
    },
    SEVERITY: {
      INFO: 'info',
      WARNING: 'warning',
      ERROR: 'error',
      CRITICAL: 'critical'
    },
    CHECK_TYPES: {
      WORKING_MEMORY_READ: 'working_memory_read',
      WORKING_MEMORY_WRITE: 'working_memory_write',
      QDRANT_CONNECTIVITY: 'qdrant_connectivity',
      QDRANT_OPERATIONS: 'qdrant_operations',
      DISK_SPACE: 'disk_space',
      MEMORY_DIRECTORY: 'memory_directory'
    }
  };
}

const { HEALTH_CONFIG, SEVERITY, CHECK_TYPES } = healthConfig;

// Initialize logger
const logger = new VerboseLogger({
  verbosity: HEALTH_CONFIG.ENABLE_VERBOSE_LOGGING,
  prefix: '🏥'
});

// Memory health status tracking with leak protection
const healthStatus = new Map();
const healthHistory = new Map();
let lastCleanup = Date.now();

// Start periodic cleanup to prevent memory leaks
setInterval(() => {
  cleanupHealthData();
}, HEALTH_CONFIG.CLEANUP_INTERVAL);

/**
 * Initialize dependencies with fallback handling
 */
function initializeDependencies() {
  let qdrantModule = null;
  let memoryConfig = null;
  let agentMemoryManager = null;

  try {
    qdrantModule = require('./qdrant');
  } catch (error) {
    logger.warn(`Qdrant module not available: ${error.message}`);
  }

  try {
    memoryConfig = require('./memory-config');
  } catch (error) {
    logger.warn(`Memory config not available: ${error.message}`);
  }

  try {
    agentMemoryManager = require('./agent-memory-manager');
  } catch (error) {
    logger.warn(`Agent memory manager not available: ${error.message}`);
  }

  return { qdrantModule, memoryConfig, agentMemoryManager };
}

// Initialize dependencies with fallback
let qdrantModule, memoryConfig, agentMemoryManager;
try {
  const deps = initializeDependencies();
  qdrantModule = deps.qdrantModule;
  memoryConfig = deps.memoryConfig;
  agentMemoryManager = deps.agentMemoryManager;
} catch (error) {
  logger.error('Critical dependency initialization failure', error);
  // Continue with limited functionality
}

/**
 * Clean up old health data to prevent memory leaks
 */
function cleanupHealthData() {
  const now = Date.now();
  const maxAge = HEALTH_CONFIG.HISTORY_CLEANUP_AGE_MS;
  
  // Clean up old history entries
  for (const [agentKey, history] of healthHistory.entries()) {
    const validEntries = history.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      return (now - entryTime) < maxAge;
    });
    
    if (validEntries.length === 0) {
      healthHistory.delete(agentKey);
      healthStatus.delete(agentKey);
    } else {
      healthHistory.set(agentKey, validEntries.slice(-HEALTH_CONFIG.MAX_HISTORY_ENTRIES));
    }
  }
  
  // Limit total number of agents tracked
  if (healthStatus.size > HEALTH_CONFIG.MAX_AGENTS_TRACKED) {
    const sortedAgents = Array.from(healthHistory.entries())
      .sort(([,a], [,b]) => {
        const aTime = Math.max(...a.map(e => new Date(e.timestamp).getTime()));
        const bTime = Math.max(...b.map(e => new Date(e.timestamp).getTime()));
        return aTime - bTime;
      })
      .slice(0, healthStatus.size - HEALTH_CONFIG.MAX_AGENTS_TRACKED);
    
    for (const [agentKey] of sortedAgents) {
      healthStatus.delete(agentKey);
      healthHistory.delete(agentKey);
    }
  }
  
  lastCleanup = now;
}

/**
 * Create a health status entry
 * @param {string} component - Component name (working_memory, qdrant, etc.)
 * @param {string} status - Status (healthy, degraded, unhealthy)
 * @param {string} message - Status message
 * @param {string} severity - Severity level
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Health status entry
 */
function createHealthEntry(component, status, message, severity = SEVERITY.INFO, metadata = {}) {
  return {
    component,
    status,
    message,
    severity,
    timestamp: new Date().toISOString(),
    metadata
  };
}

/**
 * Update health status for a component
 * @param {string} agentName - Agent name
 * @param {string} component - Component name
 * @param {Object} healthEntry - Health status entry
 */
function updateHealthStatus(agentName, component, healthEntry) {
  const agentKey = `${agentName}`;
  
  // Periodic cleanup check
  if (Date.now() - lastCleanup > HEALTH_CONFIG.CLEANUP_INTERVAL) {
    cleanupHealthData();
  }
  
  if (!healthStatus.has(agentKey)) {
    healthStatus.set(agentKey, new Map());
  }
  
  if (!healthHistory.has(agentKey)) {
    healthHistory.set(agentKey, []);
  }

  // Update current status with size limit
  const agentStatus = healthStatus.get(agentKey);
  agentStatus.set(component, healthEntry);
  
  // Limit status entries per agent
  if (agentStatus.size > HEALTH_CONFIG.MAX_STATUS_ENTRIES_PER_AGENT) {
    const oldestEntry = agentStatus.keys().next().value;
    agentStatus.delete(oldestEntry);
  }
  
  // Add to history
  const history = healthHistory.get(agentKey);
  history.push({...healthEntry, component});
  
  // Limit history size
  if (history.length > HEALTH_CONFIG.MAX_HISTORY_ENTRIES) {
    history.splice(0, history.length - HEALTH_CONFIG.MAX_HISTORY_ENTRIES);
  }
}

/**
 * Get memory directory path for agent
 * @param {string} agentName - Agent name
 * @returns {string} Memory directory path
 */
function getMemoryDirectory(agentName) {
  const baseDir = memoryConfig?.MEMORY_CONFIG?.baseDirectory || '.ai';
  return path.resolve(process.cwd(), baseDir);
}

/**
 * Get working memory file path for agent
 * @param {string} agentName - Agent name
 * @returns {string} Working memory file path
 */
function getWorkingMemoryPath(agentName) {
  const memoryDir = getMemoryDirectory(agentName);
  return path.join(memoryDir, `working_memory_${agentName}.json`);
}

/**
 * Check if memory directory exists and is accessible
 * @param {string} agentName - Agent name
 * @returns {Promise<Object>} Health check result
 */
async function checkMemoryDirectory(agentName) {
  const checkStart = Date.now();
  const memoryDir = getMemoryDirectory(agentName);
  
  try {
    // Check if directory exists
    const stats = await fs.stat(memoryDir);
    
    if (!stats.isDirectory()) {
      return createHealthEntry(
        CHECK_TYPES.MEMORY_DIRECTORY,
        'unhealthy',
        `Memory path exists but is not a directory: ${memoryDir}`,
        SEVERITY.ERROR,
        { path: memoryDir, checkDuration: Date.now() - checkStart }
      );
    }
    
    // Test write access by creating a temporary file with UUID for uniqueness
    const testFile = path.join(memoryDir, `${HEALTH_CONFIG.TEMP_FILE_PREFIX}${crypto.randomUUID()}`);
    
    try {
      await fs.writeFile(testFile, 'health_check', { encoding: 'utf8', mode: HEALTH_CONFIG.MEMORY_FILE_MODE });
      await fs.unlink(testFile);
    } catch (accessError) {
      return createHealthEntry(
        CHECK_TYPES.MEMORY_DIRECTORY,
        'unhealthy',
        `Memory directory not writable: ${memoryDir}`,
        SEVERITY.ERROR,
        { 
          path: memoryDir, 
          error: accessError.message,
          checkDuration: Date.now() - checkStart
        }
      );
    }
    
    return createHealthEntry(
      CHECK_TYPES.MEMORY_DIRECTORY,
      'healthy',
      `Memory directory accessible: ${memoryDir}`,
      SEVERITY.INFO,
      { path: memoryDir, checkDuration: Date.now() - checkStart }
    );
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Directory doesn't exist, try to create it
      try {
        await fs.mkdir(memoryDir, { recursive: true, mode: HEALTH_CONFIG.MEMORY_DIR_MODE });
        return createHealthEntry(
          CHECK_TYPES.MEMORY_DIRECTORY,
          'healthy',
          `Memory directory created: ${memoryDir}`,
          SEVERITY.INFO,
          { path: memoryDir, created: true, checkDuration: Date.now() - checkStart }
        );
      } catch (createError) {
        return createHealthEntry(
          CHECK_TYPES.MEMORY_DIRECTORY,
          'unhealthy',
          `Failed to create memory directory: ${memoryDir}`,
          SEVERITY.CRITICAL,
          { 
            path: memoryDir, 
            error: createError.message,
            checkDuration: Date.now() - checkStart
          }
        );
      }
    }
    
    return createHealthEntry(
      CHECK_TYPES.MEMORY_DIRECTORY,
      'unhealthy',
      `Memory directory check failed: ${error.message}`,
      SEVERITY.ERROR,
      { path: memoryDir, error: error.message, checkDuration: Date.now() - checkStart }
    );
  }
}

/**
 * Check working memory read access
 * @param {string} agentName - Agent name
 * @returns {Promise<Object>} Health check result
 */
async function checkWorkingMemoryRead(agentName) {
  const checkStart = Date.now();
  const memoryPath = getWorkingMemoryPath(agentName);
  
  try {
    // First check if file exists
    const exists = await fs.access(memoryPath).then(() => true).catch(() => false);
    
    if (!exists) {
      return createHealthEntry(
        CHECK_TYPES.WORKING_MEMORY_READ,
        'healthy',
        `Working memory file does not exist yet (will be created on first use): ${memoryPath}`,
        SEVERITY.INFO,
        { path: memoryPath, exists: false, checkDuration: Date.now() - checkStart }
      );
    }
    
    // Try to read the file with timeout
    const readPromise = fs.readFile(memoryPath, 'utf8');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Read timeout')), HEALTH_CONFIG.FILE_ACCESS_TIMEOUT)
    );
    
    const content = await Promise.race([readPromise, timeoutPromise]);
    
    // Try to parse as JSON to ensure it's valid
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (parseError) {
      return createHealthEntry(
        CHECK_TYPES.WORKING_MEMORY_READ,
        'degraded',
        `Working memory file contains invalid JSON: ${memoryPath}`,
        SEVERITY.WARNING,
        { 
          path: memoryPath, 
          error: parseError.message,
          contentLength: content.length,
          checkDuration: Date.now() - checkStart
        }
      );
    }
    
    return createHealthEntry(
      CHECK_TYPES.WORKING_MEMORY_READ,
      'healthy',
      `Working memory file readable: ${memoryPath}`,
      SEVERITY.INFO,
      { 
        path: memoryPath, 
        contentLength: content.length,
        hasObservations: Array.isArray(parsedContent.observations),
        observationCount: parsedContent.observations?.length || 0,
        checkDuration: Date.now() - checkStart
      }
    );
    
  } catch (error) {
    let severity = SEVERITY.ERROR;
    let status = 'unhealthy';
    
    if (error.message === 'Read timeout') {
      severity = SEVERITY.WARNING;
      status = 'degraded';
    }
    
    return createHealthEntry(
      CHECK_TYPES.WORKING_MEMORY_READ,
      status,
      `Working memory read failed: ${error.message}`,
      severity,
      { path: memoryPath, error: error.message, checkDuration: Date.now() - checkStart }
    );
  }
}

/**
 * Check working memory write access
 * @param {string} agentName - Agent name
 * @returns {Promise<Object>} Health check result
 */
async function checkWorkingMemoryWrite(agentName) {
  const checkStart = Date.now();
  const memoryPath = getWorkingMemoryPath(agentName);
  
  try {
    // Create a minimal test memory structure
    const testMemory = {
      agentName,
      lastUpdated: new Date().toISOString(),
      healthCheck: true,
      observations: [],
      decisions: [],
      keyFacts: {},
      blockers: []
    };
    
    // First ensure the directory exists with proper permissions
    const memoryDir = path.dirname(memoryPath);
    await fs.mkdir(memoryDir, { recursive: true, mode: HEALTH_CONFIG.MEMORY_DIR_MODE });
    
    // Write test memory with timeout and proper permissions
    const writePromise = fs.writeFile(memoryPath, JSON.stringify(testMemory, null, 2), { 
      encoding: 'utf8', 
      mode: HEALTH_CONFIG.MEMORY_FILE_MODE 
    });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Write timeout')), HEALTH_CONFIG.FILE_ACCESS_TIMEOUT)
    );
    
    await Promise.race([writePromise, timeoutPromise]);
    
    // Verify the write by reading back
    const verifyContent = await fs.readFile(memoryPath, 'utf8');
    const parsedVerify = JSON.parse(verifyContent);
    
    if (!parsedVerify.healthCheck) {
      return createHealthEntry(
        CHECK_TYPES.WORKING_MEMORY_WRITE,
        'degraded',
        `Working memory write verification failed: ${memoryPath}`,
        SEVERITY.WARNING,
        { path: memoryPath, checkDuration: Date.now() - checkStart }
      );
    }
    
    return createHealthEntry(
      CHECK_TYPES.WORKING_MEMORY_WRITE,
      'healthy',
      `Working memory file writable: ${memoryPath}`,
      SEVERITY.INFO,
      { path: memoryPath, checkDuration: Date.now() - checkStart }
    );
    
  } catch (error) {
    let severity = SEVERITY.ERROR;
    let status = 'unhealthy';
    
    if (error.message === 'Write timeout') {
      severity = SEVERITY.WARNING;
      status = 'degraded';
    }
    
    return createHealthEntry(
      CHECK_TYPES.WORKING_MEMORY_WRITE,
      status,
      `Working memory write failed: ${error.message}`,
      severity,
      { path: memoryPath, error: error.message, checkDuration: Date.now() - checkStart }
    );
  }
}

/**
 * Check Qdrant connectivity
 * @param {string} agentName - Agent name
 * @returns {Promise<Object>} Health check result
 */
async function checkQdrantConnectivity(agentName) {
  const checkStart = Date.now();
  
  if (!qdrantModule) {
    return createHealthEntry(
      CHECK_TYPES.QDRANT_CONNECTIVITY,
      'unhealthy',
      'Qdrant module not available',
      SEVERITY.WARNING,
      { reason: 'module_unavailable', checkDuration: Date.now() - checkStart }
    );
  }
  
  try {
    // Use the built-in health check function
    const isHealthy = await qdrantModule.checkQdrantHealth();
    
    if (isHealthy) {
      return createHealthEntry(
        CHECK_TYPES.QDRANT_CONNECTIVITY,
        'healthy',
        'Qdrant connection healthy',
        SEVERITY.INFO,
        { checkDuration: Date.now() - checkStart }
      );
    } else {
      return createHealthEntry(
        CHECK_TYPES.QDRANT_CONNECTIVITY,
        'unhealthy',
        'Qdrant connection failed',
        SEVERITY.WARNING,
        { reason: 'connection_failed', checkDuration: Date.now() - checkStart }
      );
    }
    
  } catch (error) {
    return createHealthEntry(
      CHECK_TYPES.QDRANT_CONNECTIVITY,
      'unhealthy',
      `Qdrant connectivity check failed: ${error.message}`,
      SEVERITY.WARNING,
      { error: error.message, checkDuration: Date.now() - checkStart }
    );
  }
}

/**
 * Check Qdrant operations (store/retrieve)
 * @param {string} agentName - Agent name
 * @returns {Promise<Object>} Health check result
 */
async function checkQdrantOperations(agentName) {
  const checkStart = Date.now();
  
  if (!qdrantModule) {
    return createHealthEntry(
      CHECK_TYPES.QDRANT_OPERATIONS,
      'unhealthy',
      'Qdrant module not available',
      SEVERITY.WARNING,
      { reason: 'module_unavailable', checkDuration: Date.now() - checkStart }
    );
  }
  
  try {
    // Test store operation
    const testText = `Health check test for ${agentName} at ${new Date().toISOString()}`;
    const testMetadata = {
      agent: agentName,
      healthCheck: true,
      timestamp: new Date().toISOString()
    };
    
    const storeId = await qdrantModule.storeMemorySnippet(agentName, testText, testMetadata);
    
    if (!storeId) {
      return createHealthEntry(
        CHECK_TYPES.QDRANT_OPERATIONS,
        'degraded',
        'Qdrant store operation returned null ID',
        SEVERITY.WARNING,
        { operation: 'store', checkDuration: Date.now() - checkStart }
      );
    }
    
    // Test retrieve operation
    const retrieveResults = await qdrantModule.retrieveMemory('health check test', 1, { agent: agentName });
    
    if (!Array.isArray(retrieveResults)) {
      return createHealthEntry(
        CHECK_TYPES.QDRANT_OPERATIONS,
        'degraded',
        'Qdrant retrieve operation returned invalid results',
        SEVERITY.WARNING,
        { operation: 'retrieve', checkDuration: Date.now() - checkStart }
      );
    }
    
    return createHealthEntry(
      CHECK_TYPES.QDRANT_OPERATIONS,
      'healthy',
      'Qdrant operations working correctly',
      SEVERITY.INFO,
      { 
        storeId: storeId.toString(),
        retrieveCount: retrieveResults.length,
        checkDuration: Date.now() - checkStart
      }
    );
    
  } catch (error) {
    return createHealthEntry(
      CHECK_TYPES.QDRANT_OPERATIONS,
      'unhealthy',
      `Qdrant operations check failed: ${error.message}`,
      SEVERITY.WARNING,
      { error: error.message, checkDuration: Date.now() - checkStart }
    );
  }
}

/**
 * Check available disk space
 * @param {string} agentName - Agent name
 * @returns {Promise<Object>} Health check result
 */
async function checkDiskSpace(agentName) {
  const checkStart = Date.now();
  const memoryDir = getMemoryDirectory(agentName);
  
  try {
    const stats = await fs.statfs ? fs.statfs(memoryDir) : null;
    
    if (!stats) {
      // Fallback to basic check if statfs not available
      return createHealthEntry(
        CHECK_TYPES.DISK_SPACE,
        'healthy',
        'Disk space check not available on this platform',
        SEVERITY.INFO,
        { platform: os.platform(), checkDuration: Date.now() - checkStart }
      );
    }
    
    const freeBytes = stats.bavail * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    const usagePercent = (usedBytes / totalBytes) * 100;
    
    const freeMB = Math.round(freeBytes / (1024 * 1024));
    const totalMB = Math.round(totalBytes / (1024 * 1024));
    
    let status = 'healthy';
    let severity = SEVERITY.INFO;
    let message = `Disk space: ${freeMB}MB free of ${totalMB}MB (${usagePercent.toFixed(1)}% used)`;
    
    if (freeMB < HEALTH_CONFIG.DISK_SPACE_CRITICAL_MB) {
      status = 'unhealthy';
      severity = SEVERITY.CRITICAL;
      message = `Critical: Low disk space - ${freeMB}MB free of ${totalMB}MB`;
    } else if (freeMB < HEALTH_CONFIG.DISK_SPACE_WARNING_MB) {
      status = 'degraded';
      severity = SEVERITY.WARNING;
      message = `Warning: Low disk space - ${freeMB}MB free of ${totalMB}MB`;
    }
    
    return createHealthEntry(
      CHECK_TYPES.DISK_SPACE,
      status,
      message,
      severity,
      { 
        freeMB, 
        totalMB, 
        usagePercent: parseFloat(usagePercent.toFixed(1)),
        path: memoryDir,
        checkDuration: Date.now() - checkStart
      }
    );
    
  } catch (error) {
    return createHealthEntry(
      CHECK_TYPES.DISK_SPACE,
      'degraded',
      `Disk space check failed: ${error.message}`,
      SEVERITY.WARNING,
      { error: error.message, path: memoryDir, checkDuration: Date.now() - checkStart }
    );
  }
}

/**
 * Perform comprehensive health check for an agent
 * @param {string} agentName - Agent name
 * @param {Object} options - Check options
 * @param {boolean} options.skipQdrant - Skip Qdrant checks
 * @param {boolean} options.skipOperations - Skip operation tests
 * @returns {Promise<Object>} Comprehensive health status
 */
async function performHealthCheck(agentName, options = {}) {
  const checkStart = Date.now();
  const results = {
    agentName,
    timestamp: new Date().toISOString(),
    overallStatus: 'healthy',
    checks: {},
    summary: {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      total: 0
    },
    recommendations: []
  };
  
  try {
    // Validate agent name
    if (!agentName || typeof agentName !== 'string') {
      throw new Error('Invalid agent name provided');
    }
    
    // Perform all health checks
    const checks = [];
    
    // Memory directory check
    checks.push(['memoryDirectory', checkMemoryDirectory(agentName)]);
    
    // Working memory checks
    checks.push(['workingMemoryRead', checkWorkingMemoryRead(agentName)]);
    checks.push(['workingMemoryWrite', checkWorkingMemoryWrite(agentName)]);
    
    // Qdrant checks (if not skipped)
    if (!options.skipQdrant) {
      checks.push(['qdrantConnectivity', checkQdrantConnectivity(agentName)]);
      
      if (!options.skipOperations) {
        checks.push(['qdrantOperations', checkQdrantOperations(agentName)]);
      }
    }
    
    // Disk space check
    checks.push(['diskSpace', checkDiskSpace(agentName)]);
    
    // Wait for all checks to complete
    const checkResults = await Promise.all(checks.map(([name, promise]) => 
      promise.then(result => [name, result]).catch(error => [name, createHealthEntry(
        name,
        'unhealthy',
        `Health check failed: ${error.message}`,
        SEVERITY.ERROR,
        { error: error.message }
      )])
    ));
    
    // Process results
    for (const [checkName, checkResult] of checkResults) {
      results.checks[checkName] = checkResult;
      results.summary.total++;
      
      // Update health status
      updateHealthStatus(agentName, checkResult.component || checkName, checkResult);
      
      // Count status types
      if (checkResult.status === 'healthy') {
        results.summary.healthy++;
      } else if (checkResult.status === 'degraded') {
        results.summary.degraded++;
      } else {
        results.summary.unhealthy++;
      }
      
      // Generate recommendations
      if (checkResult.status !== 'healthy') {
        results.recommendations.push(generateRecommendation(checkResult));
      }
    }
    
    // Determine overall status
    if (results.summary.unhealthy > 0) {
      results.overallStatus = 'unhealthy';
    } else if (results.summary.degraded > 0) {
      results.overallStatus = 'degraded';
    }
    
    results.checkDuration = Date.now() - checkStart;
    
    // Log results based on status
    if (results.overallStatus !== 'healthy') {
      logger.warn(`Agent ${agentName} memory health: ${results.overallStatus} (${results.summary.unhealthy} unhealthy, ${results.summary.degraded} degraded)`);
    }
    
    return results;
    
  } catch (error) {
    const errorResult = {
      agentName,
      timestamp: new Date().toISOString(),
      overallStatus: 'unhealthy',
      error: error.message,
      checkDuration: Date.now() - checkStart,
      recommendations: [`Fix health check error: ${error.message}`]
    };
    
    logger.error(`Health check failed for agent ${agentName}`, error);
    return errorResult;
  }
}

/**
 * Generate recommendation based on health check result
 * @param {Object} checkResult - Health check result
 * @returns {string} Recommendation text
 */
function generateRecommendation(checkResult) {
  switch (checkResult.component) {
    case CHECK_TYPES.MEMORY_DIRECTORY:
      if (checkResult.status === 'unhealthy') {
        return `Ensure the memory directory exists and is writable: ${checkResult.metadata?.path}`;
      }
      break;
      
    case CHECK_TYPES.WORKING_MEMORY_READ:
      if (checkResult.status === 'unhealthy') {
        return `Check working memory file permissions and integrity: ${checkResult.metadata?.path}`;
      } else if (checkResult.status === 'degraded') {
        return `Working memory file contains invalid JSON, consider resetting: ${checkResult.metadata?.path}`;
      }
      break;
      
    case CHECK_TYPES.WORKING_MEMORY_WRITE:
      if (checkResult.status === 'unhealthy') {
        return `Ensure write permissions to memory directory and sufficient disk space`;
      }
      break;
      
    case CHECK_TYPES.QDRANT_CONNECTIVITY:
      if (checkResult.status === 'unhealthy') {
        return `Check Qdrant server status and network connectivity. Start Qdrant or update configuration.`;
      }
      break;
      
    case CHECK_TYPES.QDRANT_OPERATIONS:
      if (checkResult.status === 'unhealthy') {
        return `Qdrant operations failing. Check server health and collection configuration.`;
      }
      break;
      
    case CHECK_TYPES.DISK_SPACE:
      if (checkResult.status === 'unhealthy') {
        return `Critical: Free up disk space immediately. Available: ${checkResult.metadata?.freeMB}MB`;
      } else if (checkResult.status === 'degraded') {
        return `Warning: Monitor disk space usage. Available: ${checkResult.metadata?.freeMB}MB`;
      }
      break;
      
    default:
      return `Address ${checkResult.component} issue: ${checkResult.message}`;
  }
  
  return `Monitor ${checkResult.component}: ${checkResult.message}`;
}

/**
 * Get current health status for an agent
 * @param {string} agentName - Agent name
 * @returns {Object|null} Current health status or null if not available
 */
function getCurrentHealthStatus(agentName) {
  const agentKey = `${agentName}`;
  const agentStatus = healthStatus.get(agentKey);
  
  if (!agentStatus) {
    return null;
  }
  
  const status = {
    agentName,
    timestamp: new Date().toISOString(),
    components: {},
    overallStatus: 'healthy',
    summary: {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      total: 0
    }
  };
  
  for (const [component, health] of agentStatus.entries()) {
    status.components[component] = health;
    status.summary.total++;
    
    if (health.status === 'healthy') {
      status.summary.healthy++;
    } else if (health.status === 'degraded') {
      status.summary.degraded++;
    } else {
      status.summary.unhealthy++;
    }
  }
  
  // Determine overall status
  if (status.summary.unhealthy > 0) {
    status.overallStatus = 'unhealthy';
  } else if (status.summary.degraded > 0) {
    status.overallStatus = 'degraded';
  }
  
  return status;
}

/**
 * Get health history for an agent
 * @param {string} agentName - Agent name
 * @param {number} limit - Maximum number of history entries to return
 * @returns {Array} Health history entries
 */
function getHealthHistory(agentName, limit = 20) {
  const agentKey = `${agentName}`;
  const history = healthHistory.get(agentKey) || [];
  
  return history.slice(-limit);
}

/**
 * Get aggregated health status for all agents
 * @returns {Object} Aggregated health status
 */
function getAggregatedHealthStatus() {
  const aggregated = {
    timestamp: new Date().toISOString(),
    agents: {},
    summary: {
      totalAgents: 0,
      healthyAgents: 0,
      degradedAgents: 0,
      unhealthyAgents: 0,
      totalChecks: 0,
      healthyChecks: 0,
      degradedChecks: 0,
      unhealthyChecks: 0
    },
    recommendations: [],
    criticalIssues: []
  };
  
  for (const [agentKey, agentStatus] of healthStatus.entries()) {
    const agentName = agentKey;
    const status = getCurrentHealthStatus(agentName);
    
    if (status) {
      aggregated.agents[agentName] = status;
      aggregated.summary.totalAgents++;
      aggregated.summary.totalChecks += status.summary.total;
      aggregated.summary.healthyChecks += status.summary.healthy;
      aggregated.summary.degradedChecks += status.summary.degraded;
      aggregated.summary.unhealthyChecks += status.summary.unhealthy;
      
      if (status.overallStatus === 'healthy') {
        aggregated.summary.healthyAgents++;
      } else if (status.overallStatus === 'degraded') {
        aggregated.summary.degradedAgents++;
      } else {
        aggregated.summary.unhealthyAgents++;
      }
      
      // Collect critical issues and recommendations
      for (const [component, health] of Object.entries(status.components)) {
        if (health.severity === SEVERITY.CRITICAL) {
          aggregated.criticalIssues.push({
            agent: agentName,
            component,
            message: health.message,
            timestamp: health.timestamp
          });
        }
        
        if (health.status !== 'healthy') {
          aggregated.recommendations.push({
            agent: agentName,
            component,
            recommendation: generateRecommendation(health),
            severity: health.severity
          });
        }
      }
    }
  }
  
  return aggregated;
}

/**
 * Clear health status for testing or reset purposes
 * @param {string} agentName - Agent name (optional, clears all if not provided)
 */
function clearHealthStatus(agentName = null) {
  if (agentName) {
    const agentKey = `${agentName}`;
    healthStatus.delete(agentKey);
    healthHistory.delete(agentKey);
  } else {
    healthStatus.clear();
    healthHistory.clear();
  }
}

/**
 * Start periodic health monitoring for an agent
 * @param {string} agentName - Agent name
 * @param {number} intervalMs - Check interval in milliseconds
 * @param {Object} options - Monitoring options
 * @returns {Function} Stop monitoring function
 */
function startPeriodicMonitoring(agentName, intervalMs = HEALTH_CONFIG.HEALTH_CHECK_INTERVAL, options = {}) {
  let isRunning = true;
  
  const runCheck = async () => {
    if (!isRunning) return;
    
    try {
      await performHealthCheck(agentName, { skipOperations: true, ...options });
    } catch (error) {
      logger.error(`Periodic check failed for ${agentName}`, error);
    }
    
    if (isRunning) {
      setTimeout(runCheck, intervalMs);
    }
  };
  
  // Start first check after a brief delay
  setTimeout(runCheck, 1000);
  
  // Return stop function
  return () => {
    isRunning = false;
  };
}

// Export with error handling for critical dependency failures
try {
  module.exports = {
    // Core health check functions
    performHealthCheck,
    getCurrentHealthStatus,
    getHealthHistory,
    getAggregatedHealthStatus,
    
    // Individual check functions
    checkMemoryDirectory,
    checkWorkingMemoryRead,
    checkWorkingMemoryWrite,
    checkQdrantConnectivity,
    checkQdrantOperations,
    checkDiskSpace,
    
    // Monitoring functions
    startPeriodicMonitoring,
    clearHealthStatus,
    
    // Constants
    SEVERITY,
    CHECK_TYPES,
    HEALTH_CONFIG,
    
    // Memory management
    cleanupHealthData,
    
    // Utility functions
    createHealthEntry,
    generateRecommendation,
    getMemoryDirectory,
    getWorkingMemoryPath
  };
} catch (error) {
  // Fallback exports in case of critical failures
  console.error('[MemoryHealth] Critical error during module export:', error.message);
  module.exports = {
    performHealthCheck: () => Promise.resolve({ 
      agentName: 'unknown', 
      overallStatus: 'unhealthy', 
      error: 'Module initialization failed' 
    }),
    getCurrentHealthStatus: () => null,
    getHealthHistory: () => [],
    getAggregatedHealthStatus: () => ({ error: 'Module initialization failed' }),
    clearHealthStatus: () => {},
    startPeriodicMonitoring: () => () => {},
    SEVERITY: { INFO: 'info', WARNING: 'warning', ERROR: 'error', CRITICAL: 'critical' },
    CHECK_TYPES: {},
    HEALTH_CONFIG: {}
  };
}