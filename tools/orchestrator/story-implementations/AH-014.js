#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// AH-014: Rollback Hooks & Drift Alarms
async function execute() {
  console.log('[AH-014] Implementing Rollback Hooks & Drift Alarms...');
  
  const toolsDir = path.join(__dirname, '..', '..');
  const rollbackDir = path.join(toolsDir, 'rollback');
  const ciDir = path.join(__dirname, '..', '..', '..', '.github', 'workflows');
  
  await fs.mkdir(rollbackDir, { recursive: true });
  await fs.mkdir(ciDir, { recursive: true });
  
  // Create drift-detector.js
  const driftDetector = `const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class DriftDetector {
  constructor() {
    this.snapshotFile = path.join(process.cwd(), '.ai', 'baseline-snapshot.json');
    this.configFile = path.join(process.cwd(), '.ai', 'drift-config.json');
    this.driftThresholds = {
      fileChanges: 10,
      structuralChanges: 5,
      dependencyChanges: 3,
      configChanges: 2
    };
  }
  
  async createBaseline() {
    console.log('[DRIFT] Creating baseline snapshot...');
    
    const snapshot = {
      timestamp: new Date().toISOString(),
      files: await this.getFileSnapshot(),
      structure: await this.getStructureSnapshot(),
      dependencies: await this.getDependencySnapshot(),
      config: await this.getConfigSnapshot()
    };
    
    await fs.mkdir(path.dirname(this.snapshotFile), { recursive: true });
    await fs.writeFile(this.snapshotFile, JSON.stringify(snapshot, null, 2));
    
    console.log(\`[DRIFT] Baseline created with \${Object.keys(snapshot.files).length} files\`);
    return snapshot;
  }
  
  async detectDrift() {
    console.log('[DRIFT] Detecting configuration drift...');
    
    try {
      const baseline = JSON.parse(await fs.readFile(this.snapshotFile, 'utf-8'));
      const current = {
        files: await this.getFileSnapshot(),
        structure: await this.getStructureSnapshot(),
        dependencies: await this.getDependencySnapshot(),
        config: await this.getConfigSnapshot()
      };
      
      const driftReport = {
        timestamp: new Date().toISOString(),
        baseline: baseline.timestamp,
        changes: {
          files: this.compareFiles(baseline.files, current.files),
          structure: this.compareStructure(baseline.structure, current.structure),
          dependencies: this.compareDependencies(baseline.dependencies, current.dependencies),
          config: this.compareConfig(baseline.config, current.config)
        },
        severity: 'low'
      };
      
      // Calculate severity
      const totalChanges = 
        driftReport.changes.files.added.length + 
        driftReport.changes.files.modified.length + 
        driftReport.changes.files.deleted.length +
        driftReport.changes.structure.length +
        driftReport.changes.dependencies.length +
        driftReport.changes.config.length;
      
      if (totalChanges > 20) driftReport.severity = 'critical';
      else if (totalChanges > 10) driftReport.severity = 'high';
      else if (totalChanges > 5) driftReport.severity = 'medium';
      
      return driftReport;
    } catch (error) {
      console.log('[DRIFT] No baseline found, creating new baseline...');
      return await this.createBaseline();
    }
  }
  
  async getFileSnapshot() {
    const files = {};
    const coreFiles = await this.getCoreFiles(process.cwd());
    
    for (const file of coreFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        files[file] = {
          hash: crypto.createHash('md5').update(content).digest('hex'),
          size: content.length,
          lastModified: (await fs.stat(file)).mtime.toISOString()
        };
      } catch (error) {
        // File doesn't exist or can't be read
      }
    }
    
    return files;
  }
  
  async getStructureSnapshot() {
    const structure = [];
    const bmadConfig = path.join(process.cwd(), 'bmad-core');
    
    if (await this.exists(bmadConfig)) {
      const agents = await this.getDirectoryStructure(path.join(bmadConfig, 'agents'));
      const teams = await this.getDirectoryStructure(path.join(bmadConfig, 'agent-teams'));
      const workflows = await this.getDirectoryStructure(path.join(bmadConfig, 'workflows'));
      
      structure.push(...agents, ...teams, ...workflows);
    }
    
    return structure;
  }
  
  async getDependencySnapshot() {
    const dependencies = [];
    
    try {
      const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf-8'));
      dependencies.push({
        type: 'npm',
        dependencies: packageJson.dependencies || {},
        devDependencies: packageJson.devDependencies || {}
      });
    } catch (error) {
      // No package.json
    }
    
    return dependencies;
  }
  
  async getConfigSnapshot() {
    const configs = [];
    const configFiles = [
      '.bmadrc.yaml',
      'bmad.config.js',
      '.ai/settings.json',
      'bmad-core/config/dynamic-plan-config.yaml'
    ];
    
    for (const configFile of configFiles) {
      try {
        const content = await fs.readFile(path.join(process.cwd(), configFile), 'utf-8');
        configs.push({
          file: configFile,
          hash: crypto.createHash('md5').update(content).digest('hex')
        });
      } catch (error) {
        // Config file doesn't exist
      }
    }
    
    return configs;
  }
  
  compareFiles(baseline, current) {
    const added = [];
    const modified = [];
    const deleted = [];
    
    // Find added and modified files
    for (const [file, data] of Object.entries(current)) {
      if (!baseline[file]) {
        added.push(file);
      } else if (baseline[file].hash !== data.hash) {
        modified.push(file);
      }
    }
    
    // Find deleted files
    for (const file of Object.keys(baseline)) {
      if (!current[file]) {
        deleted.push(file);
      }
    }
    
    return { added, modified, deleted };
  }
  
  compareStructure(baseline, current) {
    const changes = [];
    const baselineSet = new Set(baseline);
    const currentSet = new Set(current);
    
    for (const item of currentSet) {
      if (!baselineSet.has(item)) {
        changes.push({ type: 'added', item });
      }
    }
    
    for (const item of baselineSet) {
      if (!currentSet.has(item)) {
        changes.push({ type: 'removed', item });
      }
    }
    
    return changes;
  }
  
  compareDependencies(baseline, current) {
    const changes = [];
    
    if (baseline.length === 0 && current.length === 0) return changes;
    
    const baselineDeps = baseline[0] || { dependencies: {}, devDependencies: {} };
    const currentDeps = current[0] || { dependencies: {}, devDependencies: {} };
    
    // Compare dependencies
    for (const [pkg, version] of Object.entries(currentDeps.dependencies)) {
      if (!baselineDeps.dependencies[pkg]) {
        changes.push({ type: 'dependency-added', package: pkg, version });
      } else if (baselineDeps.dependencies[pkg] !== version) {
        changes.push({ type: 'dependency-updated', package: pkg, from: baselineDeps.dependencies[pkg], to: version });
      }
    }
    
    return changes;
  }
  
  compareConfig(baseline, current) {
    const changes = [];
    const baselineMap = new Map(baseline.map(c => [c.file, c.hash]));
    
    for (const config of current) {
      const baselineHash = baselineMap.get(config.file);
      if (!baselineHash) {
        changes.push({ type: 'config-added', file: config.file });
      } else if (baselineHash !== config.hash) {
        changes.push({ type: 'config-modified', file: config.file });
      }
    }
    
    return changes;
  }
  
  async getCoreFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...await this.getCoreFiles(path.join(dir, entry.name)));
      } else if (entry.isFile() && this.isCoreFile(entry.name)) {
        files.push(path.join(dir, entry.name));
      }
    }
    
    return files;
  }
  
  isCoreFile(filename) {
    const coreExtensions = ['.yaml', '.yml', '.json', '.js', '.md'];
    const coreFiles = ['package.json', '.bmadrc.yaml', 'bmad.config.js'];
    
    return coreFiles.includes(filename) || 
           coreExtensions.some(ext => filename.endsWith(ext)) ||
           filename.startsWith('bmad-');
  }
  
  async getDirectoryStructure(dir) {
    const structure = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        structure.push(\`\${dir}/\${entry.name}\`);
      }
    } catch (error) {
      // Directory doesn't exist
    }
    
    return structure;
  }
  
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { DriftDetector };

if (require.main === module) {
  const detector = new DriftDetector();
  const command = process.argv[2];
  
  if (command === 'baseline') {
    detector.createBaseline().then(() => {
      console.log('[DRIFT] Baseline snapshot created successfully');
    });
  } else {
    detector.detectDrift().then(report => {
      console.log(\`[DRIFT] Drift report generated - Severity: \${report.severity}\`);
      if (report.severity === 'critical' || report.severity === 'high') {
        console.error('Critical drift detected!');
        process.exit(1);
      }
    });
  }
}`;
  
  await fs.writeFile(path.join(rollbackDir, 'drift-detector.js'), driftDetector);
  
  // Create rollback-manager.js
  const rollbackManager = `const fs = require('fs').promises;
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
    const rollbackName = name || \`rollback-\${timestamp}\`;
    
    console.log(\`[ROLLBACK] Creating rollback point: \${rollbackName}\`);
    
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
    
    const rollbackFile = path.join(this.rollbackDir, \`\${rollbackName}.json\`);
    await fs.writeFile(rollbackFile, JSON.stringify(rollbackData, null, 2));
    
    console.log(\`[ROLLBACK] Rollback point created: \${rollbackFile}\`);
    return rollbackData;
  }
  
  async executeRollback(rollbackName) {
    console.log(\`[ROLLBACK] Executing rollback to: \${rollbackName}\`);
    
    const rollbackFile = path.join(this.rollbackDir, \`\${rollbackName}.json\`);
    
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
      
      console.log(\`[ROLLBACK] Successfully rolled back to \${rollbackName}\`);
      return true;
    } catch (error) {
      console.error(\`[ROLLBACK] Failed to execute rollback: \${error.message}\`);
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
    
    const hookFile = path.join(this.hookDir, \`\${hookType}.js\`);
    await fs.writeFile(hookFile, script);
    
    console.log(\`[ROLLBACK] Registered \${hookType} hook\`);
  }
  
  async executeHooks(hookType, rollbackData) {
    const hookFile = path.join(this.hookDir, \`\${hookType}.js\`);
    
    try {
      await fs.access(hookFile);
      console.log(\`[ROLLBACK] Executing \${hookType} hooks...\`);
      
      const hook = require(hookFile);
      if (typeof hook.execute === 'function') {
        await hook.execute(rollbackData);
      }
    } catch (error) {
      console.log(\`[ROLLBACK] No \${hookType} hooks found\`);
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
        console.log(\`[ROLLBACK] Restored \${file}\`);
      } catch (error) {
        console.error(\`[ROLLBACK] Failed to restore \${file}: \${error.message}\`);
      }
    }
  }
  
  async restoreConfig(configState) {
    const configDir = path.join(process.cwd(), '.ai');
    await fs.mkdir(configDir, { recursive: true });
    
    for (const [file, content] of Object.entries(configState)) {
      try {
        await fs.writeFile(path.join(configDir, file), content);
        console.log(\`[ROLLBACK] Restored config \${file}\`);
      } catch (error) {
        console.error(\`[ROLLBACK] Failed to restore config \${file}: \${error.message}\`);
      }
    }
  }
  
  async gitRollback(commitHash) {
    try {
      console.log(\`[ROLLBACK] Rolling back git to \${commitHash}\`);
      await execAsync(\`git reset --hard \${commitHash}\`);
    } catch (error) {
      console.error(\`[ROLLBACK] Git rollback failed: \${error.message}\`);
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
          console.log(\`  \${rb.name} - \${rb.timestamp} (\${rb.triggeredBy})\`);
        });
      });
      break;
    default:
      console.log('Usage: node rollback-manager.js [create|rollback|list] [name]');
  }
}`;
  
  await fs.writeFile(path.join(rollbackDir, 'rollback-manager.js'), rollbackManager);
  
  // Create GitHub workflow for drift monitoring
  const driftWorkflow = `name: Drift Detection & Rollback

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  drift-detection:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
      with:
        fetch-depth: 0
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Check for drift
      id: drift
      run: |
        node tools/rollback/drift-detector.js > drift-report.json
        echo "drift_detected=\$(cat drift-report.json | jq -r '.severity')" >> \$GITHUB_OUTPUT
    
    - name: Create rollback point on high drift
      if: contains(steps.drift.outputs.drift_detected, 'high') || contains(steps.drift.outputs.drift_detected, 'critical')
      run: node tools/rollback/rollback-manager.js create "drift-\${{ github.sha }}"
    
    - name: Alert on critical drift
      if: contains(steps.drift.outputs.drift_detected, 'critical')
      uses: 8398a7/action-slack@v3
      with:
        status: failure
        text: 'Critical configuration drift detected in \${{ github.repository }}'
      env:
        SLACK_WEBHOOK_URL: \${{ secrets.SLACK_WEBHOOK }}
    
    - name: Upload drift report
      uses: actions/upload-artifact@v3
      with:
        name: drift-report
        path: drift-report.json
`;
  
  await fs.writeFile(path.join(ciDir, 'drift-monitoring.yml'), driftWorkflow);
  
  // Create example rollback hooks
  const preRollbackHook = `// Pre-rollback hook - executed before rollback
async function execute(rollbackData) {
  console.log(\`[HOOK] Executing pre-rollback for \${rollbackData.name}\`);
  
  // Stop any running services
  // Backup current state
  // Notify team of rollback
  
  console.log('[HOOK] Pre-rollback hook completed');
}

module.exports = { execute };`;
  
  const postRollbackHook = `// Post-rollback hook - executed after rollback
async function execute(rollbackData) {
  console.log(\`[HOOK] Executing post-rollback for \${rollbackData.name}\`);
  
  // Restart services
  // Verify rollback success
  // Update monitoring
  
  console.log('[HOOK] Post-rollback hook completed');
}

module.exports = { execute };`;
  
  const hooksDir = path.join(__dirname, '..', '..', '..', '.ai', 'hooks');
  await fs.mkdir(hooksDir, { recursive: true });
  await fs.writeFile(path.join(hooksDir, 'pre-rollback.js'), preRollbackHook);
  await fs.writeFile(path.join(hooksDir, 'post-rollback.js'), postRollbackHook);
  
  console.log('[AH-014] ✓ Rollback Hooks & Drift Alarms implementation complete');
}

module.exports = { execute };