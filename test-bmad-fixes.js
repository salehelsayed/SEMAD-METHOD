#!/usr/bin/env node
/**
 * Test script to verify BMAD framework fixes
 * 
 * Tests:
 * 1. Task schema validation
 * 2. Automatic memory and story validation
 * 3. Centralized connection management
 */

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// Import the fixed modules
const StructuredTaskLoader = require('./tools/lib/structured-task-loader');
const validationHooks = require('./bmad-core/utils/validation-hooks');
const connectionManager = require('./bmad-core/utils/connection-manager');
const storyLoader = require('./bmad-core/utils/story-loader');

console.log('Testing BMAD Framework Fixes...\n');

async function testTaskSchemaValidation() {
  console.log('1. Testing Task Schema Validation');
  console.log('=================================');
  
  const loader = new StructuredTaskLoader(process.cwd());
  
  // Create a test task with invalid schema
  const invalidTask = {
    // Missing required 'id' field
    name: 'Test Task',
    steps: [
      {
        // Missing required 'id' field in step
        name: 'Test Step',
        actions: [{ description: 'Do something' }]
      }
    ]
  };
  
  const validTask = {
    id: 'test-task',
    name: 'Valid Test Task',
    steps: [
      {
        id: 'step1',
        name: 'Valid Step',
        actions: [{ description: 'Do something valid' }]
      }
    ]
  };
  
  // Test invalid task
  const tempInvalidPath = path.join(process.cwd(), 'test-invalid-task.yaml');
  const tempValidPath = path.join(process.cwd(), 'test-valid-task.yaml');
  
  try {
    fs.writeFileSync(tempInvalidPath, yaml.dump(invalidTask));
    fs.writeFileSync(tempValidPath, yaml.dump(validTask));
    
    // Wait for validator initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Test loading invalid task
    try {
      await loader.loadTask(tempInvalidPath);
      console.log('❌ Failed: Invalid task was not rejected');
    } catch (error) {
      if (error.message.includes('validation failed')) {
        console.log('✅ Passed: Invalid task was properly rejected');
        console.log(`   Error: ${error.message.split('\n')[0]}`);
      } else {
        console.log('❌ Failed: Unexpected error:', error.message);
      }
    }
    
    // Test loading valid task
    try {
      const result = await loader.loadTask(tempValidPath);
      console.log('✅ Passed: Valid task loaded successfully');
      console.log(`   Task ID: ${result.data.id}`);
    } catch (error) {
      console.log('❌ Failed: Valid task was rejected:', error.message);
    }
    
  } finally {
    // Cleanup
    if (fs.existsSync(tempInvalidPath)) fs.unlinkSync(tempInvalidPath);
    if (fs.existsSync(tempValidPath)) fs.unlinkSync(tempValidPath);
  }
  
  console.log();
}

async function testAutomaticValidation() {
  console.log('2. Testing Automatic Validation Hooks');
  console.log('=====================================');
  
  // Test memory validation hook
  console.log('Testing memory validation hook:');
  const memoryValidation = await validationHooks.executeHooks('beforeMemorySave', {
    agentName: 'test-agent',
    text: 'Test memory content',
    metadata: { storyId: 'TEST-001' }
  });
  
  console.log(`✅ Memory validation: ${memoryValidation.valid ? 'Passed' : 'Failed'}`);
  if (memoryValidation.errors.length > 0) {
    console.log('   Errors:', memoryValidation.errors);
  }
  
  // Test invalid memory
  const invalidMemoryValidation = await validationHooks.executeHooks('beforeMemorySave', {
    // Missing agentName
    text: 'Test memory content'
  });
  
  console.log(`✅ Invalid memory rejected: ${!invalidMemoryValidation.valid ? 'Passed' : 'Failed'}`);
  if (invalidMemoryValidation.errors.length > 0) {
    console.log(`   Error: ${invalidMemoryValidation.errors[0].message}`);
  }
  
  // Test story validation hook
  console.log('\nTesting story validation hook:');
  const storyData = {
    frontMatter: {
      Status: 'In Progress',
      StoryContract: {
        version: '1.0',
        story_id: 'TEST-001',
        epic_id: 'EPIC-001',
        apiEndpoints: [],
        filesToModify: [],
        acceptanceCriteriaLinks: []
      }
    },
    content: 'Test story content with dev-save-memory reference'
  };
  
  const storyValidation = await validationHooks.executeHooks('afterStoryLoad', storyData);
  console.log(`✅ Story validation: ${storyValidation.valid ? 'Passed' : 'Failed'}`);
  if (storyValidation.warnings && storyValidation.warnings.length > 0) {
    console.log('   Warnings:', storyValidation.warnings.map(w => w.message));
  }
  
  console.log();
}

async function testConnectionManager() {
  console.log('3. Testing Connection Manager');
  console.log('=============================');
  
  // Get connection stats
  const stats = connectionManager.getPoolStats();
  console.log('Initial connection pool:', Object.keys(stats).length === 0 ? 'Empty' : stats);
  
  // Test Qdrant connection (will create if not exists)
  const qdrantClient = connectionManager.getQdrantConnection('test');
  console.log('✅ Created test Qdrant connection');
  
  // Check pool stats again
  const newStats = connectionManager.getPoolStats();
  console.log('Connection pool after creation:', Object.keys(newStats));
  
  // Test health check
  const healthResult = await connectionManager.healthCheckAll();
  console.log('Health check results:', healthResult);
  
  // Test connection cleanup
  await connectionManager.closeConnection('qdrant_test');
  const finalStats = connectionManager.getPoolStats();
  console.log('✅ Connection closed successfully');
  console.log('Final pool stats:', Object.keys(finalStats));
  
  console.log();
}

async function testStoryLoader() {
  console.log('4. Testing Story Loader with Auto-Validation');
  console.log('===========================================');
  
  // Create a test story
  const testStoryPath = path.join(process.cwd(), 'test-story.md');
  const testStoryContent = `---
Status: In Progress
StoryContract:
  version: "1.0"
  story_id: "TEST-STORY-001"
  epic_id: "TEST-EPIC-001"
  apiEndpoints: []
  filesToModify: []
  acceptanceCriteriaLinks: []
---

# Test Story

## Description
This is a test story for validation.

## Tasks
- [x] Implement feature
- [ ] Write tests

## Dev Agent Record
Executed: *execute-task dev-save-memory task_name='feature' story_id='TEST-STORY-001'

## QA Results
Pending review.
`;
  
  try {
    fs.writeFileSync(testStoryPath, testStoryContent);
    
    // Test loading with auto-validation
    const loadedStory = await storyLoader.loadStory(testStoryPath);
    console.log('✅ Story loaded with validation');
    console.log(`   Validation: ${loadedStory.validation.valid ? 'Passed' : 'Failed'}`);
    console.log(`   Sections found: ${Array.from(loadedStory.sections.keys()).join(', ')}`);
    
    // Test batch validation
    const batchResults = await storyLoader.batchValidate([testStoryPath]);
    console.log('✅ Batch validation completed');
    console.log(`   Total: ${batchResults.total}, Passed: ${batchResults.passed}, Failed: ${batchResults.failed}`);
    
  } finally {
    // Cleanup
    if (fs.existsSync(testStoryPath)) fs.unlinkSync(testStoryPath);
  }
  
  console.log();
}

async function runAllTests() {
  try {
    await testTaskSchemaValidation();
    await testAutomaticValidation();
    await testConnectionManager();
    await testStoryLoader();
    
    console.log('========================================');
    console.log('✅ All tests completed successfully!');
    console.log('========================================');
    
    // Shutdown connection manager
    await connectionManager.shutdown();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});