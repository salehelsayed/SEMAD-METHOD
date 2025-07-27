#!/usr/bin/env node

const path = require('path');
const TaskRunner = require('../tools/task-runner');

async function debugTaskExecution() {
  const taskRunner = new TaskRunner(path.join(__dirname, '..'));
  
  console.log('Testing task execution with invalid story...\n');
  
  try {
    const result = await taskRunner.executeTask('sm', 'bmad-core/structured-tasks/validate-story-contract.yaml', {
      inputs: { storyFilePath: 'tests/test-invalid-story.md' }
    });
    
    console.log('\nTask result:', JSON.stringify(result, null, 2));
    
    // Check the memory/context state
    if (result.memory && result.memory.context) {
      console.log('\nContext state:');
      console.log('validationExitCode:', result.memory.context.validationExitCode);
      console.log('validationResult:', result.memory.context.validationResult);
    }
    
  } catch (error) {
    console.log('\nTask execution threw error (expected for invalid story):');
    console.log('Error:', error.message);
    console.log('Stack:', error.stack);
  }
}

debugTaskExecution();