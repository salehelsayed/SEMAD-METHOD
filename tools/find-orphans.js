#!/usr/bin/env node

/**
 * Find Orphaned Files and Dead Code
 * Detects:
 * - Files not imported/required anywhere
 * - Unused exports
 * - Test files without corresponding source files
 * - Empty or near-empty files
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');
const { Command } = require('commander');

// File patterns to analyze
const DEFAULT_PATTERNS = {
  source: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
  ignore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/.next/**',
    '**/.cache/**',
    '**/public/**',
    '**/*.min.js',
    '**/*.bundle.js'
  ]
};

// Entry point patterns (files that are typically entry points)
const ENTRY_PATTERNS = [
  '**/index.js',
  '**/index.ts',
  '**/main.js',
  '**/main.ts',
  '**/app.js',
  '**/app.ts',
  '**/cli.js',
  '**/bin/*.js',
  '**/*.config.js',
  '**/*.config.ts',
  '**/scripts/**/*.js',
  '**/tools/**/*.js'
];

class OrphanDetector {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.patterns = options.patterns || DEFAULT_PATTERNS;
    this.verbose = options.verbose || false;
    this.includeTests = options.includeTests || false;
    
    // Storage for analysis
    this.allFiles = new Set();
    this.importedFiles = new Set();
    this.exportMap = new Map(); // file -> exports
    this.importMap = new Map(); // file -> imports
    this.requireMap = new Map(); // who requires what
  }

  /**
   * Main analysis function
   */
  async analyze() {
    console.log(chalk.cyan('🔍 Analyzing codebase for orphaned files and code issues...\n'));
    
    // Step 1: Find all files
    await this.findAllFiles();
    
    // Step 2: Analyze imports/exports
    await this.analyzeImportsExports();
    
    // Step 3: Identify orphans
    const orphans = this.identifyOrphans();
    
    // Step 4: Find unused exports
    const unusedExports = this.findUnusedExports();
    
    // Step 5: Find empty files
    const emptyFiles = this.findEmptyFiles();
    
    // Step 6: Find test orphans
    const testOrphans = this.findTestOrphans();
    
    // Step 7: Find code issues
    const codeIssues = this.findCodeIssues();
    
    // Step 8: Find dead code
    const deadCode = this.findDeadCode();
    
    return {
      orphans,
      unusedExports,
      emptyFiles,
      testOrphans,
      codeIssues,
      deadCode,
      stats: {
        totalFiles: this.allFiles.size,
        importedFiles: this.importedFiles.size,
        orphanedFiles: orphans.length,
        filesWithUnusedExports: unusedExports.length,
        emptyFiles: emptyFiles.length,
        orphanedTests: testOrphans.length,
        filesWithCommentedCode: codeIssues.commentedCode.length,
        filesWithTodos: codeIssues.todos.length,
        filesWithConsoleLogs: codeIssues.consoleLogs.length,
        filesWithErrorPatterns: codeIssues.errorPatterns.length,
        filesWithDebugCode: codeIssues.debugCode.length,
        filesWithDeprecatedCode: codeIssues.deprecatedCode.length,
        filesWithDeadCode: deadCode.length
      }
    };
  }

  /**
   * Find all JavaScript/TypeScript files
   */
  async findAllFiles() {
    const patterns = this.patterns.source;
    
    for (const pattern of patterns) {
      const files = glob.sync(pattern, {
        cwd: this.rootDir,
        ignore: this.patterns.ignore,
        absolute: false
      });
      
      files.forEach(file => {
        const fullPath = path.resolve(this.rootDir, file);
        // Skip test files if not including tests
        if (!this.includeTests && file.includes('.test.') || file.includes('.spec.')) {
          return;
        }
        this.allFiles.add(fullPath);
      });
    }
    
    if (this.verbose) {
      console.log(chalk.gray(`Found ${this.allFiles.size} files to analyze`));
    }
  }

  /**
   * Analyze imports and exports in all files
   */
  async analyzeImportsExports() {
    for (const filePath of this.allFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Find imports/requires
        const imports = this.extractImports(content, filePath);
        this.importMap.set(filePath, imports);
        
        // Mark imported files
        imports.forEach(imp => {
          const resolvedPath = this.resolveImportPath(imp, filePath);
          if (resolvedPath && this.allFiles.has(resolvedPath)) {
            this.importedFiles.add(resolvedPath);
            
            // Track who requires what
            if (!this.requireMap.has(resolvedPath)) {
              this.requireMap.set(resolvedPath, new Set());
            }
            this.requireMap.get(resolvedPath).add(filePath);
          }
        });
        
        // Find exports
        const exports = this.extractExports(content);
        if (exports.length > 0) {
          this.exportMap.set(filePath, exports);
        }
      } catch (error) {
        if (this.verbose) {
          console.log(chalk.yellow(`Warning: Could not analyze ${filePath}: ${error.message}`));
        }
      }
    }
  }

  /**
   * Extract imports from file content
   */
  extractImports(content, filePath) {
    const imports = [];
    
    // ES6 imports
    const es6ImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6ImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    // CommonJS requires
    const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    // Dynamic imports
    const dynamicImportRegex = /import\s*\(['"]([^'"]+)['"]\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return imports;
  }

  /**
   * Extract exports from file content
   */
  extractExports(content) {
    const exports = [];
    
    // Named exports
    const namedExportRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    
    // Export statements
    const exportStatementRegex = /export\s*\{([^}]+)\}/g;
    while ((match = exportStatementRegex.exec(content)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]);
      exports.push(...names);
    }
    
    // Default export
    if (/export\s+default\s+/.test(content)) {
      exports.push('default');
    }
    
    // CommonJS exports
    const commonjsExportRegex = /module\.exports\s*=\s*\{([^}]+)\}/;
    match = commonjsExportRegex.exec(content);
    if (match) {
      const names = match[1].split(',').map(n => n.trim().split(':')[0]);
      exports.push(...names);
    }
    
    if (/module\.exports\s*=\s*\w+/.test(content)) {
      exports.push('default');
    }
    
    return exports;
  }

  /**
   * Resolve import path to actual file
   */
  resolveImportPath(importPath, fromFile) {
    // Skip node_modules and built-in modules
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }
    
    const dir = path.dirname(fromFile);
    let resolvedPath = path.resolve(dir, importPath);
    
    // Try different extensions
    const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];
    for (const ext of extensions) {
      const fullPath = resolvedPath + ext;
      if (this.allFiles.has(fullPath)) {
        return fullPath;
      }
    }
    
    return null;
  }

  /**
   * Identify orphaned files
   */
  identifyOrphans() {
    const orphans = [];
    
    for (const file of this.allFiles) {
      // Skip entry points
      const relativePath = path.relative(this.rootDir, file);
      const isEntryPoint = ENTRY_PATTERNS.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(relativePath);
      });
      
      if (isEntryPoint) {
        continue;
      }
      
      // Check if file is imported anywhere
      if (!this.importedFiles.has(file)) {
        orphans.push({
          file: relativePath,
          type: 'orphan',
          reason: 'Not imported or required anywhere'
        });
      }
    }
    
    return orphans;
  }

  /**
   * Find unused exports
   */
  findUnusedExports() {
    const unusedExports = [];
    
    for (const [file, exports] of this.exportMap) {
      const unusedInFile = [];
      const importers = this.requireMap.get(file) || new Set();
      
      if (importers.size === 0) {
        continue; // File is orphaned, already reported
      }
      
      // Check each export
      for (const exportName of exports) {
        let isUsed = false;
        
        // Check if any importer uses this export
        for (const importer of importers) {
          const content = fs.readFileSync(importer, 'utf8');
          
          // Check for named import
          if (exportName !== 'default') {
            try {
              const escapedName = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const namedImportRegex = new RegExp(`import\\s*\\{[^}]*\\b${escapedName}\\b[^}]*\\}\\s*from\\s*['"]`);
              if (namedImportRegex.test(content)) {
                isUsed = true;
                break;
              }
            } catch (e) {
              // Skip if regex fails
            }
          }
          
          // Check for default import or * import
          if (exportName === 'default' || /import\s+\*\s+as\s+\w+\s+from/.test(content)) {
            isUsed = true;
            break;
          }
        }
        
        if (!isUsed) {
          unusedInFile.push(exportName);
        }
      }
      
      if (unusedInFile.length > 0) {
        unusedExports.push({
          file: path.relative(this.rootDir, file),
          unusedExports: unusedInFile,
          type: 'unused-exports'
        });
      }
    }
    
    return unusedExports;
  }

  /**
   * Find empty or near-empty files
   */
  findEmptyFiles() {
    const emptyFiles = [];
    const MIN_MEANINGFUL_LINES = 5; // Threshold for meaningful content
    
    for (const file of this.allFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        // Filter out empty lines and comments
        const meaningfulLines = lines.filter(line => {
          const trimmed = line.trim();
          return trimmed.length > 0 && 
                 !trimmed.startsWith('//') && 
                 !trimmed.startsWith('/*') &&
                 !trimmed.startsWith('*');
        });
        
        if (meaningfulLines.length < MIN_MEANINGFUL_LINES) {
          emptyFiles.push({
            file: path.relative(this.rootDir, file),
            lines: meaningfulLines.length,
            type: 'empty',
            reason: `Only ${meaningfulLines.length} meaningful lines`
          });
        }
      } catch (error) {
        // Skip files we can't read
      }
    }
    
    return emptyFiles;
  }

  /**
   * Find test files without corresponding source files
   */
  findTestOrphans() {
    const testOrphans = [];
    const testFiles = Array.from(this.allFiles).filter(f => 
      f.includes('.test.') || f.includes('.spec.')
    );
    
    for (const testFile of testFiles) {
      // Derive expected source file
      const sourceFile = testFile
        .replace('.test.', '.')
        .replace('.spec.', '.')
        .replace(/\.(test|spec)/, '');
      
      // Check if source exists
      if (!this.allFiles.has(sourceFile)) {
        // Also check without test directory
        const alternativeSource = sourceFile.replace('/tests/', '/').replace('/test/', '/');
        if (!this.allFiles.has(alternativeSource)) {
          testOrphans.push({
            file: path.relative(this.rootDir, testFile),
            expectedSource: path.relative(this.rootDir, sourceFile),
            type: 'orphaned-test',
            reason: 'No corresponding source file found'
          });
        }
      }
    }
    
    return testOrphans;
  }

  /**
   * Find code issues: commented code, TODOs, console.logs, error patterns
   */
  findCodeIssues() {
    const issues = {
      commentedCode: [],
      todos: [],
      consoleLogs: [],
      errorPatterns: [],
      debugCode: [],
      deprecatedCode: []
    };

    for (const filePath of this.allFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const relativePath = path.relative(this.rootDir, filePath);
        
        // Track issues in this file
        const fileIssues = {
          commentedCode: [],
          todos: [],
          consoleLogs: [],
          errorPatterns: [],
          debugCode: [],
          deprecatedCode: []
        };

        lines.forEach((line, index) => {
          const lineNum = index + 1;
          const trimmedLine = line.trim();

          // Find commented code (heuristic: comments with code-like patterns)
          if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
            const commentContent = trimmedLine.replace(/^\/\/\s*|^\/\*\s*|\*\/$/g, '').trim();
            // Check if it looks like code (has brackets, semicolons, function calls, etc.)
            if (/[{};()=]|function|const|let|var|if|for|while|return/.test(commentContent) &&
                !/(TODO|FIXME|NOTE|HACK|XXX|REVIEW)/.test(commentContent)) {
              fileIssues.commentedCode.push({
                line: lineNum,
                content: trimmedLine.substring(0, 80) + (trimmedLine.length > 80 ? '...' : '')
              });
            }
          }

          // Find TODOs, FIXMEs, HACKs, etc.
          if (/(TODO|FIXME|HACK|XXX|REVIEW|BUG|REFACTOR):/i.test(line)) {
            const match = line.match(/(TODO|FIXME|HACK|XXX|REVIEW|BUG|REFACTOR):\s*(.*)/i);
            if (match) {
              fileIssues.todos.push({
                line: lineNum,
                type: match[1].toUpperCase(),
                content: match[2].trim().substring(0, 80)
              });
            }
          }

          // Find console.log statements (excluding test files)
          if (!filePath.includes('.test.') && !filePath.includes('.spec.')) {
            if (/console\.(log|error|warn|debug|trace|info)/.test(line)) {
              fileIssues.consoleLogs.push({
                line: lineNum,
                type: line.match(/console\.(\w+)/)[1],
                content: trimmedLine.substring(0, 80) + (trimmedLine.length > 80 ? '...' : '')
              });
            }
          }

          // Find error patterns (throw statements, unhandled errors, etc.)
          if (/throw\s+new\s+Error|\.catch\s*\(\s*\)|\bcatch\s*\{\s*\}/.test(line)) {
            fileIssues.errorPatterns.push({
              line: lineNum,
              pattern: 'error-handling',
              content: trimmedLine.substring(0, 80) + (trimmedLine.length > 80 ? '...' : '')
            });
          }

          // Find debug code patterns
          if (/debugger;|\/\/\s*DEBUG|\/\*\s*DEBUG/.test(line)) {
            fileIssues.debugCode.push({
              line: lineNum,
              content: trimmedLine.substring(0, 80) + (trimmedLine.length > 80 ? '...' : '')
            });
          }

          // Find deprecated patterns
          if (/@deprecated|DEPRECATED|deprecated/i.test(line)) {
            fileIssues.deprecatedCode.push({
              line: lineNum,
              content: trimmedLine.substring(0, 80) + (trimmedLine.length > 80 ? '...' : '')
            });
          }
        });

        // Add file to issues if it has any problems
        Object.keys(fileIssues).forEach(issueType => {
          if (fileIssues[issueType].length > 0) {
            issues[issueType].push({
              file: relativePath,
              issues: fileIssues[issueType],
              count: fileIssues[issueType].length
            });
          }
        });

      } catch (error) {
        // Skip files we can't read
      }
    }

    return issues;
  }

  /**
   * Find dead/unreachable code patterns
   */
  findDeadCode() {
    const deadCode = [];

    for (const filePath of this.allFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(this.rootDir, filePath);
        const deadPatterns = [];

        // Find unreachable code after return statements
        const returnMatches = content.match(/return[^;]*;[\s]*[^}\s]/g);
        if (returnMatches) {
          deadPatterns.push({
            type: 'unreachable-after-return',
            count: returnMatches.length
          });
        }

        // Find always-false conditions
        if (/if\s*\(\s*false\s*\)/.test(content)) {
          deadPatterns.push({
            type: 'always-false-condition',
            count: (content.match(/if\s*\(\s*false\s*\)/g) || []).length
          });
        }

        // Find always-true conditions that might hide dead else branches
        if (/if\s*\(\s*true\s*\)/.test(content)) {
          deadPatterns.push({
            type: 'always-true-condition',
            count: (content.match(/if\s*\(\s*true\s*\)/g) || []).length
          });
        }

        if (deadPatterns.length > 0) {
          deadCode.push({
            file: relativePath,
            patterns: deadPatterns,
            type: 'dead-code'
          });
        }
      } catch (error) {
        // Skip files we can't read
      }
    }

    return deadCode;
  }

  /**
   * Print results
   */
  printResults(results) {
    console.log(chalk.cyan('\n📊 Analysis Results\n'));
    console.log(chalk.gray('─'.repeat(50)));
    
    // Stats
    console.log(chalk.white('📈 Statistics:'));
    console.log(`  Total files analyzed: ${results.stats.totalFiles}`);
    console.log(`  Files with imports: ${results.stats.importedFiles}`);
    console.log(`  Orphaned files: ${chalk.red(results.stats.orphanedFiles)}`);
    console.log(`  Files with unused exports: ${chalk.yellow(results.stats.filesWithUnusedExports)}`);
    console.log(`  Empty/near-empty files: ${chalk.yellow(results.stats.emptyFiles)}`);
    console.log(`  Orphaned test files: ${chalk.yellow(results.stats.orphanedTests)}`);
    
    // Orphaned files
    if (results.orphans.length > 0) {
      console.log(chalk.red('\n❌ Orphaned Files (not imported anywhere):'));
      results.orphans.forEach(orphan => {
        console.log(`  ${chalk.red('○')} ${orphan.file}`);
      });
    }
    
    // Unused exports
    if (results.unusedExports.length > 0) {
      console.log(chalk.yellow('\n⚠️  Files with Unused Exports:'));
      results.unusedExports.forEach(item => {
        console.log(`  ${chalk.yellow('○')} ${item.file}`);
        item.unusedExports.forEach(exp => {
          console.log(`    - ${exp}`);
        });
      });
    }
    
    // Empty files
    if (results.emptyFiles.length > 0) {
      console.log(chalk.yellow('\n📄 Empty/Near-Empty Files:'));
      results.emptyFiles.forEach(item => {
        console.log(`  ${chalk.yellow('○')} ${item.file} (${item.lines} lines)`);
      });
    }
    
    // Test orphans
    if (results.testOrphans.length > 0) {
      console.log(chalk.yellow('\n🧪 Orphaned Test Files:'));
      results.testOrphans.forEach(item => {
        console.log(`  ${chalk.yellow('○')} ${item.file}`);
        console.log(`    Expected source: ${item.expectedSource}`);
      });
    }
    
    // Code Issues
    if (results.codeIssues) {
      // TODOs and FIXMEs
      if (results.codeIssues.todos && results.codeIssues.todos.length > 0) {
        console.log(chalk.blue('\n📝 TODOs and FIXMEs:'));
        let todoCount = 0;
        results.codeIssues.todos.slice(0, 10).forEach(item => {
          console.log(`  ${chalk.blue('○')} ${item.file} (${item.count} items)`);
          item.issues.slice(0, 3).forEach(issue => {
            console.log(`    L${issue.line}: ${chalk.cyan(issue.type)} - ${issue.content}`);
            todoCount++;
          });
        });
        if (results.codeIssues.todos.length > 10) {
          console.log(chalk.gray(`    ... and ${results.codeIssues.todos.length - 10} more files`));
        }
      }

      // Commented Code
      if (results.codeIssues.commentedCode && results.codeIssues.commentedCode.length > 0) {
        console.log(chalk.magenta('\n💬 Files with Commented Code:'));
        results.codeIssues.commentedCode.slice(0, 5).forEach(item => {
          console.log(`  ${chalk.magenta('○')} ${item.file} (${item.count} blocks)`);
        });
        if (results.codeIssues.commentedCode.length > 5) {
          console.log(chalk.gray(`    ... and ${results.codeIssues.commentedCode.length - 5} more files`));
        }
      }

      // Console Logs
      if (results.codeIssues.consoleLogs && results.codeIssues.consoleLogs.length > 0) {
        console.log(chalk.cyan('\n🔍 Console Logs (non-test files):'));
        results.codeIssues.consoleLogs.slice(0, 5).forEach(item => {
          console.log(`  ${chalk.cyan('○')} ${item.file} (${item.count} statements)`);
        });
        if (results.codeIssues.consoleLogs.length > 5) {
          console.log(chalk.gray(`    ... and ${results.codeIssues.consoleLogs.length - 5} more files`));
        }
      }

      // Debug Code
      if (results.codeIssues.debugCode && results.codeIssues.debugCode.length > 0) {
        console.log(chalk.red('\n🐛 Debug Code Found:'));
        results.codeIssues.debugCode.forEach(item => {
          console.log(`  ${chalk.red('○')} ${item.file} (${item.count} instances)`);
        });
      }

      // Deprecated Code
      if (results.codeIssues.deprecatedCode && results.codeIssues.deprecatedCode.length > 0) {
        console.log(chalk.gray('\n⚠️  Deprecated Code:'));
        results.codeIssues.deprecatedCode.forEach(item => {
          console.log(`  ${chalk.gray('○')} ${item.file} (${item.count} references)`);
        });
      }
    }

    // Dead Code
    if (results.deadCode && results.deadCode.length > 0) {
      console.log(chalk.red('\n☠️  Potential Dead Code:'));
      results.deadCode.slice(0, 10).forEach(item => {
        console.log(`  ${chalk.red('○')} ${item.file}`);
        item.patterns.forEach(pattern => {
          console.log(`    - ${pattern.type} (${pattern.count} instances)`);
        });
      });
    }

    // Summary
    console.log(chalk.gray('\n─'.repeat(50)));
    const totalIssues = results.stats.orphanedFiles + 
                       results.stats.filesWithUnusedExports + 
                       results.stats.emptyFiles + 
                       results.stats.orphanedTests +
                       results.stats.filesWithCommentedCode +
                       results.stats.filesWithTodos +
                       results.stats.filesWithConsoleLogs +
                       results.stats.filesWithDebugCode +
                       results.stats.filesWithDeadCode;
    
    if (totalIssues === 0) {
      console.log(chalk.green('✅ No orphaned files or code issues detected!'));
    } else {
      console.log(chalk.yellow(`⚠️  Found ${totalIssues} potential issues across categories`));
      console.log(chalk.gray('\nSummary:'));
      if (results.stats.orphanedFiles > 0) 
        console.log(chalk.gray(`  • ${results.stats.orphanedFiles} orphaned files`));
      if (results.stats.filesWithTodos > 0) 
        console.log(chalk.gray(`  • ${results.stats.filesWithTodos} files with TODOs/FIXMEs`));
      if (results.stats.filesWithCommentedCode > 0) 
        console.log(chalk.gray(`  • ${results.stats.filesWithCommentedCode} files with commented code`));
      if (results.stats.filesWithConsoleLogs > 0) 
        console.log(chalk.gray(`  • ${results.stats.filesWithConsoleLogs} files with console logs`));
      console.log(chalk.gray('\nConsider cleaning up these issues to improve code quality.'));
    }
  }

  /**
   * Export results to JSON
   */
  exportToJson(results, outputPath) {
    const output = {
      timestamp: new Date().toISOString(),
      rootDir: this.rootDir,
      ...results
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(chalk.green(`\n💾 Results exported to ${outputPath}`));
  }
}

// CLI
const program = new Command();

program
  .name('find-orphans')
  .description('Find orphaned files and dead code in your codebase')
  .version('1.0.0')
  .option('-r, --root <path>', 'Root directory to analyze', process.cwd())
  .option('-p, --patterns <patterns>', 'File patterns to analyze (comma-separated)', '**/*.js,**/*.ts')
  .option('-i, --ignore <patterns>', 'Patterns to ignore (comma-separated)')
  .option('-v, --verbose', 'Verbose output')
  .option('-t, --include-tests', 'Include test files in orphan analysis')
  .option('-j, --json <path>', 'Export results to JSON file')
  .option('--show-imports', 'Show import relationships (verbose)')
  .action(async (options) => {
    try {
      // Parse patterns
      if (options.patterns) {
        options.patterns = {
          source: options.patterns.split(','),
          ignore: options.ignore ? options.ignore.split(',') : DEFAULT_PATTERNS.ignore
        };
      }
      
      const detector = new OrphanDetector(options);
      const results = await detector.analyze();
      
      detector.printResults(results);
      
      if (options.json) {
        detector.exportToJson(results, options.json);
      }
      
      // Exit with error code if orphans found
      const hasIssues = results.stats.orphanedFiles > 0;
      process.exit(hasIssues ? 1 : 0);
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program.parse();

module.exports = OrphanDetector;