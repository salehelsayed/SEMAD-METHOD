#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { program } = require('commander');

/**
 * Dev Agent 'Implement Next Story' Command
 * Implements the next approved story using the dev agent
 */
class DevNextStoryRunner {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.configPath = path.join(rootDir, 'bmad-core', 'core-config.yaml');
  }

  /**
   * Load configuration from core-config.yaml
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
   * Find the next story to implement
   */
  findNextStory() {
    try {
      const findNextStoryModule = require('../bmad-core/utils/find-next-story');
      const config = this.loadConfig();
      
      const storyLocation = config.devStoryLocation || 'docs/stories';
      const result = findNextStoryModule.findNextApprovedStory(storyLocation);
      
      if (!result.found) {
        console.log(chalk.yellow('⏭️  No approved stories found ready for implementation.'));
        console.log(chalk.dim('Stories must have status "Approved" to be implemented.'));
        if (result.error) {
          console.log(chalk.dim(`Details: ${result.error}`));
        }
        return null;
      }

      // Transform the result to match expected format
      return {
        storyId: result.fullStoryId || result.filename,
        epicId: result.epicId,
        title: result.title,
        status: 'Approved',
        filePath: result.path
      };
    } catch (error) {
      console.error(chalk.red('Error finding next story:'), error.message);
      return null;
    }
  }

  /**
   * Run the dev agent to implement the story
   */
  async runDevAgent(storyPath, options = {}) {
    console.log(chalk.blue('🚀 Running Dev Agent Implementation...\n'));
    
    try {
      const AgentRunner = require('../bmad-core/utils/agent-runner');
      const runner = new AgentRunner({
        memoryEnabled: true,
        healthMonitoringEnabled: true,
        verbose: options.verbose || false
      });

      // Load dev agent configuration
      const devAgentPath = path.join(this.rootDir, 'bmad-core', 'agents', 'dev.md');
      if (!fs.existsSync(devAgentPath)) {
        throw new Error(`Dev agent not found: ${devAgentPath}`);
      }

      console.log(`📖 Story: ${path.relative(this.rootDir, storyPath)}`);
      console.log(`🤖 Agent: dev`);
      console.log(`📂 Working Directory: ${this.rootDir}\n`);

      // Prepare context for the dev agent
      const context = {
        storyPath: storyPath,
        task: 'implement-next-story',
        mode: options.mode || 'implementation',
        projectRoot: this.rootDir
      };

      // Run the structured task for implementing next story
      const taskPath = path.join(this.rootDir, 'bmad-core', 'structured-tasks', 'implement-next-story.yaml');
      
      if (fs.existsSync(taskPath)) {
        console.log(chalk.blue('🔧 Using structured task: implement-next-story.yaml'));
        const result = await runner.runStructuredTask('dev', taskPath, context);
        return result;
      } else {
        // Fallback to direct agent execution
        console.log(chalk.yellow('⚠️  Structured task not found, using direct agent execution'));
        const result = await runner.runAgent('dev', context);
        return result;
      }

    } catch (error) {
      console.error(chalk.red('Dev agent execution failed:'), error.message);
      throw error;
    }
  }

  /**
   * Update story status after implementation
   */
  async updateStoryStatus(storyPath, status) {
    try {
      const content = fs.readFileSync(storyPath, 'utf8');
      const statusRegex = /(##\s*Status\s*\n\s*)(.+)/i;
      
      if (!statusRegex.test(content)) {
        console.warn(chalk.yellow('⚠️  Could not find Status section in story file'));
        return false;
      }

      const updatedContent = content.replace(statusRegex, `$1${status}`);
      fs.writeFileSync(storyPath, updatedContent, 'utf8');
      
      console.log(chalk.green(`✅ Story status updated to: ${status}`));
      return true;
      
    } catch (error) {
      console.error(chalk.red('Failed to update story status:'), error.message);
      return false;
    }
  }

  /**
   * Main execution flow
   */
  async run(options = {}) {
    console.log(chalk.bold('🛠️  BMad Dev Agent - Implement Next Story\n'));
    console.log(`📂 Project: ${this.rootDir}\n`);

    try {
      // Find next story to implement
      const nextStory = this.findNextStory();
      if (!nextStory) {
        return 1;
      }

      console.log(chalk.green(`📋 Found story to implement:`));
      console.log(`   Story ID: ${nextStory.storyId}`);
      console.log(`   Epic ID: ${nextStory.epicId || 'N/A'}`);
      console.log(`   Title: ${nextStory.title || 'Untitled'}`);
      console.log(`   Status: ${nextStory.status}`);
      console.log(`   File: ${path.relative(this.rootDir, nextStory.filePath)}\n`);

      // Confirm execution if not in auto mode
      if (!options.auto) {
        const inquirer = require('inquirer');
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed with implementation?',
            default: true
          }
        ]);

        if (!proceed) {
          console.log(chalk.yellow('⏹️  Implementation cancelled.'));
          return 0;
        }
      }

      // Update story status to In Progress
      console.log(chalk.blue('📝 Updating story status to "In Progress"...'));
      await this.updateStoryStatus(nextStory.filePath, 'In Progress');

      // Run dev agent implementation
      const result = await this.runDevAgent(nextStory.filePath, options);

      if (result && result.success) {
        console.log(chalk.green('\n✅ Implementation completed successfully!'));
        
        // Update story status to Implemented
        await this.updateStoryStatus(nextStory.filePath, 'Implemented');
        
        console.log(chalk.blue('\n📋 Next Steps:'));
        console.log('   1. Review the implemented changes');
        console.log('   2. Run tests to ensure quality');
        console.log('   3. Use QA agent for validation');
        console.log(`   4. Run: npm run qa:review "${path.relative(this.rootDir, nextStory.filePath)}"`);
        
        return 0;
      } else {
        console.log(chalk.red('\n❌ Implementation failed or incomplete.'));
        
        // Update story status back to Approved for retry
        await this.updateStoryStatus(nextStory.filePath, 'Approved');
        
        console.log(chalk.yellow('Story status reverted to "Approved" for retry.'));
        return 1;
      }

    } catch (error) {
      console.error(chalk.red('\nError during implementation:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      return 1;
    }
  }
}

// CLI setup
program
  .description('Run dev agent to implement the next approved story')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-a, --auto', 'Run automatically without confirmation prompts')
  .option('-v, --verbose', 'Show detailed execution logs')
  .option('-m, --mode <mode>', 'Implementation mode (implementation, review, test)', 'implementation')
  .parse(process.argv);

async function main() {
  const options = program.opts();
  const runner = new DevNextStoryRunner(options.directory);
  
  try {
    const exitCode = await runner.run({
      auto: options.auto,
      verbose: options.verbose,
      mode: options.mode
    });
    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red('Command failed:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DevNextStoryRunner;