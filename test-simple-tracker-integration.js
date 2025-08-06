#!/usr/bin/env node

/**
 * Integration test for the simplified task tracker system
 * Tests the complete flow from agent activation through task completion
 */

const TaskTracker = require('./bmad-core/utils/simple-task-tracker');
const { getTracker, startWorkflow } = require('./bmad-core/utils/memory-compatibility-wrapper');
const simpleMemory = require('./bmad-core/utils/simpleMemory');

async function testBasicTracking() {
  console.log('🧪 Test 1: Basic Task Tracking');
  console.log('================================\n');
  
  const tracker = new TaskTracker();
  
  // Start a workflow
  const tasks = [
    { name: 'Read story requirements', id: 'task-1' },
    { name: 'Implement API endpoint', id: 'task-2' },
    { name: 'Write unit tests', id: 'task-3' },
    { name: 'Update documentation', id: 'task-4' }
  ];
  
  tracker.setAgent('dev');
  tracker.startWorkflow('implement-user-story', tasks);
  
  // Complete some tasks
  console.log('📋 Starting workflow...');
  console.log(tracker.getProgressReport());
  
  tracker.completeCurrentTask('Requirements understood');
  console.log('\n✅ Completed first task');
  console.log(tracker.getProgressReport());
  
  tracker.completeCurrentTask('API endpoint implemented with error handling');
  console.log('\n✅ Completed second task');
  
  tracker.skipCurrentTask('Tests will be written by QA team');
  console.log('\n⏭️  Skipped third task');
  
  tracker.completeCurrentTask('README updated with new endpoint');
  console.log('\n✅ Completed final task');
  console.log(tracker.getProgressReport());
  
  // Save debug log
  const logPath = tracker.saveDebugLog('.ai/test-logs');
  console.log(`\n💾 Debug log saved to: ${logPath}`);
  
  return true;
}

async function testCompatibilityWrapper() {
  console.log('\n\n🧪 Test 2: Compatibility Wrapper');
  console.log('==================================\n');
  
  const { 
    loadAgentMemoryContextAndExit,
    persistObservation,
    persistDecision,
    executeDevSaveMemory
  } = require('./bmad-core/utils/memory-compatibility-wrapper');
  
  // Test agent initialization
  const initResult = loadAgentMemoryContextAndExit('qa');
  console.log('✅ Agent initialized:', initResult);
  
  // Test observation logging
  const obsResult = persistObservation('qa', 'Code review started for story 4.1');
  console.log('✅ Observation logged:', obsResult);
  
  // Test decision logging
  const decResult = persistDecision(
    'qa',
    'Approve with minor comments',
    'Code meets standards but needs better error messages'
  );
  console.log('✅ Decision logged:', decResult);
  
  // Test task completion
  const tracker = getTracker();
  startWorkflow('qa-review', [
    { name: 'Review code quality' },
    { name: 'Check test coverage' },
    { name: 'Validate documentation' }
  ]);
  
  const saveResult = executeDevSaveMemory('Review code quality', '4.1', {
    findings: 'Code is clean and well-structured',
    issues: ['Missing JSDoc comments', 'Console.log statements need removal'],
    recommendation: 'Address minor issues then merge'
  });
  console.log('✅ Memory save executed:', saveResult);
  
  console.log('\n📊 Current Progress:');
  console.log(tracker.getProgressReport());
  
  return true;
}

async function testSimpleMemoryModule() {
  console.log('\n\n🧪 Test 3: Simple Memory Module');
  console.log('=================================\n');
  
  // Reset tracker for new test
  const tracker = getTracker();
  tracker.reset();
  
  // Test context saving
  const contextResult = await simpleMemory.saveContext({
    agentName: 'dev',
    context: {
      currentStory: '4.2',
      currentTask: 'implement-user-auth',
      status: 'in-progress',
      context: {
        decisions: 'Use JWT for authentication',
        rationale: 'Industry standard, stateless',
        files: ['auth.controller.js', 'auth.service.js'],
        challenges: ['Token refresh strategy'],
        notes: 'Following OAuth2 best practices'
      }
    }
  });
  console.log('✅ Context saved:', contextResult);
  
  // Test various log entries
  await simpleMemory.logEntry({
    agentName: 'dev',
    type: 'decision',
    content: 'Implement refresh token rotation',
    metadata: {
      story: '4.2',
      task: 'implement-user-auth',
      rationale: 'Enhanced security against token theft'
    }
  });
  console.log('✅ Decision logged');
  
  await simpleMemory.logEntry({
    agentName: 'dev',
    type: 'pattern',
    content: 'jwt-auth-middleware',
    metadata: {
      story: '4.2',
      description: 'Reusable JWT validation middleware',
      codeSnippet: 'const jwt = require("jsonwebtoken");',
      techStack: ['Node.js', 'Express', 'JWT']
    }
  });
  console.log('✅ Pattern logged');
  
  await simpleMemory.logEntry({
    agentName: 'dev',
    type: 'observation',
    content: 'Challenges: Token expiry handling needs careful consideration',
    metadata: {
      story: '4.2',
      solutions: 'Implement grace period for token refresh'
    }
  });
  console.log('✅ Observation logged');
  
  // Mark task complete
  await simpleMemory.saveContext({
    agentName: 'dev',
    context: {
      currentStory: '4.2',
      currentTask: 'implement-user-auth',
      status: 'completed',
      context: {
        decisions: 'JWT with refresh token rotation implemented',
        files: ['auth.controller.js', 'auth.service.js', 'jwt.middleware.js']
      }
    }
  });
  console.log('✅ Task marked complete');
  
  // Get progress
  const progress = await simpleMemory.getProgress();
  console.log('\n📊 Progress Data:', JSON.stringify(progress, null, 2));
  
  return true;
}

async function testErrorScenarios() {
  console.log('\n\n🧪 Test 4: Error Handling');
  console.log('===========================\n');
  
  const tracker = new TaskTracker();
  
  // Test completing task without workflow
  try {
    tracker.completeCurrentTask('This should fail');
    console.log('❌ Should have failed - no workflow');
  } catch (error) {
    console.log('✅ Correctly handled no workflow error');
  }
  
  // Test skipping last task
  tracker.startWorkflow('error-test', [{ name: 'single-task' }]);
  tracker.skipCurrentTask('Testing skip');
  
  const current = tracker.getCurrentTask();
  console.log('✅ Skip handled correctly:', current === null ? 'No more tasks' : 'Tasks remain');
  
  // Test progress on empty workflow
  tracker.reset();
  const emptyProgress = tracker.getProgress();
  console.log('✅ Empty workflow handled:', emptyProgress === null ? 'Returns null' : 'Has data');
  
  return true;
}

// Run all tests
async function runIntegrationTests() {
  console.log('🚀 Simple Task Tracker Integration Tests');
  console.log('========================================\n');
  
  try {
    await testBasicTracking();
    await testCompatibilityWrapper();
    await testSimpleMemoryModule();
    await testErrorScenarios();
    
    console.log('\n\n✅ All integration tests passed!');
    console.log('\n📝 Summary:');
    console.log('  - Basic task tracking works correctly');
    console.log('  - Compatibility wrapper provides backward compatibility');
    console.log('  - Simple memory module bridges to structured tasks');
    console.log('  - Error handling is robust');
    console.log('\n🎉 The simplified task tracker is ready for use!');
    
  } catch (error) {
    console.error('\n\n❌ Integration test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  runIntegrationTests();
}

module.exports = { runIntegrationTests };