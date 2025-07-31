#!/usr/bin/env node

/**
 * Test script to demonstrate the verbose logging functionality
 * Shows different verbosity levels and their output
 */

const WorkflowOrchestrator = require('./tools/workflow-orchestrator');
const chalk = require('chalk');

async function testVerbosityLevels() {
  console.log(chalk.bold('=== Testing BMad Orchestrator Verbosity Levels ===\n'));

  const testStory = {
    id: 'TEST-001',
    name: 'Test Story for Verbosity Demo'
  };

  // Test 1: Minimal verbosity
  console.log(chalk.bold.yellow('\n1. Testing MINIMAL verbosity level:'));
  console.log(chalk.dim('   (Only critical messages will be shown)\n'));
  
  const orchestrator1 = new WorkflowOrchestrator(process.cwd());
  orchestrator1.logger.configure({ verbosity: true, verbosityLevel: 'minimal' });
  orchestrator1.simulator.configureLogger({ verbosity: true, verbosityLevel: 'minimal' });
  
  // Simulate some operations with minimal verbosity
  await orchestrator1.initialize();
  console.log(chalk.dim('\n   [In minimal mode, most detailed logs are suppressed]\n'));

  // Test 2: Normal verbosity
  console.log(chalk.bold.yellow('\n2. Testing NORMAL verbosity level:'));
  console.log(chalk.dim('   (Major tasks and transitions will be shown)\n'));
  
  const orchestrator2 = new WorkflowOrchestrator(process.cwd());
  orchestrator2.logger.configure({ verbosity: true, verbosityLevel: 'normal' });
  orchestrator2.simulator.configureLogger({ verbosity: true, verbosityLevel: 'normal' });
  
  await orchestrator2.initialize();
  
  // Simulate some workflow operations
  orchestrator2.logger.phaseStart('Sample Workflow', 'Demonstrating normal verbosity');
  orchestrator2.logger.taskStart('Loading configuration');
  orchestrator2.logger.taskComplete('Loading configuration', 'Config loaded with 5 settings');
  orchestrator2.logger.agentAction('dev', 'Implementing feature X', { files: 3 });
  orchestrator2.logger.agentAction('qa', 'Reviewing implementation', { tests: 10 });
  orchestrator2.logger.phaseComplete('Sample Workflow', 'Completed successfully');

  // Test 3: Detailed verbosity
  console.log(chalk.bold.yellow('\n3. Testing DETAILED verbosity level:'));
  console.log(chalk.dim('   (All activities and context will be shown)\n'));
  
  const orchestrator3 = new WorkflowOrchestrator(process.cwd());
  orchestrator3.logger.configure({ verbosity: true, verbosityLevel: 'detailed' });
  orchestrator3.simulator.configureLogger({ verbosity: true, verbosityLevel: 'detailed' });
  
  await orchestrator3.initialize();
  
  // Simulate detailed workflow operations
  orchestrator3.logger.phaseStart('Detailed Workflow', 'Showing all logging details');
  orchestrator3.logger.taskStart('Initializing components', 'Loading all dependencies', 'detailed');
  orchestrator3.logger.taskComplete('Initializing components', 'Loaded 15 modules', 'detailed');
  orchestrator3.logger.agentAction('dev', 'Starting implementation', {
    storyId: 'TEST-001',
    estimatedTime: '2 hours',
    complexity: 'medium'
  }, 'detailed');
  orchestrator3.logger.iteration(1, 'Dev implementing initial version', 'Creating core functionality');
  orchestrator3.logger.workflowTransition('Development', 'QA Review', 'Implementation complete');
  orchestrator3.logger.phaseComplete('Detailed Workflow', 'All details captured');

  // Test 4: Disabled verbosity
  console.log(chalk.bold.yellow('\n4. Testing DISABLED verbosity:'));
  console.log(chalk.dim('   (No orchestrator logs will be shown)\n'));
  
  const orchestrator4 = new WorkflowOrchestrator(process.cwd());
  orchestrator4.logger.configure({ verbosity: false });
  orchestrator4.simulator.configureLogger({ verbosity: false });
  
  await orchestrator4.initialize();
  orchestrator4.logger.phaseStart('Silent Workflow', 'This should not appear');
  orchestrator4.logger.taskStart('Hidden task');
  orchestrator4.logger.taskComplete('Hidden task', 'Completed silently');
  
  console.log(chalk.dim('   [No output shown when verbosity is disabled]\n'));

  // Summary
  console.log(chalk.bold.green('\n=== Verbosity Test Complete ==='));
  console.log('\nUsage examples:');
  console.log('  - Minimal:  ', chalk.cyan('node tools/workflow-orchestrator.js run --verbose minimal'));
  console.log('  - Normal:   ', chalk.cyan('node tools/workflow-orchestrator.js run --verbose normal'));
  console.log('  - Detailed: ', chalk.cyan('node tools/workflow-orchestrator.js run --verbose detailed'));
  console.log('  - Disabled: ', chalk.cyan('node tools/workflow-orchestrator.js run --no-verbose'));
  console.log('\nConfiguration file example:');
  console.log(chalk.dim(`
  # .bmad-workflow.yaml
  flowType: iterative
  verbosity: true
  verbosityLevel: normal
  `));
}

// Run the test
testVerbosityLevels().catch(console.error);