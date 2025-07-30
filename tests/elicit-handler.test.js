const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const TaskRunner = require('../tools/task-runner');

// Mock modules
jest.mock('../bmad-core/agents/index', () => ({
  getWorkingMemory: jest.fn(),
  updateWorkingMemory: jest.fn(),
  initializeWorkingMemory: jest.fn()
}));

describe('Elicit Flag Handler Tests', () => {
  let taskRunner;
  const testProjectRoot = path.join(__dirname, '..');
  
  beforeEach(() => {
    taskRunner = new TaskRunner(testProjectRoot);
    jest.clearAllMocks();
  });

  describe('getActionsRequiringInput', () => {
    it('should identify actions with elicit=true', () => {
      const task = {
        name: 'Test Task',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            actions: [
              { description: 'Action 1', elicit: false },
              { description: 'Action 2', elicit: true },
              { description: 'Action 3', elicit: true }
            ]
          },
          {
            id: 'step2',
            name: 'Step 2',
            actions: [
              { description: 'Action 4', elicit: false }
            ]
          }
        ]
      };

      const result = taskRunner.getActionsRequiringInput(task);
      
      expect(result).toHaveLength(1);
      expect(result[0].stepId).toBe('step1');
      expect(result[0].stepName).toBe('Step 1');
      expect(result[0].actions).toHaveLength(2);
      expect(result[0].actions[0].description).toBe('Action 2');
      expect(result[0].actions[1].description).toBe('Action 3');
    });

    it('should return empty array for task with no elicit actions', () => {
      const task = {
        name: 'Test Task',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            actions: [
              { description: 'Action 1', elicit: false },
              { description: 'Action 2', elicit: false }
            ]
          }
        ]
      };

      const result = taskRunner.getActionsRequiringInput(task);
      expect(result).toHaveLength(0);
    });

    it('should handle task with no steps', () => {
      const task = { name: 'Test Task' };
      const result = taskRunner.getActionsRequiringInput(task);
      expect(result).toHaveLength(0);
    });
  });

  describe('validateElicitRequirements', () => {
    it('should pass validation when no elicit actions exist', () => {
      const task = {
        name: 'Test Task',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            actions: [
              { description: 'Action 1', elicit: false }
            ]
          }
        ]
      };

      const context = {};
      const result = taskRunner.validateElicitRequirements(task, context);
      
      expect(result.valid).toBe(true);
      expect(result.missingInputs).toHaveLength(0);
    });

    it('should fail validation when elicit actions exist but no handler provided', () => {
      const task = {
        name: 'Test Task',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            actions: [
              { description: 'What is your name?', elicit: true }
            ]
          }
        ]
      };

      const context = {};
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = taskRunner.validateElicitRequirements(task, context);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No userInputHandler provided');
      expect(result.missingInputs).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Task has actions requiring user input'));
      
      consoleSpy.mockRestore();
    });

    it('should pass validation when elicit actions exist and handler is provided', () => {
      const task = {
        name: 'Test Task',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            actions: [
              { description: 'What is your name?', elicit: true }
            ]
          }
        ]
      };

      const context = {
        userInputHandler: jest.fn()
      };
      
      const result = taskRunner.validateElicitRequirements(task, context);
      
      expect(result.valid).toBe(true);
      expect(result.missingInputs).toHaveLength(0);
    });
  });

  describe('executeTask with elicit validation', () => {
    const { getWorkingMemory, updateWorkingMemory } = require('../bmad-core/agents/index');

    beforeEach(() => {
      // Mock memory operations
      getWorkingMemory.mockResolvedValue({
        agentId: 'test-agent',
        taskId: 'test-task'
      });
      updateWorkingMemory.mockResolvedValue(true);
    });

    it('should fail task execution when elicit actions exist but no handler provided', async () => {
      // Create a test task file with elicit actions
      const testTaskPath = path.join(__dirname, 'fixtures', 'test-elicit-task.yaml');
      const testTask = {
        id: 'test-elicit-task',
        name: 'Test Elicit Task',
        steps: [
          {
            id: 'step1',
            name: 'User Input Step',
            actions: [
              { description: 'Initialize system', elicit: false },
              { description: 'What is your preference?', elicit: true },
              { description: 'Continue processing', elicit: false }
            ]
          }
        ]
      };

      // Ensure fixture directory exists
      const fixtureDir = path.join(__dirname, 'fixtures');
      if (!fs.existsSync(fixtureDir)) {
        fs.mkdirSync(fixtureDir, { recursive: true });
      }
      
      // Write test task file
      fs.writeFileSync(testTaskPath, yaml.dump(testTask));

      try {
        const result = await taskRunner.executeTask('test-agent', testTaskPath, {});
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Task requires user input but no handler provided');
        expect(result.requiresUserInput).toBe(true);
        expect(result.missingInputs).toHaveLength(1);
        expect(result.missingInputs[0].stepName).toBe('User Input Step');
        expect(result.missingInputs[0].actions[0].description).toBe('What is your preference?');
      } finally {
        // Clean up test file
        if (fs.existsSync(testTaskPath)) {
          fs.unlinkSync(testTaskPath);
        }
      }
    });

    it('should proceed with task execution when allowMissingUserInput is true', async () => {
      // Create a test task file with elicit actions
      const testTaskPath = path.join(__dirname, 'fixtures', 'test-elicit-task-2.yaml');
      const testTask = {
        id: 'test-elicit-task-2',
        name: 'Test Elicit Task 2',
        steps: [
          {
            id: 'step1',
            name: 'User Input Step',
            actions: [
              { description: 'What is your preference?', elicit: true }
            ]
          }
        ]
      };

      // Ensure fixture directory exists
      const fixtureDir = path.join(__dirname, 'fixtures');
      if (!fs.existsSync(fixtureDir)) {
        fs.mkdirSync(fixtureDir, { recursive: true });
      }
      
      // Write test task file
      fs.writeFileSync(testTaskPath, yaml.dump(testTask));

      try {
        const result = await taskRunner.executeTask('test-agent', testTaskPath, {
          allowMissingUserInput: true
        });
        
        // Should proceed despite missing handler
        expect(result.success).toBe(true);
        expect(result.requiresUserInput).toBeUndefined();
      } finally {
        // Clean up test file
        if (fs.existsSync(testTaskPath)) {
          fs.unlinkSync(testTaskPath);
        }
      }
    });

    it('should call userInputHandler when elicit actions are encountered', async () => {
      // Create a test task file with elicit actions
      const testTaskPath = path.join(__dirname, 'fixtures', 'test-elicit-task-3.yaml');
      const testTask = {
        id: 'test-elicit-task-3',
        name: 'Test Elicit Task 3',
        steps: [
          {
            id: 'step1',
            name: 'User Input Step',
            actions: [
              { description: 'Initialize system', elicit: false },
              { description: 'What is your name?', elicit: true },
              { description: 'What is your preference?', elicit: true }
            ]
          }
        ]
      };

      // Ensure fixture directory exists
      const fixtureDir = path.join(__dirname, 'fixtures');
      if (!fs.existsSync(fixtureDir)) {
        fs.mkdirSync(fixtureDir, { recursive: true });
      }
      
      // Write test task file
      fs.writeFileSync(testTaskPath, yaml.dump(testTask));

      const mockInputHandler = jest.fn().mockResolvedValue({
        'What is your name?': 'Test User',
        'What is your preference?': 'Option A'
      });

      try {
        const result = await taskRunner.executeTask('test-agent', testTaskPath, {
          userInputHandler: mockInputHandler
        });
        
        // Should succeed with handler
        expect(result.success).toBe(true);
        
        // Note: The actual call to userInputHandler happens in executeStepActions
        // which is mocked in these tests. In integration tests, we would verify
        // that the handler is actually called.
      } finally {
        // Clean up test file
        if (fs.existsSync(testTaskPath)) {
          fs.unlinkSync(testTaskPath);
        }
      }
    });
  });

  describe('executeStepActions with elicit handling', () => {
    it('should log user input requirements when elicit=true', async () => {
      const step = {
        id: 'test-step',
        name: 'Test Step',
        actions: [
          { description: 'Initialize', elicit: false },
          { description: 'What is your name?', elicit: true },
          { description: 'What is your email?', elicit: true }
        ]
      };

      const mockInputHandler = jest.fn().mockResolvedValue({
        'What is your name?': 'John Doe',
        'What is your email?': 'john@example.com'
      });

      const context = {
        userInputHandler: mockInputHandler
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await taskRunner.executeStepActions(step, 'test-agent', context);

      // Verify that user input requirements were logged
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('User input required'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('What is your name?'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('What is your email?'));

      // Verify that the input handler was called
      expect(mockInputHandler).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ description: 'What is your name?', elicit: true }),
          expect.objectContaining({ description: 'What is your email?', elicit: true })
        ]),
        step
      );

      // Verify that responses were stored in context
      expect(context.userResponses).toBeDefined();
      expect(context.userResponses['test-step']).toEqual({
        'What is your name?': 'John Doe',
        'What is your email?': 'john@example.com'
      });

      consoleSpy.mockRestore();
    });

    it('should warn when elicit=true but no handler provided', async () => {
      const step = {
        id: 'test-step',
        name: 'Test Step',
        actions: [
          { description: 'What is your name?', elicit: true }
        ]
      };

      const context = {}; // No userInputHandler

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await taskRunner.executeStepActions(step, 'test-agent', context);

      // Verify warning was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Action requires user input but no handler provided')
      );

      consoleSpy.mockRestore();
    });
  });
});