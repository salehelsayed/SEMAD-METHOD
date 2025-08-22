#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Concurrency Control System for Orchestrator
 * Provides atomic file locks to prevent concurrent modifications
 */
class LockManager {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..', '..');
    this.lockDir = path.join(this.projectRoot, '.ai', 'locks');
    this.progressDir = path.join(this.projectRoot, '.ai', 'progress');
    this.lockStateFile = path.join(this.progressDir, 'locks.json');
    this.activeLocks = new Map();
    
    // Ensure directories exist
    this._ensureDirectories();
  }

  async _ensureDirectories() {
    await fs.mkdir(this.lockDir, { recursive: true });
    await fs.mkdir(this.progressDir, { recursive: true });
  }

  /**
   * Generate a hash for a file path to create unique lock filenames
   * @param {string} filePath - The path to hash
   * @returns {string} - SHA-256 hash of the path
   */
  _hashPath(filePath) {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }

  /**
   * Get the lock file path for a given file path
   * @param {string} filePath - Target file path
   * @returns {string} - Lock file path
   */
  _getLockFilePath(filePath) {
    const hashedPath = this._hashPath(filePath);
    return path.join(this.lockDir, `${hashedPath}.lock`);
  }

  /**
   * Acquire a lock for a file path
   * @param {string} filePath - Path to lock
   * @param {string} storyId - Story ID requesting the lock
   * @param {number} timeout - Timeout in milliseconds (default: 30000)
   * @returns {Promise<Object>} - Lock information
   * @throws {Error} - If lock cannot be acquired
   */
  async acquire(filePath, storyId, timeout = 30000) {
    await this._ensureDirectories();
    
    const normalizedPath = path.resolve(filePath);
    const lockFilePath = this._getLockFilePath(normalizedPath);
    const lockId = `${storyId}-${Date.now()}`;
    
    console.log(`[LOCK] Attempting to acquire lock for ${normalizedPath} by ${storyId}`);
    
    try {
      // Check if lock file already exists
      const lockStat = await fs.stat(lockFilePath).catch(() => null);
      
      if (lockStat) {
        // Try to read existing lock
        const existingLockData = await fs.readFile(lockFilePath, 'utf-8').catch(() => null);
        
        if (existingLockData) {
          const existingLock = JSON.parse(existingLockData);
          
          // Check if lock is stale (older than timeout)
          const lockAge = Date.now() - existingLock.acquiredAt;
          if (lockAge > timeout) {
            console.log(`[LOCK] Removing stale lock for ${normalizedPath} (age: ${lockAge}ms)`);
            await fs.unlink(lockFilePath);
          } else if (existingLock.storyId !== storyId) {
            throw new Error(`File ${normalizedPath} is locked by ${existingLock.storyId} (acquired ${lockAge}ms ago)`);
          } else {
            console.log(`[LOCK] Lock already owned by ${storyId} for ${normalizedPath}`);
            return existingLock;
          }
        }
      }

      // Create new lock
      const lockData = {
        lockId,
        storyId,
        filePath: normalizedPath,
        acquiredAt: Date.now(),
        timeout,
        pid: process.pid
      };

      // Atomic write using a temporary file
      const tempLockFile = `${lockFilePath}.tmp`;
      await fs.writeFile(tempLockFile, JSON.stringify(lockData, null, 2));
      
      // Atomic move to final location
      try {
        await fs.rename(tempLockFile, lockFilePath);
      } catch (renameError) {
        // Cleanup temp file on failure
        await fs.unlink(tempLockFile).catch(() => {});
        
        // Check if another process beat us to it
        const existingLockData = await fs.readFile(lockFilePath, 'utf-8').catch(() => null);
        if (existingLockData) {
          const existingLock = JSON.parse(existingLockData);
          throw new Error(`File ${normalizedPath} is locked by ${existingLock.storyId}`);
        }
        
        throw renameError;
      }

      // Store in memory for quick access
      this.activeLocks.set(normalizedPath, lockData);
      
      // Persist lock state
      await this._saveLockState();
      
      console.log(`[LOCK] ✓ Lock acquired for ${normalizedPath} by ${storyId} (ID: ${lockId})`);
      
      // Set up auto-release timer
      setTimeout(async () => {
        try {
          await this.release(normalizedPath, storyId);
          console.log(`[LOCK] Auto-released expired lock for ${normalizedPath}`);
        } catch (error) {
          console.warn(`[LOCK] Failed to auto-release lock for ${normalizedPath}:`, error.message);
        }
      }, timeout);
      
      return lockData;

    } catch (error) {
      console.error(`[LOCK] ✗ Failed to acquire lock for ${normalizedPath}:`, error.message);
      throw error;
    }
  }

  /**
   * Release a lock for a file path
   * @param {string} filePath - Path to unlock
   * @param {string} storyId - Story ID releasing the lock
   * @returns {Promise<boolean>} - True if released successfully
   * @throws {Error} - If lock cannot be released
   */
  async release(filePath, storyId) {
    const normalizedPath = path.resolve(filePath);
    const lockFilePath = this._getLockFilePath(normalizedPath);
    
    console.log(`[LOCK] Attempting to release lock for ${normalizedPath} by ${storyId}`);
    
    try {
      // Check if lock file exists
      const lockStat = await fs.stat(lockFilePath).catch(() => null);
      
      if (!lockStat) {
        console.log(`[LOCK] No lock file found for ${normalizedPath}`);
        return true;
      }

      // Read and validate lock
      const lockData = JSON.parse(await fs.readFile(lockFilePath, 'utf-8'));
      
      if (lockData.storyId !== storyId) {
        throw new Error(`Cannot release lock for ${normalizedPath}: owned by ${lockData.storyId}, not ${storyId}`);
      }

      // Remove lock file
      await fs.unlink(lockFilePath);
      
      // Remove from memory
      this.activeLocks.delete(normalizedPath);
      
      // Persist lock state
      await this._saveLockState();
      
      console.log(`[LOCK] ✓ Lock released for ${normalizedPath} by ${storyId}`);
      return true;

    } catch (error) {
      console.error(`[LOCK] ✗ Failed to release lock for ${normalizedPath}:`, error.message);
      throw error;
    }
  }

  /**
   * Get the status of all locks
   * @returns {Promise<Object>} - Lock status information
   */
  async status() {
    await this._ensureDirectories();
    
    try {
      // Read all lock files
      const lockFiles = await fs.readdir(this.lockDir).catch(() => []);
      const locks = [];
      
      for (const lockFile of lockFiles) {
        if (lockFile.endsWith('.lock')) {
          try {
            const lockFilePath = path.join(this.lockDir, lockFile);
            const lockData = JSON.parse(await fs.readFile(lockFilePath, 'utf-8'));
            const age = Date.now() - lockData.acquiredAt;
            
            locks.push({
              ...lockData,
              age,
              isStale: age > lockData.timeout,
              lockFile: lockFile
            });
          } catch (error) {
            console.warn(`[LOCK] Failed to read lock file ${lockFile}:`, error.message);
          }
        }
      }
      
      // Clean up stale locks
      const staleLocks = locks.filter(lock => lock.isStale);
      for (const staleLock of staleLocks) {
        try {
          await fs.unlink(path.join(this.lockDir, staleLock.lockFile));
          console.log(`[LOCK] Cleaned up stale lock: ${staleLock.filePath}`);
        } catch (error) {
          console.warn(`[LOCK] Failed to clean stale lock:`, error.message);
        }
      }
      
      const activeLocks = locks.filter(lock => !lock.isStale);
      
      return {
        activeLocks,
        totalLocks: activeLocks.length,
        staleLocks: staleLocks.length,
        lockDirectory: this.lockDir,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[LOCK] Failed to get status:', error.message);
      return {
        activeLocks: [],
        totalLocks: 0,
        staleLocks: 0,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Save current lock state to persistent storage
   * @private
   */
  async _saveLockState() {
    try {
      const lockState = {
        lastUpdated: new Date().toISOString(),
        activeLocks: Array.from(this.activeLocks.entries()).map(([path, lock]) => ({
          path,
          ...lock
        }))
      };
      
      await fs.writeFile(this.lockStateFile, JSON.stringify(lockState, null, 2));
    } catch (error) {
      console.warn('[LOCK] Failed to save lock state:', error.message);
    }
  }

  /**
   * Restore lock state from persistent storage
   * @private
   */
  async _restoreLockState() {
    try {
      const lockStateData = await fs.readFile(this.lockStateFile, 'utf-8');
      const lockState = JSON.parse(lockStateData);
      
      for (const lockInfo of lockState.activeLocks) {
        const { path: filePath, ...lockData } = lockInfo;
        this.activeLocks.set(filePath, lockData);
      }
      
      console.log(`[LOCK] Restored ${lockState.activeLocks.length} locks from persistent storage`);
    } catch (error) {
      // File doesn't exist or is corrupted - start fresh
      console.log('[LOCK] No previous lock state found, starting fresh');
    }
  }

  /**
   * Cleanup all locks for a specific story
   * @param {string} storyId - Story ID to cleanup
   * @returns {Promise<number>} - Number of locks cleaned up
   */
  async cleanupStoryLocks(storyId) {
    console.log(`[LOCK] Cleaning up all locks for story ${storyId}`);
    
    const status = await this.status();
    const storyLocks = status.activeLocks.filter(lock => lock.storyId === storyId);
    
    let cleanedUp = 0;
    for (const lock of storyLocks) {
      try {
        await this.release(lock.filePath, storyId);
        cleanedUp++;
      } catch (error) {
        console.warn(`[LOCK] Failed to cleanup lock for ${lock.filePath}:`, error.message);
      }
    }
    
    console.log(`[LOCK] Cleaned up ${cleanedUp} locks for story ${storyId}`);
    return cleanedUp;
  }
}

// Create singleton instance
const lockManager = new LockManager();

// CLI interface
if (require.main === module) {
  async function main() {
    const command = process.argv[2];
    const filePath = process.argv[3];
    const storyId = process.argv[4] || 'cli-session';

    try {
      switch (command) {
        case 'acquire':
          if (!filePath) {
            console.error('Usage: node locks.js acquire <file-path> [story-id]');
            process.exit(1);
          }
          const lock = await lockManager.acquire(filePath, storyId);
          console.log(`Lock acquired:`, lock);
          break;

        case 'release':
          if (!filePath) {
            console.error('Usage: node locks.js release <file-path> [story-id]');
            process.exit(1);
          }
          await lockManager.release(filePath, storyId);
          console.log(`Lock released for ${filePath}`);
          break;

        case 'status':
          const status = await lockManager.status();
          console.log(JSON.stringify(status, null, 2));
          break;

        case 'cleanup':
          if (!storyId || storyId === 'cli-session') {
            console.error('Usage: node locks.js cleanup <story-id>');
            process.exit(1);
          }
          const cleaned = await lockManager.cleanupStoryLocks(storyId);
          console.log(`Cleaned up ${cleaned} locks for story ${storyId}`);
          break;

        default:
          console.log(`Usage: node locks.js <command> [args...]

Commands:
  acquire <file-path> [story-id]  - Acquire lock for file
  release <file-path> [story-id]  - Release lock for file
  status                          - Show all active locks
  cleanup <story-id>              - Cleanup all locks for story

Examples:
  node locks.js acquire src/test.js AH-011
  node locks.js release src/test.js AH-011
  node locks.js status
  node locks.js cleanup AH-011`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

  main();
}

module.exports = { LockManager, lockManager };