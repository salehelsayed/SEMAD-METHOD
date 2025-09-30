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
    this.configPath = path.join(rootDir, 'semad-core', 'core-config.yaml');
  }

  /**
   * Load configuration from core-config.yaml
   */
  loadConfig() {
    const yaml = require('js-yaml');
    const candidates = [
      path.join(this.rootDir, '.semad-core', 'core-config.yaml'),
      path.join(this.rootDir, 'semad-core', 'core-config.yaml'),
      path.join(this.rootDir, '.semad-core', 'core-config.yaml'),
      path.join(this.rootDir, 'semad-core', 'core-config.yaml'),
      path.join(this.rootDir, 'core-config.yaml')
    ];
    const p = candidates.find(f => fs.existsSync(f));
    if (!p) {
      throw new Error(`Core configuration not found. Searched: ${candidates.join(', ')}`);
    }
    const content = fs.readFileSync(p, 'utf8');
    return yaml.load(content);
  }

  /**
   * Find stories ready for QA review
   */
  findStoriesForReview() {
    try {
      const { getAllStoriesStatus } = require('../semad-core/utils/find-next-story');
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
    
    // Check for YAML frontmatter with storyContract
    if (content.startsWith('---') && content.includes('storyContract:')) {
      // Parse YAML frontmatter
      const yamlEnd = content.indexOf('---', 3);
      if (yamlEnd > 0) {
        const yamlContent = content.substring(3, yamlEnd);
        try {
          const yaml = require('js-yaml');
          const frontmatter = yaml.load(yamlContent);
          if (frontmatter && frontmatter.storyContract) {
            // Valid contract format
            return true;
          }
        } catch (e) {
          console.warn(chalk.yellow(`⚠️  Failed to parse story contract: ${e.message}`));
        }
      }
    }
    
    // Check for traditional markdown sections
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
      // Prefer review-story.yaml; allow override via env; fallback to qa-dev-handoff.yaml
      const requestedTask = process.env.QA_REVIEW_TASK || process.env.QA_REVIEW_STRUCTURED_TASK;
      const tryNames = requestedTask ? [requestedTask] : ['review-story.yaml', 'qa-dev-handoff.yaml'];
      const candidates = [];
      for (const name of tryNames) {
        candidates.push(
          path.join(this.rootDir, 'semad-core', 'structured-tasks', name),
          path.join(this.rootDir, '.semad-core', 'structured-tasks', name),
          path.join(this.rootDir, 'semad-core', 'structured-tasks', name)
        );
      }
      const qaTaskPath = candidates.find(p => fs.existsSync(p));
      if (!qaTaskPath) {
        throw new Error('No QA structured task found (looked for review-story.yaml, qa-dev-handoff.yaml)');
      }

      const taskName = path.basename(qaTaskPath);
      console.log(chalk.blue(`🔧 Using structured task: ${taskName}`));

      // Build context with user input handler
      const TaskRunner = require('./task-runner');
      const { createUserInputHandler } = require('./lib/elicit-handler');

      const allowMissingUserInput = !!options.writeOnly || process.env.BMAD_NONINTERACTIVE === '1' || process.env.BMAD_ALLOW_MISSING_USER_INPUT === '1';
      const userInputHandler = allowMissingUserInput ?
        createUserInputHandler({ mode: 'auto', nonInteractive: true }) :
        createUserInputHandler({ mode: process.env.SEMAD_ELICIT_MODE || 'cli' });

      const context = {
        storyPath,
        projectRoot: this.rootDir,
        mode: options.mode || 'review',
        reviewType: options.reviewType || 'full',
        userInputHandler,
        allowMissingUserInput
      };

      // Execute task
      const runner = new TaskRunner(this.rootDir);
      const execResult = await runner.executeTask('qa', qaTaskPath, context);

      // Summarize user responses (if any) into QA comments
      let qaComments = '';
      if (context.userResponses && typeof context.userResponses === 'object') {
        const lines = [];
        lines.push('Summary of interactive responses:');
        for (const [stepId, responses] of Object.entries(context.userResponses)) {
          lines.push(`- Step ${stepId}:`);
          for (const [question, answer] of Object.entries(responses || {})) {
            lines.push(`  • ${question} -> ${answer}`);
          }
        }
        qaComments = lines.join('\n');
      }

      // Infer final status: look for explicit final decision if provided
      let finalStatus = 'QA Approved';
      const decisionText = JSON.stringify(context.userResponses || {}).toLowerCase();
      if (/claude\s*error|\[claude\s*error\]|error:/.test(decisionText)) {
        finalStatus = 'QA Failed';
      } else if (/no\b|reject|needs fix|needs\s+fixes|fail/.test(decisionText)) {
        finalStatus = 'QA Failed';
      } else if (/yes\b|approve|approved/.test(decisionText)) {
        finalStatus = 'QA Approved';
      }

      return {
        success: !!execResult && execResult.success !== false,
        approved: finalStatus === 'QA Approved',
        comments: qaComments
      };
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
      // Match any markdown heading level for Status, with optional colon
      const statusRegex = /(#{1,6}\s*Status\s*:?[\t ]*\n[\t ]*)(.+)/i;
      
      if (!statusRegex.test(content)) {
        // Try to update YAML frontmatter status if present
        if (content.startsWith('---')) {
          const yamlEnd = content.indexOf('---', 3);
          if (yamlEnd > 0) {
            const yaml = require('js-yaml');
            const fmRaw = content.substring(3, yamlEnd);
            try {
              const fm = yaml.load(fmRaw) || {};
              if (fm.storyContract) {
                fm.storyContract.status = status;
                const newFm = '---\n' + yaml.dump(fm) + '---';
                content = newFm + content.substring(yamlEnd + 3);
              } else if (fm.status) {
                fm.status = status;
                const newFm = '---\n' + yaml.dump(fm) + '---';
                content = newFm + content.substring(yamlEnd + 3);
              } else {
                console.warn(chalk.yellow('⚠️  Could not find Status section in story file'));
                return false;
              }
            } catch (e) {
              console.warn(chalk.yellow('⚠️  Could not parse frontmatter to update status'));
              return false;
            }
          } else {
            console.warn(chalk.yellow('⚠️  Could not find Status section in story file'));
            return false;
          }
        } else {
          console.warn(chalk.yellow('⚠️  Could not find Status section in story file'));
          return false;
        }
      } else {
        // Update status in markdown section
        content = content.replace(statusRegex, `$1${status}`);
      }

      // Ensure QA Results section is updated with latest findings
      if (qaComments !== null) {
        const timestamp = new Date().toISOString();
        const lines = content.split('\n');

        const removeSection = (sectionTitle) => {
          const matchTitle = sectionTitle.trim().toLowerCase();
          let idx = lines.findIndex(line => line.trim().toLowerCase() === matchTitle);
          let removed = false;
          while (idx !== -1) {
            let endIdx = lines.length;
            for (let i = idx + 1; i < lines.length; i++) {
              if (/^##\s+/.test(lines[i]) || /^#\s+/.test(lines[i])) {
                endIdx = i;
                break;
              }
            }
            lines.splice(idx, endIdx - idx);
            removed = true;
            idx = lines.findIndex(line => line.trim().toLowerCase() === matchTitle);
          }
          return removed;
        };

        const removedOldResults = removeSection('## qa results');
        const removedOldFindings = removeSection('## qa findings');

        const summaryLines = (qaComments && qaComments.trim())
          ? qaComments.trim().split(/\r?\n/).map(line => line.trimEnd())
          : ['- QA review completed via CLI automation; no additional comments captured.'];

        const qaSection = [
          '## QA Results',
          `### Review Date: ${timestamp}`,
          '### Reviewed By: Quinn (QA Agent)',
          `### Decision: ${status}`,
          '',
          ...summaryLines,
          ''
        ];

        if (lines.length && lines[lines.length - 1].trim() !== '') {
          lines.push('');
        }
        lines.push(...qaSection);

        content = lines.join('\n');

        if (removedOldResults || removedOldFindings) {
          console.log(chalk.dim('🧹 Removed previous QA Results/QA Findings sections before writing new review.'));
        }
      }

      fs.writeFileSync(storyPath, content, 'utf8');
      
      console.log(chalk.green(`✅ Story status updated to: ${status}`));
      if (qaComments !== null) {
        console.log(chalk.blue('📝 QA Results section updated in story file'));
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
        let storyInfo = null;
        
        // Try to parse YAML frontmatter first
        if (content.startsWith('---')) {
          const yamlEnd = content.indexOf('---', 3);
          if (yamlEnd > 0) {
            const yamlContent = content.substring(3, yamlEnd);
            try {
              const yaml = require('js-yaml');
              const frontmatter = yaml.load(yamlContent);
              if (frontmatter && frontmatter.storyContract) {
                const contract = frontmatter.storyContract;
                storyInfo = {
                  storyId: contract.story_id || 'Unknown',
                  title: contract.story_title || 'Untitled',
                  status: contract.status || 'Unknown',
                  filePath: absolutePath
                };
              }
            } catch (e) {
              // Fall through to markdown parsing
            }
          }
        }
        
        // Fall back to markdown parsing if YAML parsing failed
        if (!storyInfo) {
          const storyIdMatch = content.match(/##?\s*Story ID\s*[:\n]\s*(\S+)/i);
          const titleMatch = content.match(/##?\s*Title\s*[:\n]\s*(.+)/i);
          const statusMatch = content.match(/##?\s*Status\s*[:\n]\s*(.+)/i);
          
          storyInfo = {
            storyId: storyIdMatch ? storyIdMatch[1].trim() : 'Unknown',
            title: titleMatch ? titleMatch[1].trim() : 'Untitled',
            status: statusMatch ? statusMatch[1].trim() : 'Unknown',
            filePath: absolutePath
          };
        }
        
        selectedStory = storyInfo;
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
