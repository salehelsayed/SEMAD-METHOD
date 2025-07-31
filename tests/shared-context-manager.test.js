/**
 * Unit tests for SharedContextManager
 * Tests initialization, user response processing, error handling, and context consolidation
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const SharedContextManager = require('../bmad-core/utils/shared-context-manager');

describe('SharedContextManager', () => {
  let manager;
  let tempDir;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = path.join(os.tmpdir(), `scm-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
    manager = new SharedContextManager(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
      console.warn('Failed to cleanup temp directory:', error.message);
    }
  });

  describe('Initialization', () => {
    test('should initialize with default directory', () => {
      const defaultManager = new SharedContextManager();
      expect(defaultManager.baseDirectory).toMatch(/\.ai$/);
      expect(path.isAbsolute(defaultManager.baseDirectory)).toBe(true);
    });

    test('should initialize with custom directory using absolute path', () => {
      const customDir = '/custom/path';
      const customManager = new SharedContextManager(customDir);
      expect(customManager.baseDirectory).toBe(path.resolve(customDir));
      expect(path.isAbsolute(customManager.baseDirectory)).toBe(true);
    });

    test('should initialize with relative directory converted to absolute', () => {
      const relativeDir = './relative/path';
      const relativeManager = new SharedContextManager(relativeDir);
      expect(path.isAbsolute(relativeManager.baseDirectory)).toBe(true);
      expect(relativeManager.baseDirectory).toBe(path.resolve(relativeDir));
    });

    test('should successfully initialize directory structure', async () => {
      const result = await manager.initialize();
      expect(result).toBe(true);

      // Check that files were created
      const contextExists = await manager.fileExists(manager.contextFilePath);
      const interactionsExists = await manager.fileExists(manager.userInteractionsPath);
      
      expect(contextExists).toBe(true);
      expect(interactionsExists).toBe(true);
    });

    test('should handle initialization errors gracefully', async () => {
      // Create a manager with an invalid path that will cause permission errors
      const invalidManager = new SharedContextManager('/root/invalid-path');
      const result = await invalidManager.initialize();
      expect(result).toBe(false);
    });

    test('should not reinitialize existing files', async () => {
      await manager.initialize();
      
      // Read the initial context
      const initialContext = await manager.loadContext();
      const initialSessionId = initialContext.sessionId;
      
      // Initialize again
      await manager.initialize();
      
      // Context should be the same (not reset)
      const secondContext = await manager.loadContext();
      expect(secondContext.sessionId).toBe(initialSessionId);
    });
  });

  describe('User Response Processing', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('should process simple text response', () => {
      const response = 'This is a simple response';
      const processed = manager.processUserResponse(response);
      
      expect(processed.cleaned).toBe('This is a simple response');
      expect(processed.wordCount).toBe(5);
      expect(processed.hasSpecialRequirements).toBe(false);
      expect(processed.hasNegations).toBe(false);
      expect(processed.containsNumbers).toBe(false);
      expect(processed.containsUrls).toBe(false);
    });

    test('should detect special requirements in response', () => {
      const response = 'The system must have authentication and should include logging';
      const processed = manager.processUserResponse(response);
      
      expect(processed.hasSpecialRequirements).toBe(true);
      expect(processed.keyPhrases.length).toBeGreaterThan(0);
    });

    test('should detect negations in response', () => {
      const response = "Don't include user registration and won't need admin panel";
      const processed = manager.processUserResponse(response);
      
      expect(processed.hasNegations).toBe(true);
    });

    test('should detect numbers and URLs', () => {
      const response = 'Need 5 users maximum, see https://example.com for details';
      const processed = manager.processUserResponse(response);
      
      expect(processed.containsNumbers).toBe(true);
      expect(processed.containsUrls).toBe(true);
    });

    test('should handle non-string responses', () => {
      const numberResponse = manager.processUserResponse(42);
      const booleanResponse = manager.processUserResponse(true);
      const objectResponse = manager.processUserResponse({ key: 'value' });
      
      expect(typeof numberResponse.cleaned).toBe('string');
      expect(typeof booleanResponse.cleaned).toBe('string');
      expect(typeof objectResponse.cleaned).toBe('string');
    });

    test('should extract key phrases correctly', () => {
      const response = 'The system needs to handle user authentication and must provide secure login';
      const processed = manager.processUserResponse(response);
      
      expect(processed.keyPhrases.length).toBeGreaterThan(0);
      expect(processed.keyPhrases.some(phrase => phrase.includes('needs to handle user authentication'))).toBe(true);
      expect(processed.keyPhrases.some(phrase => phrase.includes('must provide secure login'))).toBe(true);
    });

    test('should limit key phrases to 5', () => {
      const response = 'needs to do this and must do that and should handle this and will provide that and can support this and might include that';
      const processed = manager.processUserResponse(response);
      
      expect(processed.keyPhrases.length).toBeLessThanOrEqual(5);
    });
  });

  describe('User Interaction Recording', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('should record user interaction successfully', async () => {
      const interaction = await manager.recordUserInteraction(
        'test-agent',
        'What features do you need?',
        'I need user authentication and a dashboard',
        {
          phase: 'planning',
          taskId: 'task-1',
          questionType: 'requirements',
          importance: 'high'
        }
      );

      expect(interaction).not.toBeNull();
      expect(interaction.agentName).toBe('test-agent');
      expect(interaction.question.text).toBe('What features do you need?');
      expect(interaction.userResponse.original).toBe('I need user authentication and a dashboard');
      expect(interaction.phase).toBe('planning');
      expect(interaction.importance).toBe('high');
    });

    test('should update context when recording interaction', async () => {
      await manager.recordUserInteraction(
        'test-agent',
        'What is your requirement?',
        'I must have secure authentication',
        { importance: 'high' }
      );

      const context = await manager.loadContext();
      expect(context.activeAgents).toContain('test-agent');
      expect(context.agentContext['test-agent']).toBeDefined();
      expect(context.agentContext['test-agent'].interactions.length).toBe(1);
      expect(context.userResponseSummary['test-agent']).toBeDefined();
      expect(context.userResponseSummary['test-agent'].length).toBe(1);
    });

    test('should extract key facts from user responses', async () => {
      const interaction = await manager.recordUserInteraction(
        'analyst',
        'What are the security requirements?',
        'The system must use OAuth2 and should implement 2FA',
        { importance: 'high' }
      );

      const context = await manager.loadContext();
      const agentKeyFacts = context.agentContext['analyst'].keyFacts;
      const globalKeyFacts = context.globalContext.keyFacts;

      expect(agentKeyFacts.length).toBeGreaterThan(0);
      expect(globalKeyFacts.length).toBeGreaterThan(0);
      
      // Should have requirement fact
      const requirementFact = agentKeyFacts.find(f => f.type === 'requirement');
      expect(requirementFact).toBeDefined();
      expect(requirementFact.content).toBe('The system must use OAuth2 and should implement 2FA');
    });

    test('should handle recording errors gracefully', async () => {
      // Force an error by making the interactions file unwritable
      await fs.chmod(manager.userInteractionsPath, 0o444);
      
      const interaction = await manager.recordUserInteraction(
        'test-agent',
        'Test question',
        'Test response'
      );

      expect(interaction).toBeNull();
      
      // Restore permissions for cleanup
      await fs.chmod(manager.userInteractionsPath, 0o644);
    });

    test('should limit user response summaries to 10 per agent', async () => {
      // Record 15 interactions
      for (let i = 0; i < 15; i++) {
        await manager.recordUserInteraction(
          'test-agent',
          `Question ${i}`,
          `Response ${i}`
        );
      }

      const context = await manager.loadContext();
      expect(context.userResponseSummary['test-agent'].length).toBe(10);
    });
  });

  describe('Context Retrieval', () => {
    beforeEach(async () => {
      await manager.initialize();
      
      // Set up some test data
      await manager.recordUserInteraction(
        'agent1',
        'Question 1',
        'Response 1',
        { storyId: 'story-1', importance: 'high' }
      );
      
      await manager.recordUserInteraction(
        'agent2',
        'Question 2',
        'Response 2',
        { storyId: 'story-2', importance: 'medium' }
      );
    });

    test('should get context for specific agent', async () => {
      const context = await manager.getContextForAgent('agent1');
      
      expect(context).not.toBeNull();
      expect(context.sessionInfo).toBeDefined();
      expect(context.globalContext).toBeDefined();
      expect(context.agentContext).toBeDefined();
      expect(context.userInteractions).toBeDefined();
      expect(context.recentUserResponses).toBeDefined();
    });

    test('should get relevant interactions with filtering', async () => {
      const agent1Interactions = await manager.getRelevantInteractions('agent1');
      const story1Interactions = await manager.getRelevantInteractions('agent1', { storyId: 'story-1' });
      const limitedInteractions = await manager.getRelevantInteractions('agent1', { limit: 1 });

      expect(agent1Interactions.length).toBe(1);
      expect(story1Interactions.length).toBe(1);
      expect(limitedInteractions.length).toBe(1);
    });

    test('should get all interactions when agentSpecific is false', async () => {
      const allInteractions = await manager.getRelevantInteractions('agent1', { agentSpecific: false });
      expect(allInteractions.length).toBe(2); // Both agent1 and agent2 interactions
    });

    test('should return empty array when no interactions found', async () => {
      const noInteractions = await manager.getRelevantInteractions('nonexistent-agent');
      expect(noInteractions).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    test('should handle file read errors with retry', async () => {
      // Test the retry logic by simulating file operation failures
      const testOperation = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce('Success');

      const result = await manager.retryWithBackoff(testOperation, 3, 10);
      expect(result).toBe('Success');
      expect(testOperation).toHaveBeenCalledTimes(3);
    });

    test('should handle file write errors with retry', async () => {
      await manager.initialize();
      
      // Mock fs.writeFile to fail first few times then succeed
      const originalWriteFile = fs.writeFile;
      let callCount = 0;
      
      fs.writeFile = jest.fn().mockImplementation((...args) => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('File write failed'));
        }
        return originalWriteFile(...args);
      });

      const context = await manager.loadContext();
      context.testField = 'test';
      
      // This should succeed after retries
      const result = await manager.saveContext(context);
      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledTimes(3);
      
      // Restore original function
      fs.writeFile = originalWriteFile;
    });

    test('should give up after max retries', async () => {
      const testOperation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      await expect(manager.retryWithBackoff(testOperation, 3, 10))
        .rejects.toThrow('Persistent failure');
      
      expect(testOperation).toHaveBeenCalledTimes(3);
    });

    test('should handle corrupted context file', async () => {
      await manager.initialize();
      
      // Corrupt the context file with invalid JSON
      await fs.writeFile(manager.contextFilePath, 'invalid json content');
      
      // Should reset context when loading fails
      const context = await manager.loadContext();
      expect(context).toBeDefined();
      expect(context.sessionId).toBeDefined();
    });
  });

  describe('Context Consolidation', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('should consolidate user interactions summary', async () => {
      // Record interactions from multiple agents
      await manager.recordUserInteraction(
        'agent1',
        'Question 1',
        'Important response that must be implemented',
        { importance: 'high' }
      );
      
      await manager.recordUserInteraction(
        'agent2',
        'Question 2',
        'Regular response',
        { importance: 'medium' }
      );

      await manager.recordUserInteraction(
        'agent1',
        'Question 3',
        'Another response',
        { importance: 'low' }
      );

      const summary = await manager.getUserInteractionsSummary();
      
      expect(summary.totalInteractions).toBe(3);
      expect(summary.agentBreakdown['agent1']).toBe(2);
      expect(summary.agentBreakdown['agent2']).toBe(1);
      expect(summary.importantResponses.length).toBe(1);
      expect(summary.openQuestions.length).toBe(3); // All unconfirmed
    });

    test('should add global context items', async () => {
      const decision = await manager.addGlobalContext(
        'decision',
        'Use React for frontend',
        'architect'
      );
      
      const keyFact = await manager.addGlobalContext(
        'keyFact',
        'System must support 1000 concurrent users',
        'user_input'
      );

      expect(decision).toBeDefined();
      expect(decision.content).toBe('Use React for frontend');
      expect(keyFact).toBeDefined();
      expect(keyFact.content).toBe('System must support 1000 concurrent users');

      const context = await manager.loadContext();
      expect(context.globalContext.decisions.length).toBe(1);
      expect(context.globalContext.keyFacts.length).toBe(1);
    });

    test('should update workflow state', async () => {
      const result = await manager.updateWorkflowState(
        'implementation',
        ['planning', 'analysis'],
        ['testing', 'deployment']
      );

      expect(result).toBe(true);

      const context = await manager.loadContext();
      expect(context.workflowState.currentStep).toBe('implementation');
      expect(context.workflowState.completedSteps).toContain('planning');
      expect(context.workflowState.completedSteps).toContain('analysis');
      expect(context.workflowState.pendingSteps).toContain('testing');
      expect(context.workflowState.pendingSteps).toContain('deployment');
    });

    test('should confirm user responses', async () => {
      const interaction = await manager.recordUserInteraction(
        'test-agent',
        'Do you need authentication?',
        'Yes, OAuth2 please'
      );

      const confirmed = await manager.confirmUserResponse(
        interaction.id,
        'test-agent',
        'Confirmed: OAuth2 authentication will be implemented'
      );

      expect(confirmed).not.toBeNull();
      expect(confirmed.userResponse.confirmed).toBe(true);
      expect(confirmed.userResponse.confirmationText).toBe('Confirmed: OAuth2 authentication will be implemented');
      expect(confirmed.userResponse.confirmedAt).toBeDefined();
    });
  });

  describe('Caching', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('should cache context and return cached version within TTL', async () => {
      // First load
      const context1 = await manager.loadContext();
      const cacheTimestamp1 = manager.contextCacheTimestamp;
      
      // Second load immediately (should use cache)
      const context2 = await manager.loadContext();
      const cacheTimestamp2 = manager.contextCacheTimestamp;
      
      expect(context1).toBe(context2); // Same object reference
      expect(cacheTimestamp1).toBe(cacheTimestamp2);
    });

    test('should invalidate cache after TTL expires', async () => {
      // Temporarily reduce cache TTL for testing
      const originalTTL = manager.CACHE_TTL;
      manager.CACHE_TTL = 50; // 50ms
      
      const context1 = await manager.loadContext();
      const cacheTimestamp1 = manager.contextCacheTimestamp;
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const context2 = await manager.loadContext();
      const cacheTimestamp2 = manager.contextCacheTimestamp;
      
      expect(cacheTimestamp2).toBeGreaterThan(cacheTimestamp1);
      
      // Restore original TTL
      manager.CACHE_TTL = originalTTL;
    });

    test('should invalidate cache when saving context', async () => {
      const context1 = await manager.loadContext();
      const cacheTimestamp1 = manager.contextCacheTimestamp;
      
      // Modify and save context
      context1.testField = 'test';
      await manager.saveContext(context1);
      const cacheTimestamp2 = manager.contextCacheTimestamp;
      
      expect(cacheTimestamp2).toBeGreaterThan(cacheTimestamp1);
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('should clean up old interactions', async () => {
      // Create old interaction by manually setting timestamp
      const interaction = await manager.recordUserInteraction(
        'test-agent',
        'Old question',
        'Old response'
      );

      // Manually modify timestamp to be 10 days old
      const interactionsData = await fs.readFile(manager.userInteractionsPath, 'utf8');
      const interactions = JSON.parse(interactionsData);
      
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      interactions.interactions[0].timestamp = oldDate.toISOString();
      
      await fs.writeFile(manager.userInteractionsPath, JSON.stringify(interactions, null, 2));

      // Add a recent interaction
      await manager.recordUserInteraction(
        'test-agent',
        'Recent question',
        'Recent response'
      );

      // Clean up interactions older than 7 days
      const result = await manager.cleanup(7);
      expect(result).toBe(true);

      // Check that only recent interaction remains
      const cleanedData = await fs.readFile(manager.userInteractionsPath, 'utf8');
      const cleanedInteractions = JSON.parse(cleanedData);
      
      expect(cleanedInteractions.interactions.length).toBe(1);
      expect(cleanedInteractions.interactions[0].question.text).toBe('Recent question');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty responses', async () => {
      await manager.initialize();
      
      const interaction = await manager.recordUserInteraction(
        'test-agent',
        'Question',
        ''
      );

      expect(interaction).not.toBeNull();
      expect(interaction.userResponse.original).toBe('');
      expect(interaction.userResponse.processed.cleaned).toBe('');
      expect(interaction.userResponse.processed.wordCount).toBe(0);
    });

    test('should handle whitespace-only responses', () => {
      const processed = manager.processUserResponse('   \n\t   ');
      expect(processed.cleaned).toBe('');
      expect(processed.wordCount).toBe(0);
    });

    test('should handle very long responses', async () => {
      await manager.initialize();
      
      const longResponse = 'A'.repeat(10000);
      const interaction = await manager.recordUserInteraction(
        'test-agent',
        'Question',
        longResponse
      );

      expect(interaction).not.toBeNull();
      expect(interaction.userResponse.original.length).toBe(10000);
    });

    test('should handle non-existent interaction confirmation', async () => {
      await manager.initialize();
      
      const result = await manager.confirmUserResponse(
        'non-existent-id',
        'test-agent',
        'Confirmation text'
      );

      expect(result).toBeNull();
    });
  });
});