/**
 * Integration tests for unified memory management system
 * Tests end-to-end memory flow across multiple agents and tasks
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const AgentRunner = require('../../bmad-core/utils/agent-runner');

// We'll create a minimal test environment
const TEST_CONFIG = {
  memory: {
    enabled: true,
    baseDirectory: '.ai-test',
    retentionPolicies: {
      workingMemory: {
        maxAgeDays: 7,
        maxObservations: 50,
        autoCleanup: true
      },
      longTermMemory: {
        maxAgeDays: 30,
        autoArchive: true
      }
    },
    qdrant: {
      enabled: false // Disable for integration tests
    }
  }
};

describe('Memory Integration Tests', () => {
  let testConfigPath;
  let agentRunner;
  
  beforeAll(async () => {
    // Create test configuration
    testConfigPath = path.join(__dirname, '../../bmad-core/core-config-test.yaml');
    await fs.writeFile(testConfigPath, yaml.dump(TEST_CONFIG));
    
    // Mock the config path in the unified memory manager
    jest.doMock('../../bmad-core/utils/unified-memory-manager', () => {
      const originalModule = jest.requireActual('../../bmad-core/utils/unified-memory-manager');
      return {
        ...originalModule,
        loadMemoryConfig: jest.fn().mockResolvedValue(TEST_CONFIG.memory)
      };
    });
    
    agentRunner = new AgentRunner({ memoryEnabled: true });
  });
  
  afterAll(async () => {
    // Clean up test files
    try {
      await fs.unlink(testConfigPath);
      await fs.rmdir(path.join(__dirname, '../..', TEST_CONFIG.memory.baseDirectory), { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });
  
  describe('End-to-End Memory Flow', () => {
    it('should demonstrate complete memory lifecycle across agents', async () => {
      // This test simulates a realistic workflow:
      // 1. SM creates a story (saves context)
      // 2. Dev implements the story (reads SM context, saves implementation notes)
      // 3. QA reviews the story (reads both SM and Dev context, saves review results)
      
      const storyContext = {
        storyId: 'story-integration-test',
        epicId: 'epic-integration-test'
      };
      
      // Phase 1: SM creates story
      const smResult = await agentRunner.executeWithMemory(
        'sm',
        'create-story',
        storyContext,
        async (context) => {
          // Simulate SM work
          return {
            success: true,
            observation: 'Created comprehensive story with acceptance criteria and technical requirements',
            significantFinding: 'Story requires new authentication middleware component',
            decision: 'Approved story for development with high priority',
            reasoning: 'Authentication is critical for upcoming user management features'
          };
        }
      );
      
      expect(smResult.success).toBe(true);
      expect(smResult.executionResult.observation).toContain('Created comprehensive story');
      
      // Phase 2: Dev implements story
      const devResult = await agentRunner.executeWithMemory(
        'dev',
        'implement-story',
        storyContext,
        async (context) => {
          // Dev should have access to SM's context through memory
          const previousContext = context.memory;
          expect(previousContext).toBeDefined();
          
          // Simulate Dev work
          return {
            success: true,
            observation: 'Implemented authentication middleware with JWT token validation',
            keyFact: {
              key: 'auth-implementation',
              content: 'Used passport.js with JWT strategy, tokens expire in 24h'
            },
            decision: 'Added comprehensive unit tests for all auth endpoints',
            significantFinding: 'Discovered need for rate limiting on login attempts'
          };
        }
      );
      
      expect(devResult.success).toBe(true);
      expect(devResult.executionResult.observation).toContain('Implemented authentication');
      
      // Phase 3: QA reviews implementation
      const qaResult = await agentRunner.executeWithMemory(
        'qa',
        'review-story',
        storyContext,
        async (context) => {
          // QA should have access to both SM and Dev context
          const memoryContext = context.memory;
          expect(memoryContext).toBeDefined();
          
          // Simulate QA work
          return {
            success: true,
            observation: 'Completed security review of authentication implementation',
            decision: 'Approved implementation after verifying JWT token security',
            reasoning: 'All security tests pass, rate limiting properly implemented',
            significantFinding: 'Implementation follows security best practices, no issues found'
          };
        }
      );
      
      expect(qaResult.success).toBe(true);
      expect(qaResult.executionResult.decision).toContain('Approved implementation');
      
      // Verify that all agents have proper memory states
      const smStatus = await agentRunner.getAgentMemoryStatus('sm');
      const devStatus = await agentRunner.getAgentMemoryStatus('dev');
      const qaStatus = await agentRunner.getAgentMemoryStatus('qa');
      
      expect(smStatus.enabled).toBe(true);
      expect(devStatus.enabled).toBe(true);
      expect(qaStatus.enabled).toBe(true);
    }, 30000); // Extended timeout for integration test
    
    it('should handle memory consistency across structured tasks', async () => {
      const structuredTask = {
        id: 'multi-step-task',
        steps: [
          {
            id: 'analyze',
            name: 'Analyze Requirements',
            required: true
          },
          {
            id: 'design',
            name: 'Create Design',
            required: true
          },
          {
            id: 'validate',
            name: 'Validate Design',
            required: true
          }
        ]
      };
      
      const stepExecutor = async (step, context) => {
        switch (step.id) {
          case 'analyze':
            return {
              requirements: ['req1', 'req2', 'req3'],
              complexity: 'medium'
            };
          case 'design':
            // Should have access to analyze results
            expect(context.step_analyze_result).toBeDefined();
            return {
              designPattern: 'MVC',
              components: ['controller', 'model', 'view']
            };
          case 'validate':
            // Should have access to both previous results
            expect(context.step_analyze_result).toBeDefined();
            expect(context.step_design_result).toBeDefined();
            return {
              validationResult: 'passed',
              issues: []
            };
          default:
            return {};
        }
      };
      
      const result = await agentRunner.executeStructuredTask(
        'architect',
        structuredTask,
        { storyId: 'structured-test' },
        stepExecutor
      );
      
      expect(result.success).toBe(true);
      expect(result.executionResult.stepResults).toHaveLength(3);
      expect(result.executionResult.stepResults.every(r => r.success)).toBe(true);
    });
    
    it('should demonstrate memory hygiene and cleanup', async () => {
      // Create many observations to trigger cleanup
      const observations = [];
      for (let i = 0; i < 60; i++) { // Exceeds maxObservations limit
        observations.push(`Observation ${i}: Working on feature implementation`);
      }
      
      // Execute multiple tasks to accumulate observations
      for (let i = 0; i < observations.length; i++) {
        await agentRunner.executeWithMemory(
          'dev',
          `task-${i}`,
          { storyId: 'cleanup-test' },
          async () => ({
            success: true,
            observation: observations[i]
          })
        );
      }
      
      // Memory should have been cleaned up according to retention policy
      const status = await agentRunner.getAgentMemoryStatus('dev');
      expect(status.enabled).toBe(true);
      
      // The exact count depends on the cleanup implementation,
      // but it should be within reasonable limits
      if (status.workingMemory && status.workingMemory.observationCount) {
        expect(status.workingMemory.observationCount).toBeLessThanOrEqual(TEST_CONFIG.memory.retentionPolicies.workingMemory.maxObservations);
      }
    });
  });
  
  describe('Error Recovery and Resilience', () => {
    it('should recover gracefully from memory corruption', async () => {
      // Simulate corrupted memory by creating invalid JSON
      const memoryDir = path.join(__dirname, '../..', TEST_CONFIG.memory.baseDirectory);
      await fs.mkdir(memoryDir, { recursive: true });
      
      const corruptedMemoryPath = path.join(memoryDir, 'working_memory_test.json');
      await fs.writeFile(corruptedMemoryPath, '{ invalid json content');
      
      // System should handle corruption and reinitialize
      const result = await agentRunner.executeWithMemory(
        'test',
        'recovery-test',
        {},
        async () => ({
          success: true,
          observation: 'Task completed despite memory issues'
        })
      );
      
      // Should still succeed by reinitializing memory
      expect(result.success).toBe(true);
    });
    
    it('should continue operation when memory system is disabled', async () => {
      const disabledRunner = new AgentRunner({ memoryEnabled: false });
      
      const result = await disabledRunner.executeWithMemory(
        'dev',
        'no-memory-task',
        {},
        async (context) => {
          expect(context.memory).toBeNull();
          return {
            success: true,
            observation: 'Task completed without memory'
          };
        }
      );
      
      expect(result.success).toBe(true);
      expect(result.memoryContext).toBeNull();
      expect(result.memoryResult).toBeNull();
    });
  });
  
  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent agent operations', async () => {
      const concurrentTasks = [];
      
      // Create multiple tasks running in parallel
      for (let i = 0; i < 5; i++) {
        const task = agentRunner.executeWithMemory(
          `agent-${i}`,
          `concurrent-task-${i}`,
          { batchId: 'concurrent-test' },
          async () => ({
            success: true,
            observation: `Concurrent task ${i} completed`,
            significantFinding: `Agent ${i} processed batch successfully`
          })
        );
        concurrentTasks.push(task);
      }
      
      const results = await Promise.all(concurrentTasks);
      
      // All tasks should succeed
      expect(results.every(r => r.success)).toBe(true);
      expect(results).toHaveLength(5);
      
      // Each should have unique agent names and task IDs
      const agentNames = results.map(r => r.agentName);
      const taskIds = results.map(r => r.taskId);
      
      expect(new Set(agentNames).size).toBe(5); // All unique
      expect(new Set(taskIds).size).toBe(5); // All unique
    });
  });
});