#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { program } = require('commander');

/**
 * Scans codebase for exclusive use of structured tasks
 */
class StructuredTaskScanner {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.structuredTasksDir = path.join(rootDir, 'bmad-core', 'structured-tasks');
    this.legacyTasksDir = path.join(rootDir, 'bmad-core', 'tasks');
    this.issues = [];
    this.warnings = [];
    this.stats = {
      structuredTasks: 0,
      legacyTasks: 0,
      agentsUsingStructured: 0,
      agentsUsingLegacy: 0,
      filesScanned: 0
    };
  }

  /**
   * Scan for legacy task references in agents and other files
   */
  async scanForLegacyTaskReferences() {
    const agentsDir = path.join(this.rootDir, 'bmad-core', 'agents');
    const extensionsToScan = ['.md', '.yaml', '.yml', '.js', '.json'];
    
    console.log(chalk.blue('🔍 Scanning for legacy task references...\n'));

    // Scan agents directory
    if (fs.existsSync(agentsDir)) {
      const agentFiles = fs.readdirSync(agentsDir).filter(file => 
        extensionsToScan.some(ext => file.endsWith(ext))
      );

      for (const file of agentFiles) {
        await this.scanFile(path.join(agentsDir, file), 'agent');
      }
    }

    // Scan other relevant directories
    const dirsToScan = [
      'bmad-core/agent-teams',
      'bmad-core/workflows',
      'tools',
      'scripts'
    ];

    for (const dir of dirsToScan) {
      const fullDir = path.join(this.rootDir, dir);
      if (fs.existsSync(fullDir)) {
        await this.scanDirectory(fullDir, path.basename(dir));
      }
    }
  }

  /**
   * Recursively scan a directory for files
   */
  async scanDirectory(dirPath, type) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, type);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.md', '.yaml', '.yml', '.js', '.json'].includes(ext)) {
          await this.scanFile(fullPath, type);
        }
      }
    }
  }

  /**
   * Scan individual file for task references
   */
  async scanFile(filePath, type) {
    this.stats.filesScanned++;
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(this.rootDir, filePath);
      
      // Look for legacy task references (avoiding false positives with structured-tasks)
      const legacyTaskPatterns = [
        /bmad-core\/tasks\/[^/\s]+\.yaml/g,
        /bmad-core\/tasks\/[^/\s]+\.md/g,
        /(?<!structured-)tasks\/[^/\s]+\.yaml/g,  // Use negative lookbehind to avoid structured-tasks
        /(?<!structured-)tasks\/[^/\s]+\.md/g,
        /"(?<!structured-)tasks\/[^"]+"/g,
        /'(?<!structured-)tasks\/[^']+'/g
      ];

      // Look for structured task references
      const structuredTaskPatterns = [
        /bmad-core\/structured-tasks\/[^/\s]+\.yaml/g,
        /structured-tasks\/[^/\s]+\.yaml/g,
        /"structured-tasks\/[^"]+"/g,
        /'structured-tasks\/[^']+'/g
      ];

      let hasLegacyTasks = false;
      let hasStructuredTasks = false;
      const legacyMatches = [];
      const structuredMatches = [];

      // Check for legacy task references
      legacyTaskPatterns.forEach(pattern => {
        const matches = [...content.matchAll(pattern)];
        if (matches.length > 0) {
          hasLegacyTasks = true;
          legacyMatches.push(...matches.map(m => m[0]));
        }
      });

      // Check for structured task references
      structuredTaskPatterns.forEach(pattern => {
        const matches = [...content.matchAll(pattern)];
        if (matches.length > 0) {
          hasStructuredTasks = true;
          structuredMatches.push(...matches.map(m => m[0]));
        }
      });

      if (hasLegacyTasks) {
        if (type === 'agent') {
          this.stats.agentsUsingLegacy++;
        }
        
        this.issues.push({
          file: relativePath,
          type: 'legacy_task_reference',
          message: `Found legacy task references`,
          references: [...new Set(legacyMatches)],
          severity: 'error'
        });
      }

      if (hasStructuredTasks) {
        if (type === 'agent') {
          this.stats.agentsUsingStructured++;
        }
      }

      // Check if file uses both (mixed usage)
      if (hasLegacyTasks && hasStructuredTasks) {
        this.warnings.push({
          file: relativePath,
          type: 'mixed_task_usage',
          message: 'File uses both legacy and structured tasks',
          legacyRefs: [...new Set(legacyMatches)],
          structuredRefs: [...new Set(structuredMatches)]
        });
      }

    } catch (error) {
      this.warnings.push({
        file: path.relative(this.rootDir, filePath),
        type: 'scan_error',
        message: `Failed to scan file: ${error.message}`
      });
    }
  }

  /**
   * Count task files in directories
   */
  countTaskFiles() {
    // Count structured tasks
    if (fs.existsSync(this.structuredTasksDir)) {
      const structuredFiles = fs.readdirSync(this.structuredTasksDir)
        .filter(file => file.endsWith('.yaml'));
      this.stats.structuredTasks = structuredFiles.length;
    }

    // Count legacy tasks (if directory still exists)
    if (fs.existsSync(this.legacyTasksDir)) {
      const legacyFiles = fs.readdirSync(this.legacyTasksDir)
        .filter(file => file.endsWith('.yaml') || file.endsWith('.md'));
      this.stats.legacyTasks = legacyFiles.length;
      
      if (legacyFiles.length > 0) {
        this.issues.push({
          file: 'bmad-core/tasks/',
          type: 'legacy_directory_exists',
          message: `Legacy tasks directory contains ${legacyFiles.length} files`,
          files: legacyFiles,
          severity: 'warning'
        });
      }
    }
  }

  /**
   * Display scan results
   */
  displayResults() {
    console.log('\n' + '='.repeat(70));
    console.log(chalk.bold('📊 Structured Task Usage Report\n'));

    // Display statistics
    console.log(chalk.bold('📈 Statistics:'));
    console.log(`   Files Scanned: ${this.stats.filesScanned}`);
    console.log(`   Structured Tasks Available: ${chalk.green(this.stats.structuredTasks)}`);
    console.log(`   Legacy Tasks Found: ${this.stats.legacyTasks > 0 ? chalk.red(this.stats.legacyTasks) : chalk.green('0')}`);
    console.log(`   Agents Using Structured Tasks: ${chalk.green(this.stats.agentsUsingStructured)}`);
    console.log(`   Agents Using Legacy Tasks: ${this.stats.agentsUsingLegacy > 0 ? chalk.red(this.stats.agentsUsingLegacy) : chalk.green('0')}`);
    console.log('');

    // Display issues
    if (this.issues.length > 0) {
      console.log(chalk.red(`❌ ${this.issues.length} Issue(s) Found:\n`));
      
      this.issues.forEach((issue, index) => {
        const severity = issue.severity === 'error' ? chalk.red('ERROR') : chalk.yellow('WARNING');
        console.log(`${index + 1}. [${severity}] ${chalk.bold(issue.file)}`);
        console.log(`   ${issue.message}`);
        
        if (issue.references) {
          console.log(`   References: ${issue.references.join(', ')}`);
        }
        
        if (issue.files) {
          console.log(`   Files: ${issue.files.join(', ')}`);
        }
        console.log('');
      });
    }

    // Display warnings
    if (this.warnings.length > 0) {
      console.log(chalk.yellow(`⚠️  ${this.warnings.length} Warning(s):\n`));
      
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${chalk.bold(warning.file)}`);
        console.log(`   ${warning.message}`);
        
        if (warning.legacyRefs) {
          console.log(`   Legacy: ${warning.legacyRefs.join(', ')}`);
        }
        
        if (warning.structuredRefs) {
          console.log(`   Structured: ${warning.structuredRefs.join(', ')}`);
        }
        console.log('');
      });
    }

    // Final assessment
    const hasErrors = this.issues.some(issue => issue.severity === 'error');
    const hasLegacyUsage = this.stats.agentsUsingLegacy > 0 || this.stats.legacyTasks > 0;

    if (!hasErrors && !hasLegacyUsage) {
      console.log(chalk.green('✅ All systems are using structured tasks exclusively!'));
      console.log(chalk.dim('No legacy task references found.'));
      return 0;
    } else if (hasErrors) {
      console.log(chalk.red('❌ Legacy task usage detected. Please migrate to structured tasks.'));
      console.log(chalk.dim('Run conversion scripts to migrate legacy tasks to structured format.'));
      return 1;
    } else {
      console.log(chalk.yellow('⚠️  Some legacy remnants found, but no active usage detected.'));
      return 0;
    }
  }

  /**
   * Run the complete scan
   */
  async run() {
    console.log(chalk.blue('🔍 BMad Structured Task Usage Scanner\n'));
    console.log(`📂 Root Directory: ${this.rootDir}\n`);

    this.countTaskFiles();
    await this.scanForLegacyTaskReferences();
    
    return this.displayResults();
  }
}

// CLI setup
program
  .description('Scan for exclusive use of structured tasks in BMad codebase')
  .option('-d, --directory <path>', 'Root directory to scan', process.cwd())
  .option('--agents-only', 'Scan only agent files')
  .option('--verbose', 'Show detailed scan progress')
  .parse(process.argv);

async function main() {
  const options = program.opts();
  const scanner = new StructuredTaskScanner(options.directory);
  
  try {
    const exitCode = await scanner.run();
    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red('Scan failed:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = StructuredTaskScanner;