#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { Command } = require('commander');
const AgentSimulator = require('../bmad-core/utils/agent-simulator');
const WorkflowConfigLoader = require('../bmad-core/utils/workflow-config-loader');
const VerboseLogger = require('../bmad-core/utils/verbose-logger');
const FilePathResolver = require('../bmad-core/utils/file-path-resolver');
const SharedContextManager = require('../bmad-core/utils/shared-context-manager');
const AgentRunner = require('../bmad-core/utils/agent-runner');
const { getAggregatedHealthStatus } = require('../bmad-core/utils/memory-health');

class WorkflowOrchestrator {
  constructor(rootDir) {
    this.rootDir = rootDir || process.cwd();
    this.workflowsDir = path.join(this.rootDir, 'bmad-core', 'workflows');
    this.storyMetadataPath = path.join(this.rootDir, '.bmad-orchestrator-metadata.json');
    this.simulator = new AgentSimulator();
    this.configLoader = new WorkflowConfigLoader(this.rootDir);
    this.logger = new VerboseLogger();
    this.filePathResolver = new FilePathResolver(this.rootDir);
    this.contextManager = new SharedContextManager(path.join(this.rootDir, '.ai'));
    this.agentRunner = new AgentRunner({ memoryEnabled: true, healthMonitoringEnabled: true });
    this.config = null;
    this.resolvedPaths = null;
    this.nonInteractive = false;
  }

  /**
   * Display consolidated memory health status for all agents
   * @param {Array} agents - List of agent names to check
   * @returns {Object} Memory health summary
   */
  async displayMemoryHealthStatus(agents = ['dev', 'qa', 'sm', 'analyst', 'pm', 'architect']) {
    this.logger.taskStart('Memory health assessment', 'Checking memory systems across all agents');
    
    console.log(chalk.bold('\n🩺 Memory Health Status Report\n'));
    
    try {
      // Get aggregated health status
      const aggregatedStatus = getAggregatedHealthStatus();
      
      if (aggregatedStatus.summary.totalAgents === 0) {
        console.log(chalk.yellow('⚠️  No memory health data available yet.'));
        console.log(chalk.dim('Memory health checks will be performed when agents are first used.\n'));
        return { 
          healthy: true, 
          message: 'No health data available', 
          agentCount: 0,
          recommendation: 'Memory health checks will run automatically when agents start'
        };
      }
      
      // Display overall summary
      const { summary } = aggregatedStatus;
      console.log(chalk.bold(`📊 Overall Status:`));
      console.log(`   Total Agents Monitored: ${summary.totalAgents}`);
      console.log(`   Healthy Agents: ${chalk.green(summary.healthyAgents)}`);
      console.log(`   Degraded Agents: ${chalk.yellow(summary.degradedAgents)}`);
      console.log(`   Unhealthy Agents: ${chalk.red(summary.unhealthyAgents)}`);
      console.log(`   Total System Checks: ${summary.totalChecks}`);
      
      // Display critical issues if any
      if (aggregatedStatus.criticalIssues.length > 0) {
        console.log(chalk.red(`\n🚨 CRITICAL ISSUES (${aggregatedStatus.criticalIssues.length}):`));
        aggregatedStatus.criticalIssues.forEach(issue => {
          console.log(chalk.red(`   • [${issue.agent}] ${issue.message}`));
        });
      }
      
      // Display agent-specific status
      if (Object.keys(aggregatedStatus.agents).length > 0) {
        console.log(chalk.bold(`\n🤖 Agent Status:`));
        
        Object.entries(aggregatedStatus.agents).forEach(([agentName, status]) => {
          const statusIcon = status.overallStatus === 'healthy' ? '✅' : 
                           status.overallStatus === 'degraded' ? '⚠️' : '❌';
          const statusColor = status.overallStatus === 'healthy' ? chalk.green : 
                            status.overallStatus === 'degraded' ? chalk.yellow : chalk.red;
          
          console.log(`   ${statusIcon} ${agentName}: ${statusColor(status.overallStatus.toUpperCase())}`);
          
          if (status.overallStatus !== 'healthy') {
            const issues = Object.values(status.components).filter(c => c.status !== 'healthy');
            issues.forEach(issue => {
              const severity = issue.severity === 'critical' ? '🚨' : 
                             issue.severity === 'error' ? '❌' : '⚠️';
              console.log(`     ${severity} ${issue.message}`);
            });
          }
        });
      }
      
      // Display top recommendations
      if (aggregatedStatus.recommendations.length > 0) {
        console.log(chalk.bold(`\n💡 Top Recommendations:`));
        const topRecommendations = aggregatedStatus.recommendations
          .slice(0, 5)
          .map(rec => `[${rec.agent}] ${rec.recommendation}`)
          .forEach(rec => console.log(`   • ${rec}`));
      }
      
      // Overall health determination
      const overallHealthy = summary.unhealthyAgents === 0 && aggregatedStatus.criticalIssues.length === 0;
      const status = overallHealthy ? 
        (summary.degradedAgents > 0 ? 'degraded' : 'healthy') : 
        'unhealthy';
      
      const statusColor = status === 'healthy' ? chalk.green : 
                         status === 'degraded' ? chalk.yellow : chalk.red;
      
      console.log(chalk.bold(`\n🎯 Overall Memory System Status: ${statusColor(status.toUpperCase())}`));
      
      if (!overallHealthy) {
        console.log(chalk.yellow(`\n⚠️  Some memory systems need attention before proceeding.`));
        console.log(chalk.dim(`Review the recommendations above to ensure optimal performance.\n`));
      } else if (status === 'degraded') {
        console.log(chalk.yellow(`\n⚠️  Memory systems are functional but have some issues.`));
        console.log(chalk.dim(`Consider addressing warnings when convenient.\n`));
      } else {
        console.log(chalk.green(`\n✅ All memory systems are healthy and ready!\n`));
      }
      
      this.logger.taskComplete('Memory health assessment', `Status: ${status}, Agents: ${summary.totalAgents}`);
      
      return {
        healthy: overallHealthy,
        status,
        agentCount: summary.totalAgents,
        healthyAgents: summary.healthyAgents,
        degradedAgents: summary.degradedAgents,
        unhealthyAgents: summary.unhealthyAgents,
        criticalIssues: aggregatedStatus.criticalIssues.length,
        recommendations: aggregatedStatus.recommendations.length
      };
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Failed to get memory health status: ${error.message}`));
      this.logger.error('Memory health assessment failed', error);
      
      return {
        healthy: false,
        status: 'error',
        agentCount: 0,
        error: error.message,
        recommendation: 'Check memory health system configuration'
      };
    }
  }

  /**
   * Initialize configuration and logger
   */
  async initialize() {
    try {
      this.config = await this.configLoader.loadConfig();
      this.logger.configure({
        verbosity: this.config.verbosity,
        verbosityLevel: this.config.verbosityLevel
      });
      
      // Configure simulator logger as well
      this.simulator.configureLogger({
        verbosity: this.config.verbosity,
        verbosityLevel: this.config.verbosityLevel
      });
      
      // Initialize shared context manager
      this.logger.taskStart('Initializing shared context manager', 'Setting up user interaction tracking');
      try {
        const contextInitialized = await this.contextManager.initialize();
        if (!contextInitialized) {
          this.logger.warn('SharedContextManager initialization failed, continuing with limited context tracking');
        } else {
          this.logger.taskComplete('Initializing shared context manager', 'Context tracking ready');
        }
      } catch (error) {
        this.logger.warn('SharedContextManager initialization error, continuing without context tracking', error);
      }
      
      // Initialize file path resolution
      this.logger.taskStart('Resolving file paths', 'Loading file locations from core-config.yaml');
      try {
        this.resolvedPaths = this.filePathResolver.getAllResolvedPaths();
        
        // Validate paths
        const validation = this.filePathResolver.validatePaths();
        if (!validation.success) {
          throw new Error(`File path validation failed:\n${validation.errors.join('\n')}`);
        }
        
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(warning => this.logger.warn(warning));
        }
        
        this.logger.taskComplete('Resolving file paths', `Resolved ${Object.keys(this.resolvedPaths).length} file paths`);
      } catch (error) {
        this.logger.error('Failed to resolve file paths', error);
        throw error;
      }
      
      // Only log after configuration is applied
      this.logger.taskStart('Loading core configuration', 'Initializing BMad orchestrator');
      this.logger.taskComplete('Loading core configuration', 'Configuration loaded successfully');
    } catch (error) {
      // Use defaults if config loading fails
      this.config = this.configLoader.getDefaultConfig();
      this.logger.configure({
        verbosity: this.config.verbosity,
        verbosityLevel: this.config.verbosityLevel
      });
      this.logger.error('Failed to load configuration', error);
      throw error; // Re-throw to prevent orchestrator from running with invalid paths
    }
  }

  /**
   * Load metadata for the current story/workflow
   */
  loadMetadata() {
    this.logger.taskStart('Loading orchestrator metadata', '', 'detailed');
    
    try {
      if (fs.existsSync(this.storyMetadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(this.storyMetadataPath, 'utf8'));
        this.logger.taskComplete('Loading orchestrator metadata', `Found metadata for story ${metadata.storyId || 'unknown'}`, 'detailed');
        return metadata;
      }
    } catch (error) {
      this.logger.warn('Failed to load metadata: ' + error.message, 'detailed');
    }
    
    this.logger.taskComplete('Loading orchestrator metadata', 'No existing metadata found', 'detailed');
    return {};
  }

  /**
   * Save metadata for the current story/workflow
   */
  saveMetadata(metadata) {
    try {
      fs.writeFileSync(this.storyMetadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('Failed to save metadata:', error.message);
    }
  }

  /**
   * Get available workflows
   */
  async getAvailableWorkflows() {
    this.logger.taskStart('Scanning for available workflows', '', 'detailed');
    
    try {
      const files = await fs.promises.readdir(this.workflowsDir);
      const workflows = files
        .filter(file => file.endsWith('.yaml'))
        .map(file => file.replace('.yaml', ''));
      
      this.logger.taskComplete('Scanning for available workflows', `Found ${workflows.length} workflows`, 'detailed');
      return workflows;
    } catch (error) {
      this.logger.error('Failed to read workflows directory', error);
      return [];
    }
  }

  /**
   * Load a workflow definition
   */
  async loadWorkflow(workflowId) {
    const workflowPath = path.join(this.workflowsDir, `${workflowId}.yaml`);
    try {
      const content = await fs.promises.readFile(workflowPath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      throw new Error(`Failed to load workflow ${workflowId}: ${error.message}`);
    }
  }

  /**
   * Prompt user to select workflow mode and flow type
   */
  async selectWorkflowMode(nonInteractive = false, defaultMode = 'single', defaultFlowType = 'linear') {
    let workflowMode, flowType;
    
    if (nonInteractive) {
      workflowMode = defaultMode;
      flowType = defaultFlowType;
      console.log(chalk.dim(`Non-interactive mode: Using workflow mode '${workflowMode}' with flow type '${flowType}'`));
    } else {
      const { workflowMode: selectedMode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'workflowMode',
          message: 'Select the workflow mode:',
          choices: [
            {
              name: 'Single Story Mode (Process one story)',
              value: 'single'
            },
            {
              name: 'Epic Loop Mode (Process all stories in an epic sequentially)',
              value: 'epic-loop'
            }
          ],
          default: 'single'
        }
      ]);
      workflowMode = selectedMode;
      
      flowType = 'linear';
      if (workflowMode === 'epic-loop') {
        const { epicFlowType } = await inquirer.prompt([
          {
            type: 'list',
            name: 'epicFlowType',
            message: 'Select the development workflow flow type for each story in the epic:',
            choices: [
              {
                name: 'Linear Dev→QA flow (Dev implements once, QA reviews once)',
                value: 'linear'
              },
              {
                name: 'Dev↔QA iterative flow (Dev and QA iterate until approved)',
                value: 'iterative'
              }
            ],
            default: 'linear'
          }
        ]);
        flowType = epicFlowType;
      } else {
        const { singleFlowType } = await inquirer.prompt([
          {
            type: 'list',
            name: 'singleFlowType',
            message: 'Select the development workflow flow type:',
            choices: [
              {
                name: 'Linear Dev→QA flow (Dev implements once, QA reviews once)',
                value: 'linear'
              },
              {
                name: 'Dev↔QA iterative flow (Dev and QA iterate until approved)',
                value: 'iterative'
              }
            ],
            default: 'linear'
          }
        ]);
        flowType = singleFlowType;
      }
    }
    
    return { workflowMode, flowType };
  }

  /**
   * Prompt user to select workflow flow type (legacy method for backwards compatibility)
   */
  async selectFlowType(nonInteractive = false, defaultFlowType = 'linear') {
    if (nonInteractive) {
      console.log(chalk.dim(`Non-interactive mode: Using flow type '${defaultFlowType}'`));
      return defaultFlowType;
    }
    
    const { flowType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'flowType',
        message: 'Select the development workflow flow type:',
        choices: [
          {
            name: 'Linear Dev→QA flow (Dev implements once, QA reviews once)',
            value: 'linear'
          },
          {
            name: 'Dev↔QA iterative flow (Dev and QA iterate until approved)',
            value: 'iterative'
          }
        ],
        default: 'linear'
      }
    ]);
    return flowType;
  }

  /**
   * Prompt user to select an epic for epic loop mode
   */
  async selectEpic(nonInteractive = false, defaultEpicId = null) {
    try {
      const allStories = this.getAllStoriesStatus();
      
      // Group stories by epic ID
      const epicGroups = {};
      allStories.forEach(story => {
        if (story.epicId) {
          if (!epicGroups[story.epicId]) {
            epicGroups[story.epicId] = {
              epicId: story.epicId,
              stories: [],
              hasApproved: false
            };
          }
          epicGroups[story.epicId].stories.push(story);
          if (story.status.toLowerCase() === 'approved') {
            epicGroups[story.epicId].hasApproved = true;
          }
        }
      });

      // Filter epics that have at least one approved story
      const availableEpics = Object.values(epicGroups)
        .filter(epic => epic.hasApproved)
        .map(epic => {
          const { getEpicStatus } = require('../bmad-core/utils/find-next-story');
          const status = getEpicStatus(this.resolvedPaths.storyLocation, epic.epicId);
          return {
            name: `Epic ${epic.epicId} (${status.completedStories}/${status.totalStories} completed, ${status.pendingStories} pending)`,
            value: epic.epicId
          };
        });

      if (availableEpics.length === 0) {
        throw new Error('No epics with approved stories found. Please ensure at least one story in an epic has "Approved" status.');
      }

      if (nonInteractive) {
        const selectedEpic = defaultEpicId || availableEpics[0].value;
        console.log(chalk.dim(`Non-interactive mode: Using epic '${selectedEpic}'`));
        return selectedEpic;
      }

      const { selectedEpic } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedEpic',
          message: 'Select an epic to process:',
          choices: availableEpics
        }
      ]);

      return selectedEpic;
    } catch (error) {
      this.logger.error('Failed to select epic', error);
      throw error;
    }
  }

  /**
   * Get all stories status using resolved paths
   */
  getAllStoriesStatus() {
    const { getAllStoriesStatus } = require('../bmad-core/utils/find-next-story');
    return getAllStoriesStatus(this.resolvedPaths.storyLocation);
  }

  /**
   * Update story status in the story file using atomic operations
   */
  async updateStoryStatus(storyPath, newStatus) {
    const backupPath = `${storyPath}.backup.${Date.now()}`;
    const tempPath = `${storyPath}.tmp.${Date.now()}`;
    
    try {
      this.logger.taskStart('Updating story status', `Atomic update to: ${newStatus}`, 'detailed');
      
      // Create backup of original file
      await fs.promises.copyFile(storyPath, backupPath);
      
      // Read original content
      const content = await fs.promises.readFile(storyPath, 'utf8');
      
      // Validate the content has the expected status structure
      const statusRegex = /(##\s*Status\s*\n\s*)(.+)/i;
      const statusMatch = content.match(statusRegex);
      
      if (!statusMatch) {
        throw new Error(`Story file ${storyPath} does not have the expected Status section format`);
      }
      
      const oldStatus = statusMatch[2].trim();
      this.logger.taskStart('Status validation', `Changing from '${oldStatus}' to '${newStatus}'`, 'detailed');
      
      // Replace the status in the content
      const updatedContent = content.replace(statusRegex, `$1${newStatus}`);
      
      // Verify the replacement worked
      const verifyMatch = updatedContent.match(statusRegex);
      if (!verifyMatch || verifyMatch[2].trim() !== newStatus) {
        throw new Error(`Status replacement failed - could not update to '${newStatus}'`);
      }
      
      // Write to temporary file first
      await fs.promises.writeFile(tempPath, updatedContent, 'utf8');
      
      // Verify temporary file was written correctly
      const verifyContent = await fs.promises.readFile(tempPath, 'utf8');
      const verifyFinalMatch = verifyContent.match(statusRegex);
      if (!verifyFinalMatch || verifyFinalMatch[2].trim() !== newStatus) {
        throw new Error(`Temporary file verification failed - status not updated correctly`);
      }
      
      // Atomic move from temp to original (on most filesystems this is atomic)
      await fs.promises.rename(tempPath, storyPath);
      
      // Clean up backup file after successful update
      await fs.promises.unlink(backupPath);
      
      this.logger.taskComplete('Updating story status', `Status atomically updated to: ${newStatus}`, 'detailed');
      
    } catch (error) {
      this.logger.error('Failed to update story status', error);
      
      // Attempt to restore from backup if it exists
      try {
        const backupExists = await fs.promises.access(backupPath).then(() => true).catch(() => false);
        if (backupExists) {
          await fs.promises.copyFile(backupPath, storyPath);
          this.logger.taskComplete('Story status rollback', 'Restored from backup after error', 'detailed');
        }
      } catch (restoreError) {
        this.logger.error('Failed to restore backup after update error', restoreError);
      }
      
      // Clean up temporary and backup files
      try {
        await fs.promises.unlink(tempPath).catch(() => {});
        await fs.promises.unlink(backupPath).catch(() => {});
      } catch (cleanupError) {
        this.logger.warn('Failed to clean up temporary files', cleanupError);
      }
      
      throw new Error(`Atomic status update failed: ${error.message}`);
    }
  }

  /**
   * Execute epic loop workflow
   */
  async executeEpicLoop(epicId, flowType) {
    console.log(chalk.bold(`🔄 Starting Epic Loop for Epic ${epicId}\n`));
    
    this.logger.phaseStart('Epic Loop Workflow', `Processing all stories in Epic ${epicId} with ${flowType} flow`);
    
    const { getEpicStatus, findNextApprovedStoryInEpic } = require('../bmad-core/utils/find-next-story');
    
    let epicCompleted = false;
    let processedStories = 0;
    let totalIterations = 0;
    let maxEpicIterations = 50; // Prevent infinite loops
    let currentEpicIteration = 0;
    let storyAttempts = {}; // Track attempts per story
    let maxAttemptsPerStory = 3; // Maximum retry attempts per story
    let consecutiveFailures = 0;
    let maxConsecutiveFailures = 5;
    
    while (!epicCompleted && currentEpicIteration < maxEpicIterations) {
      currentEpicIteration++;
      this.logger.taskStart('Epic iteration', `Iteration ${currentEpicIteration}/${maxEpicIterations}`, 'detailed');
      // Get current epic status
      const epicStatus = getEpicStatus(this.resolvedPaths.storyLocation, epicId);
      
      this.logger.summary('Epic Progress', [
        `Epic ID: ${epicId}`,
        `Total Stories: ${epicStatus.totalStories}`,
        `Completed Stories: ${epicStatus.completedStories}`,
        `In Progress Stories: ${epicStatus.inProgressStories}`,
        `Pending Stories: ${epicStatus.pendingStories}`
      ]);
      
      // Check if epic is complete
      if (epicStatus.isComplete) {
        epicCompleted = true;
        this.logger.taskComplete('Epic iteration', 'Epic completed successfully');
        break;
      }
      
      // Check for consecutive failures
      if (consecutiveFailures >= maxConsecutiveFailures) {
        this.logger.error('Epic loop terminating', `Too many consecutive failures (${consecutiveFailures})`);
        console.log(chalk.red(`\n❌ Epic loop terminated after ${consecutiveFailures} consecutive failures`));
        break;
      }
      
      // Find next approved story
      let nextStoryResult;
      try {
        nextStoryResult = findNextApprovedStoryInEpic(this.resolvedPaths.storyLocation, epicId);
      } catch (error) {
        this.logger.error('Error finding next story', error);
        consecutiveFailures++;
        continue;
      }
      
      if (!nextStoryResult.found) {
        this.logger.warn(`No more approved stories found in Epic ${epicId}: ${nextStoryResult.error}`);
        // Check if this is because all stories are processed or there's an error
        if (epicStatus.pendingStories === 0) {
          this.logger.taskComplete('Epic iteration', 'No more pending stories to process');
          break;
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= maxConsecutiveFailures) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay before retry
          continue;
        }
      }
      
      const story = {
        id: nextStoryResult.fullStoryId,
        name: nextStoryResult.title,
        file: nextStoryResult.path,
        epicId: nextStoryResult.epicId,
        storyId: nextStoryResult.storyId,
        storyContract: nextStoryResult.storyContract
      };
      
      // Check story attempt count
      const storyKey = story.id;
      if (!storyAttempts[storyKey]) {
        storyAttempts[storyKey] = 0;
      }
      
      if (storyAttempts[storyKey] >= maxAttemptsPerStory) {
        this.logger.warn(`Story ${story.id} exceeded maximum attempts (${maxAttemptsPerStory}), skipping`);
        console.log(chalk.yellow(`⚠️  Story ${story.id} exceeded maximum attempts, skipping`));
        consecutiveFailures++;
        continue;
      }
      
      storyAttempts[storyKey]++;
      console.log(chalk.blue(`\n📖 Processing Story ${story.id}: ${story.name} (Attempt ${storyAttempts[storyKey]}/${maxAttemptsPerStory})`));
      
      try {
        // Update story status to InProgress
        await this.updateStoryStatus(story.file, 'InProgress');
      } catch (error) {
        this.logger.error(`Failed to update story status for ${story.id}`, error);
        console.log(chalk.red(`❌ Failed to update story status for ${story.id}: ${error.message}`));
        consecutiveFailures++;
        continue;
      }
      
      // Execute SM validation using actual agent simulator
      this.logger.agentAction('sm', 'Validating story draft', { storyId: story.id });
      const spinner = ora('Scrum Master validating story draft...').start();
      
      try {
        const smResult = await this.simulateAgentWork('sm', 'validate_story', {
          ...story,
          storyContract: story.storyContract,
          resolvedPaths: this.resolvedPaths
        });
        
        if (smResult.success && smResult.approved) {
          spinner.succeed('Scrum Master validation complete ✅');
          this.logger.agentAction('sm', 'Story validation approved', {
            storyId: story.id,
            validationChecks: smResult.validationChecks || [],
            recommendations: smResult.recommendations || []
          });
        } else {
          spinner.warn(`Scrum Master validation found issues: ${smResult.issues?.length || 0} concerns`);
          this.logger.agentAction('sm', 'Story validation found issues', {
            storyId: story.id,
            issues: smResult.issues || [],
            approved: false
          });
          
          // Log SM recommendations but continue processing 
          // (SM validation is advisory, not blocking)
          if (smResult.issues && smResult.issues.length > 0) {
            console.log('\nScrum Master Recommendations:');
            smResult.issues.forEach((issue, index) => {
              console.log(`  ${index + 1}. ${issue}`);
            });
            console.log(chalk.dim('Note: SM recommendations are advisory. Story will continue processing.\n'));
          }
        }
      } catch (error) {
        spinner.warn('Scrum Master validation encountered an error');
        this.logger.warn('SM validation error (continuing with story processing)', error);
        console.log(chalk.yellow('⚠️  SM validation error, continuing with story processing'));
      }
      
      let result;
      let storyProcessed = false;
      
      try {
        // Execute Dev→QA workflow
        result = await this.executeDevQAWorkflow(story, flowType);
        storyProcessed = true;
        
        // Update story status based on QA result
        const finalStatus = result?.qaResult?.approved ? 'Done' : 'Review';
        
        try {
          await this.updateStoryStatus(story.file, finalStatus);
        } catch (statusError) {
          this.logger.error(`Failed to update final status for ${story.id}`, statusError);
          console.log(chalk.red(`❌ Failed to update final status for ${story.id}: ${statusError.message}`));
          // Continue processing - status update failure shouldn't stop the epic
        }
        
        if (result?.qaResult?.approved) {
          console.log(chalk.green(`✅ Story ${story.id} completed successfully!`));
          processedStories++;
          consecutiveFailures = 0; // Reset on success
          delete storyAttempts[storyKey]; // Remove from retry tracking
        } else {
          console.log(chalk.yellow(`⚠️  Story ${story.id} needs further work`));
          consecutiveFailures++;
        }
        
        if (result?.iterations) {
          totalIterations += result.iterations;
        } else {
          totalIterations += 1;
        }
        
      } catch (error) {
        this.logger.error(`Error processing story ${story.id}`, error);
        console.log(chalk.red(`❌ Error processing story ${story.id}: ${error.message}`));
        
        // Try to reset story status to Approved for retry
        try {
          await this.updateStoryStatus(story.file, 'Approved');
        } catch (resetError) {
          this.logger.error(`Failed to reset story status for ${story.id}`, resetError);
        }
        
        consecutiveFailures++;
        storyProcessed = false;
      }
      
      // Update iteration counters and task completion
      this.logger.taskComplete('Epic iteration', 
        storyProcessed ? `Story ${story.id} processed` : `Story ${story.id} failed to process`);
      
      // Small delay before next story
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Handle loop termination conditions
    if (currentEpicIteration >= maxEpicIterations) {
      this.logger.warn('Epic loop terminated', `Maximum iterations reached (${maxEpicIterations})`);
      console.log(chalk.yellow(`\n⚠️  Epic loop terminated after reaching maximum iterations (${maxEpicIterations})`));
    }
    
    // Final epic status
    const finalEpicStatus = getEpicStatus(this.resolvedPaths.storyLocation, epicId);
    
    this.logger.phaseComplete('Epic Loop Workflow');
    
    console.log(chalk.bold('\n🎉 Epic Loop Complete!\n'));
    console.log(chalk.green(`Epic ${epicId} Status:`));
    console.log(`  Total Stories: ${finalEpicStatus.totalStories}`);
    console.log(`  Completed Stories: ${finalEpicStatus.completedStories}`);
    console.log(`  Stories Processed: ${processedStories}`);
    console.log(`  Total Iterations: ${totalIterations}`);
    
    if (finalEpicStatus.isComplete) {
      console.log(chalk.green('🎊 Epic fully completed!'));
    } else {
      console.log(chalk.yellow('⚠️  Epic has remaining stories to process'));
    }
    
    return {
      epicId,
      epicCompleted: finalEpicStatus.isComplete,
      processedStories,
      totalIterations,
      finalStatus: finalEpicStatus
    };
  }

  /**
   * Execute Dev→QA workflow based on flow type
   */
  async executeDevQAWorkflow(story, flowType) {
    const spinner = ora();
    
    this.logger.phaseStart('Dev↔QA Workflow', `Executing ${flowType} flow for story: ${story.name || story.id}`);
    
    this.logger.summary('Story Information', [
      `ID: ${story.id || 'N/A'}`,
      `Name: ${story.name || 'Unnamed Story'}`,
      `Flow Type: ${flowType === 'iterative' ? 'Dev↔QA Iterative' : 'Linear Dev→QA'}`
    ]);

    if (flowType === 'linear') {
      // Linear flow: Dev → QA (once)
      await this.executeLinearFlow(story, spinner);
    } else {
      // Iterative flow: Dev ↔ QA (loop until approved)
      await this.executeIterativeFlow(story, spinner);
    }
    
    this.logger.phaseComplete('Dev↔QA Workflow');
  }

  /**
   * Execute linear Dev→QA flow
   */
  async executeLinearFlow(story, spinner) {
    this.logger.workflowTransition('Start', 'Linear Dev→QA Flow', 'Single-pass implementation and review');

    // Dev Phase
    this.logger.agentAction('dev', 'Starting story implementation', { storyId: story.id });
    spinner.start('Dev agent implementing story...');
    const devResult = await this.simulateAgentWork('dev', 'implement', story);
    spinner.succeed(`Dev implementation complete: ${devResult.filesModified} files modified`);
    this.logger.agentAction('dev', 'Implementation completed', {
      filesModified: devResult.filesModified,
      linesAdded: devResult.linesAdded,
      testsAdded: devResult.testsAdded
    });
    
    // QA Phase
    this.logger.agentAction('qa', 'Starting implementation review', { storyId: story.id });
    spinner.start('QA agent reviewing implementation...');
    const qaResult = await this.simulateAgentWork('qa', 'review', {
      ...story,
      implementation: devResult
    });
    
    if (qaResult.approved) {
      spinner.succeed('QA review complete: Implementation approved ✅');
      this.logger.agentAction('qa', 'Review completed - Implementation approved', {
        coverage: qaResult.coverage,
        testsPassed: qaResult.testsPassed
      });
      this.logger.taskComplete('Story implementation', 'All acceptance criteria met');
      console.log(chalk.green('\n✨ Story completed successfully!'));
    } else {
      spinner.warn(`QA review complete: ${qaResult.issues.length} issues found`);
      this.logger.agentAction('qa', 'Review completed - Issues found', {
        issueCount: qaResult.issues.length,
        severity: qaResult.severity
      });
      this.logger.warn(`Story has ${qaResult.issues.length} QA findings that need Dev agent to address`);
      console.log('\nQA Recommendations for Dev Agent:');
      qaResult.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
      console.log(chalk.dim('\nNote: In linear flow, Dev agent must manually address these issues.'));
    }

    return { devResult, qaResult };
  }

  /**
   * Execute iterative Dev↔QA flow
   */
  async executeIterativeFlow(story, spinner) {
    console.log(chalk.blue('🔄 Executing Iterative Dev↔QA Flow\n'));

    let iteration = 1;
    let qaApproved = false;
    let devResult = null;
    let qaResult = null;

    while (!qaApproved) {
      this.logger.iteration(iteration, 'Starting iteration');

      // Dev Phase
      if (iteration === 1) {
        this.logger.agentAction('dev', 'Starting initial story implementation', { storyId: story.id });
        spinner.start('Dev agent implementing story...');
        devResult = await this.simulateAgentWork('dev', 'implement', story);
      } else {
        this.logger.agentAction('dev', 'Implementing QA recommendations', {
          issueCount: qaResult.issues.length,
          previousIteration: iteration - 1
        });
        spinner.start('Dev agent implementing QA recommendations...');
        devResult = await this.simulateAgentWork('dev', 'fix', {
          ...story,
          qaFeedback: qaResult.issues,
          qaReport: qaResult.report
        });
      }
      spinner.succeed(`Dev work complete: ${devResult.filesModified} files modified`);
      this.logger.agentAction('dev', 'Work completed', {
        filesModified: devResult.filesModified,
        issuesAddressed: devResult.issuesAddressed
      }, 'detailed');

      // QA Phase
      this.logger.agentAction('qa', 'Reviewing implementation', { iteration });
      spinner.start('QA agent reviewing implementation...');
      qaResult = await this.simulateAgentWork('qa', 'review', {
        ...story,
        implementation: devResult,
        iteration
      });

      if (qaResult.approved) {
        spinner.succeed('QA review complete: Implementation approved ✅');
        this.logger.agentAction('qa', 'Review approved', {
          iteration,
          coverage: qaResult.coverage
        });
        qaApproved = true;
      } else {
        spinner.warn(`QA review complete: ${qaResult.issues.length} recommendations provided`);
        this.logger.agentAction('qa', 'Review found issues', {
          iteration,
          issueCount: qaResult.issues.length
        });
        this.logger.summary('QA Recommendations', qaResult.issues, 'detailed');
        console.log('\nQA Recommendations for Dev Agent:');
        qaResult.issues.forEach((issue, index) => {
          console.log(`  ${index + 1}. ${issue}`);
        });
        console.log(chalk.dim('\nDev agent will implement these recommendations in the next iteration.'));

        // Check if we should continue iterating
        if (iteration >= 5) {
          console.log(chalk.yellow('\n⚠️  Maximum iterations (5) reached'));
          
          // In non-interactive mode, automatically stop after 5 iterations
          if (this.nonInteractive) {
            console.log(chalk.dim('Non-interactive mode: Stopping after maximum iterations'));
            break;
          }
          
          const { continueIterating } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continueIterating',
              message: 'Continue iterating?',
              default: false
            }
          ]);
          
          if (!continueIterating) {
            break;
          }
        }

        iteration++;
      }
    }

    if (qaApproved) {
      this.logger.taskComplete('Story implementation', `Approved after ${iteration} iteration(s)`);
      console.log(chalk.green('\n✨ Story completed successfully after ' + iteration + ' iteration(s)!'));
    } else {
      this.logger.warn(`Story implementation stopped after ${iteration} iterations with unresolved QA findings`);
      console.log(chalk.yellow('\n⚠️  Story implementation stopped with unresolved QA findings'));
    }

    return { devResult, qaResult, iterations: iteration };
  }

  /**
   * Consolidate context before agent handoff
   */
  async consolidateContextForHandoff(sourceAgent, targetAgent, workflowPhase, contextScope = {}) {
    try {
      this.logger.taskStart('Context consolidation', `${sourceAgent} → ${targetAgent}`, 'detailed');
      
      // Get user interactions summary for the handoff
      const userInteractionsSummary = await this.contextManager.getUserInteractionsSummary({
        ...contextScope,
        limit: 20 // Get recent interactions
      });
      
      // Get specific context for the target agent
      const targetContext = await this.contextManager.getContextForAgent(targetAgent, contextScope);
      
      // Create consolidated handoff package
      const handoffPackage = {
        sourceAgent,
        targetAgent,
        workflowPhase,
        timestamp: new Date().toISOString(),
        userInteractionsSummary,
        targetContext,
        contextScope,
        recommendations: this.generateHandoffRecommendations(sourceAgent, targetAgent, userInteractionsSummary)
      };
      
      // Update workflow state
      await this.contextManager.updateWorkflowState(
        `${workflowPhase}-${targetAgent}`,
        [`${workflowPhase}-${sourceAgent}`],
        [`${targetAgent}-work`]
      );
      
      this.logger.taskComplete('Context consolidation', 
        `${userInteractionsSummary?.totalInteractions || 0} interactions consolidated`, 'detailed');
      
      return handoffPackage;
    } catch (error) {
      this.logger.error('Context consolidation failed', error);
      // Return minimal handoff package on error
      return {
        sourceAgent,
        targetAgent,
        workflowPhase,
        timestamp: new Date().toISOString(),
        error: error.message,
        recommendations: [`Review context manually due to consolidation error: ${error.message}`]
      };
    }
  }

  /**
   * Generate recommendations for agent handoff based on context
   */
  generateHandoffRecommendations(sourceAgent, targetAgent, userInteractionsSummary) {
    const recommendations = [];
    
    if (!userInteractionsSummary) {
      recommendations.push('No user interaction context available - proceed with caution');
      return recommendations;
    }
    
    // Check for unconfirmed responses
    if (userInteractionsSummary.openQuestions?.length > 0) {
      recommendations.push(
        `${userInteractionsSummary.openQuestions.length} user responses need confirmation before proceeding`
      );
    }
    
    // Check for important responses
    if (userInteractionsSummary.importantResponses?.length > 0) {
      recommendations.push(
        `Review ${userInteractionsSummary.importantResponses.length} high-priority user requirements`
      );
    }
    
    // Agent-specific recommendations
    if (targetAgent === 'dev' && sourceAgent === 'po') {
      recommendations.push('Use retrieve-user-context task to check for specific technical requirements');
      recommendations.push('Confirm architectural constraints with user before implementation');
    } else if (targetAgent === 'qa' && sourceAgent === 'dev') {
      recommendations.push('Review user acceptance criteria from PO interactions');
      recommendations.push('Validate test scenarios against user requirements');
    } else if (targetAgent === 'po' && sourceAgent === 'analyst') {
      recommendations.push('Convert business insights into specific, testable requirements');
      recommendations.push('Confirm user priorities and MVP scope');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Context handoff complete - proceed with agent work');
    }
    
    return recommendations;
  }

  /**
   * Simulate agent work (delegates to AgentSimulator)
   * Enhanced to pass resolved file paths and consolidated context to agents
   * Includes memory health monitoring integration
   */
  async simulateAgentWork(agent, action, context) {
    // Consolidate context before agent work if this is a handoff scenario
    let consolidatedContext = null;
    if (context.handoffFromAgent) {
      consolidatedContext = await this.consolidateContextForHandoff(
        context.handoffFromAgent,
        agent,
        context.workflowPhase || 'development',
        context.contextScope || {}
      );
    }
    
    // Enhance context with resolved file paths and consolidated context
    const enhancedContext = {
      ...context,
      resolvedPaths: this.resolvedPaths,
      consolidatedContext,
      contextManager: this.contextManager, // Allow agents to access context manager
      filePathResolver: {
        storyLocation: this.resolvedPaths.storyLocation,
        prdFile: this.resolvedPaths.prdFile,
        prdShardedLocation: this.resolvedPaths.prdShardedLocation,
        architectureFile: this.resolvedPaths.architectureFile,
        architectureShardedLocation: this.resolvedPaths.architectureShardedLocation,
        devDebugLog: this.resolvedPaths.devDebugLog,
        devLoadAlwaysFiles: this.resolvedPaths.devLoadAlwaysFiles,
        isPRDSharded: this.resolvedPaths.isPRDSharded,
        isArchitectureSharded: this.resolvedPaths.isArchitectureSharded
      }
    };
    
    this.logger.taskStart(`Agent work: ${agent}`, `Action: ${action} with resolved paths and context`, 'detailed');
    
    // Use AgentRunner with memory health integration for actual agent execution
    const taskId = `${action}-${Date.now()}`;
    const agentResult = await this.agentRunner.executeWithMemory(
      agent, 
      taskId, 
      enhancedContext, 
      async (taskContext) => {
        // Execute the original simulator work
        const simulatorResult = await this.simulator.simulateAgentWork(agent, action, taskContext);
        return {
          success: true,
          ...simulatorResult
        };
      }
    );
    
    // Surface any memory health issues that occurred during execution
    if (agentResult.healthCheckResult && !agentResult.healthCheckResult.healthy) {
      this.agentRunner.surfaceMemoryHealthIssues(agent, agentResult.healthCheckResult);
    }
    
    this.logger.taskComplete(`Agent work: ${agent}`, `Action completed: ${action}`, 'detailed');
    
    // Return the original simulator result format for compatibility
    return agentResult.executionResult || agentResult;
  }

  /**
   * Get resolved file paths for agent use
   * @returns {Object} All resolved file paths
   */
  getResolvedPaths() {
    if (!this.resolvedPaths) {
      throw new Error('File paths not yet resolved. Call initialize() first.');
    }
    return this.resolvedPaths;
  }

  /**
   * Find next approved story using resolved paths
   * @returns {Object} Story information or null if none found
   */
  findNextApprovedStory() {
    const findNextStory = require('../bmad-core/utils/find-next-story');
    return findNextStory.findNextApprovedStory(this.resolvedPaths.storyLocation);
  }

  /**
   * Execute structured task with resolved file paths
   * @param {string} taskId - Task identifier
   * @param {Object} context - Execution context
   * @returns {Object} Task execution result
   */
  async executeTaskWithPaths(taskId, context = {}) {
    const enhancedContext = {
      ...context,
      resolvedPaths: this.resolvedPaths,
      filePathResolver: this.filePathResolver
    };
    
    this.logger.taskStart(`Executing task: ${taskId}`, 'With resolved file paths', 'detailed');
    
    // This would integrate with the actual task execution system
    // For now, we'll simulate task execution
    const result = {
      taskId,
      success: true,
      context: enhancedContext,
      message: `Task ${taskId} executed with centralized file paths`
    };
    
    this.logger.taskComplete(`Executing task: ${taskId}`, 'Task completed successfully', 'detailed');
    return result;
  }

  /**
   * Run the orchestrator
   */
  async run(options = {}) {
    console.log(chalk.bold('🎼 BMad Workflow Orchestrator\n'));

    try {
      // Initialize configuration and logger
      await this.initialize();
      
      // Set non-interactive mode
      this.nonInteractive = options.nonInteractive || false;
      
      // Apply command-line overrides after initialization
      if (options.verbose === false) {
        this.logger.configure({ verbosity: false });
        this.simulator.configureLogger({ verbosity: false });
      } else if (options.verbose && typeof options.verbose === 'string') {
        this.logger.configure({ 
          verbosity: true, 
          verbosityLevel: options.verbose 
        });
        this.simulator.configureLogger({ 
          verbosity: true, 
          verbosityLevel: options.verbose 
        });
      }
      
      this.logger.phaseStart('Orchestrator Initialization', 'Setting up workflow environment');
      
      // Display memory health status at the beginning of each workflow
      const memoryHealthStatus = await this.displayMemoryHealthStatus();
      
      // Load existing metadata
      const metadata = this.loadMetadata();

      // Get story information (from file or options)
      this.logger.taskStart('Loading story information');
      let story = {};
      if (options.storyFile) {
        // Use resolved path if it's a relative path, otherwise use as provided
        const storyPath = path.resolve(this.rootDir, options.storyFile);
        if (fs.existsSync(storyPath)) {
          this.logger.taskStart('Reading story file', storyPath, 'detailed');
          const storyContent = fs.readFileSync(storyPath, 'utf8');
          // Parse story file (simplified - in real implementation would parse properly)
          story = {
            id: options.storyId || 'STORY-001',
            name: options.storyName || 'Story from ' + path.basename(storyPath),
            file: storyPath,
            content: storyContent
          };
          this.logger.taskComplete('Reading story file', `Loaded story: ${story.name}`);
        } else {
          // Try to find story in the configured story location
          const storyFileName = path.basename(options.storyFile);
          const storyPathInLocation = path.join(this.resolvedPaths.storyLocation, storyFileName);
          if (fs.existsSync(storyPathInLocation)) {
            this.logger.taskStart('Reading story file from story location', storyPathInLocation, 'detailed');
            const storyContent = fs.readFileSync(storyPathInLocation, 'utf8');
            story = {
              id: options.storyId || 'STORY-001',
              name: options.storyName || 'Story from ' + storyFileName,
              file: storyPathInLocation,
              content: storyContent
            };
            this.logger.taskComplete('Reading story file from story location', `Loaded story: ${story.name}`);
          } else {
            throw new Error(`Story file not found: ${options.storyFile} (checked ${storyPath} and ${storyPathInLocation})`);
          }
        }
      } else {
        story = {
          id: options.storyId || 'STORY-001',
          name: options.storyName || 'Development Story'
        };
      }
      this.logger.taskComplete('Loading story information', `Story: ${story.name} (${story.id})`)

      // Select workflow mode and flow type if not provided
      let workflowMode = options.workflowMode || 'single';
      let flowType = options.flowType;
      let epicId = options.epicId;
      
      if (!flowType && metadata.workflowMode && metadata.flowType) {
        console.log(chalk.dim(`Using previously selected workflow: ${metadata.workflowMode} mode with ${metadata.flowType} flow`));
        workflowMode = metadata.workflowMode;
        flowType = metadata.flowType;
        epicId = metadata.epicId;
      } else if (!options.workflowMode && !options.flowType) {
        const selection = await this.selectWorkflowMode(options.nonInteractive, options.workflowMode, options.flowType);
        workflowMode = selection.workflowMode;
        flowType = selection.flowType;
        
        // If epic loop mode is selected, prompt for epic selection
        if (workflowMode === 'epic-loop') {
          epicId = await this.selectEpic(options.nonInteractive, options.epicId);
        }
      } else if (!flowType) {
        flowType = await this.selectFlowType(options.nonInteractive);
      }

      // Save metadata
      this.saveMetadata({
        ...metadata,
        workflowMode,
        flowType,
        epicId,
        storyId: story.id,
        lastRun: new Date().toISOString()
      });

      // Execute the workflow based on mode
      let result;
      if (workflowMode === 'epic-loop') {
        if (!epicId) {
          throw new Error('Epic ID is required for epic loop mode');
        }
        this.logger.phaseStart('Epic Loop Execution', `Starting epic loop for Epic ${epicId} with ${flowType} flow`);
        result = await this.executeEpicLoop(epicId, flowType);
      } else {
        this.logger.phaseStart('Single Story Execution', `Starting ${flowType} workflow for story ${story.id}`);
        result = await this.executeDevQAWorkflow(story, flowType);
      }

      // Save execution results to metadata
      const executionResult = {
        workflowMode,
        flowType,
        epicId,
        storyId: story.id,
        lastRun: new Date().toISOString(),
        lastResult: workflowMode === 'epic-loop' ? {
          success: result?.epicCompleted || false,
          processedStories: result?.processedStories || 0,
          totalIterations: result?.totalIterations || 0,
          epicId: result?.epicId
        } : {
          success: result?.qaResult?.approved || false,
          iterations: result?.iterations || 1
        }
      };

      this.saveMetadata({
        ...metadata,
        ...executionResult
      });

      this.logger.phaseComplete('Orchestrator Initialization');
      
    } catch (error) {
      this.logger.error('Orchestration failed', error);
      console.error(chalk.red('\n❌ Orchestration failed:'), error.message);
      process.exit(1);
    }
  }
}

// CLI Setup
const program = new Command();

program
  .name('bmad-orchestrator')
  .description('BMad Method Workflow Orchestrator - Choose between linear and iterative Dev↔QA flows')
  .version('1.0.0');

program
  .command('run')
  .description('Run the workflow orchestrator for a story or epic')
  .option('-s, --story-file <path>', 'Path to the story file')
  .option('--story-id <id>', 'Story ID')
  .option('--story-name <name>', 'Story name')
  .option('-m, --workflow-mode <mode>', 'Workflow mode: single or epic-loop')
  .option('--mode <mode>', 'Orchestration mode: greenfield, brownfield, etc.')
  .option('-e, --epic-id <id>', 'Epic ID for epic loop mode')
  .option('-f, --flow-type <type>', 'Flow type: linear or iterative')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-v, --verbose <level>', 'Verbosity level: minimal, normal, or detailed', 'normal')
  .option('--no-verbose', 'Disable verbose output')
  .option('--non-interactive', 'Run in non-interactive mode (no user prompts)')
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    await orchestrator.run(options);
  });

program
  .command('status')
  .description('Show the current orchestrator status and metadata')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    
    try {
      await orchestrator.initialize();
      const metadata = orchestrator.loadMetadata();
      
      if (Object.keys(metadata).length === 0) {
        console.log(chalk.yellow('No orchestrator metadata found'));
      } else {
        console.log(chalk.bold('🎼 Orchestrator Status\n'));
        console.log(`Workflow Mode: ${metadata.workflowMode || 'single'}`);
        console.log(`Flow Type: ${metadata.flowType || 'Not set'}`);
        
        if (metadata.workflowMode === 'epic-loop' && metadata.epicId) {
          console.log(`Epic ID: ${metadata.epicId}`);
          
          // Show epic status if available
          try {
            const { getEpicStatus } = require('../bmad-core/utils/find-next-story');
            const epicStatus = getEpicStatus(orchestrator.resolvedPaths.storyLocation, metadata.epicId);
            console.log(`Epic Progress: ${epicStatus.completedStories}/${epicStatus.totalStories} completed`);
            console.log(`Pending Stories: ${epicStatus.pendingStories}`);
          } catch (error) {
            console.log(chalk.dim('Epic status unavailable'));
          }
        }
        
        console.log(`Last Story ID: ${metadata.storyId || 'N/A'}`);
        console.log(`Last Run: ${metadata.lastRun || 'Never'}`);
        
        if (metadata.lastResult) {
          if (metadata.workflowMode === 'epic-loop') {
            console.log(`Last Result: ${metadata.lastResult.success ? 'Epic Completed' : 'Epic In Progress'}`);
            console.log(`Stories Processed: ${metadata.lastResult.processedStories || 0}`);
            console.log(`Total Iterations: ${metadata.lastResult.totalIterations || 0}`);
          } else {
            console.log(`Last Result: ${metadata.lastResult.success ? 'Success' : 'Failed'}`);
            if (metadata.lastResult.iterations) {
              console.log(`Iterations: ${metadata.lastResult.iterations}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error showing status:'), error.message);
    }
  });

program
  .command('list-epics')
  .description('List all available epics with their story counts and status')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    
    try {
      await orchestrator.initialize();
      const allStories = orchestrator.getAllStoriesStatus();
      
      // Group stories by epic ID
      const epicGroups = {};
      allStories.forEach(story => {
        if (story.epicId) {
          if (!epicGroups[story.epicId]) {
            epicGroups[story.epicId] = [];
          }
          epicGroups[story.epicId].push(story);
        }
      });

      if (Object.keys(epicGroups).length === 0) {
        console.log(chalk.yellow('No epics found in the stories directory'));
        return;
      }

      console.log(chalk.bold('📚 Available Epics\n'));
      
      const { getEpicStatus } = require('../bmad-core/utils/find-next-story');
      
      Object.keys(epicGroups)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .forEach(epicId => {
          const status = getEpicStatus(orchestrator.resolvedPaths.storyLocation, epicId);
          const statusColor = status.isComplete ? chalk.green : 
                             status.pendingStories > 0 ? chalk.blue : 
                             chalk.yellow;
          
          console.log(statusColor(`Epic ${epicId}:`));
          console.log(`  Total Stories: ${status.totalStories}`);
          console.log(`  Completed: ${status.completedStories}`);
          console.log(`  In Progress: ${status.inProgressStories}`);
          console.log(`  Pending: ${status.pendingStories}`);
          console.log(`  Status: ${status.isComplete ? '✅ Complete' : status.pendingStories > 0 ? '🔄 Ready for processing' : '⏳ No approved stories'}`);
          console.log('');
        });
    } catch (error) {
      console.error(chalk.red('Error listing epics:'), error.message);
    }
  });

// Only parse arguments if this is the main module
if (require.main === module) {
  // Parse command line arguments
  program.parse(process.argv);

  // If no command specified, show help
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

module.exports = WorkflowOrchestrator;