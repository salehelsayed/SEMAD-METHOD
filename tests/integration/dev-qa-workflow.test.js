/**
 * Integration Tests for Dev↔QA Workflow
 * 
 * Tests the complete feedback loop between Dev and QA agents,
 * including permissions enforcement and iterative improvements.
 */

const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const WorkflowExecutor = require('../../bmad-core/utils/workflow-executor');
const AgentPermissionsValidator = require('../../bmad-core/utils/agent-permissions');
const { expect } = require('chai');
const sinon = require('sinon');

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
      expect(validation.allowed).to.be.false;
      expect(validation.reason).to.include('read-only permissions');
    });
    
    it('should allow QA agent to update QA Results section', () => {
      const validation = permissionsValidator.validateStorySectionModification('qa', 'qa-results');
      expect(validation.allowed).to.be.true;
    });
    
    it('should prevent QA agent from updating Dev sections', () => {
      const validation = permissionsValidator.validateStorySectionModification('qa', 'dev-agent-record');
      expect(validation.allowed).to.be.false;
      expect(validation.reason).to.include('NOT allowed');
    });
    
    it('should allow Dev agent to modify code files', () => {
      const validation = permissionsValidator.validateFileModification('dev', '/src/feature.js');
      expect(validation.allowed).to.be.true;
    });
    
    it('should allow Dev agent to update task checkboxes', () => {
      const validation = permissionsValidator.validateStorySectionModification('dev', 'tasks-subtasks');
      expect(validation.allowed).to.be.true;
    });
  });
  
  describe('Iterative Flow Execution', () => {
    it('should execute initial Dev implementation', async () => {
      const context = {
        story: { id: 'test-1', title: 'Test Story' }
      };
      
      // Mock callbacks
      const devCallback = sinon.spy(async (step, ctx) => ({
        filesModified: ['src/feature.js'],
        testsWritten: ['tests/feature.test.js'],
        success: true
      }));
      
      const qaCallback = sinon.spy(async (step, ctx) => ({
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
      expect(devCallback.calledOnce).to.be.true;
      expect(devCallback.firstCall.args[0].agent).to.equal('dev');
      
      // Verify QA was called
      expect(qaCallback.calledOnce).to.be.true;
      expect(qaCallback.firstCall.args[0].agent).to.equal('qa');
    });
    
    it('should iterate when QA finds issues', async () => {
      const context = {
        story: { id: 'test-2', title: 'Test Story with Issues' }
      };
      
      let devCallCount = 0;
      let qaCallCount = 0;
      
      // Mock callbacks with iteration logic
      const devCallback = sinon.spy(async (step, ctx) => {
        devCallCount++;
        return {
          filesModified: ['src/feature.js'],
          iteration: devCallCount,
          fixedIssues: ctx.qaFeedback ? ctx.qaFeedback.issues : []
        };
      });
      
      const qaCallback = sinon.spy(async (step, ctx) => {
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
      expect(devCallCount).to.be.at.least(2);
      expect(qaCallCount).to.be.at.least(2);
      
      // Verify QA feedback was passed to Dev
      const devSecondCall = devCallback.getCall(1);
      expect(devSecondCall.args[1]).to.have.property('qaFeedback');
      expect(devSecondCall.args[1].qaFeedback.issues).to.include('Missing validation');
    });
    
    it('should stop after maximum iterations', async () => {
      const context = {
        story: { id: 'test-3', title: 'Test Story - Max Iterations' }
      };
      
      // Mock callbacks - QA never approves
      const devCallback = sinon.spy(async () => ({ success: true }));
      const qaCallback = sinon.spy(async () => ({
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
      expect(devCallback.callCount).to.be.at.most(3);
      expect(qaCallback.callCount).to.be.at.most(3);
    });
  });
  
  describe('Secure File Operations', () => {
    it('should provide secure file operations for QA agent', async () => {
      const qaOps = workflowExecutor.getSecureFileOperations('qa');
      
      // Test read operation (should succeed)
      const testFilePath = path.join(rootDir, 'tests', 'fixtures', 'test-read.txt');
      await fs.writeFile(testFilePath, 'test content');
      
      const content = qaOps.readFile(testFilePath);
      expect(content).to.equal('test content');
      
      // Test write operation (should fail)
      expect(() => {
        qaOps.writeFile(testFilePath, 'modified content');
      }).to.throw('Permission denied');
      
      // Clean up
      await fs.unlink(testFilePath);
    });
    
    it('should allow Dev agent to write files', async () => {
      const devOps = workflowExecutor.getSecureFileOperations('dev');
      
      const testFilePath = path.join(rootDir, 'tests', 'fixtures', 'test-write.txt');
      
      // Test write operation (should succeed)
      devOps.writeFile(testFilePath, 'dev content');
      
      const content = await fs.readFile(testFilePath, 'utf8');
      expect(content).to.equal('dev content');
      
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
      }).to.not.throw();
      
      // Test updating Dev section (should fail)
      expect(() => {
        qaOps.modifyStorySection(testStoryPath, 'dev-agent-record', 'Should not work');
      }).to.throw('Permission denied');
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
      
      expect(devSection.content).to.include('Implementation complete');
      expect(qaSection.content).to.include('Needs fixes');
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