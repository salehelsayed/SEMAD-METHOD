#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { program } = require('commander');

/**
 * QA Agent Review functionality
 * Runs QA review on implemented stories
 */
class QAReviewRunner {
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
   * Find stories ready for QA review
   */
  findStoriesForReview() {
    try {
      const { getAllStoriesStatus } = require('../bmad-core/utils/find-next-story');
      const config = this.loadConfig();
      
      const storyLocation = config.stories?.storyLocation || 'docs/stories';
      const allStories = getAllStoriesStatus(storyLocation);
      
      // Find stories with "Implemented" or "In QA" status
      const reviewableStories = allStories.filter(story => 
        story.status === 'Implemented' || story.status === 'In QA'
      );

      return reviewableStories;
    } catch (error) {
      console.error(chalk.red('Error finding stories for review:'), error.message);
      return [];
    }
  }

  /**
   * Validate story file exists and has proper structure
   */
  validateStoryFile(storyPath) {
    if (!fs.existsSync(storyPath)) {
      throw new Error(`Story file not found: ${storyPath}`);
    }

    const content = fs.readFileSync(storyPath, 'utf8');
    
    // Check for required sections
    const requiredSections = ['Story ID', 'Status', 'Implementation Details'];
    const missingSections = requiredSections.filter(section => 
      !content.includes(`## ${section}`) && !content.includes(`# ${section}`)
    );

    if (missingSections.length > 0) {
      console.warn(chalk.yellow(`⚠️  Missing sections in story: ${missingSections.join(', ')}`));
    }

    return true;
  }

  /**
   * Run QA agent review on a story
   */
  async runQAReview(storyPath, options = {}) {
    console.log(chalk.blue('🔍 Running QA Agent Review...\n'));
    
    try {
      const AgentRunner = require('../bmad-core/utils/agent-runner');
      const runner = new AgentRunner({
        memoryEnabled: true,
        healthMonitoringEnabled: true,
        verbose: options.verbose || false
      });

      // Load QA agent configuration
      const qaAgentPath = path.join(this.rootDir, 'bmad-core', 'agents', 'qa.md');
      if (!fs.existsSync(qaAgentPath)) {
        throw new Error(`QA agent not found: ${qaAgentPath}`);
      }

      console.log(`📖 Story: ${path.relative(this.rootDir, storyPath)}`);
      console.log(`🤖 Agent: qa`);
      console.log(`📂 Working Directory: ${this.rootDir}\n`);

      // Prepare context for the QA agent
      const context = {
        storyPath: storyPath,
        task: 'qa-review',
        mode: options.mode || 'review',
        projectRoot: this.rootDir,
        reviewType: options.reviewType || 'full',
        writeOnly: options.writeOnly || false
      };

      // Check for QA review structured task
      const qaTaskPath = path.join(this.rootDir, 'bmad-core', 'structured-tasks', 'qa-dev-handoff.yaml');
      
      if (fs.existsSync(qaTaskPath)) {
        console.log(chalk.blue('🔧 Using structured task: qa-dev-handoff.yaml'));
        const result = await runner.runStructuredTask('qa', qaTaskPath, context);
        return result;
      } else {
        // Fallback to direct agent execution
        console.log(chalk.yellow('⚠️  QA structured task not found, using direct agent execution'));
        const result = await runner.runAgent('qa', context);
        return result;
      }

    } catch (error) {
      console.error(chalk.red('QA agent execution failed:'), error.message);
      throw error;
    }
  }

  /**
   * Update story status after QA review
   */
  async updateStoryStatus(storyPath, status, qaComments = null) {
    try {
      let content = fs.readFileSync(storyPath, 'utf8');
      const statusRegex = /(##\s*Status\s*\n\s*)(.+)/i;
      
      if (!statusRegex.test(content)) {
        console.warn(chalk.yellow('⚠️  Could not find Status section in story file'));
        return false;
      }

      // Update status
      content = content.replace(statusRegex, `$1${status}`);

      // Add QA comments section if provided
      if (qaComments && qaComments.trim()) {
        const qaSection = `\n## QA Review Comments\n\n${qaComments}\n\n**Review Date:** ${new Date().toISOString().split('T')[0]}\n`;
        
        // Insert QA section before Implementation Details if it exists
        if (content.includes('## Implementation Details')) {
          content = content.replace('## Implementation Details', qaSection + '## Implementation Details');
        } else {
          content += qaSection;
        }
      }

      fs.writeFileSync(storyPath, content, 'utf8');
      
      console.log(chalk.green(`✅ Story status updated to: ${status}`));
      if (qaComments) {
        console.log(chalk.blue('📝 QA comments added to story file'));
      }
      return true;
      
    } catch (error) {
      console.error(chalk.red('Failed to update story status:'), error.message);
      return false;
    }
  }

  /**
   * Interactive story selection
   */
  async selectStoryForReview(stories) {
    if (stories.length === 0) {
      console.log(chalk.yellow('⏭️  No stories found ready for QA review.'));
      console.log(chalk.dim('Stories must have status "Implemented" or "In QA" to be reviewed.'));
      return null;
    }

    if (stories.length === 1) {
      console.log(chalk.blue('📋 Found 1 story ready for review:'));
      return stories[0];
    }

    const inquirer = require('inquirer');
    const choices = stories.map(story => ({
      name: `Story ${story.storyId} - ${story.title || 'Untitled'} (${story.status})`,
      value: story
    }));

    const { selectedStory } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedStory',
        message: 'Select a story to review:',
        choices: choices
      }
    ]);

    return selectedStory;
  }

  /**
   * Main execution flow
   */
  async run(storyFilePath = null, options = {}) {
    console.log(chalk.bold('🔍 BMad QA Agent - Story Review\n'));
    console.log(`📂 Project: ${this.rootDir}\n`);

    try {
      let selectedStory = null;

      if (storyFilePath) {
        // Review specific story file
        const absolutePath = path.isAbsolute(storyFilePath) 
          ? storyFilePath 
          : path.resolve(this.rootDir, storyFilePath);
        
        this.validateStoryFile(absolutePath);
        
        // Extract story info from file
        const content = fs.readFileSync(absolutePath, 'utf8');
        const storyIdMatch = content.match(/##?\s*Story ID\s*[:\n]\s*(\S+)/i);
        const titleMatch = content.match(/##?\s*Title\s*[:\n]\s*(.+)/i);
        const statusMatch = content.match(/##?\s*Status\s*[:\n]\s*(.+)/i);
        
        selectedStory = {
          storyId: storyIdMatch ? storyIdMatch[1].trim() : 'Unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          status: statusMatch ? statusMatch[1].trim() : 'Unknown',
          filePath: absolutePath
        };
      } else {
        // Find and select story for review
        const reviewableStories = this.findStoriesForReview();
        selectedStory = await this.selectStoryForReview(reviewableStories);
        
        if (!selectedStory) {
          return 1;
        }
      }

      console.log(chalk.green(`📋 Selected story for review:`));
      console.log(`   Story ID: ${selectedStory.storyId}`);
      console.log(`   Title: ${selectedStory.title}`);
      console.log(`   Current Status: ${selectedStory.status}`);
      console.log(`   File: ${path.relative(this.rootDir, selectedStory.filePath)}\n`);

      // Update story status to In QA
      if (selectedStory.status !== 'In QA') {
        console.log(chalk.blue('📝 Updating story status to "In QA"...'));
        await this.updateStoryStatus(selectedStory.filePath, 'In QA');
      }

      // Run QA review
      const result = await this.runQAReview(selectedStory.filePath, options);

      if (result && result.success) {
        console.log(chalk.green('\n✅ QA review completed successfully!'));
        
        // Determine final status based on review result
        const finalStatus = result.approved !== false ? 'QA Approved' : 'QA Failed';
        const qaComments = result.comments || result.feedback || '';
        
        await this.updateStoryStatus(selectedStory.filePath, finalStatus, qaComments);
        
        if (finalStatus === 'QA Approved') {
          console.log(chalk.green('🎉 Story approved! Ready for release.'));
        } else {
          console.log(chalk.yellow('⚠️  Story requires fixes. Feedback provided in story file.'));
          console.log(chalk.blue('\n📋 Next Steps:'));
          console.log('   1. Review QA feedback in the story file');
          console.log('   2. Address the identified issues');
          console.log(`   3. Re-run: npm run dev:next-story "${path.relative(this.rootDir, selectedStory.filePath)}"`);
        }
        
        return 0;
      } else {
        console.log(chalk.red('\n❌ QA review failed or incomplete.'));
        
        // Update story status back to Implemented for retry
        await this.updateStoryStatus(selectedStory.filePath, 'Implemented');
        
        console.log(chalk.yellow('Story status reverted to "Implemented" for retry.'));
        return 1;
      }

    } catch (error) {
      console.error(chalk.red('\nError during QA review:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      return 1;
    }
  }
}

// CLI setup
program
  .description('Run QA agent review on implemented stories')
  .argument('[story-file]', 'Path to specific story file to review')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-v, --verbose', 'Show detailed execution logs')
  .option('-m, --mode <mode>', 'Review mode (review, quick, thorough)', 'review')
  .option('-t, --review-type <type>', 'Type of review (full, code-only, docs-only)', 'full')
  .option('-w, --write-only', 'Write-only review mode (no interactive prompts)')
  .parse(process.argv);

async function main() {
  const options = program.opts();
  const storyFile = program.args[0];
  const runner = new QAReviewRunner(options.directory);
  
  try {
    const exitCode = await runner.run(storyFile, {
      verbose: options.verbose,
      mode: options.mode,
      reviewType: options.reviewType,
      writeOnly: options.writeOnly
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

module.exports = QAReviewRunner;