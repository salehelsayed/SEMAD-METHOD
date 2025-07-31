#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const chalk = require('chalk');
const { program } = require('commander');

/**
 * Validates core-config.yaml paths and settings
 */
class ConfigValidator {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.configPath = path.join(rootDir, 'bmad-core', 'core-config.yaml');
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate that a path exists and is accessible
   */
  validatePath(pathStr, label, required = true) {
    if (!pathStr) {
      if (required) {
        this.errors.push(`${label}: Path is required but not specified`);
      }
      return false;
    }

    const fullPath = path.isAbsolute(pathStr) ? pathStr : path.join(this.rootDir, pathStr);
    
    if (!fs.existsSync(fullPath)) {
      this.errors.push(`${label}: Path does not exist: ${pathStr} (resolved to: ${fullPath})`);
      return false;
    }

    return true;
  }

  /**
   * Validate core configuration structure and paths
   */
  async validateConfig() {
    console.log(chalk.blue('🔍 Validating BMad Core Configuration...\n'));

    if (!fs.existsSync(this.configPath)) {
      this.errors.push(`Core configuration file not found: ${this.configPath}`);
      return;
    }

    let config;
    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      config = yaml.load(content);
    } catch (error) {
      this.errors.push(`Failed to parse YAML configuration: ${error.message}`);
      return;
    }

    console.log(`📋 Configuration file: ${this.configPath}`);
    console.log(`📂 Root directory: ${this.rootDir}\n`);

    // Validate story locations
    if (config.stories) {
      console.log(chalk.bold('📖 Story Configuration:'));
      
      if (config.stories.storyLocation) {
        const isValid = this.validatePath(config.stories.storyLocation, 'Story Location');
        console.log(`   Story Location: ${config.stories.storyLocation} ${isValid ? '✅' : '❌'}`);
      }

      if (config.stories.storyTemplate) {
        const isValid = this.validatePath(config.stories.storyTemplate, 'Story Template');
        console.log(`   Story Template: ${config.stories.storyTemplate} ${isValid ? '✅' : '❌'}`);
      }
      console.log('');
    }

    // Validate PRD locations
    if (config.prd) {
      console.log(chalk.bold('📄 PRD Configuration:'));
      
      if (config.prd.prdLocation) {
        const isValid = this.validatePath(config.prd.prdLocation, 'PRD Location');
        console.log(`   PRD Location: ${config.prd.prdLocation} ${isValid ? '✅' : '❌'}`);
      }

      if (config.prd.prdShardedLocation) {
        const isValid = this.validatePath(config.prd.prdShardedLocation, 'PRD Sharded Location');
        console.log(`   PRD Sharded Location: ${config.prd.prdShardedLocation} ${isValid ? '✅' : '❌'}`);
      }

      if (config.prd.prdTemplate) {
        const isValid = this.validatePath(config.prd.prdTemplate, 'PRD Template');
        console.log(`   PRD Template: ${config.prd.prdTemplate} ${isValid ? '✅' : '❌'}`);
      }
      console.log('');
    }

    // Validate architecture locations
    if (config.architecture) {
      console.log(chalk.bold('🏗️  Architecture Configuration:'));
      
      if (config.architecture.architectureLocation) {
        const isValid = this.validatePath(config.architecture.architectureLocation, 'Architecture Location');
        console.log(`   Architecture Location: ${config.architecture.architectureLocation} ${isValid ? '✅' : '❌'}`);
      }

      if (config.architecture.architectureTemplate) {
        const isValid = this.validatePath(config.architecture.architectureTemplate, 'Architecture Template');
        console.log(`   Architecture Template: ${config.architecture.architectureTemplate} ${isValid ? '✅' : '❌'}`);
      }
      console.log('');
    }

    // Validate memory configuration
    if (config.memory) {
      console.log(chalk.bold('🧠 Memory Configuration:'));
      
      if (config.memory.memoryLocation) {
        const isValid = this.validatePath(config.memory.memoryLocation, 'Memory Location');
        console.log(`   Memory Location: ${config.memory.memoryLocation} ${isValid ? '✅' : '❌'}`);
      }
      console.log('');
    }

    // Validate search tools configuration
    if (config.searchTools) {
      console.log(chalk.bold('🔍 Search Tools Configuration:'));
      
      if (config.searchTools.toolMappingsFile) {
        const isValid = this.validatePath(config.searchTools.toolMappingsFile, 'Tool Mappings File');
        console.log(`   Tool Mappings File: ${config.searchTools.toolMappingsFile} ${isValid ? '✅' : '❌'}`);
      }

      if (config.searchTools.defaultOutputFile) {
        const outputDir = path.dirname(config.searchTools.defaultOutputFile);
        const isValid = this.validatePath(outputDir, 'Search Tools Output Directory', false);
        console.log(`   Default Output File: ${config.searchTools.defaultOutputFile} ${isValid ? '✅' : '⚠️'}`);
        if (!isValid && outputDir !== '.') {
          this.warnings.push(`Search tools output directory may need to be created: ${outputDir}`);
        }
      }
      console.log('');
    }

    // Validate workflow configuration
    if (config.workflows) {
      console.log(chalk.bold('⚙️  Workflow Configuration:'));
      
      if (config.workflows.workflowsLocation) {
        const isValid = this.validatePath(config.workflows.workflowsLocation, 'Workflows Location');
        console.log(`   Workflows Location: ${config.workflows.workflowsLocation} ${isValid ? '✅' : '❌'}`);
      }
      console.log('');
    }

    // Check for critical bmad-core directories
    console.log(chalk.bold('🔧 BMad Core Directories:'));
    const coreDirectories = [
      'bmad-core/agents',
      'bmad-core/structured-tasks',
      'bmad-core/templates',
      'bmad-core/data'
    ];

    coreDirectories.forEach(dir => {
      const isValid = this.validatePath(dir, `BMad ${dir.split('/')[1]}`);
      console.log(`   ${dir}: ${isValid ? '✅' : '❌'}`);
    });
  }

  /**
   * Display validation results
   */
  displayResults() {
    console.log('\n' + '='.repeat(60));
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log(chalk.green('✅ Configuration validation passed!'));
      console.log(chalk.dim('All paths and settings are valid.'));
      return 0;
    }

    if (this.errors.length > 0) {
      console.log(chalk.red(`❌ ${this.errors.length} Error(s) Found:`));
      this.errors.forEach((error, index) => {
        console.log(chalk.red(`   ${index + 1}. ${error}`));
      });
      console.log('');
    }

    if (this.warnings.length > 0) {
      console.log(chalk.yellow(`⚠️  ${this.warnings.length} Warning(s):`));
      this.warnings.forEach((warning, index) => {
        console.log(chalk.yellow(`   ${index + 1}. ${warning}`));
      });
      console.log('');
    }

    if (this.errors.length > 0) {
      console.log(chalk.red('Configuration validation failed. Please fix the errors above.'));
      return 1;
    } else {
      console.log(chalk.yellow('Configuration validation completed with warnings.'));
      return 0;
    }
  }
}

// CLI setup
program
  .description('Validate BMad core configuration paths and settings')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .parse(process.argv);

async function main() {
  const options = program.opts();
  const validator = new ConfigValidator(options.directory);
  
  try {
    await validator.validateConfig();
    const exitCode = validator.displayResults();
    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red('Validation failed:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ConfigValidator;