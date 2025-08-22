const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class ReferenceChecker {
  constructor() {
    this.parsers = {};
    this.knownFiles = new Set();
    this.createdFiles = new Set();
    this.knownSymbols = new Set();
    this.createdSymbols = new Set();
    this.references = [];
    this.errors = [];
  }

  async initialize() {
    // Load language parsers
    this.parsers = {
      'js': require('./parsers/javascript-parser'),
      'ts': require('./parsers/typescript-parser'), 
      'md': require('./parsers/markdown-parser'),
      'yaml': require('./parsers/yaml-parser'),
      'yml': require('./parsers/yaml-parser')
    };
    
    console.log('[REF-CHECK] Reference checker initialized');
  }

  async scanRepository(projectDir = process.cwd()) {
    console.log('[REF-CHECK] Scanning repository for existing files and symbols...');
    
    try {
      // Get all tracked files
      const gitFiles = execSync('git ls-files', { 
        cwd: projectDir, 
        encoding: 'utf-8' 
      }).trim().split('\n').filter(Boolean);
      
      gitFiles.forEach(file => this.knownFiles.add(file));
      
      // Extract symbols from known files
      for (const file of gitFiles) {
        const fullPath = path.join(projectDir, file);
        const ext = path.extname(file).slice(1);
        
        if (this.parsers[ext]) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const symbols = await this.parsers[ext].extractSymbols(content, file);
            symbols.forEach(symbol => this.knownSymbols.add(symbol));
          } catch (error) {
            console.warn(`[REF-CHECK] Warning: Could not parse ${file}: ${error.message}`);
          }
        }
      }
      
      console.log(`[REF-CHECK] Found ${this.knownFiles.size} files and ${this.knownSymbols.size} symbols`);
      
    } catch (error) {
      throw new Error(`Failed to scan repository: ${error.message}`);
    }
  }

  async loadPatchPlan(patchPlanPath) {
    console.log(`[REF-CHECK] Loading patch plan: ${patchPlanPath}`);
    
    try {
      const patchPlan = JSON.parse(await fs.readFile(patchPlanPath, 'utf-8'));
      
      // Extract files and symbols that will be created
      for (const change of patchPlan.changes) {
        this.createdFiles.add(change.path);
        
        // Extract symbols from operations
        for (const operation of change.operations) {
          if (operation.location && operation.location.symbol) {
            this.createdSymbols.add(operation.location.symbol);
          }
        }
        
        // Add explicitly listed symbols
        if (change.symbols) {
          change.symbols.forEach(symbol => this.createdSymbols.add(symbol));
        }
      }
      
      console.log(`[REF-CHECK] Patch plan will create ${this.createdFiles.size} files and ${this.createdSymbols.size} symbols`);
      
      return patchPlan;
      
    } catch (error) {
      throw new Error(`Failed to load patch plan: ${error.message}`);
    }
  }

  async checkPatchReferences(patchPlanPath, projectDir = process.cwd()) {
    console.log('[REF-CHECK] Checking patch references...');
    
    const patchPlan = await this.loadPatchPlan(patchPlanPath);
    this.errors = [];
    this.references = [];
    
    for (const change of patchPlan.changes) {
      const filePath = change.path;
      const ext = path.extname(filePath).slice(1);
      
      if (this.parsers[ext]) {
        // Extract references from new content
        for (const operation of change.operations) {
          if (operation.content) {
            try {
              const refs = await this.parsers[ext].extractReferences(operation.content, filePath);
              
              for (const ref of refs) {
                this.references.push({
                  file: filePath,
                  operation: operation.type,
                  reference: ref,
                  location: operation.location
                });
                
                // Check if reference is resolvable
                const isResolvable = this.isReferenceResolvable(ref, filePath, projectDir);
                
                if (!isResolvable) {
                  this.errors.push({
                    type: 'unresolved-reference',
                    file: filePath,
                    reference: ref,
                    operation: operation.type,
                    message: `Reference '${ref.identifier}' cannot be resolved`
                  });
                }
              }
            } catch (error) {
              this.errors.push({
                type: 'parse-error',
                file: filePath,
                operation: operation.type,
                message: `Failed to parse content: ${error.message}`
              });
            }
          }
        }
      }
    }
    
    const hasErrors = this.errors.length > 0;
    
    if (hasErrors) {
      console.error(`[REF-CHECK] ✗ Found ${this.errors.length} reference errors`);
      this.errors.forEach(error => {
        console.error(`  ${error.file}: ${error.message}`);
      });
    } else {
      console.log(`[REF-CHECK] ✓ All ${this.references.length} references are resolvable`);
    }
    
    return !hasErrors;
  }

  isReferenceResolvable(reference, fromFile, projectDir) {
    switch (reference.type) {
      case 'file':
        return this.isFileResolvable(reference.path, fromFile, projectDir);
      
      case 'import':
        return this.isImportResolvable(reference.module, reference.identifier, fromFile, projectDir);
      
      case 'function':
      case 'class':
      case 'variable':
        return this.isSymbolResolvable(reference.identifier);
      
      default:
        return true; // Conservative: assume unknown reference types are valid
    }
  }

  isFileResolvable(filePath, fromFile, projectDir) {
    // Handle relative paths
    if (filePath.startsWith('./') || filePath.startsWith('../')) {
      const resolvedPath = path.resolve(path.dirname(fromFile), filePath);
      const relativePath = path.relative(projectDir, resolvedPath);
      return this.knownFiles.has(relativePath) || this.createdFiles.has(relativePath);
    }
    
    // Handle absolute paths within project
    if (filePath.startsWith('/')) {
      const relativePath = filePath.slice(1);
      return this.knownFiles.has(relativePath) || this.createdFiles.has(relativePath);
    }
    
    // Handle direct file references
    return this.knownFiles.has(filePath) || this.createdFiles.has(filePath);
  }

  isImportResolvable(moduleName, identifier, fromFile, projectDir) {
    // Node modules are assumed to be available
    if (!moduleName.startsWith('.')) {
      return true;
    }
    
    // Local module imports
    const moduleFile = this.resolveModulePath(moduleName, fromFile, projectDir);
    if (!moduleFile) {
      return false;
    }
    
    // If specific identifier is imported, check if it exists
    if (identifier) {
      return this.knownSymbols.has(`${moduleFile}:${identifier}`) ||
             this.createdSymbols.has(`${moduleFile}:${identifier}`);
    }
    
    return true;
  }

  isSymbolResolvable(symbolName) {
    return this.knownSymbols.has(symbolName) || this.createdSymbols.has(symbolName);
  }

  resolveModulePath(moduleName, fromFile, projectDir) {
    const possibleExtensions = ['.js', '.ts', '.json'];
    const basePath = path.resolve(path.dirname(fromFile), moduleName);
    
    // Try direct path
    for (const ext of possibleExtensions) {
      const fullPath = basePath + ext;
      const relativePath = path.relative(projectDir, fullPath);
      
      if (this.knownFiles.has(relativePath) || this.createdFiles.has(relativePath)) {
        return relativePath;
      }
    }
    
    // Try index files
    for (const ext of possibleExtensions) {
      const indexPath = path.join(basePath, 'index' + ext);
      const relativePath = path.relative(projectDir, indexPath);
      
      if (this.knownFiles.has(relativePath) || this.createdFiles.has(relativePath)) {
        return relativePath;
      }
    }
    
    return null;
  }

  async generateReport(outputPath) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        filesScanned: this.knownFiles.size,
        symbolsFound: this.knownSymbols.size,
        referencesChecked: this.references.length,
        errorsFound: this.errors.length,
        passed: this.errors.length === 0
      },
      references: this.references,
      errors: this.errors,
      knownFiles: Array.from(this.knownFiles),
      createdFiles: Array.from(this.createdFiles)
    };
    
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(`[REF-CHECK] Report saved to ${outputPath}`);
    
    return report;
  }
}

module.exports = { ReferenceChecker };

// CLI usage
if (require.main === module) {
  async function main() {
    const patchPlanPath = process.argv[2];
    const projectDir = process.argv[3] || process.cwd();

    if (!patchPlanPath) {
      console.error('Usage: node check-references.js <patch-plan.json> [project-dir]');
      process.exit(1);
    }

    const checker = new ReferenceChecker();
    await checker.initialize();
    await checker.scanRepository(projectDir);
    
    const passed = await checker.checkPatchReferences(patchPlanPath, projectDir);
    
    // Generate report
    const reportPath = path.join(projectDir, '.ai', 'reference-check.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await checker.generateReport(reportPath);
    
    process.exit(passed ? 0 : 1);
  }

  main().catch(error => {
    console.error('[REF-CHECK] Fatal error:', error.message);
    process.exit(1);
  });
}
