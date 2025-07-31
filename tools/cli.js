#!/usr/bin/env node

const { Command } = require('commander');
const WebBuilder = require('./builders/web-builder');
const V3ToV4Upgrader = require('./upgraders/v3-to-v4-upgrader');
const IdeSetup = require('./installer/lib/ide-setup');
const path = require('path');
const chalk = require('chalk');

const program = new Command();

program
  .name('bmad-build')
  .description('BMad-Method build tool for creating web bundles')
  .version('4.0.0');

program
  .command('build')
  .description('Build web bundles for agents and teams')
  .option('-a, --agents-only', 'Build only agent bundles')
  .option('-t, --teams-only', 'Build only team bundles')
  .option('-e, --expansions-only', 'Build only expansion pack bundles')
  .option('--no-expansions', 'Skip building expansion packs')
  .option('--no-clean', 'Skip cleaning output directories')
  .action(async (options) => {
    const builder = new WebBuilder({
      rootDir: process.cwd()
    });

    try {
      // Validate root directory structure
      const fs = require('fs');
      const requiredDirs = ['bmad-core', 'tools'];
      const missingDirs = requiredDirs.filter(dir => !fs.existsSync(path.join(process.cwd(), dir)));
      
      if (missingDirs.length > 0) {
        console.error(chalk.red('\u274c Build failed: Missing required directories'));
        console.error(chalk.yellow(`  Missing: ${missingDirs.join(', ')}`))
        console.error(chalk.dim('  Run this command from the SEMAD-METHOD root directory'));
        process.exit(1);
      }

      if (options.clean) {
        console.log('Cleaning output directories...');
        await builder.cleanOutputDirs();
      }

      if (options.expansionsOnly) {
        console.log('Building expansion pack bundles...');
        await builder.buildAllExpansionPacks({ clean: false });
      } else {
        if (!options.teamsOnly) {
          console.log('Building agent bundles...');
          await builder.buildAgents();
        }

        if (!options.agentsOnly) {
          console.log('Building team bundles...');
          await builder.buildTeams();
        }

        if (!options.noExpansions) {
          console.log('Building expansion pack bundles...');
          await builder.buildAllExpansionPacks({ clean: false });
        }
      }

      console.log(chalk.green('\u2713 Build completed successfully!'));
    } catch (error) {
      console.error(chalk.red('\u274c Build failed:'), error.message);
      
      // Provide more context based on error type
      if (error.message.includes('ENOENT')) {
        console.error(chalk.yellow('\n\u26a0\ufe0f  File or directory not found'));
        console.error(chalk.dim('  Check that all required files exist'));
      } else if (error.message.includes('YAML')) {
        console.error(chalk.yellow('\n\u26a0\ufe0f  YAML parsing error'));
        console.error(chalk.dim('  Check agent and team configuration files for syntax errors'));
      } else if (error.message.includes('dependency')) {
        console.error(chalk.yellow('\n\u26a0\ufe0f  Dependency resolution failed'));
        console.error(chalk.dim('  Check that all referenced dependencies exist'));
      }
      
      // Show stack trace in debug mode
      if (process.env.DEBUG) {
        console.error(chalk.dim('\nStack trace:'));
        console.error(chalk.dim(error.stack));
      } else {
        console.error(chalk.dim('\nRun with DEBUG=1 for more details'));
      }
      
      process.exit(1);
    }
  });

program
  .command('build:expansions')
  .description('Build web bundles for all expansion packs')
  .option('--expansion <name>', 'Build specific expansion pack only')
  .option('--no-clean', 'Skip cleaning output directories')
  .action(async (options) => {
    const builder = new WebBuilder({
      rootDir: process.cwd()
    });

    try {
      if (options.expansion) {
        console.log(`Building expansion pack: ${options.expansion}`);
        await builder.buildExpansionPack(options.expansion, { clean: options.clean });
      } else {
        console.log('Building all expansion packs...');
        await builder.buildAllExpansionPacks({ clean: options.clean });
      }

      console.log('Expansion pack build completed successfully!');
    } catch (error) {
      console.error('Expansion pack build failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('list:agents')
  .description('List all available agents')
  .action(async () => {
    try {
      const builder = new WebBuilder({ rootDir: process.cwd() });
      const agents = await builder.resolver.listAgents();
      
      if (agents.length === 0) {
        console.warn(chalk.yellow('\u26a0\ufe0f  No agents found'));
        console.log(chalk.dim('  Check that bmad-core/agents directory exists'));
      } else {
        console.log(chalk.bold('Available agents:'));
        agents.forEach(agent => console.log(chalk.cyan(`  - ${agent}`)));
      }
    } catch (error) {
      console.error(chalk.red('\u274c Failed to list agents:'), error.message);
      process.exit(1);
    }
  });

program
  .command('list:expansions')
  .description('List all available expansion packs')
  .action(async () => {
    try {
      const builder = new WebBuilder({ rootDir: process.cwd() });
      const expansions = await builder.listExpansionPacks();
      
      if (expansions.length === 0) {
        console.log(chalk.yellow('No expansion packs found'));
        console.log(chalk.dim('  Expansion packs can be added to the expansion-packs directory'));
      } else {
        console.log(chalk.bold('Available expansion packs:'));
        expansions.forEach(expansion => console.log(chalk.cyan(`  - ${expansion}`)));
      }
    } catch (error) {
      console.error(chalk.red('\u274c Failed to list expansion packs:'), error.message);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate agent and team configurations')
  .action(async () => {
    const builder = new WebBuilder({ rootDir: process.cwd() });
    try {
      // Validate by attempting to build all agents and teams
      const agents = await builder.resolver.listAgents();
      const teams = await builder.resolver.listTeams();
      
      console.log('Validating agents...');
      for (const agent of agents) {
        await builder.resolver.resolveAgentDependencies(agent);
        console.log(`  ✓ ${agent}`);
      }
      
      console.log('\nValidating teams...');
      for (const team of teams) {
        await builder.resolver.resolveTeamDependencies(team);
        console.log(`  ✓ ${team}`);
      }
      
      console.log(chalk.green('\n\u2713 All configurations are valid!'));
    } catch (error) {
      console.error(chalk.red('\u274c Validation failed:'), error.message);
      
      // Provide specific guidance based on validation errors
      if (error.message.includes('not found')) {
        console.error(chalk.yellow('\n\u26a0\ufe0f  Missing dependency detected'));
        console.error(chalk.dim('  Ensure all referenced files exist in their expected locations'));
      } else if (error.message.includes('YAML')) {
        console.error(chalk.yellow('\n\u26a0\ufe0f  Configuration syntax error'));
        console.error(chalk.dim('  Check YAML syntax in agent/team configuration files'));
      }
      
      process.exit(1);
    }
  });

program
  .command('upgrade')
  .description('Upgrade a BMad-Method V3 project to V4')
  .option('-p, --project <path>', 'Path to V3 project (defaults to current directory)')
  .option('--dry-run', 'Show what would be changed without making changes')
  .option('--no-backup', 'Skip creating backup (not recommended)')
  .action(async (options) => {
    const upgrader = new V3ToV4Upgrader();
    await upgrader.upgrade({
      projectPath: options.project,
      dryRun: options.dryRun,
      backup: options.backup
    });
  });

program
  .command('scan-dependencies')
  .description('Scan repository for code dependencies and populate Qdrant database')
  .option('-r, --root <path>', 'Repository root directory (defaults to current directory)')
  .option('--include-tests', 'Include test files in the analysis')
  .option('--max-size <bytes>', 'Maximum file size to process in bytes', '1048576')
  .option('--watch', 'Watch for file changes and update dependencies incrementally')
  .option('--stats', 'Show dependency database statistics after scan')
  .action(async (options) => {
    try {
      const { scanRepository, watchRepository, getDependencyStats } = require('../bmad-core/utils/dependency-scanner');
      
      const config = {
        rootDir: options.root || process.cwd(),
        includeTests: options.includeTests,
        maxFileSize: parseInt(options.maxSize),
        showProgress: true
      };
      
      if (options.watch) {
        console.log(chalk.blue('Starting dependency watch mode...'));
        console.log(chalk.dim('Press Ctrl+C to stop watching'));
        
        const watcher = watchRepository(config);
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
          console.log(chalk.yellow('\nStopping dependency watcher...'));
          watcher.close();
          process.exit(0);
        });
        
      } else {
        console.log(chalk.blue('Starting repository dependency scan...'));
        const result = await scanRepository(config);
        
        if (result.success) {
          console.log(chalk.green('\n✓ Dependency scan completed successfully!'));
          
          if (options.stats || result.stats) {
            console.log(chalk.bold('\nDependency Database Statistics:'));
            console.log(`  Total symbols: ${result.stats.totalSymbols}`);
            console.log('  Symbol types:');
            Object.entries(result.stats.typeDistribution).forEach(([type, count]) => {
              console.log(`    ${type}: ${count}`);
            });
          }
        } else {
          console.error(chalk.red('✗ Dependency scan failed:'), result.error);
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(chalk.red('✗ Dependency scan failed:'), error.message);
      console.error(chalk.dim('Ensure Qdrant is running on localhost:6333'));
      process.exit(1);
    }
  });

program
  .command('dependency-stats')
  .description('Show dependency database statistics')
  .action(async () => {
    try {
      const { getDependencyStats } = require('../bmad-core/utils/dependency-analyzer');
      
      console.log(chalk.blue('Fetching dependency statistics...'));
      const stats = await getDependencyStats();
      
      console.log(chalk.bold('\nDependency Database Statistics:'));
      console.log(`  Total symbols: ${stats.totalSymbols}`);
      
      if (Object.keys(stats.typeDistribution).length > 0) {
        console.log('  Symbol types:');
        Object.entries(stats.typeDistribution).forEach(([type, count]) => {
          console.log(`    ${type}: ${count}`);
        });
      } else {
        console.log(chalk.yellow('  No symbols found in database'));
        console.log(chalk.dim('  Run "bmad-build scan-dependencies" to populate the database'));
      }
    } catch (error) {
      console.error(chalk.red('✗ Failed to get dependency stats:'), error.message);
      console.error(chalk.dim('Ensure Qdrant is running on localhost:6333'));
      process.exit(1);
    }
  });

program.parse();