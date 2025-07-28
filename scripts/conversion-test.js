#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { parseTaskMarkdown, parseChecklistMarkdown, validateConversion } = require('../bmad-core/scripts/convert-tasks-v2');

// Test data directory
const testDataDir = path.join(__dirname, 'test-data');

// Helper function to create test directories
function setupTestEnvironment() {
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
}

// Test cases
const tests = {
  'Task with SEQUENTIAL header': {
    type: 'task',
    input: `# Test Task

## Purpose
This is a test task.

## SEQUENTIAL Task Execution (Do not proceed until current Task is complete)

### 1. First Step
- Do something
- Do another thing

### 2. Second Step
- Final action
`,
    expected: {
      name: 'Test Task',
      purpose: 'This is a test task.',
      metadata: {
        executionMode: 'SEQUENTIAL'
      },
      steps: [
        {
          name: 'First Step',
          actions: [
            { description: 'Do something' },
            { description: 'Do another thing' }
          ]
        },
        {
          name: 'Second Step',
          actions: [
            { description: 'Final action' }
          ]
        }
      ]
    }
  },

  'Task with elicit actions': {
    type: 'task',
    input: `# Interactive Task

## Purpose
Task with user prompts.

## Task Execution

### 1. Setup
- Load configuration
- Ask user for input?
- Verify settings
`,
    expected: {
      name: 'Interactive Task',
      steps: [
        {
          actions: [
            { description: 'Load configuration', elicit: false },
            { description: 'Ask user for input?', elicit: true },
            { description: 'Verify settings', elicit: true }
          ]
        }
      ]
    }
  },

  'Checklist with LLM instructions': {
    type: 'checklist',
    input: `# Test Checklist

## 1. First Category

[[LLM: Check these carefully

Multi-line
instructions]]

- [ ] Item 1
- [ ] Item 2

## 2. Second Category
- [ ] Item 3

## Validation Result
Status: pending
Test notes here
`,
    expected: {
      name: 'Test Checklist',
      categories: [
        {
          name: 'First Category',
          notes: 'Check these carefully\n\nMulti-line\ninstructions',
          items: [
            { description: 'Item 1', checked: false },
            { description: 'Item 2', checked: false }
          ]
        },
        {
          name: 'Second Category',
          items: [
            { description: 'Item 3', checked: false }
          ]
        }
      ],
      result: {
        status: 'pending',
        notes: 'Test notes here'
      }
    }
  },

  'Edge case: Empty file': {
    type: 'task',
    input: '',
    expectedError: 'Missing task name'
  },

  'Edge case: No steps': {
    type: 'task',
    input: `# Task Without Steps

## Purpose
This task has no steps.
`,
    expectedError: 'No steps found'
  },

  'Complex nested content': {
    type: 'task',
    input: `# Complex Task

## Purpose
Complex test case.

## Task Execution

### 1. Main Step

This step has a description with multiple paragraphs.

Including code blocks:

\`\`\`javascript
const test = true;
\`\`\`

- Action one
- Prompt user: Should we continue?
  - Nested bullet (should be part of action)
- Final action

CRITICAL: This is an important note.
`,
    expected: {
      name: 'Complex Task',
      steps: [
        {
          name: 'Main Step',
          description: expect => expect.includes('```javascript'),
          actions: [
            { description: 'Action one', elicit: false },
            { description: expect => expect.includes('Should we continue'), elicit: true },
            { description: 'Final action', elicit: false }
          ],
          notes: expect => expect.includes('CRITICAL')
        }
      ]
    }
  }
};

// Run tests
function runTests() {
  setupTestEnvironment();
  
  let passed = 0;
  let failed = 0;
  
  console.log('Running conversion tests...\n');
  
  for (const [testName, test] of Object.entries(tests)) {
    try {
      const filename = `test-${Date.now()}.md`;
      let result;
      
      if (test.type === 'task') {
        result = parseTaskMarkdown(test.input, filename);
      } else if (test.type === 'checklist') {
        result = parseChecklistMarkdown(test.input, filename);
      }
      
      if (test.expectedError) {
        // Should have generated an error
        const hasError = validationResults.errors.some(err => 
          err.includes(test.expectedError)
        );
        if (hasError) {
          console.log(`✓ ${testName}`);
          passed++;
        } else {
          console.log(`✗ ${testName} - Expected error not found`);
          failed++;
        }
      } else {
        // Check result matches expected
        if (validateResult(result, test.expected)) {
          console.log(`✓ ${testName}`);
          passed++;
        } else {
          console.log(`✗ ${testName} - Result doesn't match expected`);
          console.log('  Expected:', JSON.stringify(test.expected, null, 2));
          console.log('  Got:', JSON.stringify(result, null, 2));
          failed++;
        }
      }
    } catch (error) {
      console.log(`✗ ${testName} - ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// Validate result matches expected (deep comparison with function support)
function validateResult(actual, expected, path = '') {
  if (typeof expected === 'function') {
    return expected(actual);
  }
  
  if (typeof expected !== typeof actual) {
    console.error(`Type mismatch at ${path}: expected ${typeof expected}, got ${typeof actual}`);
    return false;
  }
  
  if (typeof expected === 'object' && expected !== null) {
    // For arrays and objects
    for (const key in expected) {
      if (!validateResult(actual[key], expected[key], `${path}.${key}`)) {
        return false;
      }
    }
    return true;
  }
  
  // Primitive comparison
  return actual === expected;
}

// Mock validation results for testing
global.validationResults = {
  errors: [],
  warnings: [],
  dataLoss: []
};

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };