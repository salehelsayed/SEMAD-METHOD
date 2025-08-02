#!/usr/bin/env node

/**
 * Test script to demonstrate executing a structured task from the command line
 * This simulates what agents would do when calling *execute-task
 */

const path = require('path');
const TaskRunner = require('./tools/task-runner');

async function executeDevSaveMemoryTask() {
  console.log('🚀 Executing dev-save-memory structured task');
  console.log('===============================================\n');

  const taskRunner = new TaskRunner(__dirname);
  
  // Simulate the command: *execute-task dev-save-memory task_name='implement-feature' story_id='4.1' implementation_details='{...}'
  const taskPath = path.join(__dirname, 'bmad-core', 'structured-tasks', 'dev-save-memory.yaml');
  
  const context = {
    inputs: {
      task_name: 'implement-feature',
      story_id: '4.1',
      implementation_details: {
        decision: 'Implemented React components with TypeScript for better type safety',
        rationale: 'TypeScript provides compile-time type checking and better IDE support',
        pattern: 'react-typescript-component',
        description: 'Created reusable UI components with proper prop typing',
        codeSnippet: 'interface Props { title: string; onClick: () => void; }',
        files: [
          'src/components/FeatureButton.tsx',
          'src/components/FeatureModal.tsx',
          'src/types/Feature.ts'
        ],
        techStack: ['React', 'TypeScript', 'CSS Modules'],
        challenges: [
          'Complex prop drilling in nested components',
          'State management across multiple components'
        ],
        solutions: [
          'Implemented Context API for shared state',
          'Created custom hooks for component logic'
        ],
        importance: 'high',
        tags: ['react', 'typescript', 'components', 'frontend']
      }
    },
    allowMissingUserInput: true
  };

  try {
    console.log('📋 Task Parameters:');
    console.log(`   - Task Name: ${context.inputs.task_name}`);
    console.log(`   - Story ID: ${context.inputs.story_id}`);
    console.log(`   - Implementation Pattern: ${context.inputs.implementation_details.pattern}`);
    console.log(`   - Files Modified: ${context.inputs.implementation_details.files.length} files`);
    console.log('');

    const startTime = Date.now();
    const result = await taskRunner.executeTask('dev', taskPath, context);
    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log('✅ Task execution completed successfully!');
      console.log('');
      console.log('📊 Execution Summary:');
      console.log(`   - Duration: ${duration}ms`);
      console.log(`   - Task: ${result.taskName}`);
      console.log(`   - Steps Processed: ${result.originalSteps}`);
      console.log(`   - Memory Operations: All functions executed`);
      
      if (result.stepsValidation) {
        console.log('   - Step Results:');
        result.stepsValidation.forEach(step => {
          const status = step.validation?.valid !== false ? '✅' : '❌';
          console.log(`     ${status} ${step.name}`);
        });
      }

      console.log('');
      console.log('🎯 What happened:');
      console.log('   1. Logged task initialization');
      console.log('   2. Updated working memory with implementation decisions');
      console.log('   3. Added task to completed tasks list');
      console.log('   4. Saved implementation pattern to long-term memory');
      console.log('   5. Saved story completion summary (if applicable)');
      console.log('   6. Logged task completion');
      
    } else {
      console.log('❌ Task execution failed:');
      console.log(`   Error: ${result.error}`);
      console.log(`   Error Type: ${result.errorType}`);
      
      if (result.missingInputs) {
        console.log('   Missing Inputs:', result.missingInputs);
      }
    }
    
  } catch (error) {
    console.error('💥 Execution failed with exception:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error('\n📍 Stack trace:');
      console.error(error.stack);
    }
  }

  console.log('\n📝 Note: Check .ai/memory-usage.log for detailed memory operation logs');
}

async function demonstrateQATask() {
  console.log('\n🔍 Executing qa-save-memory structured task');
  console.log('===========================================\n');

  const taskRunner = new TaskRunner(__dirname);
  
  // Simulate QA agent saving review findings
  const taskPath = path.join(__dirname, 'bmad-core', 'structured-tasks', 'qa-save-memory.yaml');
  
  const context = {
    inputs: {
      review_id: 'review-4.1-001',
      story_id: '4.1',
      review_details: {
        type: 'code_review',
        findings: [
          'Missing error handling in async API calls',
          'Inconsistent component naming conventions',
          'Props interface could be more specific'
        ],
        recommendations: [
          'Add try-catch blocks around API calls',
          'Follow PascalCase for component names',
          'Use union types for button variants'
        ],
        qualityScore: 8,
        status: 'approved_with_comments',
        pattern: 'async-error-handling',
        description: 'Common pattern of missing error boundaries and async error handling',
        issues: [
          'API calls without proper error handling',
          'Missing loading states',
          'No user feedback on errors'
        ],
        severity: 'medium',
        category: 'error-handling',
        resolution: 'Added error boundaries and loading states',
        importance: 'high',
        tags: ['error-handling', 'async', 'user-experience', 'review']
      }
    },
    allowMissingUserInput: true
  };

  try {
    console.log('📋 Review Parameters:');
    console.log(`   - Review ID: ${context.inputs.review_id}`);
    console.log(`   - Story ID: ${context.inputs.story_id}`);
    console.log(`   - Quality Score: ${context.inputs.review_details.qualityScore}/10`);
    console.log(`   - Status: ${context.inputs.review_details.status}`);
    console.log(`   - Issues Found: ${context.inputs.review_details.findings.length}`);
    console.log('');

    const result = await taskRunner.executeTask('qa', taskPath, context);
    
    if (result.success) {
      console.log('✅ QA task execution completed successfully!');
      console.log('');
      console.log('🎯 What happened:');
      console.log('   1. Logged review task initialization');  
      console.log('   2. Updated working memory with review findings');
      console.log('   3. Added review to completed reviews list');
      console.log('   4. Saved quality patterns to long-term memory');
      console.log('   5. Saved feedback strategies (if applicable)');
      console.log('   6. Logged task completion');
    } else {
      console.log('❌ QA task execution failed:');
      console.log(`   Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('💥 QA execution failed:');
    console.error(`   ${error.message}`);
  }
}

// Run demonstration
async function runDemo() {
  await executeDevSaveMemoryTask();
  await demonstrateQATask();
  
  console.log('\n🎉 Demo completed!');
  console.log('\n💡 Usage in agent workflows:');
  console.log('   From Dev Agent: *execute-task dev-save-memory task_name=\'my-task\' story_id=\'123\' implementation_details=\'{...}\'');
  console.log('   From QA Agent:  *execute-task qa-save-memory review_id=\'rev-123\' story_id=\'123\' review_details=\'{...}\'');
}

if (require.main === module) {
  runDemo().catch(error => {
    console.error('💥 Demo failed:', error);
    process.exit(1);
  });
}

module.exports = { executeDevSaveMemoryTask, demonstrateQATask };