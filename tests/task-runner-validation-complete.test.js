#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const TaskRunner = require('../tools/task-runner');

// Complete test of task runner validation capabilities
async function testTaskRunnerValidation() {
  console.log('Testing TaskRunner validation capabilities\n');
  
  const rootDir = path.join(__dirname, '..');
  const taskRunner = new TaskRunner(rootDir);
  
  const results = {
    passed: 0,
    failed: 0
  };
  
  // Test 1: Verify all namespaced actions are implemented
  console.log('Test 1: Verify namespaced actions');
  console.log('-'.repeat(50));
  
  const actions = [
    { name: 'file:read', test: async () => {
      const testFile = path.join(__dirname, 'test-file.txt');
      fs.writeFileSync(testFile, 'test content');
      try {
        const result = await taskRunner.executeNamespacedAction(
          { action: 'file:read', inputs: { path: testFile }, outputs: { content: 'fileContent' } },
          {}
        );
        return result.fileContent === 'test content';
      } finally {
        fs.unlinkSync(testFile);
      }
    }},
    
    { name: 'yaml:extract-frontmatter', test: async () => {
      const yamlContent = `---
test:
  key: value
---
content`;
      const result = await taskRunner.executeNamespacedAction(
        { action: 'yaml:extract-frontmatter', inputs: { content: yamlContent, key: 'test' }, outputs: { contractData: 'data' } },
        {}
      );
      return result && result.data && result.data.key === 'value';
    }},
    
    { name: 'script:execute', test: async () => {
      const context = { inputs: { testArg: 'hello' } };
      const result = await taskRunner.executeNamespacedAction(
        { action: 'script:execute', inputs: { script: 'scripts/validate-story-contract.js', args: ['--help'] }, outputs: { exitCode: 'code' } },
        context
      );
      return result && context.code !== undefined;
    }},
    
    { name: 'logic:evaluate', test: async () => {
      const context = { testValue: 42 };
      const result = await taskRunner.executeNamespacedAction(
        { action: 'logic:evaluate', inputs: { expression: '{{testValue}} > 40' }, outputs: { result: 'evalResult' } },
        context
      );
      return context.evalResult === true;
    }},
    
    { name: 'workflow:conditional-halt', test: async () => {
      try {
        await taskRunner.executeNamespacedAction(
          { action: 'workflow:conditional-halt', inputs: { condition: false } },
          {}
        );
        return true; // Should not halt
      } catch {
        return false;
      }
    }}
  ];
  
  for (const action of actions) {
    try {
      const passed = await action.test();
      if (passed) {
        console.log(`✓ ${action.name}`);
        results.passed++;
      } else {
        console.log(`✗ ${action.name} - test returned false`);
        results.failed++;
      }
    } catch (error) {
      console.log(`✗ ${action.name} - ${error.message}`);
      results.failed++;
    }
  }
  
  // Test 2: Full validation task execution
  console.log('\n\nTest 2: Full validation task execution');
  console.log('-'.repeat(50));
  
  const validStoryPath = path.join(__dirname, 'test-valid-story.md');
  const invalidStoryPath = path.join(__dirname, 'test-invalid-story.md');
  
  // Test with valid story
  try {
    console.log('\nTesting with valid story...');
    const result = await taskRunner.executeTask('sm', 'bmad-core/structured-tasks/validate-story-contract.yaml', {
      inputs: { storyFilePath: validStoryPath }
    });
    
    if (result.success) {
      console.log('✓ Valid story passed validation');
      results.passed++;
    } else {
      console.log('✗ Valid story failed validation');
      results.failed++;
    }
  } catch (error) {
    console.log('✗ Valid story test failed:', error.message);
    results.failed++;
  }
  
  // Test with invalid story
  try {
    console.log('\nTesting with invalid story...');
    const result = await taskRunner.executeTask('sm', 'bmad-core/structured-tasks/validate-story-contract.yaml', {
      inputs: { storyFilePath: invalidStoryPath }
    });
    
    // Should have failed but didn't
    console.log('✗ Invalid story should have failed validation');
    results.failed++;
  } catch (error) {
    if (error.message.includes('StoryContract validation failed')) {
      console.log('✓ Invalid story correctly failed validation');
      results.passed++;
    } else {
      console.log('✗ Invalid story failed with unexpected error:', error.message);
      results.failed++;
    }
  }
  
  // Test 3: Template resolution
  console.log('\n\nTest 3: Template resolution');
  console.log('-'.repeat(50));
  
  const templateTests = [
    { input: '{{simple}}', context: { simple: 'value' }, expected: 'value' },
    { input: '{{nested.path}}', context: { nested: { path: 'value' } }, expected: 'value' },
    { input: '{{inputs.test}}', context: { inputs: { test: 'value' } }, expected: 'value' },
    { input: '{{test}}', context: { inputs: { test: 'value' } }, expected: 'value' }, // Should resolve from inputs
    { input: 'static', context: {}, expected: 'static' },
    { input: 'prefix {{var}} suffix', context: { var: 'TEST' }, expected: 'prefix TEST suffix' }
  ];
  
  templateTests.forEach(test => {
    const result = taskRunner.resolveTemplateValue(test.input, test.context);
    if (result === test.expected) {
      console.log(`✓ "${test.input}" => "${result}"`);
      results.passed++;
    } else {
      console.log(`✗ "${test.input}" => "${result}" (expected "${test.expected}")`);
      results.failed++;
    }
  });
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Total tests: ${results.passed + results.failed}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  
  if (results.failed === 0) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed');
    process.exit(1);
  }
}

// Run the test
testTaskRunnerValidation().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});