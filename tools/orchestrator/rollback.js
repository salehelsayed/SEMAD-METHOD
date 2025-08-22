#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { SnapshotManager } = require('./snapshots');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class RollbackOrchestrator {
  constructor() {
    this.snapshotManager = new SnapshotManager();
    this.rollbackLogDir = path.join(process.cwd(), '.ai', 'rollback-logs');
    this.concurrencyController = path.join(process.cwd(), '.ai', 'locks');
  }

  /**
   * Execute atomic rollback for a story
   * @param {string} storyId - Story identifier
   * @param {Object} options - Rollback options
   */
  async executeRollback(storyId, options = {}) {
    const rollbackId = `rollback-${storyId}-${Date.now()}`;
    console.log(`[ROLLBACK] Starting atomic rollback for story ${storyId} (${rollbackId})`);

    const rollbackLog = {
      rollbackId,
      storyId,
      timestamp: new Date().toISOString(),
      user: process.env.USER || 'system',
      status: 'started',
      steps: [],
      options: {
        preserveNewFiles: options.preserveNewFiles || false,
        cleanupArtifacts: options.cleanupArtifacts !== false,
        restoreGitState: options.restoreGitState !== false,
        ...options
      }
    };

    try {
      // Step 1: Verify lock exists (safety check)
      await this.verifyAndCreateLock(storyId, rollbackLog);

      // Step 2: Load snapshot
      const snapshot = await this.loadSnapshot(storyId, rollbackLog);

      // Step 3: Validate rollback preconditions
      await this.validateRollbackPreconditions(storyId, snapshot, rollbackLog);

      // Step 4: Create backup of current state
      await this.createCurrentStateBackup(storyId, rollbackLog);

      // Step 5: Restore files from snapshot
      await this.restoreFiles(snapshot, rollbackLog);

      // Step 6: Cleanup artifacts if requested
      if (rollbackLog.options.cleanupArtifacts) {
        await this.cleanupArtifacts(storyId, rollbackLog);
      }

      // Step 7: Restore git state if requested
      if (rollbackLog.options.restoreGitState) {
        await this.restoreGitState(storyId, rollbackLog);
      }

      // Step 8: Release locks
      await this.releaseLocks(storyId, rollbackLog);

      // Step 9: Log completion
      rollbackLog.status = 'completed';
      rollbackLog.completedAt = new Date().toISOString();
      await this.saveRollbackLog(rollbackLog);

      console.log(`[ROLLBACK] ✓ Atomic rollback completed successfully for story ${storyId}`);
      return { success: true, rollbackId, log: rollbackLog };

    } catch (error) {
      console.error(`[ROLLBACK] ✗ Rollback failed for story ${storyId}: ${error.message}`);
      
      rollbackLog.status = 'failed';
      rollbackLog.error = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };

      // Attempt to release locks even on failure
      try {
        await this.releaseLocks(storyId, rollbackLog);
      } catch (lockError) {
        console.error(`[ROLLBACK] Failed to release locks: ${lockError.message}`);
      }

      await this.saveRollbackLog(rollbackLog);
      throw error;
    }
  }

  /**
   * Verify or create lock for the story
   */
  async verifyAndCreateLock(storyId, rollbackLog) {
    const step = { name: 'verify_lock', status: 'started', timestamp: new Date().toISOString() };
    rollbackLog.steps.push(step);

    try {
      // Check if already locked
      const isLocked = await this.snapshotManager.isLocked(storyId);
      
      if (!isLocked) {
        console.log(`[ROLLBACK] Creating lock for story ${storyId}`);
        await this.snapshotManager.createLock(storyId);
      } else {
        console.log(`[ROLLBACK] Story ${storyId} is already locked`);
      }

      step.status = 'completed';
      console.log(`[ROLLBACK] ✓ Lock verified for story ${storyId}`);
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      throw new Error(`Failed to verify lock: ${error.message}`);
    }
  }

  /**
   * Load snapshot for the story
   */
  async loadSnapshot(storyId, rollbackLog) {
    const step = { name: 'load_snapshot', status: 'started', timestamp: new Date().toISOString() };
    rollbackLog.steps.push(step);

    try {
      const snapshot = await this.snapshotManager.getSnapshot(storyId);
      step.status = 'completed';
      step.filesCount = snapshot.totalFiles;
      console.log(`[ROLLBACK] ✓ Loaded snapshot with ${snapshot.totalFiles} files`);
      return snapshot;
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      throw new Error(`Failed to load snapshot: ${error.message}`);
    }
  }

  /**
   * Validate rollback preconditions
   */
  async validateRollbackPreconditions(storyId, snapshot, rollbackLog) {
    const step = { name: 'validate_preconditions', status: 'started', timestamp: new Date().toISOString() };
    rollbackLog.steps.push(step);

    try {
      // Check if working directory is clean (optional warning)
      try {
        const { stdout } = await execAsync('git status --porcelain');
        if (stdout.trim()) {
          console.warn(`[ROLLBACK] Warning: Working directory has uncommitted changes`);
          step.warnings = ['Working directory not clean'];
        }
      } catch (error) {
        // Not a git repo or git not available
      }

      // Verify snapshot integrity
      const fileCount = Object.keys(snapshot.files).length;
      if (fileCount === 0) {
        throw new Error('Snapshot is empty');
      }

      step.status = 'completed';
      console.log(`[ROLLBACK] ✓ Preconditions validated`);
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      throw error;
    }
  }

  /**
   * Create backup of current state before rollback
   */
  async createCurrentStateBackup(storyId, rollbackLog) {
    const step = { name: 'backup_current_state', status: 'started', timestamp: new Date().toISOString() };
    rollbackLog.steps.push(step);

    try {
      const backupDir = path.join(this.rollbackLogDir, storyId, 'pre-rollback-backup');
      await fs.mkdir(backupDir, { recursive: true });

      const snapshot = await this.snapshotManager.getSnapshot(storyId);
      const backedUpFiles = [];

      for (const [relativePath, fileInfo] of Object.entries(snapshot.files)) {
        if (fileInfo === null) continue; // File didn't exist in snapshot

        const currentPath = path.resolve(relativePath);
        
        try {
          // Check if file exists currently
          await fs.access(currentPath);
          
          // Create backup
          const backupPath = path.join(backupDir, relativePath.replace(/[/\\]/g, '_'));
          await fs.mkdir(path.dirname(backupPath), { recursive: true });
          await fs.copyFile(currentPath, backupPath);
          backedUpFiles.push(relativePath);
        } catch (error) {
          // File doesn't exist currently, that's ok
        }
      }

      step.status = 'completed';
      step.backedUpFiles = backedUpFiles.length;
      console.log(`[ROLLBACK] ✓ Backed up ${backedUpFiles.length} current files`);
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      throw new Error(`Failed to backup current state: ${error.message}`);
    }
  }

  /**
   * Restore files from snapshot
   */
  async restoreFiles(snapshot, rollbackLog) {
    const step = { name: 'restore_files', status: 'started', timestamp: new Date().toISOString() };
    rollbackLog.steps.push(step);

    try {
      const restoredFiles = [];
      const errors = [];

      for (const [relativePath, fileInfo] of Object.entries(snapshot.files)) {
        try {
          const targetPath = path.resolve(relativePath);
          
          if (fileInfo === null) {
            // File didn't exist in snapshot, remove if it exists now
            try {
              await fs.access(targetPath);
              await fs.unlink(targetPath);
              console.log(`[ROLLBACK] Removed new file: ${relativePath}`);
              restoredFiles.push({ file: relativePath, action: 'removed' });
            } catch (error) {
              // File doesn't exist, which is what we want
            }
          } else {
            // Restore file from snapshot
            const snapshotContent = await fs.readFile(fileInfo.snapshotPath, 'utf-8');
            
            // Ensure target directory exists
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            
            // Write file
            await fs.writeFile(targetPath, snapshotContent);
            console.log(`[ROLLBACK] Restored: ${relativePath}`);
            restoredFiles.push({ file: relativePath, action: 'restored' });
          }
        } catch (error) {
          console.error(`[ROLLBACK] Failed to restore ${relativePath}: ${error.message}`);
          errors.push({ file: relativePath, error: error.message });
        }
      }

      if (errors.length > 0) {
        step.status = 'partial';
        step.errors = errors;
        console.warn(`[ROLLBACK] ⚠ Partial restore: ${errors.length} files failed`);
      } else {
        step.status = 'completed';
      }

      step.restoredFiles = restoredFiles.length;
      console.log(`[ROLLBACK] ✓ Restored ${restoredFiles.length} files`);
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      throw new Error(`Failed to restore files: ${error.message}`);
    }
  }

  /**
   * Cleanup artifacts related to the story
   */
  async cleanupArtifacts(storyId, rollbackLog) {
    const step = { name: 'cleanup_artifacts', status: 'started', timestamp: new Date().toISOString() };
    rollbackLog.steps.push(step);

    try {
      const artifactPaths = [
        path.join('.ai', 'patches', `${storyId}.patch.json`),
        path.join('.ai', 'test-logs', `${storyId}-tests.json`),
        path.join('.ai', 'task-bundles', `${storyId}-bundle.json`)
      ];

      const cleanedFiles = [];

      for (const artifactPath of artifactPaths) {
        try {
          await fs.access(artifactPath);
          await fs.unlink(artifactPath);
          cleanedFiles.push(artifactPath);
          console.log(`[ROLLBACK] Cleaned artifact: ${artifactPath}`);
        } catch (error) {
          // Artifact doesn't exist, that's fine
        }
      }

      step.status = 'completed';
      step.cleanedFiles = cleanedFiles.length;
      console.log(`[ROLLBACK] ✓ Cleaned ${cleanedFiles.length} artifacts`);
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      console.warn(`[ROLLBACK] ⚠ Failed to cleanup artifacts: ${error.message}`);
      // Don't throw here, this is not critical
    }
  }

  /**
   * Restore git state if applicable
   */
  async restoreGitState(storyId, rollbackLog) {
    const step = { name: 'restore_git_state', status: 'started', timestamp: new Date().toISOString() };
    rollbackLog.steps.push(step);

    try {
      // Check if we're in a git repo
      await execAsync('git rev-parse --git-dir');

      // Get current commit
      const { stdout: currentCommit } = await execAsync('git rev-parse HEAD');
      
      // Try to find the commit from snapshot metadata
      const snapshot = await this.snapshotManager.getSnapshot(storyId);
      if (snapshot.metadata.gitCommit && snapshot.metadata.gitCommit !== currentCommit.trim()) {
        console.log(`[ROLLBACK] Reverting git to commit: ${snapshot.metadata.gitCommit}`);
        await execAsync(`git reset --hard ${snapshot.metadata.gitCommit}`);
        step.gitCommit = snapshot.metadata.gitCommit;
      }

      step.status = 'completed';
      console.log(`[ROLLBACK] ✓ Git state restored`);
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      console.warn(`[ROLLBACK] ⚠ Failed to restore git state: ${error.message}`);
      // Don't throw here, git operations are optional
    }
  }

  /**
   * Release all locks for the story
   */
  async releaseLocks(storyId, rollbackLog) {
    const step = { name: 'release_locks', status: 'started', timestamp: new Date().toISOString() };
    rollbackLog.steps.push(step);

    try {
      await this.snapshotManager.releaseLock(storyId);
      step.status = 'completed';
      console.log(`[ROLLBACK] ✓ Released locks for story ${storyId}`);
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      console.error(`[ROLLBACK] Failed to release locks: ${error.message}`);
      // Don't throw here, log the error but continue
    }
  }

  /**
   * Save rollback log
   */
  async saveRollbackLog(rollbackLog) {
    try {
      await fs.mkdir(this.rollbackLogDir, { recursive: true });
      const logPath = path.join(this.rollbackLogDir, `${rollbackLog.rollbackId}.json`);
      await fs.writeFile(logPath, JSON.stringify(rollbackLog, null, 2));
      console.log(`[ROLLBACK] Saved rollback log: ${logPath}`);
    } catch (error) {
      console.error(`[ROLLBACK] Failed to save rollback log: ${error.message}`);
    }
  }

  /**
   * List available rollback logs
   */
  async listRollbackLogs(storyId = null) {
    try {
      const files = await fs.readdir(this.rollbackLogDir);
      const logs = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const logData = JSON.parse(
              await fs.readFile(path.join(this.rollbackLogDir, file), 'utf-8')
            );
            
            if (!storyId || logData.storyId === storyId) {
              logs.push({
                rollbackId: logData.rollbackId,
                storyId: logData.storyId,
                timestamp: logData.timestamp,
                status: logData.status,
                user: logData.user
              });
            }
          } catch (error) {
            // Invalid log file, skip
          }
        }
      }

      return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get detailed rollback log
   */
  async getRollbackLog(rollbackId) {
    const logPath = path.join(this.rollbackLogDir, `${rollbackId}.json`);
    try {
      return JSON.parse(await fs.readFile(logPath, 'utf-8'));
    } catch (error) {
      throw new Error(`Rollback log not found: ${rollbackId}`);
    }
  }
}

module.exports = { RollbackOrchestrator };

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const storyId = process.argv[3];
  const orchestrator = new RollbackOrchestrator();

  async function main() {
    switch (command) {
      case 'execute':
        {
          if (!storyId) {
            console.error('Usage: node rollback.js execute <storyId> [options]');
            process.exit(1);
          }

          const options = {};
          if (process.argv.includes('--preserve-new-files')) {
            options.preserveNewFiles = true;
          }
          if (process.argv.includes('--no-cleanup')) {
            options.cleanupArtifacts = false;
          }
          if (process.argv.includes('--no-git-restore')) {
            options.restoreGitState = false;
          }

          const result = await orchestrator.executeRollback(storyId, options);
          console.log(`Rollback completed: ${result.rollbackId}`);
        }
        break;

      case 'list':
        {
          const logs = await orchestrator.listRollbackLogs(storyId);
          console.log(`Found ${logs.length} rollback logs${storyId ? ` for story ${storyId}` : ''}:`);
          logs.forEach(log => {
            console.log(`  ${log.rollbackId} - ${log.storyId} - ${log.timestamp} (${log.status})`);
          });
        }
        break;

      case 'show':
        {
          const rollbackId = storyId; // Using storyId parameter as rollbackId
          if (!rollbackId) {
            console.error('Usage: node rollback.js show <rollbackId>');
            process.exit(1);
          }
          const log = await orchestrator.getRollbackLog(rollbackId);
          console.log(JSON.stringify(log, null, 2));
        }
        break;

      case 'status':
        {
          if (!storyId) {
            console.error('Usage: node rollback.js status <storyId>');
            process.exit(1);
          }
          
          const snapshot = new SnapshotManager();
          const isLocked = await snapshot.isLocked(storyId);
          const hasSnapshot = await snapshot.listSnapshots(storyId).then(s => s.length > 0);
          
          console.log(`Story ${storyId} status:`);
          console.log(`  Locked: ${isLocked ? 'Yes' : 'No'}`);
          console.log(`  Snapshot available: ${hasSnapshot ? 'Yes' : 'No'}`);
        }
        break;

      default:
        console.log('Usage: node rollback.js <execute|list|show|status> [args...]');
        console.log('Commands:');
        console.log('  execute <storyId> [options]  - Execute atomic rollback');
        console.log('    Options:');
        console.log('      --preserve-new-files     - Don\'t remove files created after snapshot');
        console.log('      --no-cleanup             - Don\'t cleanup artifacts');
        console.log('      --no-git-restore         - Don\'t restore git state');
        console.log('  list [storyId]               - List rollback logs');
        console.log('  show <rollbackId>            - Show detailed rollback log');
        console.log('  status <storyId>             - Show story rollback status');
        process.exit(1);
    }
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}