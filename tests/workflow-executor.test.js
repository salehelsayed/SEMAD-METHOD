const WorkflowExecutor = require('../bmad-core/utils/workflow-executor');
const WorkflowConfigLoader = require('../bmad-core/utils/workflow-config-loader');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

// Mock the error handler
jest.mock('../bmad-core/utils/error-handler', () => ({
  handle: jest.fn(),
  warn: jest.fn()
}));

// Mock the workflow monitor
jest.mock('../bmad-core/utils/workflow-monitor', () => {
  return jest.fn().mockImplementation(() => ({
    monitorExecution: jest.fn().mockResolvedValue({
      status: 'success',
      warnings: [],
      errors: []
    })
  }));
});

describe('WorkflowExecutor', () => {
  let executor;
  const testRootDir = path.join(__dirname, 'test-project');
  const workflowsDir = path.join(testRootDir, 'bmad-core', 'workflows');

  beforeEach(async () => {
    // Create test directory structure
    await fs.mkdir(workflowsDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  describe('Flow Type Selection', () => {
    test('should default to linear flow', () => {
      executor = new WorkflowExecutor(testRootDir);
      expect(executor.flowType).toBe('linear');
    });

    test('should accept iterative flow type', () => {
      executor = new WorkflowExecutor(testRootDir, { flowType: 'iterative' });
      expect(executor.flowType).toBe('iterative');
    });
  });

  describe('Linear Flow Execution', () => {
    beforeEach(async () => {
      executor = new WorkflowExecutor(testRootDir, { flowType: 'linear' });
      
      // Create a test workflow with Dev→QA steps
      const workflow = {
        workflow: {
          id: 'test-workflow',
          name: 'Test Workflow',
          sequence: [
            { agent: 'sm', action: 'create_story' },
            { agent: 'dev', action: 'implement_story', creates: 'implementation_files' },
            { agent: 'qa', action: 'review_implementation' }
          ]
        }
      };
      
      await fs.writeFile(
        path.join(workflowsDir, 'test-workflow.yaml'),
        yaml.dump(workflow)
      );
    });

    test('should execute Dev then QA once in linear flow', async () => {
      const devCallback = jest.fn().mockResolvedValue({ filesModified: 5 });
      const qaCallback = jest.fn().mockResolvedValue({ approved: false, issues: ['Test issue'] });
      
      executor.callbacks = {
        dev: devCallback,
        qa: qaCallback,
        sm: jest.fn().mockResolvedValue({ storyCreated: true })
      };

      const result = await executor.execute('test-workflow');

      expect(result.success).toBe(true);
      expect(result.flowType).toBe('linear');
      expect(devCallback).toHaveBeenCalledTimes(1);
      expect(qaCallback).toHaveBeenCalledTimes(1);
      expect(result.devResult).toBeDefined();
      expect(result.qaResult).toBeDefined();
      expect(result.qaResult.data.approved).toBe(false);
    });

    test('should not loop in linear flow even with QA failures', async () => {
      const devCallback = jest.fn().mockResolvedValue({ filesModified: 3 });
      const qaCallback = jest.fn().mockResolvedValue({ approved: false, issues: ['Issue 1', 'Issue 2'] });
      
      executor.callbacks = {
        dev: devCallback,
        qa: qaCallback,
        sm: jest.fn().mockResolvedValue({ storyCreated: true })
      };

      const result = await executor.execute('test-workflow');

      expect(devCallback).toHaveBeenCalledTimes(1);
      expect(qaCallback).toHaveBeenCalledTimes(1);
      expect(result.flowType).toBe('linear');
    });
  });

  describe('Iterative Flow Execution', () => {
    beforeEach(async () => {
      executor = new WorkflowExecutor(testRootDir, { 
        flowType: 'iterative',
        maxIterations: 3
      });
      
      // Create a test workflow with Dev↔QA loop
      const workflow = {
        workflow: {
          id: 'test-workflow',
          name: 'Test Workflow',
          sequence: [
            { agent: 'sm', action: 'create_story' },
            { agent: 'dev', action: 'implement_story', creates: 'implementation_files' },
            { agent: 'qa', action: 'review_implementation' },
            { agent: 'dev', action: 'address_qa_feedback', condition: 'qa_left_unchecked_items' }
          ]
        }
      };
      
      await fs.writeFile(
        path.join(workflowsDir, 'test-workflow.yaml'),
        yaml.dump(workflow)
      );
    });

    test('should loop until QA approves in iterative flow', async () => {
      let qaCallCount = 0;
      const devCallback = jest.fn().mockResolvedValue({ filesModified: 3 });
      const qaCallback = jest.fn().mockImplementation(async () => {
        qaCallCount++;
        // Approve on third iteration
        if (qaCallCount >= 3) {
          return { approved: true, issues: [] };
        }
        return { approved: false, issues: [`Issue ${qaCallCount}`] };
      });
      
      executor.callbacks = {
        dev: devCallback,
        qa: qaCallback,
        sm: jest.fn().mockResolvedValue({ storyCreated: true })
      };

      const result = await executor.execute('test-workflow');

      expect(result.success).toBe(true);
      expect(result.flowType).toBe('iterative');
      expect(result.qaApproved).toBe(true);
      expect(result.totalIterations).toBe(3);
      expect(devCallback).toHaveBeenCalledTimes(3); // Initial + 2 fixes
      expect(qaCallback).toHaveBeenCalledTimes(3);
    });

    test('should stop at max iterations if not approved', async () => {
      const devCallback = jest.fn().mockResolvedValue({ filesModified: 2 });
      const qaCallback = jest.fn().mockResolvedValue({ 
        approved: false, 
        issues: ['Persistent issue'] 
      });
      
      executor.callbacks = {
        dev: devCallback,
        qa: qaCallback,
        sm: jest.fn().mockResolvedValue({ storyCreated: true })
      };

      const result = await executor.execute('test-workflow');

      expect(result.flowType).toBe('iterative');
      expect(result.qaApproved).toBe(false);
      expect(result.totalIterations).toBe(3); // maxIterations
      expect(devCallback).toHaveBeenCalledTimes(3);
      expect(qaCallback).toHaveBeenCalledTimes(3);
    });

    test('should call onMaxIterationsReached callback when limit hit', async () => {
      const onMaxIterationsReached = jest.fn().mockResolvedValue(false);
      
      executor = new WorkflowExecutor(testRootDir, { 
        flowType: 'iterative',
        maxIterations: 2,
        callbacks: {
          onMaxIterationsReached
        }
      });

      const devCallback = jest.fn().mockResolvedValue({ filesModified: 1 });
      const qaCallback = jest.fn().mockResolvedValue({ 
        approved: false, 
        issues: ['Issue'] 
      });
      
      executor.callbacks.dev = devCallback;
      executor.callbacks.qa = qaCallback;
      executor.callbacks.sm = jest.fn().mockResolvedValue({ storyCreated: true });

      const result = await executor.execute('test-workflow');

      expect(onMaxIterationsReached).toHaveBeenCalledWith(2, ['Issue']);
      expect(result.totalIterations).toBe(2);
    });

    test('should pass iteration context to agents', async () => {
      const devCallback = jest.fn().mockResolvedValue({ filesModified: 1 });
      const qaCallback = jest.fn().mockResolvedValue({ approved: true, issues: [] });
      
      executor.callbacks = {
        dev: devCallback,
        qa: qaCallback,
        sm: jest.fn().mockResolvedValue({ storyCreated: true })
      };

      await executor.execute('test-workflow');

      // Check QA was called with iteration context
      const qaCall = qaCallback.mock.calls[0];
      expect(qaCall[1]).toHaveProperty('iteration', 1);
      expect(qaCall[1]).toHaveProperty('devImplementation');
    });
  });

  describe('Workflow Detection', () => {
    test('should detect Dev↔QA workflow correctly', () => {
      executor = new WorkflowExecutor(testRootDir);
      
      const workflow = {
        sequence: [
          { agent: 'dev', action: 'implement_story' },
          { agent: 'qa', action: 'review_implementation' }
        ]
      };
      
      expect(executor.isDevQAWorkflow(workflow)).toBe(true);
    });

    test('should detect non-Dev↔QA workflow', () => {
      executor = new WorkflowExecutor(testRootDir);
      
      const workflow = {
        sequence: [
          { agent: 'analyst', action: 'create_prd' },
          { agent: 'architect', action: 'create_architecture' }
        ]
      };
      
      expect(executor.isDevQAWorkflow(workflow)).toBe(false);
    });
  });
});

describe('WorkflowConfigLoader', () => {
  let configLoader;
  const testRootDir = path.join(__dirname, 'test-config-project');

  beforeEach(async () => {
    await fs.mkdir(testRootDir, { recursive: true });
    configLoader = new WorkflowConfigLoader(testRootDir);
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  describe('Configuration Loading', () => {
    test('should load default config when no file exists', async () => {
      const config = await configLoader.loadConfig();
      
      expect(config.flowType).toBe('linear');
      expect(config.maxIterations).toBe(5);
      expect(config.autoApproveOnNoIssues).toBe(true);
    });

    test('should load YAML config file', async () => {
      const testConfig = {
        flowType: 'iterative',
        maxIterations: 10
      };
      
      await fs.writeFile(
        path.join(testRootDir, '.bmad-workflow.yaml'),
        yaml.dump(testConfig)
      );
      
      const config = await configLoader.loadConfig();
      
      expect(config.flowType).toBe('iterative');
      expect(config.maxIterations).toBe(10);
    });

    test('should load JSON config file', async () => {
      const testConfig = {
        flowType: 'iterative',
        maxIterations: 8,
        devFixStrategy: 'fix-critical'
      };
      
      await fs.writeFile(
        path.join(testRootDir, '.bmad-workflow.json'),
        JSON.stringify(testConfig, null, 2)
      );
      
      const config = await configLoader.loadConfig();
      
      expect(config.flowType).toBe('iterative');
      expect(config.maxIterations).toBe(8);
      expect(config.devFixStrategy).toBe('fix-critical');
    });
  });

  describe('Configuration Validation', () => {
    test('should reject invalid flow type', async () => {
      const invalidConfig = {
        flowType: 'invalid-type'
      };
      
      await expect(configLoader.validateConfig(invalidConfig))
        .rejects.toThrow('Invalid workflow configuration');
    });

    test('should apply defaults for missing fields', async () => {
      const partialConfig = {
        flowType: 'iterative'
      };
      
      const validated = await configLoader.validateConfig(partialConfig);
      
      expect(validated.maxIterations).toBe(5);
      expect(validated.autoApproveOnNoIssues).toBe(true);
      expect(validated.qaReviewCriteria.checkCodeStyle).toBe(true);
    });
  });

  describe('Configuration Updates', () => {
    test('should update config value', async () => {
      await configLoader.updateConfig('flowType', 'iterative');
      
      const flowType = await configLoader.getConfigValue('flowType');
      expect(flowType).toBe('iterative');
    });

    test('should update nested config value', async () => {
      await configLoader.updateConfig('qaReviewCriteria.checkSecurity', true);
      
      const checkSecurity = await configLoader.getConfigValue('qaReviewCriteria.checkSecurity');
      expect(checkSecurity).toBe(true);
    });
  });

  describe('Helper Methods', () => {
    test('should check if iterative flow is enabled', async () => {
      // Default is linear
      expect(await configLoader.isIterativeFlowEnabled()).toBe(false);
      
      // Update to iterative
      await configLoader.updateConfig('flowType', 'iterative');
      expect(await configLoader.isIterativeFlowEnabled()).toBe(true);
    });

    test('should get QA review criteria', async () => {
      const criteria = await configLoader.getQAReviewCriteria();
      
      expect(criteria).toHaveProperty('checkCodeStyle', true);
      expect(criteria).toHaveProperty('checkTestCoverage', true);
      expect(criteria).toHaveProperty('checkDocumentation', true);
    });
  });
});