#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const TaskRunner = require('../tools/task-runner');

// Test the task runner's ability to execute the validation task
async function testValidationTask() {
  console.log('Testing TaskRunner with validate-story-contract task...\n');
  
  const rootDir = path.join(__dirname, '..');
  const taskRunner = new TaskRunner(rootDir);
  
  // Create a test story file with valid StoryContract
  const testStoryPath = path.join(__dirname, 'test-story.md');
  const testStoryContent = `---
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
  
  // Write test story file
  fs.writeFileSync(testStoryPath, testStoryContent);
  
  try {
    // Test 1: Execute validation task with valid story
    console.log('Test 1: Valid StoryContract');
    console.log('-'.repeat(50));
    
    const result = await taskRunner.executeTask('sm', 'bmad-core/structured-tasks/validate-story-contract.yaml', {
      inputs: {
        storyFilePath: testStoryPath
      }
    });
    
    console.log('Task execution result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✓ Task executed successfully');
    } else {
      console.log('✗ Task failed:', result.error);
    }
    
    // Test 2: Execute validation task with invalid story
    console.log('\n\nTest 2: Invalid StoryContract (missing required fields)');
    console.log('-'.repeat(50));
    
    const invalidStoryContent = `---
StoryContract:
  version: "1.0"
  # Missing required fields like story_id, epic_id
---

# Invalid Story
`;
    
    fs.writeFileSync(testStoryPath, invalidStoryContent);
    
    try {
      const invalidResult = await taskRunner.executeTask('sm', 'bmad-core/structured-tasks/validate-story-contract.yaml', {
        inputs: {
          storyFilePath: testStoryPath
        }
      });
      
      console.log('✗ Task should have failed but succeeded');
    } catch (error) {
      console.log('✓ Task correctly failed with error:', error.message);
    }
    
    // Test 3: Test individual actions
    console.log('\n\nTest 3: Testing individual namespaced actions');
    console.log('-'.repeat(50));
    
    // Test file:read
    console.log('\n- Testing file:read action...');
    const fileReadResult = await taskRunner.executeNamespacedAction(
      { action: 'file:read', inputs: { path: testStoryPath }, outputs: { content: 'fileContent' } },
      {}
    );
    console.log('✓ file:read executed successfully');
    
    // Test yaml:extract-frontmatter
    console.log('\n- Testing yaml:extract-frontmatter action...');
    const yamlExtractResult = await taskRunner.executeNamespacedAction(
      { 
        action: 'yaml:extract-frontmatter', 
        inputs: { 
          content: fs.readFileSync(testStoryPath, 'utf8'), 
          key: 'StoryContract' 
        }, 
        outputs: { contractData: 'storyContract' } 
      },
      {}
    );
    console.log('✓ yaml:extract-frontmatter executed successfully');
    
    // Test logic:evaluate
    console.log('\n- Testing logic:evaluate action...');
    const context = { validationExitCode: 0 };
    const logicResult = await taskRunner.executeNamespacedAction(
      { 
        action: 'logic:evaluate', 
        inputs: { expression: '{{validationExitCode}} === 0' }, 
        outputs: { result: 'validationResult' } 
      },
      context
    );
    console.log('✓ logic:evaluate executed successfully, result:', logicResult);
    
    // Test workflow:conditional-halt
    console.log('\n- Testing workflow:conditional-halt action...');
    try {
      await taskRunner.executeNamespacedAction(
        { 
          action: 'workflow:conditional-halt', 
          inputs: { condition: true, errorMessage: 'Test halt' } 
        },
        {}
      );
      console.log('✗ workflow:conditional-halt should have thrown an error');
    } catch (error) {
      console.log('✓ workflow:conditional-halt correctly threw error:', error.message);
    }
    
    console.log('\n\nAll tests completed!');
    
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
testValidationTask().catch(console.error);