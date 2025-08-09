const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock modules
jest.mock('inquirer');
jest.mock('ora');
jest.mock('chalk');

const WorkflowOrchestrator = require('../tools/workflow-orchestrator');
const { 
  getStoriesForEpic, 
  findNextApprovedStoryInEpic, 
  getEpicStatus 
} = require('../bmad-core/utils/find-next-story');

describe('Epic Loop Functionality', () => {
  let tempDir;
  let storyDir;
  let orchestrator;

  beforeEach(async () => {
    // Create temporary directory for test stories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-epic-test-'));
    storyDir = path.join(tempDir, 'stories');
    fs.mkdirSync(storyDir, { recursive: true });

    // Create test configuration directory structure
    const bmadCoreDir = path.join(tempDir, 'bmad-core');
    const utilsDir = path.join(bmadCoreDir, 'utils');
    fs.mkdirSync(utilsDir, { recursive: true });

    // Create a minimal core-config.yaml for testing
    const coreConfigPath = path.join(bmadCoreDir, 'core-config.yaml');
    fs.writeFileSync(coreConfigPath, `
devStoryLocation: '${storyDir}'
verbosity: false
verbosityLevel: 'minimal'
    `);

    // Initialize orchestrator
    orchestrator = new WorkflowOrchestrator(tempDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getStoriesForEpic', () => {
    test('should return empty array when no stories exist', () => {
      const result = getStoriesForEpic(storyDir, '1');
      expect(result).toEqual([]);
    });

    test('should return only stories belonging to specific epic', () => {
      // Create test stories for multiple epics
      createTestStory('1.1.first-story.md', 'Approved', 'First Story');
      createTestStory('1.2.second-story.md', 'Done', 'Second Story');
      createTestStory('2.1.other-epic-story.md', 'Approved', 'Other Epic Story');
      createTestStory('1.3.third-story.md', 'InProgress', 'Third Story');

      const epic1Stories = getStoriesForEpic(storyDir, '1');
      
      expect(epic1Stories).toHaveLength(3);
      expect(epic1Stories.map(s => s.file)).toEqual([
        '1.1.first-story.md',
        '1.2.second-story.md',
        '1.3.third-story.md'
      ]);
      expect(epic1Stories.every(s => s.epicId === '1')).toBe(true);
    });

    test('should sort stories by story ID numerically', () => {
      createTestStory('1.10.tenth-story.md', 'Approved', 'Tenth Story');
      createTestStory('1.2.second-story.md', 'Approved', 'Second Story');
      createTestStory('1.1.first-story.md', 'Approved', 'First Story');

      const stories = getStoriesForEpic(storyDir, '1');
      
      expect(stories.map(s => s.storyId)).toEqual(['1', '2', '10']);
    });

    test('should handle invalid story files gracefully', () => {
      createTestStory('1.1.valid-story.md', 'Approved', 'Valid Story');
      fs.writeFileSync(path.join(storyDir, '1.2.invalid-story.md'), 'invalid content without proper structure');

      const stories = getStoriesForEpic(storyDir, '1');
      
      expect(stories).toHaveLength(2);
      expect(stories[1].status).toBe('Unknown');
      expect(stories[1].title).toBe('1.2.invalid-story.md');
    });
  });

  describe('findNextApprovedStoryInEpic', () => {
    test('should find the first approved story in epic', () => {
      createTestStory('1.1.first-story.md', 'Done', 'First Story');
      createTestStory('1.2.second-story.md', 'Approved', 'Second Story');
      createTestStory('1.3.third-story.md', 'Approved', 'Third Story');

      const result = findNextApprovedStoryInEpic(storyDir, '1');
      
      expect(result.found).toBe(true);
      expect(result.fullStoryId).toBe('1.2');
      expect(result.title).toBe('Second Story');
      expect(result.status).toBe('Approved');
    });

    test('should return not found when no approved stories exist', () => {
      createTestStory('1.1.first-story.md', 'Done', 'First Story');
      createTestStory('1.2.second-story.md', 'InProgress', 'Second Story');

      const result = findNextApprovedStoryInEpic(storyDir, '1');
      
      expect(result.found).toBe(false);
      expect(result.error).toContain('No approved stories found');
    });

    test('should return not found when epic does not exist', () => {
      createTestStory('1.1.first-story.md', 'Approved', 'First Story');

      const result = findNextApprovedStoryInEpic(storyDir, '999');
      
      expect(result.found).toBe(false);
      expect(result.error).toContain('No stories found for epic 999');
    });
  });

  describe('getEpicStatus', () => {
    test('should calculate epic status correctly', () => {
      createTestStory('1.1.first-story.md', 'Done', 'First Story');
      createTestStory('1.2.second-story.md', 'Approved', 'Second Story');
      createTestStory('1.3.third-story.md', 'InProgress', 'Third Story');
      createTestStory('1.4.fourth-story.md', 'Review', 'Fourth Story');

      const status = getEpicStatus(storyDir, '1');
      
      expect(status.totalStories).toBe(4);
      expect(status.completedStories).toBe(1);
      expect(status.pendingStories).toBe(1);
      expect(status.inProgressStories).toBe(2); // InProgress + Review
      expect(status.isComplete).toBe(false);
    });

    test('should mark epic as complete when all stories are done', () => {
      createTestStory('1.1.first-story.md', 'Done', 'First Story');
      createTestStory('1.2.second-story.md', 'Done', 'Second Story');

      const status = getEpicStatus(storyDir, '1');
      
      expect(status.isComplete).toBe(true);
      expect(status.completedStories).toBe(2);
      expect(status.totalStories).toBe(2);
    });

    test('should handle empty epic', () => {
      const status = getEpicStatus(storyDir, '999');
      
      expect(status.totalStories).toBe(0);
      expect(status.isComplete).toBe(false);
    });
  });

  describe('Epic Loop Integration', () => {
    beforeEach(() => {
      // Mock inquirer responses
      const inquirer = require('inquirer');
      inquirer.prompt = jest.fn();
    });

    test('should process approved stories in epic sequentially', async () => {
      // Create test epic with multiple approved stories
      createTestStory('1.1.first-story.md', 'Approved', 'First Story');
      createTestStory('1.2.second-story.md', 'Approved', 'Second Story');
      createTestStory('1.3.third-story.md', 'Done', 'Third Story'); // Already done

      // Mock the orchestrator initialization
      orchestrator.initialize = jest.fn().mockResolvedValue();
      orchestrator.resolvedPaths = { storyLocation: storyDir };
      orchestrator.config = { verbosity: false };
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

      // Mock the Dev-QA workflow execution
      orchestrator.executeDevQAWorkflow = jest.fn().mockResolvedValue({
        qaResult: { approved: true },
        iterations: 1
      });

      // Mock the SM agent work
      orchestrator.simulateAgentWork = jest.fn().mockResolvedValue({
        success: true,
        approved: true,
        validationChecks: [],
        recommendations: []
      });

      const result = await orchestrator.executeEpicLoop('1', 'linear');

      expect(result.processedStories).toBe(2); // Should process the 2 approved stories
      expect(result.epicCompleted).toBe(true);
      expect(orchestrator.executeDevQAWorkflow).toHaveBeenCalledTimes(2);
    });

    test('should handle story processing failures gracefully', async () => {
      createTestStory('1.1.first-story.md', 'Approved', 'First Story');
      createTestStory('1.2.second-story.md', 'Approved', 'Second Story');

      orchestrator.initialize = jest.fn().mockResolvedValue();
      orchestrator.resolvedPaths = { storyLocation: storyDir };
      orchestrator.config = { verbosity: false };
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

      // Mock first story to fail, second to succeed
      orchestrator.executeDevQAWorkflow = jest.fn()
        .mockRejectedValueOnce(new Error('Simulated failure'))
        .mockResolvedValueOnce({
          qaResult: { approved: true },
          iterations: 1
        });

      orchestrator.simulateAgentWork = jest.fn().mockResolvedValue({
        success: true,
        approved: true
      });

      const result = await orchestrator.executeEpicLoop('1', 'linear');

      // Should continue processing despite first story failure
      expect(result.processedStories).toBe(1); // Only second story succeeded
      expect(orchestrator.executeDevQAWorkflow).toHaveBeenCalledTimes(4); // 3 attempts for first story + 1 for second
    });

    test('should terminate epic loop on max iterations', async () => {
      // Create a story that will keep failing
      createTestStory('1.1.failing-story.md', 'Approved', 'Failing Story');

      orchestrator.initialize = jest.fn().mockResolvedValue();
      orchestrator.resolvedPaths = { storyLocation: storyDir };
      orchestrator.config = { verbosity: false };
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

      // Always fail the Dev-QA workflow to trigger retries
      orchestrator.executeDevQAWorkflow = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      orchestrator.simulateAgentWork = jest.fn().mockResolvedValue({
        success: true,
        approved: true
      });

      const result = await orchestrator.executeEpicLoop('1', 'linear');

      // Should eventually terminate
      expect(result.epicCompleted).toBe(false);
    });
  });

  describe('Atomic File Operations', () => {
    test('should update story status atomically', async () => {
      const storyFile = path.join(storyDir, '1.1.test-story.md');
      createTestStory('1.1.test-story.md', 'Approved', 'Test Story');

      orchestrator.resolvedPaths = { storyLocation: storyDir };
      orchestrator.logger = { 
        taskStart: jest.fn(),
        taskComplete: jest.fn(),
        error: jest.fn()
      };

      await orchestrator.updateStoryStatus(storyFile, 'InProgress');

      const content = fs.readFileSync(storyFile, 'utf8');
      expect(content).toContain('## Status\nInProgress');
    });

    test('should restore from backup on atomic update failure', async () => {
      const storyFile = path.join(storyDir, '1.1.test-story.md');
      createTestStory('1.1.test-story.md', 'Approved', 'Test Story');

      orchestrator.resolvedPaths = { storyLocation: storyDir };
      orchestrator.logger = { 
        taskStart: jest.fn(),
        taskComplete: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
      };

      // Mock fs.promises.rename to fail
      const originalRename = fs.promises.rename;
      fs.promises.rename = jest.fn().mockRejectedValue(new Error('Simulated rename failure'));

      try {
        await orchestrator.updateStoryStatus(storyFile, 'InProgress');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Atomic status update failed');
      }

      // Verify original content is preserved
      const content = fs.readFileSync(storyFile, 'utf8');
      expect(content).toContain('## Status\nApproved');

      // Restore original rename function
      fs.promises.rename = originalRename;
    });
  });

  // Helper function to create test story files
  function createTestStory(filename, status, title) {
    const storyContent = `---
StoryContract:
  title: "${title}"
  description: "Test story for epic loop functionality"
---

# ${title}

## Description
This is a test story for validating epic loop functionality.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Status
${status}
`;
    fs.writeFileSync(path.join(storyDir, filename), storyContent);
  }
});
