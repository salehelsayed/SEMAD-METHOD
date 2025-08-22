#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// AH-006: Static Reference Checker
async function execute() {
  console.log('[AH-006] Implementing Static Reference Checker...');
  
  const toolsDir = path.join(__dirname, '..', '..');
  const refCheckerDir = path.join(toolsDir, 'reference-checker');
  const parsersDir = path.join(refCheckerDir, 'parsers');
  const docsDir = path.join(__dirname, '..', '..', '..', 'docs');
  
  // Ensure directories exist
  await fs.mkdir(parsersDir, { recursive: true });
  
  // Create check-references.js
  const checkReferencesScript = `const fs = require('fs').promises;
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
      }).trim().split('\\n').filter(Boolean);
      
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
            console.warn(\`[REF-CHECK] Warning: Could not parse \${file}: \${error.message}\`);
          }
        }
      }
      
      console.log(\`[REF-CHECK] Found \${this.knownFiles.size} files and \${this.knownSymbols.size} symbols\`);
      
    } catch (error) {
      throw new Error(\`Failed to scan repository: \${error.message}\`);
    }
  }

  async loadPatchPlan(patchPlanPath) {
    console.log(\`[REF-CHECK] Loading patch plan: \${patchPlanPath}\`);
    
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
      
      console.log(\`[REF-CHECK] Patch plan will create \${this.createdFiles.size} files and \${this.createdSymbols.size} symbols\`);
      
      return patchPlan;
      
    } catch (error) {
      throw new Error(\`Failed to load patch plan: \${error.message}\`);
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
                    message: \`Reference '\${ref.identifier}' cannot be resolved\`
                  });
                }
              }
            } catch (error) {
              this.errors.push({
                type: 'parse-error',
                file: filePath,
                operation: operation.type,
                message: \`Failed to parse content: \${error.message}\`
              });
            }
          }
        }
      }
    }
    
    const hasErrors = this.errors.length > 0;
    
    if (hasErrors) {
      console.error(\`[REF-CHECK] ✗ Found \${this.errors.length} reference errors\`);
      this.errors.forEach(error => {
        console.error(\`  \${error.file}: \${error.message}\`);
      });
    } else {
      console.log(\`[REF-CHECK] ✓ All \${this.references.length} references are resolvable\`);
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
      return this.knownSymbols.has(\`\${moduleFile}:\${identifier}\`) ||
             this.createdSymbols.has(\`\${moduleFile}:\${identifier}\`);
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
    console.log(\`[REF-CHECK] Report saved to \${outputPath}\`);
    
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
`;
  
  await fs.writeFile(
    path.join(refCheckerDir, 'check-references.js'),
    checkReferencesScript
  );
  
  // Create JavaScript parser
  const javascriptParser = `const path = require('path');

class JavaScriptParser {
  async extractSymbols(content, filePath) {
    const symbols = [];
    
    // Extract function declarations
    const functionRegex = /function\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(/g;
    let match;
    
    while ((match = functionRegex.exec(content)) !== null) {
      symbols.push(\`\${filePath}:\${match[1]}\`);
    }
    
    // Extract arrow functions assigned to variables
    const arrowFunctionRegex = /(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*\\([^)]*\\)\\s*=>/g;
    
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
      symbols.push(\`\${filePath}:\${match[1]}\`);
    }
    
    // Extract class declarations
    const classRegex = /class\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*(?:extends\\s+[a-zA-Z_$][a-zA-Z0-9_$]*)?\\s*\\{/g;
    
    while ((match = classRegex.exec(content)) !== null) {
      symbols.push(\`\${filePath}:\${match[1]}\`);
    }
    
    // Extract exports
    const exportRegex = /module\\.exports\\s*=\\s*\\{([^}]+)\\}/g;
    
    while ((match = exportRegex.exec(content)) !== null) {
      const exportContent = match[1];
      const exportedNames = exportContent.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
      
      if (exportedNames) {
        exportedNames.forEach(name => {
          symbols.push(\`\${filePath}:\${name}\`);
        });
      }
    }
    
    return symbols;
  }

  async extractReferences(content, filePath) {
    const references = [];
    
    // Extract require statements
    const requireRegex = /require\\s*\\(\\s*['"]([^'"]+)['"]\\s*\\)/g;
    let match;
    
    while ((match = requireRegex.exec(content)) !== null) {
      references.push({
        type: 'import',
        module: match[1],
        line: this.getLineNumber(content, match.index),
        identifier: null
      });
    }
    
    // Extract destructured requires
    const destructureRequireRegex = /const\\s*\\{([^}]+)\\}\\s*=\\s*require\\s*\\(\\s*['"]([^'"]+)['"]\\s*\\)/g;
    
    while ((match = destructureRequireRegex.exec(content)) !== null) {
      const identifiers = match[1].split(',').map(id => id.trim());
      
      identifiers.forEach(identifier => {
        references.push({
          type: 'import',
          module: match[2],
          identifier: identifier,
          line: this.getLineNumber(content, match.index)
        });
      });
    }
    
    // Extract ES6 imports
    const importRegex = /import\\s+(?:\\{([^}]+)\\}\\s+from\\s+|([a-zA-Z_$][a-zA-Z0-9_$]*)\\s+from\\s+|\\*\\s+as\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s+from\\s+)['"]([^'"]+)['"]/g;
    
    while ((match = importRegex.exec(content)) !== null) {
      const namedImports = match[1];
      const defaultImport = match[2];
      const namespaceImport = match[3];
      const module = match[4];
      
      if (namedImports) {
        const identifiers = namedImports.split(',').map(id => id.trim());
        identifiers.forEach(identifier => {
          references.push({
            type: 'import',
            module: module,
            identifier: identifier,
            line: this.getLineNumber(content, match.index)
          });
        });
      } else if (defaultImport) {
        references.push({
          type: 'import',
          module: module,
          identifier: defaultImport,
          line: this.getLineNumber(content, match.index)
        });
      } else if (namespaceImport) {
        references.push({
          type: 'import',
          module: module,
          identifier: namespaceImport,
          line: this.getLineNumber(content, match.index)
        });
      }
    }
    
    // Extract function calls
    const functionCallRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(/g;
    
    while ((match = functionCallRegex.exec(content)) !== null) {
      // Skip common keywords
      const identifier = match[1];
      if (!['if', 'for', 'while', 'switch', 'function', 'class', 'const', 'let', 'var'].includes(identifier)) {
        references.push({
          type: 'function',
          identifier: identifier,
          line: this.getLineNumber(content, match.index)
        });
      }
    }
    
    return references;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\\n').length;
  }
}

module.exports = new JavaScriptParser();
`;
  
  await fs.writeFile(
    path.join(parsersDir, 'javascript-parser.js'),
    javascriptParser
  );
  
  // Create TypeScript parser (extends JavaScript)
  const typescriptParser = `const JavaScriptParser = require('./javascript-parser');

class TypeScriptParser extends JavaScriptParser.constructor {
  async extractSymbols(content, filePath) {
    const symbols = await super.extractSymbols(content, filePath);
    
    // Extract TypeScript interfaces
    const interfaceRegex = /interface\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*(?:extends\\s+[^{]+)?\\s*\\{/g;
    let match;
    
    while ((match = interfaceRegex.exec(content)) !== null) {
      symbols.push(\`\${filePath}:\${match[1]}\`);
    }
    
    // Extract TypeScript types
    const typeRegex = /type\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=/g;
    
    while ((match = typeRegex.exec(content)) !== null) {
      symbols.push(\`\${filePath}:\${match[1]}\`);
    }
    
    // Extract enums
    const enumRegex = /enum\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\{/g;
    
    while ((match = enumRegex.exec(content)) !== null) {
      symbols.push(\`\${filePath}:\${match[1]}\`);
    }
    
    return symbols;
  }

  async extractReferences(content, filePath) {
    const references = await super.extractReferences(content, filePath);
    
    // Extract type imports
    const typeImportRegex = /import\\s+type\\s+\\{([^}]+)\\}\\s+from\\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = typeImportRegex.exec(content)) !== null) {
      const types = match[1].split(',').map(t => t.trim());
      
      types.forEach(type => {
        references.push({
          type: 'import',
          module: match[2],
          identifier: type,
          typeOnly: true,
          line: this.getLineNumber(content, match.index)
        });
      });
    }
    
    return references;
  }
}

module.exports = new TypeScriptParser();
`;
  
  await fs.writeFile(
    path.join(parsersDir, 'typescript-parser.js'),
    typescriptParser
  );
  
  // Create Markdown parser
  const markdownParser = `class MarkdownParser {
  async extractSymbols(content, filePath) {
    // Markdown files typically don't export symbols
    return [];
  }

  async extractReferences(content, filePath) {
    const references = [];
    
    // Extract file links
    const linkRegex = /\\[([^\\]]+)\\]\\(([^)]+)\\)/g;
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const url = match[2];
      
      // Only check local file references
      if (!url.startsWith('http') && !url.startsWith('#')) {
        references.push({
          type: 'file',
          path: url,
          line: this.getLineNumber(content, match.index),
          description: match[1]
        });
      }
    }
    
    // Extract code fence file references
    const codeFenceRegex = /\`\`\`[a-zA-Z]*\\s*([^\\n]*\\.\\w+)\\s*\\n/g;
    
    while ((match = codeFenceRegex.exec(content)) !== null) {
      const filePath = match[1].trim();
      
      if (filePath && filePath.includes('.')) {
        references.push({
          type: 'file',
          path: filePath,
          line: this.getLineNumber(content, match.index),
          context: 'code-fence'
        });
      }
    }
    
    // Extract image references
    const imageRegex = /!\\[([^\\]]*)\\]\\(([^)]+)\\)/g;
    
    while ((match = imageRegex.exec(content)) !== null) {
      const imagePath = match[2];
      
      if (!imagePath.startsWith('http')) {
        references.push({
          type: 'file',
          path: imagePath,
          line: this.getLineNumber(content, match.index),
          context: 'image'
        });
      }
    }
    
    return references;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\\n').length;
  }
}

module.exports = new MarkdownParser();
`;
  
  await fs.writeFile(
    path.join(parsersDir, 'markdown-parser.js'),
    markdownParser
  );
  
  // Create YAML parser
  const yamlParser = `class YamlParser {
  async extractSymbols(content, filePath) {
    // YAML files typically don't export symbols
    return [];
  }

  async extractReferences(content, filePath) {
    const references = [];
    
    // Extract file path references in YAML values
    const filePathRegex = /\\s*[a-zA-Z_][a-zA-Z0-9_]*\\s*:\\s*(['"]?)([^\\s'"]+\\.[a-zA-Z]+)\\1/g;
    let match;
    
    while ((match = filePathRegex.exec(content)) !== null) {
      const filePath = match[2];
      
      // Skip URLs and absolute paths
      if (!filePath.startsWith('http') && !filePath.startsWith('/') && filePath.includes('.')) {
        references.push({
          type: 'file',
          path: filePath,
          line: this.getLineNumber(content, match.index),
          context: 'yaml-value'
        });
      }
    }
    
    // Extract path arrays
    const pathArrayRegex = /\\s*-\\s*(['"]?)([^\\s'"]+\\.[a-zA-Z]+)\\1/g;
    
    while ((match = pathArrayRegex.exec(content)) !== null) {
      const filePath = match[2];
      
      if (!filePath.startsWith('http') && !filePath.startsWith('/') && filePath.includes('.')) {
        references.push({
          type: 'file',
          path: filePath,
          line: this.getLineNumber(content, match.index),
          context: 'yaml-array'
        });
      }
    }
    
    return references;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\\n').length;
  }
}

module.exports = new YamlParser();
`;
  
  await fs.writeFile(
    path.join(parsersDir, 'yaml-parser.js'),
    yamlParser
  );
  
  // Update validation-system.md documentation
  const validationDocPath = path.join(docsDir, 'validation-system.md');
  
  let existingValidationDoc = '';
  try {
    existingValidationDoc = await fs.readFile(validationDocPath, 'utf-8');
  } catch (error) {
    // File doesn't exist, start with empty content
  }
  
  const referenceCheckerDoc = `
## Reference Checker (AH-006)

The static reference checker validates that all file and symbol references in patch plans are resolvable.

### Overview

The reference checker prevents "hallucinated" code from being merged by:
1. Scanning the repository for existing files and symbols
2. Analyzing patch plans to extract new files and symbols that will be created
3. Validating all references in changed code against known + to-be-created assets
4. Failing the check if any references are unresolvable

### Language Support

#### JavaScript/TypeScript
- Import/export statements (\`require\`, \`import\`, \`module.exports\`)
- Function declarations and calls
- Class declarations and usage
- Variable references
- TypeScript-specific: interfaces, types, enums

#### Markdown
- File links: \`[text](path/to/file)\`
- Image references: \`![alt](path/to/image)\`
- Code fence file references

#### YAML
- File path values in configuration
- Path arrays and lists

### Usage

\`\`\`bash
# Check references in a patch plan
npm run reference:check

# Direct usage
node tools/reference-checker/check-references.js patch-plan.json

# With custom project directory
node tools/reference-checker/check-references.js patch-plan.json /path/to/project
\`\`\`

### Integration

The reference checker is automatically invoked by:
- \`npm run preflight:all\` (see AH-003)
- Development → QA gate (see AH-004)

### Reference Types

#### File References
- Relative paths: \`./utils/helper.js\`, \`../config/settings.json\`
- Absolute project paths: \`/src/components/Button.tsx\`
- Direct file names: \`package.json\`, \`README.md\`

#### Import References
- Node modules: \`require('express')\` (assumed available)
- Local modules: \`require('./utils')\`, \`import { helper } from '../lib'\`
- Type imports: \`import type { User } from './types'\`

#### Symbol References
- Function calls: \`calculateTotal()\`, \`user.getName()\`
- Class usage: \`new UserService()\`
- Variable access: \`config.apiUrl\`

### Resolution Logic

1. **Known Assets**: Files and symbols currently in the repository
2. **Created Assets**: Files and symbols defined in the patch plan
3. **Resolution**: Reference is valid if it exists in known OR created assets

### Error Types

- **Unresolved Reference**: Symbol/file not found in known or created sets
- **Parse Error**: Unable to extract references from content
- **Module Resolution**: Cannot resolve local module imports

### Reports

Reference check results are saved to \`.ai/reference-check.json\`:

\`\`\`json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "summary": {
    "filesScanned": 150,
    "symbolsFound": 45,
    "referencesChecked": 12,
    "errorsFound": 0,
    "passed": true
  },
  "references": [...],
  "errors": [...]
}
\`\`\`

### Configuration

The reference checker uses conservative rules to minimize false negatives:
- Unknown reference types are assumed valid
- External module imports are not validated
- Dynamic imports and eval statements are not checked

### Extending Support

To add support for new languages:

1. Create a parser in \`tools/reference-checker/parsers/\`
2. Implement \`extractSymbols(content, filePath)\` and \`extractReferences(content, filePath)\`
3. Register the parser in \`check-references.js\`

### Limitations

- Does not validate runtime-generated references
- Cannot check dynamic import paths
- May miss complex destructuring patterns
- Assumes well-formed code syntax

`;
  
  // Append reference checker documentation if it doesn't exist
  if (!existingValidationDoc.includes('## Reference Checker')) {
    await fs.writeFile(validationDocPath, existingValidationDoc + referenceCheckerDoc);
  }
  
  console.log('[AH-006] ✓ Static Reference Checker implementation complete');
}

module.exports = { execute };