const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock external dependencies
jest.mock('inquirer');
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis()
  }));
});
jest.mock('chalk', () => ({
  green: jest.fn(str => str),
  yellow: jest.fn(str => str),
  red: jest.fn(str => str),
  blue: jest.fn(str => str),
  bold: jest.fn(str => str),
  dim: jest.fn(str => str)
}));

const WorkflowOrchestrator = require('../../tools/workflow-orchestrator');

describe('Epic Loop Integration Tests', () => {
  let tempDir;
  let storyDir;
  let orchestrator;
  let consoleLogSpy;

  beforeEach(async () => {
    // Suppress console output during tests
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    // Create temporary directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-epic-integration-'));
    storyDir = path.join(tempDir, 'stories');
    fs.mkdirSync(storyDir, { recursive: true });

    // Create bmad-core directory structure
    const bmadCoreDir = path.join(tempDir, 'bmad-core');
    const utilsDir = path.join(bmadCoreDir, 'utils');
    const workflowsDir = path.join(bmadCoreDir, 'workflows');
    fs.mkdirSync(utilsDir, { recursive: true });
    fs.mkdirSync(workflowsDir, { recursive: true });

    // Create core configuration
    const coreConfigPath = path.join(bmadCoreDir, 'core-config.yaml');
    fs.writeFileSync(coreConfigPath, `
devStoryLocation: '${storyDir}'
verbosity: false
verbosityLevel: 'minimal'
flowType: 'linear'
workflowMode: 'single'
maxEpicIterations: 10
maxAttemptsPerStory: 2
maxConsecutiveFailures: 3
    `);

    // Initialize orchestrator
    orchestrator = new WorkflowOrchestrator(tempDir);
  });

  afterEach(() => {
    // Restore console methods
    consoleLogSpy.mockRestore();
    jest.restoreAllMocks();

    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('End-to-End Epic Processing', () => {
    test('should successfully process a complete epic', async () => {
      // Create a full epic with multiple stories
      createCompleteEpic('1', [
        { id: '1', status: 'Approved', title: 'User Authentication' },
        { id: '2', status: 'Approved', title: 'User Profile Management' },
        { id: '3', status: 'Approved', title: 'Password Reset Flow' }
      ]);

      // Mock orchestrator dependencies
      await setupOrchestratorMocks(true); // All stories succeed

      const result = await orchestrator.executeEpicLoop('1', 'linear');

      expect(result.processedStories).toBe(3);
      expect(result.epicCompleted).toBe(true);
      expect(result.totalIterations).toBeGreaterThan(0);

      // Verify all stories are marked as Done
      const finalEpicStatus = getEpicStatusFromFiles('1');
      expect(finalEpicStatus.completedStories).toBe(3);
    });

    test('should handle mixed success and failure scenarios', async () => {
      createCompleteEpic('2', [
        { id: '1', status: 'Approved', title: 'Feature A' },
        { id: '2', status: 'Approved', title: 'Feature B' },
        { id: '3', status: 'Approved', title: 'Feature C' }
      ]);

      // Mock with alternating success/failure
      await setupOrchestratorMocks(false, { 
        successPattern: [true, false, true] // First and third succeed, second fails
      });

      const result = await orchestrator.executeEpicLoop('2', 'linear');

      expect(result.processedStories).toBe(2); // Only successful stories
      expect(result.epicCompleted).toBe(false); // Epic not complete due to failures
    });

    test('should respect maximum iteration limits', async () => {
      createCompleteEpic('3', [
        { id: '1', status: 'Approved', title: 'Failing Story' }
      ]);

      // Mock to always fail
      await setupOrchestratorMocks(false, { alwaysFail: true });

      const result = await orchestrator.executeEpicLoop('3', 'linear');

      expect(result.processedStories).toBe(0);
      expect(result.epicCompleted).toBe(false);
    });

    test('should handle iterative Dev↔QA flow', async () => {
      createCompleteEpic('4', [
        { id: '1', status: 'Approved', title: 'Complex Feature' }
      ]);

      // Mock iterative workflow
      await setupOrchestratorMocks(true, { 
        iterativeMode: true,
        iterationsNeeded: 3 
      });

      const result = await orchestrator.executeEpicLoop('4', 'iterative');

      expect(result.processedStories).toBe(1);
      expect(result.totalIterations).toBe(3); // Should include all Dev↔QA iterations
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from temporary file system errors', async () => {
      createCompleteEpic('5', [
        { id: '1', status: 'Approved', title: 'Resilient Story' }
      ]);

      await setupOrchestratorMocks(true);

      // Mock file system error on first attempt, success on retry
      let attemptCount = 0;
      const originalUpdateStatus = orchestrator.updateStoryStatus.bind(orchestrator);
      orchestrator.updateStoryStatus = jest.fn(async (path, status) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Temporary file system error');
        }
        return originalUpdateStatus(path, status);
      });

      const result = await orchestrator.executeEpicLoop('5', 'linear');

      // Should eventually succeed after retry
      expect(result.processedStories).toBe(1);
    });

    test('should handle corrupted story files gracefully', async () => {
      // Create epic with one corrupted story
      createCompleteEpic('6', [
        { id: '1', status: 'Approved', title: 'Good Story' },
        { id: '2', status: 'Approved', title: 'Bad Story' }
      ]);

      // Corrupt the second story file
      const corruptedStory = path.join(storyDir, '6.2.bad-story.md');
      fs.writeFileSync(corruptedStory, 'Corrupted content without proper structure');

      await setupOrchestratorMocks(true);

      const result = await orchestrator.executeEpicLoop('6', 'linear');

      // Should process the good story and skip the corrupted one
      expect(result.processedStories).toBe(1);
    });
  });

  describe('Configuration Integration', () => {
    test('should respect configuration limits', async () => {
      // Update configuration with restrictive limits
      const coreConfigPath = path.join(tempDir, 'bmad-core', 'core-config.yaml');
      fs.writeFileSync(coreConfigPath, `
devStoryLocation: '${storyDir}'
verbosity: false
maxEpicIterations: 2
maxAttemptsPerStory: 1
maxConsecutiveFailures: 1
      `);

      createCompleteEpic('7', [
        { id: '1', status: 'Approved', title: 'First Story' },
        { id: '2', status: 'Approved', title: 'Second Story' }
      ]);

      // Reinitialize orchestrator with new config
      orchestrator = new WorkflowOrchestrator(tempDir);
      await setupOrchestratorMocks(false, { alwaysFail: true });

      const result = await orchestrator.executeEpicLoop('7', 'linear');

      // Should terminate quickly due to restrictive limits
      expect(result.processedStories).toBe(0);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large epics efficiently', async () => {
      // Create epic with many stories
      const storyCount = 20;
      const stories = Array.from({ length: storyCount }, (_, i) => ({
        id: String(i + 1),
        status: 'Approved',
        title: `Story ${i + 1}`
      }));

      createCompleteEpic('8', stories);
      await setupOrchestratorMocks(true);

      const startTime = Date.now();
      const result = await orchestrator.executeEpicLoop('8', 'linear');
      const endTime = Date.now();

      expect(result.processedStories).toBe(storyCount);
      expect(result.epicCompleted).toBe(true);
      
      // Should complete within reasonable time (adjust threshold as needed)
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(30000); // 30 seconds max
    });
  });

  // Helper functions
  async function setupOrchestratorMocks(successMode = true, options = {}) {
    orchestrator.initialize = jest.fn().mockResolvedValue();
    orchestrator.resolvedPaths = { storyLocation: storyDir };
    orchestrator.config = { 
      verbosity: false,
      maxEpicIterations: 10,
      maxAttemptsPerStory: 2,
      maxConsecutiveFailures: 3
    };
    
    orchestrator.logger = { 
      phaseStart: jest.fn(),
      phaseComplete: jest.fn(),
      taskStart: jest.fn(),
      taskComplete: jest.fn(),
      summary: jest.fn(),
      agentAction: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Mock SM agent work
    orchestrator.simulateAgentWork = jest.fn().mockResolvedValue({
      success: true,
      approved: true,
      validationChecks: ['Story structure', 'Acceptance criteria'],
      recommendations: []
    });

    // Mock Dev↔QA workflow based on options
    if (options.alwaysFail) {
      orchestrator.executeDevQAWorkflow = jest.fn().mockRejectedValue(new Error('Simulated failure'));
    } else if (options.successPattern) {
      let callIndex = 0;
      orchestrator.executeDevQAWorkflow = jest.fn().mockImplementation(() => {
        const shouldSucceed = options.successPattern[callIndex % options.successPattern.length];
        callIndex++;
        
        if (shouldSucceed) {
          return Promise.resolve({
            qaResult: { approved: true },
            iterations: options.iterationsNeeded || 1
          });
        } else {
          return Promise.reject(new Error('Simulated failure'));
        }
      });
    } else if (successMode) {
      orchestrator.executeDevQAWorkflow = jest.fn().mockResolvedValue({
        qaResult: { approved: true },
        iterations: options.iterationsNeeded || 1
      });
    } else {
      orchestrator.executeDevQAWorkflow = jest.fn().mockRejectedValue(new Error('Simulated failure'));
    }
  }

  function createCompleteEpic(epicId, stories) {
    stories.forEach(story => {
      const filename = `${epicId}.${story.id}.${story.title.toLowerCase().replace(/\s+/g, '-')}.md`;
      const storyContent = `---
StoryContract:
  title: "${story.title}"
  description: "Integration test story for epic ${epicId}"
  acceptanceCriteria:
    - "Acceptance criterion 1"
    - "Acceptance criterion 2"
---

# ${story.title}

## Description
This is an integration test story for epic loop functionality testing.

## Acceptance Criteria
- [ ] Criterion 1 is met
- [ ] Criterion 2 is met
- [ ] All edge cases are handled

## Technical Implementation
- Implementation detail 1
- Implementation detail 2

## Status
${story.status}
`;
      
      fs.writeFileSync(path.join(storyDir, filename), storyContent);
    });
  }

  function getEpicStatusFromFiles(epicId) {
    const files = fs.readdirSync(storyDir);
    const epicFiles = files.filter(f => f.startsWith(`${epicId}.`) && f.endsWith('.md'));
    
    let completedStories = 0;
    let totalStories = epicFiles.length;
    
    epicFiles.forEach(file => {
      const content = fs.readFileSync(path.join(storyDir, file), 'utf8');
      const statusMatch = content.match(/##\s*Status\s*\n\s*(.+)/i);
      if (statusMatch && statusMatch[1].trim() === 'Done') {
        completedStories++;
      }
    });
    
    return {
      totalStories,
      completedStories,
      isComplete: completedStories === totalStories && totalStories > 0
    };
  }
});
