#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SnapshotManager {
  constructor() {
    this.snapshotsDir = path.join(process.cwd(), '.ai', 'snapshots');
    this.lockDir = path.join(process.cwd(), '.ai', 'locks');
  }

  /**
   * Create snapshots before applying a patch
   * @param {string} storyId - Story identifier
   * @param {Array} filePaths - Array of file paths to snapshot
   * @param {Object} metadata - Additional metadata for the snapshot
   */
  async createSnapshot(storyId, filePaths, metadata = {}) {
    console.log(`[SNAPSHOT] Creating snapshot for story ${storyId}...`);
    
    const timestamp = new Date().toISOString();
    const snapshotId = `${storyId}-${timestamp.replace(/[:.]/g, '-')}`;
    const storySnapshotDir = path.join(this.snapshotsDir, storyId);
    
    // Ensure snapshot directory exists
    await fs.mkdir(storySnapshotDir, { recursive: true });
    
    const snapshot = {
      storyId,
      snapshotId,
      timestamp,
      metadata: {
        ...metadata,
        triggeredBy: process.env.USER || 'system',
        reason: 'pre-patch-snapshot'
      },
      files: {},
      hashes: {},
      totalFiles: 0,
      totalSize: 0
    };

    // Create snapshots for each file
    for (const filePath of filePaths) {
      try {
        const absolutePath = path.resolve(filePath);
        const relativePath = path.relative(process.cwd(), absolutePath);
        
        // Check if file exists
        const stats = await fs.stat(absolutePath).catch(() => null);
        if (!stats) {
          console.log(`[SNAPSHOT] File not found: ${relativePath} - will be marked as new file`);
          snapshot.files[relativePath] = null; // File doesn't exist yet
          snapshot.hashes[relativePath] = null;
          continue;
        }

        // Read file content
        const content = await fs.readFile(absolutePath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        
        // Save snapshot file
        const snapshotFilePath = path.join(storySnapshotDir, `${relativePath.replace(/[/\\]/g, '_')}.snap`);
        await fs.mkdir(path.dirname(snapshotFilePath), { recursive: true });
        await fs.writeFile(snapshotFilePath, content);
        
        // Record file info
        snapshot.files[relativePath] = {
          snapshotPath: snapshotFilePath,
          originalPath: absolutePath,
          size: stats.size,
          lastModified: stats.mtime.toISOString()
        };
        snapshot.hashes[relativePath] = hash;
        snapshot.totalFiles++;
        snapshot.totalSize += stats.size;
        
        console.log(`[SNAPSHOT] Captured: ${relativePath} (${stats.size} bytes)`);
        
      } catch (error) {
        console.error(`[SNAPSHOT] Failed to snapshot ${filePath}: ${error.message}`);
        // Continue with other files
      }
    }

    // Save snapshot metadata
    const snapshotMetaPath = path.join(storySnapshotDir, 'snapshot.json');
    await fs.writeFile(snapshotMetaPath, JSON.stringify(snapshot, null, 2));
    
    console.log(`[SNAPSHOT] Created snapshot ${snapshotId} with ${snapshot.totalFiles} files (${snapshot.totalSize} bytes)`);
    return snapshot;
  }

  /**
   * List available snapshots for a story
   * @param {string} storyId - Story identifier
   */
  async listSnapshots(storyId) {
    const storySnapshotDir = path.join(this.snapshotsDir, storyId);
    
    try {
      const snapshotFile = path.join(storySnapshotDir, 'snapshot.json');
      const snapshotData = JSON.parse(await fs.readFile(snapshotFile, 'utf-8'));
      return [snapshotData];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get snapshot details
   * @param {string} storyId - Story identifier
   */
  async getSnapshot(storyId) {
    const storySnapshotDir = path.join(this.snapshotsDir, storyId);
    const snapshotFile = path.join(storySnapshotDir, 'snapshot.json');
    
    try {
      return JSON.parse(await fs.readFile(snapshotFile, 'utf-8'));
    } catch (error) {
      throw new Error(`Snapshot not found for story ${storyId}: ${error.message}`);
    }
  }

  /**
   * Create file hash for comparison
   * @param {string} filePath - Path to file
   */
  async createFileHash(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      return null; // File doesn't exist
    }
  }

  /**
   * Compare current file state with snapshot
   * @param {string} storyId - Story identifier
   * @param {Array} filePaths - Files to check
   */
  async compareWithSnapshot(storyId, filePaths) {
    const snapshot = await this.getSnapshot(storyId);
    const changes = {
      modified: [],
      unchanged: [],
      new: [],
      deleted: []
    };

    // Check each file against snapshot
    for (const filePath of filePaths) {
      const relativePath = path.relative(process.cwd(), path.resolve(filePath));
      const currentHash = await this.createFileHash(filePath);
      const snapshotHash = snapshot.hashes[relativePath];

      if (snapshotHash === null && currentHash !== null) {
        changes.new.push(relativePath);
      } else if (snapshotHash !== null && currentHash === null) {
        changes.deleted.push(relativePath);
      } else if (snapshotHash !== currentHash) {
        changes.modified.push(relativePath);
      } else {
        changes.unchanged.push(relativePath);
      }
    }

    return changes;
  }

  /**
   * Cleanup old snapshots
   * @param {string} storyId - Story identifier
   * @param {number} retentionDays - Days to retain snapshots
   */
  async cleanupSnapshots(storyId, retentionDays = 7) {
    const storySnapshotDir = path.join(this.snapshotsDir, storyId);
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    try {
      const snapshot = await this.getSnapshot(storyId);
      const snapshotTime = new Date(snapshot.timestamp).getTime();

      if (snapshotTime < cutoffTime) {
        console.log(`[SNAPSHOT] Cleaning up old snapshot for story ${storyId}`);
        await fs.rm(storySnapshotDir, { recursive: true, force: true });
        return true;
      }
    } catch (error) {
      // Snapshot doesn't exist, nothing to clean
    }

    return false;
  }

  /**
   * Create a lock file to prevent concurrent operations
   * @param {string} storyId - Story identifier
   */
  async createLock(storyId) {
    const lockFile = path.join(this.lockDir, `${storyId}.lock`);
    await fs.mkdir(this.lockDir, { recursive: true });

    try {
      await fs.access(lockFile);
      throw new Error(`Story ${storyId} is already locked for operations`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    const lockData = {
      storyId,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      user: process.env.USER || 'system'
    };

    await fs.writeFile(lockFile, JSON.stringify(lockData, null, 2));
    console.log(`[SNAPSHOT] Created lock for story ${storyId}`);
    return lockFile;
  }

  /**
   * Release a lock file
   * @param {string} storyId - Story identifier
   */
  async releaseLock(storyId) {
    const lockFile = path.join(this.lockDir, `${storyId}.lock`);

    try {
      await fs.unlink(lockFile);
      console.log(`[SNAPSHOT] Released lock for story ${storyId}`);
      return true;
    } catch (error) {
      console.error(`[SNAPSHOT] Failed to release lock for story ${storyId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a story is locked
   * @param {string} storyId - Story identifier
   */
  async isLocked(storyId) {
    const lockFile = path.join(this.lockDir, `${storyId}.lock`);

    try {
      await fs.access(lockFile);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all locked stories
   */
  async getLockedStories() {
    try {
      const lockFiles = await fs.readdir(this.lockDir);
      const locks = [];

      for (const file of lockFiles) {
        if (file.endsWith('.lock')) {
          try {
            const lockData = JSON.parse(
              await fs.readFile(path.join(this.lockDir, file), 'utf-8')
            );
            locks.push(lockData);
          } catch (error) {
            // Invalid lock file, skip
          }
        }
      }

      return locks;
    } catch (error) {
      return [];
    }
  }
}

module.exports = { SnapshotManager };

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const storyId = process.argv[3];
  const manager = new SnapshotManager();

  async function main() {
    switch (command) {
      case 'create':
        {
          const files = process.argv.slice(4);
          if (!storyId || files.length === 0) {
            console.error('Usage: node snapshots.js create <storyId> <file1> [file2...]');
            process.exit(1);
          }
          await manager.createSnapshot(storyId, files);
        }
        break;

      case 'list':
        {
          if (!storyId) {
            console.error('Usage: node snapshots.js list <storyId>');
            process.exit(1);
          }
          const snapshots = await manager.listSnapshots(storyId);
          console.log(`Found ${snapshots.length} snapshots for story ${storyId}:`);
          snapshots.forEach(s => {
            console.log(`  ${s.snapshotId} - ${s.timestamp} (${s.totalFiles} files)`);
          });
        }
        break;

      case 'compare':
        {
          const files = process.argv.slice(4);
          if (!storyId || files.length === 0) {
            console.error('Usage: node snapshots.js compare <storyId> <file1> [file2...]');
            process.exit(1);
          }
          const changes = await manager.compareWithSnapshot(storyId, files);
          console.log('Changes detected:');
          console.log(`  Modified: ${changes.modified.length}`);
          console.log(`  New: ${changes.new.length}`);
          console.log(`  Deleted: ${changes.deleted.length}`);
          console.log(`  Unchanged: ${changes.unchanged.length}`);
        }
        break;

      case 'locks':
        {
          const locks = await manager.getLockedStories();
          console.log(`Found ${locks.length} locked stories:`);
          locks.forEach(lock => {
            console.log(`  ${lock.storyId} - ${lock.timestamp} (PID: ${lock.pid}, User: ${lock.user})`);
          });
        }
        break;

      case 'unlock':
        {
          if (!storyId) {
            console.error('Usage: node snapshots.js unlock <storyId>');
            process.exit(1);
          }
          await manager.releaseLock(storyId);
        }
        break;

      case 'cleanup':
        {
          const days = parseInt(process.argv[4]) || 7;
          if (!storyId) {
            console.error('Usage: node snapshots.js cleanup <storyId> [days]');
            process.exit(1);
          }
          const cleaned = await manager.cleanupSnapshots(storyId, days);
          console.log(cleaned ? 'Snapshot cleaned up' : 'No cleanup needed');
        }
        break;

      default:
        console.log('Usage: node snapshots.js <create|list|compare|locks|unlock|cleanup> [args...]');
        console.log('Commands:');
        console.log('  create <storyId> <file1> [file2...]  - Create snapshot before patch');
        console.log('  list <storyId>                       - List snapshots for story');
        console.log('  compare <storyId> <file1> [file2...] - Compare with snapshot');
        console.log('  locks                                - Show all locked stories');
        console.log('  unlock <storyId>                     - Release story lock');
        console.log('  cleanup <storyId> [days]             - Clean old snapshots');
        process.exit(1);
    }
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}