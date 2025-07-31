/**
 * Unit tests for Unified Memory Manager
 * Tests the core memory management functionality including configuration loading,
 * memory lifecycle, and integration with structured tasks
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { 
  loadMemoryForTask,
  saveAndCleanMemory,
  summarizeAndArchiveMemories,
  getMemoryStatus,
  loadMemoryConfig
} = require('../bmad-core/utils/unified-memory-manager');

// Mock dependencies
jest.mock('../bmad-core/utils/agent-memory-manager');
jest.mock('../bmad-core/utils/qdrant');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn()
  }
}));

const mockAgentMemoryManager = require('../bmad-core/utils/agent-memory-manager');
const mockQdrant = require('../bmad-core/utils/qdrant');
const mockFs = fs;

describe('Unified Memory Manager', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mocks
    mockAgentMemoryManager.loadWorkingMemory.mockResolvedValue({
      agentName: 'test-agent',
      sessionId: '12345',
      currentContext: { storyId: 'story-1', epicId: 'epic-1' },
      observations: [],
      decisions: [],
      keyFacts: {}
    });
    
    mockAgentMemoryManager.initializeWorkingMemory.mockResolvedValue({
      agentName: 'test-agent',
      sessionId: '12345',
      currentContext: {},
      observations: [],
      decisions: [],
      keyFacts: {}
    });
    
    mockAgentMemoryManager.retrieveRelevantMemories.mockResolvedValue([]);
    mockAgentMemoryManager.updateWorkingMemory.mockResolvedValue(true);
    mockAgentMemoryManager.storeMemorySnippetWithContext.mockResolvedValue('memory-id-123');
    mockAgentMemoryManager.archiveTaskMemory.mockResolvedValue(true);
    
    mockQdrant.storeMemorySnippet.mockResolvedValue('qdrant-id-123');
    mockQdrant.retrieveMemory.mockResolvedValue([]);
  });

  describe('loadMemoryConfig', () => {
    it('should load memory configuration from core-config.yaml', async () => {
      const mockConfig = {
        memory: {
          enabled: true,
          baseDirectory: '.ai',
          retentionPolicies: {
            workingMemory: { maxAgeDays: 7 }
          }
        }
      };
      
      mockFs.readFile.mockResolvedValue(yaml.dump(mockConfig));
      
      const config = await loadMemoryConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.baseDirectory).toBe('.ai');
      expect(config.retentionPolicies.workingMemory.maxAgeDays).toBe(7);
    });

    it('should return default configuration when core-config.yaml is not found', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      
      const config = await loadMemoryConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.baseDirectory).toBe('.ai');
      expect(config.retentionPolicies).toBeDefined();
    });

    it('should handle invalid YAML in core-config.yaml', async () => {
      mockFs.readFile.mockResolvedValue('invalid: yaml: content:');
      
      const config = await loadMemoryConfig();
      
      expect(config.enabled).toBe(true); // Should fallback to defaults
    });
  });

  describe('loadMemoryForTask', () => {
    it('should load existing working memory and query long-term memories', async () => {
      const mockMemory = {
        agentName: 'sm',
        observations: [{ content: 'Previous observation' }],
        currentContext: { storyId: 'story-1' }
      };
      
      const mockLongTermMemories = [
        { content: 'Relevant past memory', agentName: 'sm' }
      ];
      
      mockAgentMemoryManager.loadWorkingMemory.mockResolvedValue(mockMemory);
      mockAgentMemoryManager.retrieveRelevantMemories.mockResolvedValue(mockLongTermMemories);
      
      const result = await loadMemoryForTask('sm', {
        taskId: 'create-story',
        storyId: 'story-1',
        epicId: 'epic-1'
      });
      
      expect(result.shortTerm).toEqual(mockMemory);
      expect(result.longTerm).toEqual(mockLongTermMemories);
      expect(result.config).toBeDefined();
      expect(mockAgentMemoryManager.loadWorkingMemory).toHaveBeenCalledWith('sm');
      expect(mockAgentMemoryManager.retrieveRelevantMemories).toHaveBeenCalledWith(
        'sm',
        'story:story-1 epic:epic-1 agent:sm',
        { storyId: 'story-1', epicId: 'epic-1', topN: 10 }
      );
    });

    it('should initialize new memory when none exists', async () => {
      mockAgentMemoryManager.loadWorkingMemory.mockResolvedValue(null);
      
      const result = await loadMemoryForTask('dev', {
        taskId: 'implement-feature',
        storyId: 'story-2'
      });
      
      expect(mockAgentMemoryManager.initializeWorkingMemory).toHaveBeenCalledWith('dev', {
        taskId: 'implement-feature',
        storyId: 'story-2'
      });
      expect(result.shortTerm).toBeDefined();
    });

    it('should handle memory system disabled', async () => {
      mockFs.readFile.mockResolvedValue(yaml.dump({ memory: { enabled: false } }));
      
      const result = await loadMemoryForTask('qa', { taskId: 'review' });
      
      expect(result.shortTerm).toBeNull();
      expect(result.longTerm).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockAgentMemoryManager.loadWorkingMemory.mockRejectedValue(new Error('Memory error'));
      
      const result = await loadMemoryForTask('sm', { taskId: 'test' });
      
      expect(result.error).toBeDefined();
      expect(result.shortTerm).toBeNull();
    });
  });

  describe('saveAndCleanMemory', () => {
    beforeEach(() => {
      mockFs.readFile.mockResolvedValue(yaml.dump({
        memory: {
          enabled: true,
          qdrant: { enabled: true },
          retentionPolicies: { workingMemory: { autoCleanup: true } }
        }
      }));
    });

    it('should save observations and decisions to working memory', async () => {
      const taskData = {
        observation: 'Task completed successfully',
        decision: 'Proceeding with implementation',
        reasoning: 'All requirements are clear',
        context: { storyId: 'story-1' }
      };
      
      const result = await saveAndCleanMemory('dev', taskData);
      
      expect(result.success).toBe(true);
      expect(result.operations).toContain('Saved observation to short-term memory');
      expect(result.operations).toContain('Saved decision to short-term memory');
      expect(mockAgentMemoryManager.updateWorkingMemory).toHaveBeenCalledWith('dev', {
        observation: 'Task completed successfully',
        currentContext: { storyId: 'story-1' }
      });
    });

    it('should archive completed tasks to long-term memory', async () => {
      const taskData = {
        observation: 'Task completed',
        taskCompleted: true,
        taskId: 'implement-auth',
        context: { storyId: 'story-1' }
      };
      
      const result = await saveAndCleanMemory('dev', taskData);
      
      expect(mockAgentMemoryManager.archiveTaskMemory).toHaveBeenCalledWith('dev', 'implement-auth');
      expect(result.operations).toContain('Archived task to long-term memory');
    });

    it('should store significant findings in Qdrant', async () => {
      const taskData = {
        significantFinding: 'Discovered new optimization pattern',
        context: { storyId: 'story-1', epicId: 'epic-1' }
      };
      
      const result = await saveAndCleanMemory('architect', taskData);
      
      expect(mockAgentMemoryManager.storeMemorySnippetWithContext).toHaveBeenCalledWith(
        'architect',
        'Discovered new optimization pattern',
        expect.objectContaining({ type: 'significant-finding' })
      );
    });

    it('should perform memory cleanup when enabled', async () => {
      mockAgentMemoryManager.loadWorkingMemory.mockResolvedValue({
        agentName: 'sm',
        observations: new Array(120).fill({ content: 'old observation' }), // Exceeds limit
        decisions: [],
        keyFacts: {}
      });
      
      const result = await saveAndCleanMemory('sm', { observation: 'New obs' });
      
      expect(result.operations.some(op => op.includes('Memory cleanup'))).toBe(true);
    });

    it('should handle memory system disabled', async () => {
      mockFs.readFile.mockResolvedValue(yaml.dump({ memory: { enabled: false } }));
      
      const result = await saveAndCleanMemory('dev', { observation: 'test' });
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Memory system disabled');
    });

    it('should handle errors gracefully', async () => {
      mockAgentMemoryManager.updateWorkingMemory.mockRejectedValue(new Error('Update failed'));
      
      const result = await saveAndCleanMemory('dev', { observation: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Update failed');
    });
  });

  describe('summarizeAndArchiveMemories', () => {
    it('should summarize old observations and store in long-term memory', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago
      
      const mockMemory = {
        agentName: 'qa',
        observations: [
          { content: 'Found bug in auth', timestamp: oldDate.toISOString() },
          { content: 'Fixed validation error', timestamp: oldDate.toISOString() },
          { content: 'SUCCESS: All tests pass', timestamp: oldDate.toISOString() },
          { content: 'ERROR: Database connection failed', timestamp: oldDate.toISOString() },
          { content: 'Completed code review', timestamp: oldDate.toISOString() }
        ]
      };
      
      mockAgentMemoryManager.loadWorkingMemory.mockResolvedValue(mockMemory);
      mockFs.readFile.mockResolvedValue(yaml.dump({
        memory: {
          hygiene: { enableAutoSummarization: true },
          retentionPolicies: { workingMemory: { maxAgeDays: 7 } },
          qdrant: { enabled: true }
        }
      }));
      
      const result = await summarizeAndArchiveMemories('qa');
      
      expect(result.success).toBe(true);
      expect(result.summarizedObservations).toBe(5);
      expect(mockAgentMemoryManager.storeMemorySnippetWithContext).toHaveBeenCalledWith(
        'qa',
        expect.stringContaining('observationCount'),
        expect.objectContaining({ type: 'automated-summary' })
      );
    });

    it('should not summarize when insufficient observations', async () => {
      const mockMemory = {
        agentName: 'dev',
        observations: [
          { content: 'Recent observation', timestamp: new Date().toISOString() }
        ]
      };
      
      mockAgentMemoryManager.loadWorkingMemory.mockResolvedValue(mockMemory);
      
      const result = await summarizeAndArchiveMemories('dev');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Not enough old observations');
    });
  });

  describe('getMemoryStatus', () => {
    it('should return comprehensive memory status', async () => {
      const mockSummary = {
        agentName: 'sm',
        hasMemory: true,
        observationCount: 25,
        decisionCount: 12,
        keyFactCount: 8
      };
      
      mockAgentMemoryManager.getMemorySummary.mockResolvedValue(mockSummary);
      
      const status = await getMemoryStatus('sm');
      
      expect(status.agent).toBe('sm');
      expect(status.enabled).toBe(true);
      expect(status.workingMemory).toEqual(mockSummary);
      expect(status.config).toBeDefined();
    });

    it('should handle memory system errors', async () => {
      mockAgentMemoryManager.getMemorySummary.mockRejectedValue(new Error('Status error'));
      
      const status = await getMemoryStatus('dev');
      
      expect(status.enabled).toBe(false);
      expect(status.error).toBe('Status error');
    });
  });

  describe('Memory Hygiene and Cleanup', () => {
    it('should clean up old observations based on retention policy', async () => {
      const mockMemory = {
        agentName: 'dev',
        observations: new Array(150).fill(null).map((_, i) => ({
          content: `Observation ${i}`,
          timestamp: new Date().toISOString()
        })),
        decisions: [],
        keyFacts: {}
      };
      
      mockAgentMemoryManager.loadWorkingMemory.mockResolvedValue(mockMemory);
      mockFs.readFile.mockResolvedValue(yaml.dump({
        memory: {
          enabled: true,
          retentionPolicies: {
            workingMemory: {
              maxObservations: 100,
              autoCleanup: true
            }
          }
        }
      }));
      
      await saveAndCleanMemory('dev', { observation: 'New observation' });
      
      // Should trigger cleanup since observations exceed maxObservations
      expect(mockAgentMemoryManager.updateWorkingMemory).toHaveBeenCalled();
    });

    it('should extract key themes from observations during summarization', async () => {
      const mockMemory = {
        agentName: 'qa',
        observations: [
          { content: 'Found error in validation', timestamp: '2023-01-01T00:00:00Z' },
          { content: 'Implemented fix successfully', timestamp: '2023-01-01T01:00:00Z' },
          { content: 'All tests passing now', timestamp: '2023-01-01T02:00:00Z' },
          { content: 'Review completed with success', timestamp: '2023-01-01T03:00:00Z' },
          { content: 'Error in database connection', timestamp: '2023-01-01T04:00:00Z' }
        ]
      };
      
      mockAgentMemoryManager.loadWorkingMemory.mockResolvedValue(mockMemory);
      mockFs.readFile.mockResolvedValue(yaml.dump({
        memory: {
          hygiene: { enableAutoSummarization: true },
          retentionPolicies: { workingMemory: { maxAgeDays: 0 } }, // Force all to be old
          qdrant: { enabled: true }
        }
      }));
      
      const result = await summarizeAndArchiveMemories('qa');
      
      expect(result.success).toBe(true);
      
      // Verify that the summary contains extracted themes
      const storeCall = mockAgentMemoryManager.storeMemorySnippetWithContext.mock.calls[0];
      const summaryContent = JSON.parse(storeCall[1]);
      expect(summaryContent.keyThemes).toBeDefined();
      expect(summaryContent.keyThemes.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete memory lifecycle for a task', async () => {
      // Setup: Load memory
      const context = {
        taskId: 'create-story-test',
        storyId: 'story-123',
        epicId: 'epic-456',
        taskType: 'story-creation'
      };
      
      const loadResult = await loadMemoryForTask('sm', context);
      expect(loadResult.shortTerm).toBeDefined();
      
      // Execute: Save task completion
      const taskData = {
        observation: 'Successfully created story with all requirements',
        decision: 'Story is ready for development',
        significantFinding: 'Identified new pattern for API design',
        taskCompleted: true,
        taskId: 'create-story-test',
        context
      };
      
      const saveResult = await saveAndCleanMemory('sm', taskData);
      expect(saveResult.success).toBe(true);
      expect(saveResult.operations.length).toBeGreaterThan(0);
      
      // Verify: Check memory status
      const status = await getMemoryStatus('sm');
      expect(status.agent).toBe('sm');
      expect(status.enabled).toBe(true);
    });

    it('should maintain memory consistency across multiple agents', async () => {
      const sharedContext = {
        storyId: 'story-shared',
        epicId: 'epic-shared'
      };
      
      // SM creates story
      await loadMemoryForTask('sm', { ...sharedContext, taskId: 'create-story' });
      await saveAndCleanMemory('sm', {
        observation: 'Story created and ready for development',
        significantFinding: 'Story includes complex authentication requirements',
        taskCompleted: true,
        taskId: 'create-story',
        context: sharedContext
      });
      
      // Dev implements story
      await loadMemoryForTask('dev', { ...sharedContext, taskId: 'implement-story' });
      await saveAndCleanMemory('dev', {
        observation: 'Implemented authentication with JWT tokens',
        decision: 'Used OAuth2 flow for external providers',
        taskCompleted: true,
        taskId: 'implement-story',
        context: sharedContext
      });
      
      // QA reviews implementation
      const qaMemory = await loadMemoryForTask('qa', { ...sharedContext, taskId: 'review-story' });
      
      // QA should have access to context from both SM and Dev through long-term memory
      expect(mockAgentMemoryManager.retrieveRelevantMemories).toHaveBeenCalledWith(
        'qa',
        expect.stringContaining('story:story-shared'),
        expect.objectContaining({ storyId: 'story-shared', epicId: 'epic-shared' })
      );
    });
  });
});