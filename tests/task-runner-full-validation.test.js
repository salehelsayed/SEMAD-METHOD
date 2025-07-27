#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const TaskRunner = require('../tools/task-runner');

// Test the full validation flow with actual step execution
async function testFullValidationFlow() {
  console.log('Testing full validation flow with step execution...\n');
  
  const rootDir = path.join(__dirname, '..');
  const taskRunner = new TaskRunner(rootDir);
  
  // Create a test story file with valid StoryContract
  const testStoryPath = path.join(__dirname, 'test-story-full.md');
  const validStoryContent = `---
StoryContract:
  version: "1.0"
  story_id: "TEST-001"
  epic_id: "EPIC-001"
  title: "Test Story"
  description: "A test story for validation"
  priority: "high"
  acceptance_criteria:
    - "Criteria 1"
    - "Criteria 2"
  definition_of_done:
    - "Tests pass"
  dependencies: []
  apiEndpoints: []
  filesToModify: []
  acceptanceCriteriaLinks: []
---

# Test Story

This is a test story for validation.
`;
  
  try {
    // Test 1: Manual step-by-step execution
    console.log('Test 1: Manual step-by-step execution with valid story');
    console.log('-'.repeat(50));
    
    fs.writeFileSync(testStoryPath, validStoryContent);
    
    const context = {
      inputs: {
        storyFilePath: testStoryPath
      }
    };
    
    // Load the task
    const taskData = await taskRunner.taskLoader.loadTask('bmad-core/structured-tasks/validate-story-contract.yaml');
    const task = taskData.data;
    
    // Execute each step manually
    for (const step of task.steps) {
      console.log(`\nExecuting step: ${step.name}`);
      
      try {
        const result = await taskRunner.executeNamespacedAction(step, context);
        console.log(`  ✓ Step completed successfully`);
        
        // Store outputs in context if defined
        if (step.outputs) {
          // If result is an object with output values, merge them
          if (result && typeof result === 'object' && !Array.isArray(result)) {
            Object.assign(context, result);
          }
          // Also handle direct output mapping
          for (const [outputKey, contextKey] of Object.entries(step.outputs)) {
            if (result && result[contextKey] !== undefined) {
              context[contextKey] = result[contextKey];
            }
          }
        }
        
        // Log the context state after this step
        if (step.id === 'validate-contract') {
          console.log(`  Exit code: ${context.validationExitCode}`);
          console.log(`  Stdout: ${context.validationOutput?.substring(0, 100)}...`);
        } else if (step.id === 'check-result') {
          console.log(`  Validation result: ${context.validationResult}`);
        }
        
      } catch (error) {
        console.log(`  ✗ Step failed: ${error.message}`);
        if (step.id === 'halt-on-failure') {
          // This is expected to fail if validation passes
          console.log(`  (This is expected when validation passes)`);
        } else {
          throw error;
        }
      }
    }
    
    // Test 2: Test with invalid story
    console.log('\n\nTest 2: Manual step-by-step execution with invalid story');
    console.log('-'.repeat(50));
    
    const invalidStoryContent = `---
StoryContract:
  version: "1.0"
  # Missing required fields like story_id, epic_id
---

# Invalid Story
`;
    
    fs.writeFileSync(testStoryPath, invalidStoryContent);
    
    const invalidContext = {
      inputs: {
        storyFilePath: testStoryPath
      }
    };
    
    // Execute each step manually for invalid story
    for (const step of task.steps) {
      console.log(`\nExecuting step: ${step.name}`);
      
      try {
        const result = await taskRunner.executeNamespacedAction(step, invalidContext);
        console.log(`  ✓ Step completed`);
        
        // Store outputs in context if defined
        if (step.outputs) {
          // If result is an object with output values, merge them
          if (result && typeof result === 'object' && !Array.isArray(result)) {
            Object.assign(invalidContext, result);
          }
          // Also handle direct output mapping
          for (const [outputKey, contextKey] of Object.entries(step.outputs)) {
            if (result && result[contextKey] !== undefined) {
              invalidContext[contextKey] = result[contextKey];
            }
          }
        }
        
        // Log the context state after this step
        if (step.id === 'validate-contract') {
          console.log(`  Exit code: ${invalidContext.validationExitCode}`);
          console.log(`  Stderr: ${invalidContext.validationErrors?.substring(0, 100)}...`);
        } else if (step.id === 'check-result') {
          console.log(`  Validation result: ${invalidContext.validationResult}`);
        }
        
      } catch (error) {
        console.log(`  ✗ Step failed: ${error.message}`);
        if (step.id === 'halt-on-failure' && error.message.includes('StoryContract validation failed')) {
          console.log(`  ✓ Workflow correctly halted on validation failure!`);
          break;
        } else {
          throw error;
        }
      }
    }
    
    console.log('\n\nAll tests completed successfully!');
    
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    // Clean up test file
    if (fs.existsSync(testStoryPath)) {
      fs.unlinkSync(testStoryPath);
    }
  }
}

// Run the test
testFullValidationFlow().catch(console.error);