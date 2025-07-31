/**
 * Memory Hygiene Tests
 * Tests the memory cleanup and archival functionality
 */

const fs = require('fs').promises;
const path = require('path');
const { 
  performMemoryHygiene, 
  shouldRunMemoryHygiene, 
  getMemoryHygieneStatus,
  analyzeMemoryUsage,
  loadHygieneConfig
} = require('../bmad-core/utils/memory-hygiene');
const { 
  initializeWorkingMemory, 
  updateWorkingMemory, 
  loadWorkingMemory,
  performAgentMemoryHygiene
} = require('../bmad-core/utils/agent-memory-manager');

// Test configuration with low retention thresholds
const testConfig = {
  enableAutoCleanup: true,
  workingMemoryLimits: {
    maxObservations: 5,
    maxDecisions: 3, 
    maxKeyFacts: 4,
    maxBlockers: 2,
    maxAgeHours: 1  // 1 hour for quick testing
  },
  cleanupTriggers: {
    runAfterEachAction: true,
    runOnMemoryThreshold: 0.6,  // 60% threshold for testing
    runOnAgeThreshold: true
  },
  archivalRules: {
    summarizeBeforeDelete: true,
    retainCriticalFacts: true,
    preserveActiveBlockers: true,
    minimumEntriesBeforeCleanup: 2
  }
};

describe('Memory Hygiene System', () => {
  const testAgentName = 'test-hygiene-agent';
  
  beforeEach(async () => {
    // Clean up any existing test memory
    try {
      const memoryPath = path.join(process.cwd(), '.ai', `working_memory_${testAgentName}.json`);
      await fs.unlink(memoryPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up test memory
    try {
      const memoryPath = path.join(process.cwd(), '.ai', `working_memory_${testAgentName}.json`);
      await fs.unlink(memoryPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('Configuration Loading', () => {
    test('should load hygiene configuration with defaults', async () => {
      const config = await loadHygieneConfig();
      expect(config).toBeDefined();
      expect(config.enableAutoCleanup).toBeDefined();
      expect(config.workingMemoryLimits).toBeDefined();
      expect(config.cleanupTriggers).toBeDefined();
      expect(config.archivalRules).toBeDefined();
    });

    test('should provide reasonable default limits', async () => {
      const config = await loadHygieneConfig();
      expect(config.workingMemoryLimits.maxObservations).toBeGreaterThan(0);
      expect(config.workingMemoryLimits.maxDecisions).toBeGreaterThan(0);
      expect(config.workingMemoryLimits.maxKeyFacts).toBeGreaterThan(0);
      expect(config.workingMemoryLimits.maxBlockers).toBeGreaterThan(0);
    });
  });

  describe('Memory Usage Analysis', () => {
    test('should analyze memory usage correctly', async () => {
      // Initialize memory with test data
      await initializeWorkingMemory(testAgentName, {
        storyId: 'test-story-1',
        epicId: 'test-epic-1'
      });

      // Add test observations
      for (let i = 0; i < 4; i++) {
        await updateWorkingMemory(testAgentName, {
          observation: `Test observation ${i + 1}`,
          context: { storyId: 'test-story-1' }
        });
      }

      const workingMemory = await loadWorkingMemory(testAgentName);
      const analysis = analyzeMemoryUsage(workingMemory, testConfig);

      expect(analysis).toBeDefined();
      expect(analysis.usage).toBeDefined();
      expect(analysis.usage.observations.current).toBe(4);
      expect(analysis.usage.observations.limit).toBe(5);
      expect(analysis.usage.observations.ratio).toBeCloseTo(0.8);
      expect(analysis.cleanupNeeded).toBe(true); // Should trigger at 60% threshold
    });

    test('should generate appropriate recommendations', async () => {
      // Initialize and populate memory beyond threshold
      await initializeWorkingMemory(testAgentName);
      
      // Add observations beyond threshold
      for (let i = 0; i < 4; i++) {
        await updateWorkingMemory(testAgentName, {
          observation: `Observation ${i + 1}`
        });
      }

      const workingMemory = await loadWorkingMemory(testAgentName);
      const analysis = analyzeMemoryUsage(workingMemory, testConfig);

      expect(analysis.recommendations).toBeDefined();
      expect(analysis.recommendations.length).toBeGreaterThan(0);
      expect(analysis.recommendations[0].section).toBe('observations');
      expect(analysis.recommendations[0].action).toBe('archive_oldest');
    });
  });

  describe('Memory Cleanup Triggers', () => {
    test('should determine when cleanup is needed', async () => {
      await initializeWorkingMemory(testAgentName);
      
      // Test with empty memory - should not need cleanup
      let shouldCleanup = await shouldRunMemoryHygiene(testAgentName, 'threshold');
      expect(shouldCleanup).toBe(false);

      // Add data beyond threshold
      for (let i = 0; i < 4; i++) {
        await updateWorkingMemory(testAgentName, {
          observation: `Test observation ${i + 1}`
        });
      }

      // Should now need cleanup
      shouldCleanup = await shouldRunMemoryHygiene(testAgentName, 'threshold');
      expect(shouldCleanup).toBe(true);
    });

    test('should respect cleanup triggers configuration', async () => {
      await initializeWorkingMemory(testAgentName);
      
      // Test action trigger
      const actionTrigger = await shouldRunMemoryHygiene(testAgentName, 'action');
      expect(typeof actionTrigger).toBe('boolean');
    });
  });

  describe('Memory Hygiene Status', () => {
    test('should provide comprehensive status information', async () => {
      await initializeWorkingMemory(testAgentName);
      
      const status = await getMemoryHygieneStatus(testAgentName);
      
      expect(status).toBeDefined();
      expect(status.agentName).toBe(testAgentName);
      expect(status.status).toBeDefined();
      expect(status.analysis).toBeDefined();
      expect(status.config).toBeDefined();
    });

    test('should handle missing memory gracefully', async () => {
      const status = await getMemoryHygieneStatus('nonexistent-agent');
      
      expect(status.status).toBe('no_memory');
      expect(status.message).toBe('No working memory found');
    });
  });

  describe('Memory Cleanup Operations', () => {
    test('should perform cleanup when thresholds are exceeded', async () => {
      await initializeWorkingMemory(testAgentName, {
        storyId: 'test-story-cleanup',
        epicId: 'test-epic-cleanup'
      });

      // Fill memory beyond thresholds
      for (let i = 0; i < 6; i++) {
        await updateWorkingMemory(testAgentName, {
          observation: `Observation ${i + 1} for cleanup test`,
          decision: i < 4 ? `Decision ${i + 1}` : undefined,
          reasoning: i < 4 ? `Reasoning for decision ${i + 1}` : undefined
        });
      }

      // Add key facts
      for (let i = 0; i < 5; i++) {
        await updateWorkingMemory(testAgentName, {
          keyFact: {
            key: `fact_${i + 1}`,
            content: `Important fact ${i + 1}`,
            importance: i === 0 ? 'high' : 'medium'
          }
        });
      }

      // Perform hygiene
      const results = await performMemoryHygiene(testAgentName, { force: true });

      expect(results).toBeDefined();
      expect(results.success).toBe(true);
      expect(results.cleanupActions).toBeDefined();
      expect(results.cleanupActions.length).toBeGreaterThan(0);

      // Verify memory was actually cleaned
      const cleanedMemory = await loadWorkingMemory(testAgentName);
      expect(cleanedMemory.observations.length).toBeLessThan(6);
      expect(cleanedMemory.lastCleanup).toBeDefined();
    });

    test('should preserve critical facts during cleanup', async () => {
      await initializeWorkingMemory(testAgentName);

      // Add critical and non-critical facts
      await updateWorkingMemory(testAgentName, {
        keyFact: {
          key: 'critical_fact',
          content: 'This is a critical fact',
          critical: true,
          importance: 'high'
        }
      });

      for (let i = 0; i < 4; i++) {
        await updateWorkingMemory(testAgentName, {
          keyFact: {
            key: `normal_fact_${i}`,
            content: `Normal fact ${i}`,
            importance: 'medium'
          }
        });
      }

      // Perform cleanup
      const results = await performMemoryHygiene(testAgentName, { force: true });
      
      // Check that critical fact is preserved
      const cleanedMemory = await loadWorkingMemory(testAgentName);
      expect(cleanedMemory.keyFacts.critical_fact).toBeDefined();
      expect(cleanedMemory.keyFacts.critical_fact.critical).toBe(true);
    });

    test('should preserve active blockers during cleanup', async () => {
      await initializeWorkingMemory(testAgentName);

      // Add resolved and active blockers
      await updateWorkingMemory(testAgentName, {
        blocker: 'Resolved blocker'
      });
      
      // Resolve first blocker
      await updateWorkingMemory(testAgentName, {
        resolveBlocker: 'Resolved blocker',
        resolution: 'Fixed the issue'
      });

      // Add active blocker
      await updateWorkingMemory(testAgentName, {
        blocker: 'Active blocker still blocking'
      });

      // Perform cleanup
      const results = await performMemoryHygiene(testAgentName, { force: true });

      // Check that active blocker is preserved
      const cleanedMemory = await loadWorkingMemory(testAgentName);
      const activeBlockers = cleanedMemory.blockers.filter(b => !b.resolved);
      expect(activeBlockers.length).toBeGreaterThan(0);
      expect(activeBlockers.some(b => b.blocker.includes('Active blocker'))).toBe(true);
    });
  });

  describe('Integration with Agent Memory Manager', () => {
    test('should integrate with manual hygiene operations', async () => {
      await initializeWorkingMemory(testAgentName);

      // Add data
      for (let i = 0; i < 6; i++) {
        await updateWorkingMemory(testAgentName, {
          observation: `Integration test observation ${i + 1}`
        });
      }

      // Perform manual hygiene
      const results = await performAgentMemoryHygiene(testAgentName);
      
      expect(results).toBeDefined();
      expect(results.agentName).toBe(testAgentName);
      expect(results.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing memory files gracefully', async () => {
      const results = await performMemoryHygiene('nonexistent-agent');
      
      expect(results).toBeDefined();
      expect(results.skipped).toBe(true);
      expect(results.reason).toBe('No working memory found');
    });

    test('should handle configuration errors gracefully', async () => {
      // This tests the fallback configuration logic
      const status = await getMemoryHygieneStatus(testAgentName);
      
      expect(status).toBeDefined();
      // Should either succeed or provide meaningful error
      expect(status.status === 'no_memory' || status.status === 'error' || status.status === 'healthy').toBe(true);
    });
  });

  describe('Performance and Memory Usage', () => {
    test('should complete cleanup operations within reasonable time', async () => {
      await initializeWorkingMemory(testAgentName);

      // Add substantial amount of data
      for (let i = 0; i < 10; i++) {
        await updateWorkingMemory(testAgentName, {
          observation: `Performance test observation ${i + 1}`,
          decision: `Performance test decision ${i + 1}`,
          reasoning: `Detailed reasoning for performance test decision ${i + 1}`
        });
      }

      const startTime = Date.now();
      const results = await performMemoryHygiene(testAgentName, { force: true });
      const duration = Date.now() - startTime;

      expect(results.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(results.duration).toBeDefined();
    });

    test('should not create memory leaks during cleanup', async () => {
      await initializeWorkingMemory(testAgentName);

      // Track initial memory usage
      const initialMemoryUsage = process.memoryUsage();
      
      // Perform multiple cleanup cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        // Add data
        for (let i = 0; i < 8; i++) {
          await updateWorkingMemory(testAgentName, {
            observation: `Cycle ${cycle} observation ${i + 1}`
          });
        }

        // Cleanup
        await performMemoryHygiene(testAgentName, { force: true });
      }

      // Check memory usage hasn't grown excessively
      const finalMemoryUsage = process.memoryUsage();
      const memoryGrowth = finalMemoryUsage.heapUsed - initialMemoryUsage.heapUsed;
      
      // Allow for some growth, but not excessive (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });
  });
});

// Helper function to wait for async cleanup
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}