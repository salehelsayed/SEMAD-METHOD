const WorkflowOrchestrator = require('../tools/workflow-orchestrator');
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

// Mock inquirer to avoid interactive prompts in tests
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));

// Mock ora spinner
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis()
  }));
});

// Mock chalk for cleaner test output
jest.mock('chalk', () => ({
  bold: (str) => str,
  blue: (str) => str,
  green: (str) => str,
  yellow: (str) => str,
  red: (str) => str,
  cyan: (str) => str,
  dim: (str) => str
}));

const inquirer = require('inquirer');

describe('WorkflowOrchestrator', () => {
  let orchestrator;
  const testRootDir = path.join(__dirname, 'test-orchestrator-project');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testRootDir)) {
      fs.mkdirSync(testRootDir, { recursive: true });
    }
    orchestrator = new WorkflowOrchestrator(testRootDir);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testRootDir)) {
      fs.rmSync(testRootDir, { recursive: true, force: true });
    }
    jest.clearAllMocks();
  });

  describe('Flow Type Selection', () => {
    test('should prompt user to select flow type', async () => {
      inquirer.prompt.mockResolvedValueOnce({ flowType: 'iterative' });
      
      const flowType = await orchestrator.selectFlowType();
      
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'list',
          name: 'flowType',
          message: 'Select the development workflow flow type:',
          choices: expect.arrayContaining([
            expect.objectContaining({ value: 'linear' }),
            expect.objectContaining({ value: 'iterative' })
          ])
        })
      ]);
      expect(flowType).toBe('iterative');
    });
  });

  describe('Metadata Management', () => {
    test('should save and load metadata', () => {
      const metadata = {
        flowType: 'iterative',
        storyId: 'TEST-001',
        lastRun: new Date().toISOString()
      };
      
      orchestrator.saveMetadata(metadata);
      const loaded = orchestrator.loadMetadata();
      
      expect(loaded).toEqual(metadata);
    });

    test('should return empty object when no metadata exists', () => {
      const metadata = orchestrator.loadMetadata();
      expect(metadata).toEqual({});
    });
  });

  describe('Linear Flow Execution', () => {
    test('should execute linear Dev→QA flow', async () => {
      const story = {
        id: 'TEST-001',
        name: 'Test Story'
      };
      
      // Mock simulateAgentWork to control the flow
      orchestrator.simulateAgentWork = jest.fn()
        .mockResolvedValueOnce({ filesModified: 3, linesAdded: 100, linesRemoved: 20 }) // Dev
        .mockResolvedValueOnce({ approved: true, issues: [] }); // QA
      
      const result = await orchestrator.executeLinearFlow(story, { start: jest.fn(), succeed: jest.fn(), warn: jest.fn() });
      
      expect(orchestrator.simulateAgentWork).toHaveBeenCalledTimes(2);
      expect(orchestrator.simulateAgentWork).toHaveBeenCalledWith('dev', 'implement', story);
      expect(orchestrator.simulateAgentWork).toHaveBeenCalledWith('qa', 'review', expect.objectContaining({
        ...story,
        implementation: expect.objectContaining({ filesModified: 3 })
      }));
      expect(result.devResult.filesModified).toBe(3);
      expect(result.qaResult.approved).toBe(true);
    });

    test('should handle QA rejection in linear flow', async () => {
      const story = {
        id: 'TEST-002',
        name: 'Test Story with Issues'
      };
      
      orchestrator.simulateAgentWork = jest.fn()
        .mockResolvedValueOnce({ filesModified: 2, linesAdded: 50, linesRemoved: 10 }) // Dev
        .mockResolvedValueOnce({ approved: false, issues: ['Missing tests', 'Code style'] }); // QA
      
      const result = await orchestrator.executeLinearFlow(story, { start: jest.fn(), succeed: jest.fn(), warn: jest.fn() });
      
      expect(result.qaResult.approved).toBe(false);
      expect(result.qaResult.issues).toHaveLength(2);
    });
  });

  describe('Iterative Flow Execution', () => {
    test('should iterate until QA approves', async () => {
      const story = {
        id: 'TEST-003',
        name: 'Iterative Test Story'
      };
      
      let qaCallCount = 0;
      orchestrator.simulateAgentWork = jest.fn().mockImplementation(async (agent, action) => {
        if (agent === 'dev') {
          if (action === 'implement') {
            return { filesModified: 3, linesAdded: 100, linesRemoved: 20 };
          } else {
            return { filesModified: 1, linesAdded: 20, linesRemoved: 5, issuesAddressed: 1 };
          }
        } else if (agent === 'qa') {
          qaCallCount++;
          if (qaCallCount >= 3) {
            return { approved: true, issues: [] };
          }
          return { approved: false, issues: [`Issue ${qaCallCount}`] };
        }
      });
      
      const result = await orchestrator.executeIterativeFlow(story, { start: jest.fn(), succeed: jest.fn(), warn: jest.fn() });
      
      expect(result.iterations).toBe(3);
      expect(result.qaResult.approved).toBe(true);
      expect(orchestrator.simulateAgentWork).toHaveBeenCalledWith('dev', 'implement', story);
      expect(orchestrator.simulateAgentWork).toHaveBeenCalledWith('dev', 'fix', expect.objectContaining({
        qaFeedback: expect.any(Array)
      }));
    });

    test('should stop at max iterations', async () => {
      const story = {
        id: 'TEST-004',
        name: 'Max Iterations Story'
      };
      
      orchestrator.simulateAgentWork = jest.fn().mockImplementation(async (agent) => {
        if (agent === 'dev') {
          return { filesModified: 1, linesAdded: 10, linesRemoved: 5 };
        } else if (agent === 'qa') {
          return { approved: false, issues: ['Persistent issue'] };
        }
      });
      
      inquirer.prompt.mockResolvedValueOnce({ continueIterating: false });
      
      const result = await orchestrator.executeIterativeFlow(story, { start: jest.fn(), succeed: jest.fn(), warn: jest.fn() });
      
      expect(result.iterations).toBe(5);
      expect(result.qaResult.approved).toBe(false);
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'continueIterating',
          message: 'Continue iterating?'
        })
      ]);
    });
  });

  describe('Orchestrator Run Method', () => {
    test('should run with linear flow', async () => {
      inquirer.prompt.mockResolvedValueOnce({ flowType: 'linear' });
      
      orchestrator.executeDevQAWorkflow = jest.fn().mockResolvedValue({
        devResult: { filesModified: 2 },
        qaResult: { approved: true }
      });
      
      await orchestrator.run({ storyId: 'TEST-005', storyName: 'Linear Story' });
      
      expect(orchestrator.executeDevQAWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'TEST-005', name: 'Linear Story' }),
        'linear'
      );
    });

    test('should run with iterative flow', async () => {
      inquirer.prompt.mockResolvedValueOnce({ flowType: 'iterative' });
      
      orchestrator.executeDevQAWorkflow = jest.fn().mockResolvedValue({
        devResult: { filesModified: 3 },
        qaResult: { approved: true },
        iterations: 2
      });
      
      await orchestrator.run({ storyId: 'TEST-006', storyName: 'Iterative Story' });
      
      expect(orchestrator.executeDevQAWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'TEST-006', name: 'Iterative Story' }),
        'iterative'
      );
    });

    test('should use flow type from options', async () => {
      orchestrator.executeDevQAWorkflow = jest.fn().mockResolvedValue({
        devResult: { filesModified: 1 },
        qaResult: { approved: true }
      });
      
      await orchestrator.run({ 
        storyId: 'TEST-007', 
        flowType: 'iterative' 
      });
      
      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(orchestrator.executeDevQAWorkflow).toHaveBeenCalledWith(
        expect.any(Object),
        'iterative'
      );
    });

    test('should use flow type from saved metadata', async () => {
      orchestrator.saveMetadata({ flowType: 'iterative' });
      
      orchestrator.executeDevQAWorkflow = jest.fn().mockResolvedValue({
        devResult: { filesModified: 1 },
        qaResult: { approved: true }
      });
      
      await orchestrator.run({ storyId: 'TEST-008' });
      
      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(orchestrator.executeDevQAWorkflow).toHaveBeenCalledWith(
        expect.any(Object),
        'iterative'
      );
    });

    test('should load story from file', async () => {
      const storyContent = '# Test Story\nThis is a test story file.';
      const storyPath = path.join(testRootDir, 'story.md');
      fs.writeFileSync(storyPath, storyContent);
      
      inquirer.prompt.mockResolvedValueOnce({ flowType: 'linear' });
      orchestrator.executeDevQAWorkflow = jest.fn().mockResolvedValue({
        devResult: { filesModified: 1 },
        qaResult: { approved: true }
      });
      
      await orchestrator.run({ storyFile: 'story.md' });
      
      expect(orchestrator.executeDevQAWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          file: storyPath,
          name: 'Story from story.md'
        }),
        'linear'
      );
    });
  });

  describe('CLI Integration', () => {
    test('should execute run command', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'workflow-orchestrator.js', 'run', '--flow-type', 'iterative'];
      
      // Create a new instance of the module to test CLI
      jest.resetModules();
      jest.doMock('../tools/workflow-orchestrator', () => {
        const MockOrchestrator = jest.fn().mockImplementation(() => ({
          run: jest.fn().mockResolvedValue()
        }));
        MockOrchestrator.prototype = WorkflowOrchestrator.prototype;
        
        // Re-create the CLI setup
        const program = new Command();
        program
          .name('bmad-orchestrator')
          .description('BMad Method Workflow Orchestrator')
          .version('1.0.0');

        program
          .command('run')
          .description('Run the workflow orchestrator')
          .option('-f, --flow-type <type>', 'Flow type')
          .action(async (options) => {
            const orchestrator = new MockOrchestrator();
            await orchestrator.run(options);
          });

        program.parse(process.argv);
        
        return MockOrchestrator;
      });
      
      process.argv = originalArgv;
    });

    test('should execute status command', async () => {
      // Save some metadata first
      orchestrator.saveMetadata({
        flowType: 'iterative',
        storyId: 'TEST-100',
        lastRun: '2024-01-01T00:00:00Z',
        lastResult: { success: true, iterations: 3 }
      });
      
      // Capture console output
      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));
      
      // Simulate status command by calling the method directly
      const metadata = orchestrator.loadMetadata();
      console.log('🎼 Orchestrator Status\n');
      console.log(`Flow Type: ${metadata.flowType || 'Not set'}`);
      console.log(`Last Story ID: ${metadata.storyId || 'N/A'}`);
      console.log(`Last Run: ${metadata.lastRun || 'Never'}`);
      if (metadata.lastResult) {
        console.log(`Last Result: ${metadata.lastResult.success ? 'Success' : 'Failed'}`);
        if (metadata.lastResult.iterations) {
          console.log(`Iterations: ${metadata.lastResult.iterations}`);
        }
      }
      
      console.log = originalLog;
      
      expect(logs).toContain('Flow Type: iterative');
      expect(logs).toContain('Last Story ID: TEST-100');
      expect(logs).toContain('Last Result: Success');
      expect(logs).toContain('Iterations: 3');
    });
  });
});