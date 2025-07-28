#!/usr/bin/env node

const TaskRunner = require('../tools/task-runner');
const path = require('path');

// Test template resolution
const taskRunner = new TaskRunner(path.join(__dirname, '..'));

const context = {
  inputs: {
    storyFilePath: '/test/path/story.md'
  },
  someOtherVar: 'value'
};

// Test resolving different template patterns
const tests = [
  '{{storyFilePath}}',
  '{{inputs.storyFilePath}}',
  'static value',
  'mixed {{inputs.storyFilePath}} value'
];

console.log('Testing template resolution:');
console.log('Context:', JSON.stringify(context, null, 2));
console.log('\nResults:');

tests.forEach(test => {
  const result = taskRunner.resolveTemplateValue(test, context);
  console.log(`"${test}" => "${result}"`);
});