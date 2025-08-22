const fs = require('fs').promises;
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
    
    console.log(`[DRIFT] Baseline created with ${Object.keys(snapshot.files).length} files`);
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
        structure.push(`${dir}/${entry.name}`);
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
      console.log(`[DRIFT] Drift report generated - Severity: ${report.severity}`);
      if (report.severity === 'critical' || report.severity === 'high') {
        console.error('Critical drift detected!');
        process.exit(1);
      }
    });
  }
}