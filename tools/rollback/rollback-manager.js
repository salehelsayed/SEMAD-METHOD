const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class RollbackManager {
  constructor() {
    this.rollbackDir = path.join(process.cwd(), '.ai', 'rollbacks');
    this.hookDir = path.join(process.cwd(), '.ai', 'hooks');
  }
  
  async createRollbackPoint(name = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rollbackName = name || `rollback-${timestamp}`;
    
    console.log(`[ROLLBACK] Creating rollback point: ${rollbackName}`);
    
    await fs.mkdir(this.rollbackDir, { recursive: true });
    
    const rollbackData = {
      name: rollbackName,
      timestamp: new Date().toISOString(),
      gitCommit: await this.getCurrentCommit(),
      files: await this.captureFileState(),
      config: await this.captureConfigState(),
      metadata: {
        triggeredBy: process.env.USER || 'system',
        reason: 'automatic-checkpoint'
      }
    };
    
    const rollbackFile = path.join(this.rollbackDir, `${rollbackName}.json`);
    await fs.writeFile(rollbackFile, JSON.stringify(rollbackData, null, 2));
    
    console.log(`[ROLLBACK] Rollback point created: ${rollbackFile}`);
    return rollbackData;
  }
  
  async executeRollback(rollbackName) {
    console.log(`[ROLLBACK] Executing rollback to: ${rollbackName}`);
    
    const rollbackFile = path.join(this.rollbackDir, `${rollbackName}.json`);
    
    try {
      const rollbackData = JSON.parse(await fs.readFile(rollbackFile, 'utf-8'));
      
      // Execute pre-rollback hooks
      await this.executeHooks('pre-rollback', rollbackData);
      
      // Restore files
      await this.restoreFiles(rollbackData.files);
      
      // Restore configurations
      await this.restoreConfig(rollbackData.config);
      
      // Git rollback if needed
      if (rollbackData.gitCommit) {
        await this.gitRollback(rollbackData.gitCommit);
      }
      
      // Execute post-rollback hooks
      await this.executeHooks('post-rollback', rollbackData);
      
      console.log(`[ROLLBACK] Successfully rolled back to ${rollbackName}`);
      return true;
    } catch (error) {
      console.error(`[ROLLBACK] Failed to execute rollback: ${error.message}`);
      return false;
    }
  }
  
  async listRollbackPoints() {
    try {
      const files = await fs.readdir(this.rollbackDir);
      const rollbacks = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = JSON.parse(await fs.readFile(path.join(this.rollbackDir, file), 'utf-8'));
          rollbacks.push({
            name: data.name,
            timestamp: data.timestamp,
            commit: data.gitCommit,
            triggeredBy: data.metadata.triggeredBy
          });
        }
      }
      
      return rollbacks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      return [];
    }
  }
  
  async registerHook(hookType, script) {
    await fs.mkdir(this.hookDir, { recursive: true });
    
    const hookFile = path.join(this.hookDir, `${hookType}.js`);
    await fs.writeFile(hookFile, script);
    
    console.log(`[ROLLBACK] Registered ${hookType} hook`);
  }
  
  async executeHooks(hookType, rollbackData) {
    const hookFile = path.join(this.hookDir, `${hookType}.js`);
    
    try {
      await fs.access(hookFile);
      console.log(`[ROLLBACK] Executing ${hookType} hooks...`);
      
      const hook = require(hookFile);
      if (typeof hook.execute === 'function') {
        await hook.execute(rollbackData);
      }
    } catch (error) {
      console.log(`[ROLLBACK] No ${hookType} hooks found`);
    }
  }
  
  async getCurrentCommit() {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD');
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }
  
  async captureFileState() {
    const coreFiles = [
      'package.json',
      '.bmadrc.yaml',
      'bmad.config.js'
    ];
    
    const fileState = {};
    
    for (const file of coreFiles) {
      try {
        const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
        fileState[file] = content;
      } catch (error) {
        // File doesn't exist
      }
    }
    
    return fileState;
  }
  
  async captureConfigState() {
    const configState = {};
    const configDir = path.join(process.cwd(), '.ai');
    
    try {
      const files = await fs.readdir(configDir);
      for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.yaml')) {
          const content = await fs.readFile(path.join(configDir, file), 'utf-8');
          configState[file] = content;
        }
      }
    } catch (error) {
      // Config directory doesn't exist
    }
    
    return configState;
  }
  
  async restoreFiles(fileState) {
    for (const [file, content] of Object.entries(fileState)) {
      try {
        await fs.writeFile(path.join(process.cwd(), file), content);
        console.log(`[ROLLBACK] Restored ${file}`);
      } catch (error) {
        console.error(`[ROLLBACK] Failed to restore ${file}: ${error.message}`);
      }
    }
  }
  
  async restoreConfig(configState) {
    const configDir = path.join(process.cwd(), '.ai');
    await fs.mkdir(configDir, { recursive: true });
    
    for (const [file, content] of Object.entries(configState)) {
      try {
        await fs.writeFile(path.join(configDir, file), content);
        console.log(`[ROLLBACK] Restored config ${file}`);
      } catch (error) {
        console.error(`[ROLLBACK] Failed to restore config ${file}: ${error.message}`);
      }
    }
  }
  
  async gitRollback(commitHash) {
    try {
      console.log(`[ROLLBACK] Rolling back git to ${commitHash}`);
      await execAsync(`git reset --hard ${commitHash}`);
    } catch (error) {
      console.error(`[ROLLBACK] Git rollback failed: ${error.message}`);
    }
  }
}

module.exports = { RollbackManager };

if (require.main === module) {
  const manager = new RollbackManager();
  const command = process.argv[2];
  const arg = process.argv[3];
  
  switch (command) {
    case 'create':
      manager.createRollbackPoint(arg).then(() => {
        console.log('[ROLLBACK] Rollback point created successfully');
      });
      break;
    case 'rollback':
      manager.executeRollback(arg).then(success => {
        process.exit(success ? 0 : 1);
      });
      break;
    case 'list':
      manager.listRollbackPoints().then(rollbacks => {
        console.log('Available rollback points:');
        rollbacks.forEach(rb => {
          console.log(`  ${rb.name} - ${rb.timestamp} (${rb.triggeredBy})`);
        });
      });
      break;
    default:
      console.log('Usage: node rollback-manager.js [create|rollback|list] [name]');
  }
}