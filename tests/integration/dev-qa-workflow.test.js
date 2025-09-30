/**
 * Integration Tests for Dev↔QA Workflow
 * 
 * Tests the complete feedback loop between Dev and QA agents,
 * including permissions enforcement and iterative improvements.
 */

const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const WorkflowExecutor = require('../../semad-core/utils/workflow-executor');
const AgentPermissionsValidator = require('../../semad-core/utils/agent-permissions');

describe('Dev↔QA Workflow Integration', () => {
  let workflowExecutor;
  let permissionsValidator;
  let rootDir;
  let testStoryPath;
  
  beforeEach(async () => {
    rootDir = path.join(__dirname, '../..');
    workflowExecutor = new WorkflowExecutor(rootDir, { flowType: 'iterative' });
    permissionsValidator = new AgentPermissionsValidator();
    
    // Create a test story file
    testStoryPath = path.join(rootDir, 'tests', 'fixtures', 'test-story.yaml');
    await createTestStory(testStoryPath);
  });
  
  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink(testStoryPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });
  
  describe('Permission Enforcement', () => {
    it('should prevent QA agent from modifying code files', () => {
      const validation = permissionsValidator.validateFileModification('qa', '/src/index.js');
      expect(validation.allowed).toBe(false);
      expect(validation.reason).toContain('read-only permissions');
    });
    
    it('should allow QA agent to update QA Results section', () => {
      const validation = permissionsValidator.validateStorySectionModification('qa', 'qa-results');
      expect(validation.allowed).toBe(true);
    });
    
    it('should prevent QA agent from updating Dev sections', () => {
      const validation = permissionsValidator.validateStorySectionModification('qa', 'dev-agent-record');
      expect(validation.allowed).toBe(false);
      expect(validation.reason).toContain('NOT allowed');
    });
    
    it('should allow Dev agent to modify code files', () => {
      const validation = permissionsValidator.validateFileModification('dev', '/src/feature.js');
      expect(validation.allowed).toBe(true);
    });
    
    it('should allow Dev agent to update task checkboxes', () => {
      const validation = permissionsValidator.validateStorySectionModification('dev', 'tasks-subtasks');
      expect(validation.allowed).toBe(true);
    });
  });
  
  describe('Iterative Flow Execution', () => {
    it('should execute initial Dev implementation', async () => {
      const context = {
        story: { id: 'test-1', title: 'Test Story' }
      };
      
      // Mock callbacks
      const devCallback = jest.fn(async (step, ctx) => ({
        filesModified: ['src/feature.js'],
        testsWritten: ['tests/feature.test.js'],
        success: true
      }));
      
      const qaCallback = jest.fn(async (step, ctx) => ({
        approved: false,
        issues: ['Missing error handling', 'Test coverage below threshold'],
        recommendations: [
          { issue: 'Missing error handling', action: 'Add try-catch blocks', priority: 'high' },
          { issue: 'Test coverage below threshold', action: 'Add unit tests', priority: 'medium' }
        ]
      }));
      
      workflowExecutor.callbacks = {
        dev: devCallback,
        qa: qaCallback
      };
      
      // Execute workflow
      const result = await workflowExecutor.execute('development-flow', context);
      
      // Verify Dev was called
      expect(devCallback).toHaveBeenCalledTimes(1);
      expect(devCallback.mock.calls[0][0].agent).toBe('dev');
      
      // Verify QA was called
      expect(qaCallback).toHaveBeenCalledTimes(1);
      expect(qaCallback.mock.calls[0][0].agent).toBe('qa');
    });
    
    it('should iterate when QA finds issues', async () => {
      const context = {
        story: { id: 'test-2', title: 'Test Story with Issues' }
      };
      
      let devCallCount = 0;
      let qaCallCount = 0;
      
      // Mock callbacks with iteration logic
      const devCallback = jest.fn(async (step, ctx) => {
        devCallCount++;
        return {
          filesModified: ['src/feature.js'],
          iteration: devCallCount,
          fixedIssues: ctx.qaFeedback ? ctx.qaFeedback.issues : []
        };
      });
      
      const qaCallback = jest.fn(async (step, ctx) => {
        qaCallCount++;
        // Approve on second review
        const approved = qaCallCount > 1;
        return {
          approved,
          issues: approved ? [] : ['Missing validation'],
          iteration: qaCallCount
        };
      });
      
      workflowExecutor.callbacks = {
        dev: devCallback,
        qa: qaCallback
      };
      
      // Execute workflow
      const result = await workflowExecutor.execute('development-flow', context);
      
      // Verify multiple iterations occurred
      expect(devCallCount).toBeGreaterThanOrEqual(2);
      expect(qaCallCount).toBeGreaterThanOrEqual(2);

      const devSecondCall = devCallback.mock.calls[1];
      expect(devSecondCall[1]).toHaveProperty('qaFeedback');
      expect(devSecondCall[1].qaFeedback.issues).toContain('Missing validation');
    });
    
    it('should stop after maximum iterations', async () => {
      const context = {
        story: { id: 'test-3', title: 'Test Story - Max Iterations' }
      };
      
      // Mock callbacks - QA never approves
      const devCallback = jest.fn(async () => ({ success: true }));
      const qaCallback = jest.fn(async () => ({
        approved: false,
        issues: ['Persistent issue']
      }));
      
      workflowExecutor.callbacks = {
        dev: devCallback,
        qa: qaCallback
      };
      workflowExecutor.maxIterations = 3;
      
      // Execute workflow
      const result = await workflowExecutor.execute('development-flow', context);
      
      // Verify it stopped at max iterations
      expect(devCallback.mock.calls.length).toBeLessThanOrEqual(3);
      expect(qaCallback.mock.calls.length).toBeLessThanOrEqual(3);
    });
  });
  
  describe('Secure File Operations', () => {
    it('should provide secure file operations for QA agent', async () => {
      const qaOps = workflowExecutor.getSecureFileOperations('qa');
      
      // Test read operation (should succeed)
      const testFilePath = path.join(rootDir, 'tests', 'fixtures', 'test-read.txt');
      await fs.writeFile(testFilePath, 'test content');
      
      const content = qaOps.readFile(testFilePath);
      expect(content).toBe('test content');
      
      // Test write operation (should fail)
      expect(() => {
        qaOps.writeFile(testFilePath, 'modified content');
      }).toThrow('Permission denied');
      
      // Clean up
      await fs.unlink(testFilePath);
    });
    
    it('should allow Dev agent to write files', async () => {
      const devOps = workflowExecutor.getSecureFileOperations('dev');
      
      const testFilePath = path.join(rootDir, 'tests', 'fixtures', 'test-write.txt');
      
      // Test write operation (should succeed)
      devOps.writeFile(testFilePath, 'dev content');
      
      const content = await fs.readFile(testFilePath, 'utf8');
      expect(content).toBe('dev content');
      
      // Clean up
      await fs.unlink(testFilePath);
    });
  });
  
  describe('Story File Updates', () => {
    it('should allow QA to update only permitted sections', async () => {
      const qaOps = workflowExecutor.getSecureFileOperations('qa');
      
      // Test updating QA Results section (should succeed)
      expect(() => {
        qaOps.modifyStorySection(testStoryPath, 'qa-results', '## QA Results\nReview completed');
      }).not.toThrow();
      
      // Test updating Dev section (should fail)
      expect(() => {
        qaOps.modifyStorySection(testStoryPath, 'dev-agent-record', 'Should not work');
      }).toThrow('Permission denied');
    });
    
    it('should track Dev and QA updates separately', async () => {
      const devOps = workflowExecutor.getSecureFileOperations('dev');
      const qaOps = workflowExecutor.getSecureFileOperations('qa');
      
      // Dev updates their section
      devOps.modifyStorySection(testStoryPath, 'dev-agent-record', '## Dev Notes\nImplementation complete');
      
      // QA updates their section
      qaOps.modifyStorySection(testStoryPath, 'qa-results', '## QA Results\nNeeds fixes');
      
      // Verify both updates are present
      const storyContent = await fs.readFile(testStoryPath, 'utf8');
      const story = yaml.load(storyContent);
      
      const devSection = story.sections.find(s => s.id === 'dev-agent-record');
      const qaSection = story.sections.find(s => s.id === 'qa-results');
      
      expect(devSection.content).toContain('Implementation complete');
      expect(qaSection.content).toContain('Needs fixes');
    });
  });
});

/**
 * Helper function to create a test story file
 */
async function createTestStory(filePath) {
  const story = {
    StoryContract: {
      version: '1.0',
      story_id: 'test-1',
      epic_id: 'test-epic'
    },
    sections: [
      { id: 'story', content: 'Test story content' },
      { id: 'tasks-subtasks', content: '- [ ] Task 1\n- [ ] Task 2' },
      { id: 'dev-agent-record', content: '' },
      { id: 'qa-results', content: '' },
      { id: 'status', content: 'In Progress' }
    ]
  };
  
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, yaml.dump(story));
}
