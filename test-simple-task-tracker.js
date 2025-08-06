/**
 * Simple test script for the TaskTracker
 * Run with: node test-simple-task-tracker.js
 */

const TaskTracker = require('./bmad-core/utils/simple-task-tracker');

console.log('=== Testing Simple Task Tracker ===\n');

// Create a new tracker instance
const tracker = new TaskTracker();

// Test 1: Start a workflow
console.log('Test 1: Starting a workflow');
const tasks = [
  { name: 'Initialize project structure' },
  { name: 'Create user model' },
  { name: 'Implement user controller' },
  { name: 'Write unit tests' },
  { name: 'Add integration tests' },
  { name: 'Update documentation' },
  { name: 'Run linting' },
  { name: 'Run all tests' },
  { name: 'Update story status' },
  { name: 'Final validation' }
];

tracker.startWorkflow('develop-story', tasks);
tracker.setAgent('dev');

// Test 2: Get current task
console.log('\nTest 2: Getting current task');
const current = tracker.getCurrentTask();
console.log(`Current task: ${current.task.name}`);
console.log(`Progress: ${current.progress}`);

// Test 3: Complete some tasks
console.log('\nTest 3: Completing tasks');
tracker.completeCurrentTask('Created src/, test/, and docs/ directories');
tracker.completeCurrentTask('User model with validation implemented');
tracker.completeCurrentTask('CRUD operations implemented');

// Test 4: Check progress
console.log('\nTest 4: Checking progress');
console.log(tracker.getProgressReport());

// Test 5: Skip a task
console.log('\nTest 5: Skipping a task');
tracker.skipCurrentTask('Documentation will be updated in separate PR');

// Test 6: Complete more tasks
console.log('\nTest 6: Completing more tasks');
tracker.completeCurrentTask('Unit tests: 15 passing');
tracker.completeCurrentTask('Integration tests: 8 passing');
tracker.completeCurrentTask('ESLint: 0 errors, 0 warnings');

// Test 7: Log some observations
console.log('\nTest 7: Logging observations');
tracker.log('Found potential performance issue in user lookup', 'warning');
tracker.log('All tests passing', 'success');
tracker.log('Attempting to fix performance issue', 'info');

// Test 8: Complete remaining tasks
console.log('\nTest 8: Completing workflow');
tracker.completeCurrentTask('All tests green: 23 passing');
tracker.completeCurrentTask('Story status updated to Ready for Review');
tracker.completeCurrentTask('Final validation complete');

// Test 9: Final progress report
console.log('\nTest 9: Final progress report');
console.log(tracker.getProgressReport());

// Test 10: Save debug log
console.log('\nTest 10: Saving debug log');
const logPath = tracker.saveDebugLog();
console.log(`Debug log saved to: ${logPath}`);

console.log('\n=== Test Complete ===');

// Test edge cases
console.log('\n=== Testing Edge Cases ===');

// Test 11: Try to complete task when workflow is done
console.log('\nTest 11: Attempting to complete task after workflow done');
const result = tracker.completeCurrentTask('This should fail');
console.log(`Result: ${result ? 'Success' : 'Failed (expected)'}`);

// Test 12: Reset and start new workflow
console.log('\nTest 12: Reset and new workflow');
tracker.reset();
tracker.startWorkflow('quick-fix', [
  { name: 'Identify issue' },
  { name: 'Apply fix' },
  { name: 'Test fix' }
]);
console.log(tracker.getProgressReport());

console.log('\n=== All Tests Complete ===');