#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { SnapshotManager } = require('./snapshots');

class DriftAlarmSystem {
  constructor() {
    this.snapshotManager = new SnapshotManager();
    this.alarmsDir = path.join(process.cwd(), '.ai', 'drift-alarms');
    this.thresholds = {
      unlistedFiles: 3,
      unexpectedChanges: 5,
      structuralDrift: 2,
      criticalFiles: 1
    };
    this.criticalFiles = [
      'package.json',
      'package-lock.json',
      '.bmadrc.yaml',
      'bmad.config.js',
      'bmad-core/config/**',
      '.ai/settings.json'
    ];
  }

  /**
   * Detect drift during patch application
   * @param {string} storyId - Story identifier
   * @param {Array} expectedFiles - Files that are expected to be modified by the patch
   * @param {Object} patchPlan - The patch plan being applied
   */
  async detectPatchDrift(storyId, expectedFiles, patchPlan = null) {
    console.log(`[DRIFT-ALARM] Detecting patch drift for story ${storyId}...`);

    const driftReport = {
      storyId,
      timestamp: new Date().toISOString(),
      expectedFiles,
      detectedChanges: {
        unlisted: [],
        missing: [],
        unexpected: [],
        critical: []
      },
      severity: 'low',
      alarms: [],
      patchPlan: patchPlan ? {
        id: patchPlan.id,
        filesCount: patchPlan.files?.length || 0
      } : null
    };

    try {
      // Get current file state
      const currentState = await this.scanCurrentState();
      
      // Load snapshot for comparison
      let snapshot = null;
      try {
        snapshot = await this.snapshotManager.getSnapshot(storyId);
      } catch (error) {
        driftReport.alarms.push({
          type: 'no_baseline',
          severity: 'medium',
          message: 'No baseline snapshot found for comparison',
          impact: 'Cannot detect unexpected changes'
        });
      }

      // Detect unlisted file changes
      await this.detectUnlistedChanges(currentState, expectedFiles, snapshot, driftReport);

      // Detect missing expected changes
      await this.detectMissingChanges(expectedFiles, currentState, driftReport);

      // Detect critical file changes
      await this.detectCriticalFileChanges(currentState, snapshot, driftReport);

      // Detect structural drift
      await this.detectStructuralDrift(currentState, snapshot, driftReport);

      // Calculate overall severity
      this.calculateSeverity(driftReport);

      // Save drift report
      await this.saveDriftReport(driftReport);

      // Trigger alarms if necessary
      await this.triggerAlarms(driftReport);

      console.log(`[DRIFT-ALARM] Drift detection completed - Severity: ${driftReport.severity}`);
      return driftReport;

    } catch (error) {
      console.error(`[DRIFT-ALARM] Drift detection failed: ${error.message}`);
      driftReport.error = error.message;
      driftReport.severity = 'critical';
      await this.saveDriftReport(driftReport);
      throw error;
    }
  }

  /**
   * Scan current file system state
   */
  async scanCurrentState() {
    const state = {
      files: {},
      structure: {},
      timestamp: new Date().toISOString()
    };

    // Scan core project files
    const coreFiles = await this.getCoreFiles(process.cwd());
    
    for (const filePath of coreFiles) {
      try {
        const relativePath = path.relative(process.cwd(), filePath);
        const stats = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        
        state.files[relativePath] = {
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          hash: crypto.createHash('sha256').update(content).digest('hex')
        };
      } catch (error) {
        // File read error, skip
      }
    }

    // Scan directory structure
    state.structure = await this.scanDirectoryStructure();

    return state;
  }

  /**
   * Detect changes to files not listed in expected files
   */
  async detectUnlistedChanges(currentState, expectedFiles, snapshot, driftReport) {
    if (!snapshot) return;

    const expectedSet = new Set(expectedFiles.map(f => path.relative(process.cwd(), path.resolve(f))));
    
    for (const [filePath, fileInfo] of Object.entries(currentState.files)) {
      // Skip if this file is expected to change
      if (expectedSet.has(filePath)) continue;

      const snapshotFile = snapshot.files[filePath];
      
      if (!snapshotFile && fileInfo) {
        // New file not in snapshot and not expected
        driftReport.detectedChanges.unlisted.push({
          file: filePath,
          type: 'new_file',
          size: fileInfo.size
        });
      } else if (snapshotFile && snapshotFile.hash !== fileInfo.hash) {
        // File changed but not expected to change
        driftReport.detectedChanges.unlisted.push({
          file: filePath,
          type: 'modified',
          oldHash: snapshotFile.hash,
          newHash: fileInfo.hash
        });
      }
    }

    // Check for deleted files
    if (snapshot) {
      for (const [filePath, fileInfo] of Object.entries(snapshot.files)) {
        if (fileInfo && !currentState.files[filePath] && !expectedSet.has(filePath)) {
          driftReport.detectedChanges.unlisted.push({
            file: filePath,
            type: 'deleted'
          });
        }
      }
    }
  }

  /**
   * Detect missing expected changes
   */
  async detectMissingChanges(expectedFiles, currentState, driftReport) {
    for (const expectedFile of expectedFiles) {
      const relativePath = path.relative(process.cwd(), path.resolve(expectedFile));
      
      if (!currentState.files[relativePath]) {
        driftReport.detectedChanges.missing.push({
          file: relativePath,
          reason: 'Expected file not found'
        });
      }
    }
  }

  /**
   * Detect changes to critical system files
   */
  async detectCriticalFileChanges(currentState, snapshot, driftReport) {
    if (!snapshot) return;

    for (const criticalPattern of this.criticalFiles) {
      // Simple pattern matching (could be enhanced with glob)
      const criticalFiles = Object.keys(currentState.files).filter(f => 
        f.includes(criticalPattern.replace('/**', '')) || f === criticalPattern
      );

      for (const criticalFile of criticalFiles) {
        const currentFile = currentState.files[criticalFile];
        const snapshotFile = snapshot.files[criticalFile];

        if (snapshotFile && currentFile && snapshotFile.hash !== currentFile.hash) {
          driftReport.detectedChanges.critical.push({
            file: criticalFile,
            type: 'critical_file_modified',
            pattern: criticalPattern
          });
        }
      }
    }
  }

  /**
   * Detect structural changes to the project
   */
  async detectStructuralDrift(currentState, snapshot, driftReport) {
    if (!snapshot || !snapshot.structure) return;

    const currentStructure = currentState.structure;
    const snapshotStructure = snapshot.structure || {};

    // Compare directory structures
    const structuralChanges = [];
    
    // Check for new directories
    for (const dir of Object.keys(currentStructure)) {
      if (!snapshotStructure[dir]) {
        structuralChanges.push({
          type: 'new_directory',
          path: dir
        });
      }
    }

    // Check for removed directories
    for (const dir of Object.keys(snapshotStructure)) {
      if (!currentStructure[dir]) {
        structuralChanges.push({
          type: 'removed_directory',
          path: dir
        });
      }
    }

    if (structuralChanges.length > 0) {
      driftReport.detectedChanges.unexpected.push(...structuralChanges);
    }
  }

  /**
   * Calculate overall drift severity
   */
  calculateSeverity(driftReport) {
    const counts = {
      unlisted: driftReport.detectedChanges.unlisted.length,
      missing: driftReport.detectedChanges.missing.length,
      unexpected: driftReport.detectedChanges.unexpected.length,
      critical: driftReport.detectedChanges.critical.length
    };

    // Critical files always result in high severity
    if (counts.critical >= this.thresholds.criticalFiles) {
      driftReport.severity = 'critical';
      driftReport.alarms.push({
        type: 'critical_files_changed',
        severity: 'critical',
        message: `${counts.critical} critical files modified unexpectedly`,
        impact: 'System stability at risk'
      });
      return;
    }

    // Check other thresholds
    if (counts.unlisted >= this.thresholds.unlistedFiles) {
      driftReport.severity = 'high';
      driftReport.alarms.push({
        type: 'excessive_unlisted_changes',
        severity: 'high',
        message: `${counts.unlisted} unlisted files changed`,
        impact: 'Patch scope exceeded'
      });
    }

    if (counts.unexpected >= this.thresholds.unexpectedChanges) {
      driftReport.severity = driftReport.severity === 'high' ? 'critical' : 'high';
      driftReport.alarms.push({
        type: 'unexpected_changes',
        severity: 'high',
        message: `${counts.unexpected} unexpected changes detected`,
        impact: 'Patch behavior unpredictable'
      });
    }

    if (counts.missing > 0) {
      const currentSeverity = driftReport.severity;
      driftReport.severity = currentSeverity === 'low' ? 'medium' : currentSeverity;
      driftReport.alarms.push({
        type: 'missing_expected_changes',
        severity: 'medium',
        message: `${counts.missing} expected files not modified`,
        impact: 'Patch may be incomplete'
      });
    }

    // Default to medium if we have any issues but no critical ones
    if (driftReport.severity === 'low' && 
        (counts.unlisted > 0 || counts.unexpected > 0)) {
      driftReport.severity = 'medium';
    }
  }

  /**
   * Trigger alarms based on severity
   */
  async triggerAlarms(driftReport) {
    if (driftReport.severity === 'critical' || driftReport.severity === 'high') {
      console.error(`[DRIFT-ALARM] 🚨 ${driftReport.severity.toUpperCase()} DRIFT DETECTED!`);
      
      for (const alarm of driftReport.alarms) {
        console.error(`[DRIFT-ALARM] ${alarm.type}: ${alarm.message}`);
        console.error(`[DRIFT-ALARM] Impact: ${alarm.impact}`);
      }

      // Create alarm file for monitoring systems
      const alarmFile = path.join(this.alarmsDir, `${driftReport.storyId}-alarm.json`);
      await fs.mkdir(this.alarmsDir, { recursive: true });
      await fs.writeFile(alarmFile, JSON.stringify({
        storyId: driftReport.storyId,
        severity: driftReport.severity,
        timestamp: driftReport.timestamp,
        alarms: driftReport.alarms,
        summary: this.generateAlarmSummary(driftReport)
      }, null, 2));

      console.error(`[DRIFT-ALARM] Alarm file created: ${alarmFile}`);
    }
  }

  /**
   * Generate alarm summary
   */
  generateAlarmSummary(driftReport) {
    const counts = {
      unlisted: driftReport.detectedChanges.unlisted.length,
      missing: driftReport.detectedChanges.missing.length,
      unexpected: driftReport.detectedChanges.unexpected.length,
      critical: driftReport.detectedChanges.critical.length
    };

    return {
      totalIssues: Object.values(counts).reduce((a, b) => a + b, 0),
      breakdown: counts,
      recommendation: this.getRecommendation(driftReport.severity, counts)
    };
  }

  /**
   * Get recommendation based on drift severity
   */
  getRecommendation(severity, counts) {
    if (severity === 'critical') {
      return 'IMMEDIATE ACTION REQUIRED: Stop patch application and investigate critical file changes';
    } else if (severity === 'high') {
      return 'Review unlisted changes and consider patch scope adjustment';
    } else if (severity === 'medium') {
      return 'Monitor changes and verify patch completeness';
    } else {
      return 'Continue monitoring';
    }
  }

  /**
   * Save drift report
   */
  async saveDriftReport(driftReport) {
    try {
      await fs.mkdir(this.alarmsDir, { recursive: true });
      const reportPath = path.join(this.alarmsDir, `${driftReport.storyId}-drift-report.json`);
      await fs.writeFile(reportPath, JSON.stringify(driftReport, null, 2));
      console.log(`[DRIFT-ALARM] Drift report saved: ${reportPath}`);
    } catch (error) {
      console.error(`[DRIFT-ALARM] Failed to save drift report: ${error.message}`);
    }
  }

  /**
   * Get core files for scanning
   */
  async getCoreFiles(dir, files = []) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip certain directories
          if (!entry.name.startsWith('.') && 
              entry.name !== 'node_modules' && 
              entry.name !== 'dist' &&
              entry.name !== 'build') {
            await this.getCoreFiles(fullPath, files);
          }
        } else if (entry.isFile()) {
          // Include relevant file types
          if (this.isRelevantFile(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Directory access error, skip
    }
    
    return files;
  }

  /**
   * Check if file is relevant for drift detection
   */
  isRelevantFile(filename) {
    const relevantExtensions = ['.js', '.ts', '.json', '.yaml', '.yml', '.md', '.txt', '.config'];
    const relevantFiles = ['package.json', 'package-lock.json', '.bmadrc.yaml', 'bmad.config.js'];
    
    return relevantFiles.includes(filename) || 
           relevantExtensions.some(ext => filename.endsWith(ext)) ||
           filename.startsWith('bmad-');
  }

  /**
   * Scan directory structure
   */
  async scanDirectoryStructure() {
    const structure = {};
    const baseDirs = ['bmad-core', 'tools', 'docs', 'scripts', '.ai'];
    
    for (const baseDir of baseDirs) {
      try {
        const fullPath = path.join(process.cwd(), baseDir);
        await fs.access(fullPath);
        structure[baseDir] = await this.getDirectoryInfo(fullPath);
      } catch (error) {
        // Directory doesn't exist
      }
    }
    
    return structure;
  }

  /**
   * Get directory information
   */
  async getDirectoryInfo(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return {
        fileCount: entries.filter(e => e.isFile()).length,
        subdirCount: entries.filter(e => e.isDirectory()).length,
        entries: entries.map(e => e.name)
      };
    } catch (error) {
      return { fileCount: 0, subdirCount: 0, entries: [] };
    }
  }

  /**
   * List drift reports
   */
  async listDriftReports(storyId = null) {
    try {
      const files = await fs.readdir(this.alarmsDir);
      const reports = [];

      for (const file of files) {
        if (file.endsWith('-drift-report.json')) {
          try {
            const reportData = JSON.parse(
              await fs.readFile(path.join(this.alarmsDir, file), 'utf-8')
            );
            
            if (!storyId || reportData.storyId === storyId) {
              reports.push({
                storyId: reportData.storyId,
                timestamp: reportData.timestamp,
                severity: reportData.severity,
                alarmsCount: reportData.alarms.length
              });
            }
          } catch (error) {
            // Invalid report file, skip
          }
        }
      }

      return reports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      return [];
    }
  }

  /**
   * Clear drift alarms for a story
   */
  async clearAlarms(storyId) {
    try {
      const alarmFile = path.join(this.alarmsDir, `${storyId}-alarm.json`);
      await fs.unlink(alarmFile);
      console.log(`[DRIFT-ALARM] Cleared alarms for story ${storyId}`);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = { DriftAlarmSystem };

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const storyId = process.argv[3];
  const driftAlarms = new DriftAlarmSystem();

  async function main() {
    switch (command) {
      case 'detect':
        {
          const expectedFiles = process.argv.slice(4);
          if (!storyId || expectedFiles.length === 0) {
            console.error('Usage: node drift-alarms.js detect <storyId> <file1> [file2...]');
            process.exit(1);
          }
          const report = await driftAlarms.detectPatchDrift(storyId, expectedFiles);
          console.log(`Drift detection completed - Severity: ${report.severity}`);
          if (report.severity === 'critical' || report.severity === 'high') {
            process.exit(1);
          }
        }
        break;

      case 'list':
        {
          const reports = await driftAlarms.listDriftReports(storyId);
          console.log(`Found ${reports.length} drift reports${storyId ? ` for story ${storyId}` : ''}:`);
          reports.forEach(report => {
            console.log(`  ${report.storyId} - ${report.timestamp} - ${report.severity} (${report.alarmsCount} alarms)`);
          });
        }
        break;

      case 'clear':
        {
          if (!storyId) {
            console.error('Usage: node drift-alarms.js clear <storyId>');
            process.exit(1);
          }
          const cleared = await driftAlarms.clearAlarms(storyId);
          console.log(cleared ? 'Alarms cleared' : 'No alarms to clear');
        }
        break;

      default:
        console.log('Usage: node drift-alarms.js <detect|list|clear> [args...]');
        console.log('Commands:');
        console.log('  detect <storyId> <file1> [file2...]  - Detect drift during patch application');
        console.log('  list [storyId]                       - List drift reports');
        console.log('  clear <storyId>                      - Clear alarms for story');
        process.exit(1);
    }
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}