/**
 * Unit tests for Agent Runner
 * Tests the agent execution wrapper with memory lifecycle management
 */

const AgentRunner = require('../bmad-core/utils/agent-runner');
const { 
  loadMemoryForTask, 
  saveAndCleanMemory,
  getMemoryStatus 
} = require('../bmad-core/utils/unified-memory-manager');

// Mock dependencies
jest.mock('../bmad-core/utils/unified-memory-manager');
jest.mock('../bmad-core/utils/verbose-logger');

const mockUnifiedMemoryManager = require('../bmad-core/utils/unified-memory-manager');

describe('Agent Runner', () => {
  let agentRunner;
  
  beforeEach(() => {
    jest.clearAllMocks();
    agentRunner = new AgentRunner({ memoryEnabled: true });
    
    // Setup default mocks
    mockUnifiedMemoryManager.loadMemoryForTask.mockResolvedValue({
      shortTerm: { agentName: 'test-agent', observations: [] },
      longTerm: [],
      config: { enabled: true }
    });
    
    mockUnifiedMemoryManager.saveAndCleanMemory.mockResolvedValue({
      success: true,
      operations: ['Saved observation'],
      warnings: []
    });
    
    mockUnifiedMemoryManager.getMemoryStatus.mockResolvedValue({
      agent: 'test-agent',
      enabled: true,
      workingMemory: { hasMemory: true }
    });
  });

  describe('executeWithMemory', () => {
    it('should execute task with full memory lifecycle', async () => {
      const mockTaskExecutor = jest.fn().mockResolvedValue({
        success: true,
        observation: 'Task completed successfully',
        significantFinding: 'Found important pattern'
      });
      
      const result = await agentRunner.executeWithMemory(
        'dev',
        'implement-feature',
        { storyId: 'story-1', epicId: 'epic-1' },
        mockTaskExecutor
      );
      
      expect(result.success).toBe(true);
      expect(result.agentName).toBe('dev');
      expect(result.taskId).toBe('implement-feature');
      expect(result.duration).toBeGreaterThan(0);
      
      // Verify memory loading
      expect(mockUnifiedMemoryManager.loadMemoryForTask).toHaveBeenCalledWith('dev', {
        taskId: 'implement-feature',
        storyId: 'story-1',
        epicId: 'epic-1',
        taskType: undefined
      });
      
      // Verify task execution with enriched context
      expect(mockTaskExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          storyId: 'story-1',
          epicId: 'epic-1',
          memory: expect.objectContaining({
            shortTerm: expect.any(Object),
            longTerm: expect.any(Array)
          }),
          agentName: 'dev',
          taskId: 'implement-feature'
        })
      );
      
      // Verify memory saving
      expect(mockUnifiedMemoryManager.saveAndCleanMemory).toHaveBeenCalledWith('dev', {
        observation: 'Task completed successfully',
        decision: undefined,
        reasoning: undefined,
        keyFact: undefined,
        significantFinding: 'Found important pattern',
        taskCompleted: true,
        taskId: 'implement-feature',
        context: expect.objectContaining({
          storyId: 'story-1',
          epicId: 'epic-1',
          executionTime: expect.any(Number)
        })
      });
    });

    it('should handle task execution errors gracefully', async () => {
      const mockTaskExecutor = jest.fn().mockRejectedValue(new Error('Task failed'));
      
      const result = await agentRunner.executeWithMemory(
        'qa',
        'review-story',
        { storyId: 'story-2' },
        mockTaskExecutor
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Task failed');
      expect(result.executionResult).toBeNull();
      
      // Should attempt to save error to memory
      expect(mockUnifiedMemoryManager.saveAndCleanMemory).toHaveBeenCalledWith('qa', {
        observation: 'Task review-story failed: Task failed',
        taskCompleted: false,
        taskId: 'review-story',
        context: expect.objectContaining({
          error: 'Task failed'
        })
      });
    });

    it('should handle memory loading failures', async () => {
      mockUnifiedMemoryManager.loadMemoryForTask.mockResolvedValue({
        shortTerm: null,
        longTerm: [],
        config: { enabled: true },
        error: 'Memory load failed'
      });
      
      const mockTaskExecutor = jest.fn().mockResolvedValue({ success: true });
      
      const result = await agentRunner.executeWithMemory(
        'sm',
        'create-story',
        {},
        mockTaskExecutor
      );
      
      // Should continue execution despite memory failure
      expect(result.success).toBe(true);
      expect(mockTaskExecutor).toHaveBeenCalled();
    });

    it('should handle memory saving failures', async () => {
      mockUnifiedMemoryManager.saveAndCleanMemory.mockResolvedValue({
        success: false,
        error: 'Memory save failed'
      });
      
      const mockTaskExecutor = jest.fn().mockResolvedValue({ success: true });
      
      const result = await agentRunner.executeWithMemory(
        'dev',
        'test-task',
        {},
        mockTaskExecutor
      );
      
      // Should still report overall success if task succeeded
      expect(result.success).toBe(true);
      expect(result.memoryResult.success).toBe(false);
    });

    it('should work with memory disabled', async () => {
      const runnerWithoutMemory = new AgentRunner({ memoryEnabled: false });
      const mockTaskExecutor = jest.fn().mockResolvedValue({ success: true });
      
      const result = await runnerWithoutMemory.executeWithMemory(
        'dev',
        'test-task',
        {},
        mockTaskExecutor
      );
      
      expect(result.success).toBe(true);
      expect(result.memoryContext).toBeNull();
      expect(result.memoryResult).toBeNull();
      
      // Memory functions should not be called
      expect(mockUnifiedMemoryManager.loadMemoryForTask).not.toHaveBeenCalled();
      expect(mockUnifiedMemoryManager.saveAndCleanMemory).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('should provide backwards compatibility interface', async () => {
      const mockExecutor = jest.fn().mockResolvedValue({
        filesModified: 3,
        linesAdded: 150
      });
      
      const result = await agentRunner.execute(
        'dev', 
        'implement',
        { storyId: 'story-1' },
        mockExecutor
      );
      
      expect(result.success).toBe(true);
      expect(result.agentName).toBe('dev');
      expect(result.taskId).toMatch(/implement-\d+/);
      
      expect(mockExecutor).toHaveBeenCalledWith(
        'implement',
        expect.objectContaining({
          storyId: 'story-1',
          memory: expect.any(Object),
          agentName: 'dev'
        })
      );
    });
  });

  describe('executeStructuredTask', () => {
    it('should execute structured task with step-by-step memory management', async () => {
      const structuredTask = {
        id: 'create-story-task',
        steps: [
          {
            id: 'step1',
            name: 'Load Context',
            description: 'Load story context',
            required: true
          },
          {
            id: 'step2', 
            name: 'Create Story',
            description: 'Create the story file',
            required: true
          }
        ]
      };
      
      const mockStepExecutor = jest.fn()
        .mockResolvedValueOnce({ contextLoaded: true })
        .mockResolvedValueOnce({ storyCreated: true });
      
      const result = await agentRunner.executeStructuredTask(
        'sm',
        structuredTask,
        { storyId: 'story-1' },
        mockStepExecutor
      );
      
      expect(result.success).toBe(true);
      expect(result.executionResult.stepResults).toHaveLength(2);
      expect(result.executionResult.stepResults[0].success).toBe(true);
      expect(result.executionResult.stepResults[1].success).toBe(true);
      
      // Verify step executor was called for each step
      expect(mockStepExecutor).toHaveBeenCalledTimes(2);
      expect(mockStepExecutor).toHaveBeenNthCalledWith(1, 
        structuredTask.steps[0],
        expect.objectContaining({ storyId: 'story-1' })
      );
    });

    it('should handle step failures in structured tasks', async () => {
      const structuredTask = {
        id: 'failing-task',
        steps: [
          {
            id: 'step1',
            name: 'Success Step',
            required: true
          },
          {
            id: 'step2',
            name: 'Failing Step', 
            required: true
          }
        ]
      };
      
      const mockStepExecutor = jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Step failed'));
      
      const result = await agentRunner.executeStructuredTask(
        'qa',
        structuredTask,
        {},
        mockStepExecutor
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Required step failed');
      expect(result.executionResult).toBeNull();
    });

    it('should continue with optional step failures', async () => {
      const structuredTask = {
        id: 'optional-step-task',
        steps: [
          {
            id: 'step1',
            name: 'Required Step',
            required: true
          },
          {
            id: 'step2',
            name: 'Optional Step',
            required: false
          }
        ]
      };
      
      const mockStepExecutor = jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Optional step failed'));
      
      const result = await agentRunner.executeStructuredTask(
        'dev',
        structuredTask,
        {},
        mockStepExecutor
      );
      
      expect(result.success).toBe(false); // Overall false because not all steps succeeded
      expect(result.executionResult.stepResults).toHaveLength(2);
      expect(result.executionResult.stepResults[0].success).toBe(true);
      expect(result.executionResult.stepResults[1].success).toBe(false);
    });
  });

  describe('batchExecute', () => {
    it('should execute multiple tasks in sequence', async () => {
      const tasks = [
        {
          agentName: 'dev',
          taskId: 'task1',
          context: { storyId: 'story-1' },
          executor: jest.fn().mockResolvedValue({ success: true, result: 'task1-done' })
        },
        {
          agentName: 'qa',
          taskId: 'task2', 
          context: { storyId: 'story-1' },
          executor: jest.fn().mockResolvedValue({ success: true, result: 'task2-done' })
        }
      ];
      
      const results = await agentRunner.batchExecute(tasks);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].agentName).toBe('dev');
      expect(results[1].success).toBe(true);
      expect(results[1].agentName).toBe('qa');
      
      expect(tasks[0].executor).toHaveBeenCalled();
      expect(tasks[1].executor).toHaveBeenCalled();
    });

    it('should handle individual task failures in batch', async () => {
      const tasks = [
        {
          agentName: 'dev',
          taskId: 'success-task',
          context: {},
          executor: jest.fn().mockResolvedValue({ success: true })
        },
        {
          agentName: 'qa',
          taskId: 'fail-task',
          context: {},
          executor: jest.fn().mockRejectedValue(new Error('Task failed'))
        }
      ];
      
      const results = await agentRunner.batchExecute(tasks);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Task failed');
    });
  });

  describe('getAgentMemoryStatus', () => {
    it('should return memory status for agent', async () => {
      const status = await agentRunner.getAgentMemoryStatus('dev');
      
      expect(status.agent).toBe('test-agent');
      expect(status.enabled).toBe(true);
      expect(mockUnifiedMemoryManager.getMemoryStatus).toHaveBeenCalledWith('dev');
    });

    it('should handle memory disabled', async () => {
      const runnerWithoutMemory = new AgentRunner({ memoryEnabled: false });
      
      const status = await runnerWithoutMemory.getAgentMemoryStatus('dev');
      
      expect(status.enabled).toBe(false);
      expect(status.message).toBe('Memory system disabled');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should gracefully handle memory system unavailable', async () => {
      mockUnifiedMemoryManager.loadMemoryForTask.mockRejectedValue(new Error('Memory system down'));
      mockUnifiedMemoryManager.saveAndCleanMemory.mockRejectedValue(new Error('Memory system down'));
      
      const mockTaskExecutor = jest.fn().mockResolvedValue({ 
        success: true,
        observation: 'Task completed' 
      });
      
      const result = await agentRunner.executeWithMemory(
        'dev',
        'test-task',
        {},
        mockTaskExecutor
      );
      
      // Task should still succeed even if memory fails
      expect(result.success).toBe(false); // False because memory loading failed
      expect(result.error).toBe('Memory system down');
      expect(mockTaskExecutor).not.toHaveBeenCalled(); // Task won't execute if memory load fails
    });

    it('should handle partial memory failures during save', async () => {
      // Memory loads successfully but save fails
      mockUnifiedMemoryManager.saveAndCleanMemory.mockRejectedValue(new Error('Save failed'));
      
      const mockTaskExecutor = jest.fn().mockResolvedValue({
        success: true,
        observation: 'Task completed'
      });
      
      const result = await agentRunner.executeWithMemory(
        'sm',
        'create-story',
        {},
        mockTaskExecutor
      );
      
      expect(result.success).toBe(false); // False because of save failure
      expect(result.error).toBe('Save failed');
      expect(mockTaskExecutor).toHaveBeenCalled(); // Task executed successfully
    });
  });

  describe('Context Enrichment', () => {
    it('should enrich task context with memory information', async () => {
      const mockMemoryContext = {
        shortTerm: {
          agentName: 'dev',
          observations: [{ content: 'Previous work' }],
          keyFacts: { 'pattern': 'MVC architecture' }
        },
        longTerm: [
          { content: 'Similar task from last sprint', relevance: 0.9 }
        ],
        config: { enabled: true }
      };
      
      mockUnifiedMemoryManager.loadMemoryForTask.mockResolvedValue(mockMemoryContext);
      
      const mockTaskExecutor = jest.fn().mockResolvedValue({ success: true });
      
      await agentRunner.executeWithMemory(
        'dev',
        'implement-api',
        { storyId: 'story-123' },
        mockTaskExecutor
      );
      
      const enrichedContext = mockTaskExecutor.mock.calls[0][0];
      
      expect(enrichedContext.memory).toEqual(mockMemoryContext);
      expect(enrichedContext.agentName).toBe('dev');
      expect(enrichedContext.taskId).toBe('implement-api');
      expect(enrichedContext.storyId).toBe('story-123');
    });
  });
});