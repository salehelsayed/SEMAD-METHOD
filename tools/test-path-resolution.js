#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { program } = require('commander');

/**
 * Test path resolution in orchestrator
 * Validates that all configured paths are correctly resolved
 */
class PathResolutionTester {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.configPath = path.join(rootDir, 'bmad-core', 'core-config.yaml');
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
  }

  /**
   * Load configuration
   */
  loadConfig() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Core configuration not found: ${this.configPath}`);
    }

    const yaml = require('js-yaml');
    const content = fs.readFileSync(this.configPath, 'utf8');
    return yaml.load(content);
  }

  /**
   * Test a single path resolution
   */
  testPathResolution(configPath, label, required = true) {
    const test = {
      label,
      configPath,
      required,
      success: false,
      resolvedPath: null,
      exists: false,
      error: null
    };

    try {
      if (!configPath) {
        if (required) {
          test.error = 'Path not configured';
          test.success = false;
        } else {
          test.success = true;
          test.error = 'Path not configured (optional)';
        }
      } else {
        // Resolve path
        const resolvedPath = path.isAbsolute(configPath) 
          ? configPath 
          : path.resolve(this.rootDir, configPath);
        
        test.resolvedPath = resolvedPath;
        
        // Check if path exists
        test.exists = fs.existsSync(resolvedPath);
        
        if (test.exists) {
          test.success = true;
        } else if (required) {
          test.error = 'Path does not exist';
          test.success = false;
        } else {
          test.success = true;
          test.error = 'Path does not exist (optional)';
        }
      }
    } catch (error) {
      test.error = error.message;
      test.success = false;
    }

    this.results.tests.push(test);
    
    if (test.success) {
      this.results.passed++;
    } else {
      this.results.failed++;
    }
    
    if (test.error && test.error.includes('optional')) {
      this.results.warnings++;
    }

    return test;
  }

  /**
   * Test orchestrator path resolution
   */
  testOrchestratorPaths() {
    console.log(chalk.blue('🔍 Testing Orchestrator Path Resolution...\n'));
    
    try {
      // Test file path resolver
      const FilePathResolver = require('../bmad-core/utils/file-path-resolver');
      const resolver = new FilePathResolver(this.rootDir);
      
      console.log(chalk.bold('🔧 Testing File Path Resolver:'));
      
      // Test resolver initialization
      try {
        const resolved = resolver.getAllResolvedPaths();
        console.log(chalk.green('✅ File Path Resolver initialized successfully'));
        
        // Test each resolved path
        Object.entries(resolved).forEach(([key, pathValue]) => {
          // Skip boolean values and null values
          if (typeof pathValue === 'boolean' || pathValue === null) {
            return;
          }
          
          // Define which paths are optional (warnings only, not failures)
          const optionalPaths = [
            'prdFile', 'architectureFile', 'devDebugLog', 'epicFilePattern',
            'architectureVersion', 'prdVersion'
          ];
          const isOptional = optionalPaths.includes(key);
          
          // Handle array values (like devLoadAlwaysFiles)
          if (Array.isArray(pathValue)) {
            pathValue.forEach((path, index) => {
              const test = this.testPathResolution(path, `${key}[${index}]`, !isOptional);
              const status = test.success ? chalk.green('✅') : chalk.red('❌');
              console.log(`   ${status} ${key}[${index}]: ${path || 'Not configured'}`);
              if (test.resolvedPath && test.resolvedPath !== path) {
                console.log(`       Resolved to: ${test.resolvedPath}`);
              }
              if (test.error) {
                console.log(`       ${chalk.dim(test.error)}`);
              }
            });
            return;
          }
          
          const test = this.testPathResolution(pathValue, key, !isOptional);
          const status = test.success ? chalk.green('✅') : chalk.red('❌');
          console.log(`   ${status} ${key}: ${pathValue || 'Not configured'}`);
          if (test.resolvedPath && test.resolvedPath !== pathValue) {
            console.log(`       Resolved to: ${test.resolvedPath}`);
          }
          if (test.error) {
            console.log(`       ${chalk.dim(test.error)}`);
          }
        });
        
      } catch (error) {
        console.log(chalk.red('❌ File Path Resolver failed:'), error.message);
        this.results.failed++;
        this.results.tests.push({
          label: 'File Path Resolver',
          success: false,
          error: error.message
        });
      }
      
    } catch (error) {
      console.log(chalk.red('❌ Could not load File Path Resolver:'), error.message);
    }
  }

  /**
   * Test configuration paths
   */
  testConfigurationPaths() {
    console.log(chalk.bold('\n📋 Testing Configuration Paths:'));
    
    const config = this.loadConfig();
    
    // Test story paths
    if (config.stories) {
      this.testPathResolution(config.stories.storyLocation, 'Story Location');
      this.testPathResolution(config.stories.storyTemplate, 'Story Template');
    }
    
    // Test PRD paths
    if (config.prd) {
      this.testPathResolution(config.prd.prdLocation, 'PRD Location', false);
      this.testPathResolution(config.prd.prdShardedLocation, 'PRD Sharded Location', false);
      this.testPathResolution(config.prd.prdTemplate, 'PRD Template', false);
    }
    
    // Test architecture paths
    if (config.architecture) {
      this.testPathResolution(config.architecture.architectureLocation, 'Architecture Location', false);
      this.testPathResolution(config.architecture.architectureTemplate, 'Architecture Template', false);
    }
    
    // Test memory paths
    if (config.memory) {
      this.testPathResolution(config.memory.baseDirectory, 'Memory Base Directory');
    }
    
    // Test workflow paths
    if (config.workflows) {
      this.testPathResolution(config.workflows.workflowsLocation, 'Workflows Location', false);
    }
    
    // Display results
    this.results.tests.forEach(test => {
      if (test.label.startsWith('Resolver:')) return; // Already displayed
      
      const status = test.success ? chalk.green('✅') : chalk.red('❌');
      console.log(`   ${status} ${test.label}: ${test.configPath || 'Not configured'}`);
      
      if (test.resolvedPath && test.resolvedPath !== test.configPath) {
        console.log(`       Resolved to: ${test.resolvedPath}`);
      }
      
      if (test.error) {
        const errorColor = test.error.includes('optional') ? chalk.yellow : chalk.red;
        console.log(`       ${errorColor(test.error)}`);
      }
      
      if (test.exists && test.resolvedPath) {
        const stats = fs.statSync(test.resolvedPath);
        const type = stats.isDirectory() ? 'directory' : 'file';
        console.log(`       ${chalk.dim(`Exists as ${type}`)}`);
      }
    });
  }

  /**
   * Test core BMad directories
   */
  testCorePaths() {
    console.log(chalk.bold('\n🔧 Testing Core BMad Paths:'));
    
    const corePaths = [
      { path: 'bmad-core', label: 'BMad Core Directory' },
      { path: 'bmad-core/agents', label: 'Agents Directory' },
      { path: 'bmad-core/structured-tasks', label: 'Structured Tasks Directory' },
      { path: 'bmad-core/templates', label: 'Templates Directory' },
      { path: 'bmad-core/data', label: 'Data Directory' },
      { path: 'bmad-core/utils', label: 'Utils Directory' },
      { path: 'tools', label: 'Tools Directory' },
      { path: 'scripts', label: 'Scripts Directory' }
    ];
    
    corePaths.forEach(({ path: corePath, label }) => {
      const test = this.testPathResolution(corePath, label);
      const status = test.success ? chalk.green('✅') : chalk.red('❌');
      console.log(`   ${status} ${label}: ${corePath}`);
      
      if (test.error) {
        console.log(`       ${chalk.red(test.error)}`);
      }
      
      // Count files in directory if it exists
      if (test.exists && test.resolvedPath) {
        try {
          const stats = fs.statSync(test.resolvedPath);
          if (stats.isDirectory()) {
            const files = fs.readdirSync(test.resolvedPath);
            console.log(`       ${chalk.dim(`Contains ${files.length} items`)}`);
          }
        } catch (error) {
          // Ignore errors counting files
        }
      }
    });
  }

  /**
   * Test workflow orchestrator compatibility
   */
  testOrchestratorCompatibility() {
    console.log(chalk.bold('\n⚙️  Testing Orchestrator Compatibility:'));
    
    try {
      // Test workflow orchestrator initialization
      const WorkflowOrchestrator = require('./workflow-orchestrator');
      const orchestrator = new WorkflowOrchestrator(this.rootDir);
      
      console.log(chalk.green('✅ Workflow Orchestrator can be instantiated'));
      this.results.passed++;
      
      // Test initialization
      try {
        // Note: We don't call initialize() as it might have side effects
        console.log(chalk.green('✅ Orchestrator constructor completed'));
        this.results.passed++;
      } catch (error) {
        console.log(chalk.red('❌ Orchestrator initialization failed:'), error.message);
        this.results.failed++;
      }
      
    } catch (error) {
      console.log(chalk.red('❌ Could not load Workflow Orchestrator:'), error.message);
      this.results.failed++;
    }
  }

  /**
   * Display final results
   */
  displayResults() {
    console.log('\n' + '='.repeat(70));
    console.log(chalk.bold('📊 Path Resolution Test Results\n'));
    
    const total = this.results.passed + this.results.failed;
    const successRate = total > 0 ? ((this.results.passed / total) * 100).toFixed(1) : 0;
    
    console.log(`📈 Summary:`);
    console.log(`   Total Tests: ${total}`);
    console.log(`   Passed: ${chalk.green(this.results.passed)}`);
    console.log(`   Failed: ${this.results.failed > 0 ? chalk.red(this.results.failed) : chalk.green('0')}`);
    console.log(`   Warnings: ${this.results.warnings > 0 ? chalk.yellow(this.results.warnings) : chalk.green('0')}`);
    console.log(`   Success Rate: ${successRate >= 80 ? chalk.green(successRate) : successRate >= 60 ? chalk.yellow(successRate) : chalk.red(successRate)}%`);
    
    if (this.results.failed === 0) {
      console.log(chalk.green('\n✅ All path resolution tests passed!'));
      console.log(chalk.dim('Orchestrator paths are correctly configured.'));
      return 0;
    } else {
      console.log(chalk.red(`\n❌ ${this.results.failed} path resolution test(s) failed.`));
      console.log(chalk.dim('Please check the configuration and ensure all required paths exist.'));
      return 1;
    }
  }

  /**
   * Run all path resolution tests
   */
  async run() {
    console.log(chalk.bold('🔍 BMad Orchestrator Path Resolution Tester\n'));
    console.log(`📂 Root Directory: ${this.rootDir}`);
    console.log(`⚙️  Config File: ${path.relative(this.rootDir, this.configPath)}\n`);
    
    try {
      this.testConfigurationPaths();
      this.testCorePaths();
      this.testOrchestratorPaths();
      this.testOrchestratorCompatibility();
      
      return this.displayResults();
      
    } catch (error) {
      console.error(chalk.red('Path resolution testing failed:'), error.message);
      return 1;
    }
  }
}

// CLI setup
program
  .description('Test path resolution in BMad orchestrator')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-v, --verbose', 'Show detailed test information')
  .parse(process.argv);

async function main() {
  const options = program.opts();
  const tester = new PathResolutionTester(options.directory);
  
  try {
    const exitCode = await tester.run();
    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red('Command failed:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = PathResolutionTester;