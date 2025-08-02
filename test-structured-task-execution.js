#!/usr/bin/env node

/**
 * Test script for structured task function execution
 * Tests the dev-save-memory task to ensure functions execute properly
 */

const path = require('path');
const TaskRunner = require('./tools/task-runner');

async function testStructuredTaskExecution() {
  console.log('🧪 Testing Structured Task Function Execution');
  console.log('================================================\n');

  const taskRunner = new TaskRunner(__dirname);
  
  // Test dev-save-memory task
  const taskPath = path.join(__dirname, 'bmad-core', 'structured-tasks', 'dev-save-memory.yaml');
  
  const context = {
    inputs: {
      story_id: 'test-story-001',
      task_name: 'implement-feature',
      implementation_details: {
        decision: 'Used React hooks for state management',
        rationale: 'Hooks provide better component reusability and testing',
        pattern: 'custom-hook-pattern',
        description: 'Created useFeatureState hook for shared state logic',
        codeSnippet: 'const useFeatureState = () => { ... }',
        files: ['src/hooks/useFeatureState.js', 'src/components/Feature.jsx'],
        techStack: ['React', 'TypeScript'],
        challenges: ['State synchronization between components'],
        solutions: ['Implemented custom hook with useReducer'],
        importance: 'medium',
        tags: ['react', 'hooks', 'state-management']
      }
    },
    allowMissingUserInput: true
  };

  try {
    console.log('📋 Executing dev-save-memory task...\n');
    
    const result = await taskRunner.executeTask('dev', taskPath, context);
    
    if (result.success) {
      console.log('✅ Task executed successfully!');
      console.log('📊 Results:');
      console.log(`   - Task Name: ${result.taskName}`);
      console.log(`   - Steps Processed: ${result.originalSteps}`);
      console.log('   - Memory operations completed');
      
      if (result.stepsValidation && result.stepsValidation.length > 0) {
        console.log('   - Step validations:', result.stepsValidation.map(s => `${s.name}: ${s.validation?.valid !== false ? '✅' : '❌'}`).join(', '));
      }
    } else {
      console.log('❌ Task execution failed:');
      console.log(`   Error: ${result.error}`);
      if (result.missingInputs) {
        console.log('   Missing inputs for user interaction:', result.missingInputs);
      }
    }
    
  } catch (error) {
    console.error('🚨 Test failed with error:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error('\n📍 Stack trace:');
      console.error(error.stack);
    }
  }
}

async function testQAStructuredTask() {
  console.log('\n🧪 Testing QA Structured Task Function Execution');
  console.log('=================================================\n');

  const taskRunner = new TaskRunner(__dirname);
  
  // Test qa-save-memory task
  const taskPath = path.join(__dirname, 'bmad-core', 'structured-tasks', 'qa-save-memory.yaml');
  
  const context = {
    inputs: {
      story_id: 'test-story-002',
      review_id: 'review-001',
      review_details: {
        type: 'code-review',
        findings: ['Missing error handling in API calls', 'Inconsistent naming conventions'],
        recommendations: ['Add try-catch blocks', 'Follow established naming patterns'],
        qualityScore: 7,
        status: 'needs-fixes',
        pattern: 'error-handling-gap',
        description: 'Common pattern of missing error handling in async operations',
        issues: ['API calls without error handling', 'Promise rejections not caught'],
        severity: 'medium',
        category: 'error-handling',
        resolution: 'Added comprehensive error handling',
        importance: 'high',
        tags: ['error-handling', 'api-calls']
      }
    },
    allowMissingUserInput: true
  };

  try {
    console.log('📋 Executing qa-save-memory task...\n');
    
    const result = await taskRunner.executeTask('qa', taskPath, context);
    
    if (result.success) {
      console.log('✅ QA Task executed successfully!');
      console.log('📊 Results:');
      console.log(`   - Task Name: ${result.taskName}`);
      console.log(`   - Steps Processed: ${result.originalSteps}`);
      console.log('   - QA memory operations completed');
    } else {
      console.log('❌ QA Task execution failed:');
      console.log(`   Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('🚨 QA Test failed with error:');
    console.error(`   ${error.message}`);
  }
}

async function testFunctionRegistry() {
  console.log('\n🧪 Testing Function Registry');
  console.log('=============================\n');
  
  try {
    const { getAvailableFunctions, hasFunction, executeFunction } = require('./tools/lib/function-registry');
    
    console.log('📋 Available functions:');
    const functions = getAvailableFunctions();
    functions.forEach(fn => console.log(`   - ${fn}`));
    
    console.log('\n🔍 Function existence checks:');
    console.log(`   - logTaskMemory exists: ${hasFunction('logTaskMemory')}`);
    console.log(`   - updateWorkingMemory exists: ${hasFunction('updateWorkingMemory')}`);
    console.log(`   - saveToLongTermMemory exists: ${hasFunction('saveToLongTermMemory')}`);
    console.log(`   - nonExistentFunction exists: ${hasFunction('nonExistentFunction')}`);
    
    console.log('\n🏃 Test function execution:');
    const context = {
      current_timestamp: new Date().toISOString(),
      agentName: 'test'
    };
    
    const result = await executeFunction('logTaskMemory', {
      agentName: 'test',
      taskName: 'test-task',
      operation: 'test_execution',
      taskData: { taskId: 'test-001' },
      metadata: { testing: true }
    }, context);
    
    console.log(`   - logTaskMemory test: ${result.success ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('🚨 Function Registry test failed:');
    console.error(`   ${error.message}`);
  }
}

// Run all tests
async function runAllTests() {
  await testFunctionRegistry();
  await testStructuredTaskExecution();
  await testQAStructuredTask();
  
  console.log('\n🎉 All tests completed!');
  console.log('\nNote: Check .ai/memory-usage.log for logged memory operations');
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = {
  testStructuredTaskExecution,
  testQAStructuredTask,
  testFunctionRegistry
};