/**
 * Safe File Operations - Provides atomic write operations with file locking
 * Prevents memory file corruption during concurrent access
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// In-memory lock tracking for file operations
const fileLocks = new Map();
const LOCK_TIMEOUT = 10000; // 10 seconds
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 100; // milliseconds

/**
 * Generate a unique lock ID for a file
 * @param {string} filePath - Path to the file
 * @returns {string} Lock ID
 */
function generateLockId(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

/**
 * Acquire a lock for a file
 * @param {string} filePath - Path to the file
 * @param {number} timeout - Lock timeout in milliseconds
 * @returns {Promise<string>} Lock token
 */
async function acquireLock(filePath, timeout = LOCK_TIMEOUT) {
  const lockId = generateLockId(filePath);
  const lockToken = `${Date.now()}_${Math.random().toString(36)}`;
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const tryAcquire = () => {
      const existingLock = fileLocks.get(lockId);
      
      // Check if existing lock has expired
      if (existingLock && (Date.now() - existingLock.timestamp) > timeout) {
        fileLocks.delete(lockId);
      }
      
      // Try to acquire lock
      if (!fileLocks.has(lockId)) {
        fileLocks.set(lockId, {
          token: lockToken,
          timestamp: Date.now(),
          filePath
        });
        resolve(lockToken);
        return;
      }
      
      // Check timeout
      if (Date.now() - startTime > timeout) {
        reject(new Error(`Failed to acquire lock for ${filePath} within ${timeout}ms`));
        return;
      }
      
      // Retry after delay
      setTimeout(tryAcquire, 10);
    };
    
    tryAcquire();
  });
}

/**
 * Release a file lock
 * @param {string} filePath - Path to the file
 * @param {string} lockToken - Lock token from acquisition
 */
function releaseLock(filePath, lockToken) {
  const lockId = generateLockId(filePath);
  const existingLock = fileLocks.get(lockId);
  
  if (existingLock && existingLock.token === lockToken) {
    fileLocks.delete(lockId);
  }
}

/**
 * Atomically write data to a file with locking
 * @param {string} filePath - Path to the file
 * @param {string} data - Data to write
 * @param {Object} options - Write options
 * @returns {Promise<boolean>} Success status
 */
async function atomicWrite(filePath, data, options = {}) {
  const { encoding = 'utf8', timeout = LOCK_TIMEOUT } = options;
  let lockToken = null;
  
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Acquire lock
    lockToken = await acquireLock(filePath, timeout);
    
    // Write to temporary file first
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, data, { encoding });
    
    // Atomically rename temp file to target file
    await fs.rename(tempPath, filePath);
    
    return true;
  } catch (error) {
    console.error(`Atomic write failed for ${filePath}:`, error.message);
    
    // Clean up temp file if it exists
    try {
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      await fs.unlink(tempPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw error;
  } finally {
    // Always release lock
    if (lockToken) {
      releaseLock(filePath, lockToken);
    }
  }
}

/**
 * Safely read a file with retry logic
 * @param {string} filePath - Path to the file
 * @param {Object} options - Read options
 * @returns {Promise<string>} File contents
 */
async function safeRead(filePath, options = {}) {
  const { encoding = 'utf8', retries = MAX_RETRY_ATTEMPTS } = options;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fs.readFile(filePath, { encoding });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist
        throw error;
      }
      
      if (attempt === retries) {
        // Final attempt failed
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
    }
  }
}

/**
 * Safely parse JSON with validation
 * @param {string} jsonString - JSON string to parse
 * @param {string} filePath - File path for error context
 * @returns {Object} Parsed JSON object
 */
function safeJsonParse(jsonString, filePath = 'unknown') {
  try {
    const parsed = JSON.parse(jsonString);
    
    // Basic validation - ensure it's an object
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error('Parsed JSON is not an object');
    }
    
    return parsed;
  } catch (error) {
    throw new Error(`JSON parse error in ${filePath}: ${error.message}`);
  }
}

/**
 * Safely read and parse JSON file
 * @param {string} filePath - Path to JSON file
 * @param {Object} defaultValue - Default value if file doesn't exist
 * @param {Object} options - Read options
 * @returns {Promise<Object>} Parsed JSON object
 */
async function safeReadJson(filePath, defaultValue = {}, options = {}) {
  try {
    const content = await safeRead(filePath, options);
    return safeJsonParse(content, filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return default
      return defaultValue;
    }
    throw error;
  }
}

/**
 * Safely write JSON to file with atomic operations
 * @param {string} filePath - Path to JSON file
 * @param {Object} data - Data to write
 * @param {Object} options - Write options
 * @returns {Promise<boolean>} Success status
 */
async function safeWriteJson(filePath, data, options = {}) {
  const { indent = 2, timeout = LOCK_TIMEOUT } = options;
  
  // Validate data can be serialized
  try {
    JSON.stringify(data);
  } catch (error) {
    throw new Error(`Cannot serialize data for ${filePath}: ${error.message}`);
  }
  
  const jsonString = JSON.stringify(data, null, indent);
  return await atomicWrite(filePath, jsonString, { timeout });
}

/**
 * Update JSON file with a function, ensuring atomic operations
 * @param {string} filePath - Path to JSON file
 * @param {Function} updateFn - Function to update the data (data) => newData
 * @param {Object} defaultValue - Default value if file doesn't exist
 * @param {Object} options - Options
 * @returns {Promise<Object>} Updated data
 */
async function updateJsonFile(filePath, updateFn, defaultValue = {}, options = {}) {
  const { timeout = LOCK_TIMEOUT } = options;
  let lockToken = null;
  
  try {
    // Acquire lock for the entire read-modify-write operation
    lockToken = await acquireLock(filePath, timeout);
    
    // Read current data
    const currentData = await safeReadJson(filePath, defaultValue);
    
    // Apply update function
    const updatedData = await updateFn(currentData);
    
    // Validate update function returned something
    if (updatedData === undefined) {
      throw new Error('Update function returned undefined');
    }
    
    // Write updated data
    await safeWriteJson(filePath, updatedData, { timeout: 0 }); // No need for separate lock
    
    return updatedData;
  } finally {
    if (lockToken) {
      releaseLock(filePath, lockToken);
    }
  }
}

/**
 * Get current lock status for diagnostics
 * @returns {Array} Array of active locks
 */
function getLockStatus() {
  const locks = [];
  for (const [lockId, lock] of fileLocks.entries()) {
    locks.push({
      lockId,
      filePath: lock.filePath,
      timestamp: lock.timestamp,
      age: Date.now() - lock.timestamp
    });
  }
  return locks;
}

/**
 * Clean up expired locks
 * @param {number} maxAge - Maximum age for locks in milliseconds
 */
function cleanupExpiredLocks(maxAge = LOCK_TIMEOUT) {
  const now = Date.now();
  for (const [lockId, lock] of fileLocks.entries()) {
    if (now - lock.timestamp > maxAge) {
      fileLocks.delete(lockId);
    }
  }
}

// Periodic cleanup of expired locks
setInterval(cleanupExpiredLocks, LOCK_TIMEOUT);

module.exports = {
  atomicWrite,
  safeRead,
  safeJsonParse,
  safeReadJson,
  safeWriteJson,
  updateJsonFile,
  acquireLock,
  releaseLock,
  getLockStatus,
  cleanupExpiredLocks,
  
  // Constants
  LOCK_TIMEOUT,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY
};