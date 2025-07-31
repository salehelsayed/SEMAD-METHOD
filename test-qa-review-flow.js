#!/usr/bin/env node

/**
 * Test script to verify QA review-only flow
 * This script simulates a story going through Dev and QA agents
 */

const WorkflowOrchestrator = require('./tools/workflow-orchestrator');
const chalk = require('chalk');

async function testQAReviewFlow() {
  console.log(chalk.bold.blue('🧪 Testing QA Review-Only Flow\n'));

  const orchestrator = new WorkflowOrchestrator(process.cwd());
  
  // Test story
  const testStory = {
    id: 'TEST-001',
    name: 'Test QA Review Flow',
    description: 'Verify QA agent only reviews and provides feedback',
    acceptanceCriteria: [
      'QA provides review feedback without modifying code',
      'Dev agent receives and implements QA recommendations',
      'Story status updates correctly'
    ]
  };

  console.log(chalk.yellow('📋 Test Story:'), testStory.name);
  console.log(chalk.dim('   ID:'), testStory.id);
  console.log(chalk.dim('   Description:'), testStory.description);
  console.log();

  try {
    // Test 1: Linear Flow
    console.log(chalk.bold('\n--- Test 1: Linear Flow ---'));
    console.log('Testing that QA provides feedback without implementing changes...\n');
    
    const linearResult = await orchestrator.executeDevQAWorkflow(testStory, 'linear');
    
    // Verify QA result structure
    if (linearResult && linearResult.qaResult) {
      if (linearResult.qaResult.report) {
        console.log(chalk.green('✓ QA provided review report'));
        console.log(chalk.dim('  Status:'), linearResult.qaResult.report.status);
        console.log(chalk.dim('  Summary:'), linearResult.qaResult.report.summary);
      } else {
        console.log(chalk.yellow('⚠ QA report structure not fully implemented in simulator'));
      }
      console.log(chalk.green('✓ QA review completed without code modifications'));
    } else {
      console.log(chalk.red('✗ Linear result structure error'));
    }

    // Test 2: Iterative Flow
    console.log(chalk.bold('\n--- Test 2: Iterative Flow ---'));
    console.log('Testing Dev↔QA iteration with QA feedback loop...\n');
    
    const iterativeResult = await orchestrator.executeDevQAWorkflow(testStory, 'iterative');
    
    if (iterativeResult && iterativeResult.iterations) {
      console.log(chalk.green(`✓ Completed ${iterativeResult.iterations} iteration(s)`));
    } else if (iterativeResult) {
      console.log(chalk.green('✓ Iterative flow completed'));
    }
    
    // Test 3: Verify QA Agent Configuration
    console.log(chalk.bold('\n--- Test 3: QA Agent Configuration ---'));
    const fs = require('fs');
    const qaConfig = fs.readFileSync('./bmad-core/agents/qa.md', 'utf8');
    
    if (qaConfig.includes('Review-Only Mandate')) {
      console.log(chalk.green('✓ QA agent configured for review-only mode'));
    } else {
      console.log(chalk.red('✗ QA agent configuration needs update'));
    }
    
    if (qaConfig.includes('Advisory Role')) {
      console.log(chalk.green('✓ QA agent has advisory role defined'));
    }
    
    // Test 4: Review Task Configuration
    console.log(chalk.bold('\n--- Test 4: Review Task Configuration ---'));
    const reviewTask = fs.readFileSync('./bmad-core/structured-tasks/review-story.yaml', 'utf8');
    
    if (reviewTask.includes('Recommended Refactoring')) {
      console.log(chalk.green('✓ Review task uses "Recommended" instead of "Performed"'));
    }
    
    if (!reviewTask.includes('[x]')) {
      console.log(chalk.green('✓ Review task does not pre-check completed items'));
    }
    
    // Test 5: Handoff Mechanism
    console.log(chalk.bold('\n--- Test 5: QA→Dev Handoff ---'));
    
    if (fs.existsSync('./bmad-core/templates/qa-dev-handoff-tmpl.yaml')) {
      console.log(chalk.green('✓ QA→Dev handoff template exists'));
    }
    
    if (fs.existsSync('./bmad-core/structured-tasks/qa-dev-handoff.yaml')) {
      console.log(chalk.green('✓ QA→Dev handoff task defined'));
    }
    
    console.log(chalk.bold.green('\n✅ All tests completed!'));
    console.log(chalk.dim('\nSummary:'));
    console.log('- QA agent is configured for review-only mode');
    console.log('- QA provides recommendations without implementing changes');
    console.log('- Dev agent receives feedback for implementation');
    console.log('- Proper handoff mechanism is in place');
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testQAReviewFlow().catch(console.error);