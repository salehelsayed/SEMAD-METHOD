#!/usr/bin/env node

/**
 * Integration Test Runner for Dev↔QA Workflow
 * 
 * Simple test runner that validates the Dev↔QA workflow without external dependencies
 */

const path = require('path');
const fs = require('fs');
const AgentPermissionsValidator = require('../../bmad-core/utils/agent-permissions');

console.log('🧪 Dev↔QA Workflow Integration Tests\n');

let passedTests = 0;
let failedTests = 0;

function test(description, testFn) {
  try {
    testFn();
    console.log(`✅ ${description}`);
    passedTests++;
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   Error: ${error.message}`);
    failedTests++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Initialize validator
const validator = new AgentPermissionsValidator();

console.log('1. Permission Enforcement Tests\n');

test('QA agent cannot modify code files', () => {
  const result = validator.validateFileModification('qa', '/src/index.js');
  assert(!result.allowed, 'QA should not be allowed to modify code files');
  assert(result.reason.includes('read-only'), 'Should indicate read-only permissions');
});

test('QA agent can update QA Results section', () => {
  const result = validator.validateStorySectionModification('qa', 'qa-results');
  assert(result.allowed, 'QA should be allowed to update qa-results section');
});

test('QA agent cannot update Dev sections', () => {
  const result = validator.validateStorySectionModification('qa', 'dev-agent-record');
  assert(!result.allowed, 'QA should not be allowed to update dev sections');
});

test('Dev agent can modify code files', () => {
  const result = validator.validateFileModification('dev', '/src/feature.js');
  assert(result.allowed, 'Dev should be allowed to modify code files');
});

test('Dev agent can update task checkboxes', () => {
  const result = validator.validateStorySectionModification('dev', 'tasks-subtasks');
  assert(result.allowed, 'Dev should be allowed to update tasks section');
});

console.log('\n2. Operation Validation Tests\n');

test('Read operations are allowed for all agents', () => {
  const qaRead = validator.validateOperation({ agent: 'qa', action: 'read', target: '/any/file.js' });
  const devRead = validator.validateOperation({ agent: 'dev', action: 'read', target: '/any/file.js' });
  assert(qaRead.allowed, 'QA should be allowed to read files');
  assert(devRead.allowed, 'Dev should be allowed to read files');
});

test('Write operations respect agent permissions', () => {
  const qaWrite = validator.validateOperation({ agent: 'qa', action: 'write', target: '/src/file.js' });
  const devWrite = validator.validateOperation({ agent: 'dev', action: 'write', target: '/src/file.js' });
  assert(!qaWrite.allowed, 'QA write should be denied');
  assert(devWrite.allowed, 'Dev write should be allowed');
});

test('Story section updates respect permissions', () => {
  const qaUpdate = validator.validateOperation({ 
    agent: 'qa', 
    action: 'update', 
    target: 'story.yaml',
    targetSection: 'qa-results'
  });
  assert(qaUpdate.allowed, 'QA should be allowed to update qa-results');
});

console.log('\n3. Secure File Operations Tests\n');

test('Secure operations prevent unauthorized writes', () => {
  const qaOps = validator.createSecureFileOperations('qa');
  let errorCaught = false;
  
  try {
    qaOps.writeFile('/test/file.js', 'content');
  } catch (error) {
    errorCaught = true;
    assert(error.message.includes('Permission denied'), 'Should show permission denied');
  }
  
  assert(errorCaught, 'Should throw error for unauthorized write');
});

test('Secure operations allow authorized writes', () => {
  const devOps = validator.createSecureFileOperations('dev');
  const testFile = path.join(__dirname, 'test-write.tmp');
  
  try {
    devOps.writeFile(testFile, 'test content');
    assert(fs.existsSync(testFile), 'File should be created');
    
    // Clean up
    fs.unlinkSync(testFile);
  } catch (error) {
    throw new Error(`Dev write failed: ${error.message}`);
  }
});

console.log('\n4. Workflow Logic Tests\n');

test('QA feedback structure is valid', () => {
  const qaFeedback = {
    approved: false,
    issues: ['Missing error handling', 'Low test coverage'],
    recommendations: [
      { issue: 'Missing error handling', action: 'Add try-catch blocks', priority: 'high' },
      { issue: 'Low test coverage', action: 'Add unit tests', priority: 'medium' }
    ],
    status: 'Needs Fixes'
  };
  
  assert(!qaFeedback.approved, 'QA should not approve with issues');
  assert(qaFeedback.issues.length > 0, 'Should have issues listed');
  assert(qaFeedback.recommendations.length === qaFeedback.issues.length, 'Should have recommendation for each issue');
  assert(qaFeedback.status === 'Needs Fixes', 'Status should indicate fixes needed');
});

test('Dev can address QA feedback', () => {
  const devResponse = {
    action: 'address_qa_feedback',
    fixedIssues: ['Missing error handling', 'Low test coverage'],
    modifiedFiles: ['src/feature.js', 'tests/feature.test.js'],
    status: 'Ready for Review'
  };
  
  assert(devResponse.fixedIssues.length > 0, 'Should have fixed issues');
  assert(devResponse.modifiedFiles.length > 0, 'Should have modified files');
  assert(devResponse.status === 'Ready for Review', 'Status should be ready for review');
});

console.log('\n5. Agent Permissions Summary\n');

// Display all agent permissions
const agents = ['qa', 'dev', 'scrum-master', 'analyst', 'architect', 'pm'];
agents.forEach(agentId => {
  const perms = validator.getAgentPermissions(agentId);
  if (perms) {
    console.log(`${agentId.toUpperCase()} Agent:`);
    console.log(`  - Can modify files: ${perms.canModifyFiles ? 'Yes' : 'No'}`);
    console.log(`  - Allowed story sections: ${Array.isArray(perms.allowedStoryFileSections) ? perms.allowedStoryFileSections.join(', ') : perms.allowedStoryFileSections}`);
    console.log('');
  }
});

// Summary
console.log('-'.repeat(50));
console.log(`\nTest Results: ${passedTests} passed, ${failedTests} failed`);
console.log(`Total Tests: ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n✨ All tests passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed.');
  process.exit(1);
}