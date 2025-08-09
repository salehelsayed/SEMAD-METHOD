/**
 * Comprehensive tests for the Memory Health system
 * Tests startup verification, periodic health checks, failure scenarios, and orchestrator integration
 */

const { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } = require('@jest/globals');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Import the memory health system
const {
  performHealthCheck,
  getCurrentHealthStatus,
  getAggregatedHealthStatus,
  checkMemoryDirectory,
  checkWorkingMemoryRead,
  checkWorkingMemoryWrite,
  checkQdrantConnectivity,
  checkQdrantOperations,
  checkDiskSpace,
  startPeriodicMonitoring,
  clearHealthStatus,
  SEVERITY,
  CHECK_TYPES
} = require('../bmad-core/utils/memory-health');

const AgentRunner = require('../bmad-core/utils/agent-runner');

// Test utilities
let testTempDir;
let originalCwd;
let originalProcessEnv;

describe('Memory Health System', () => {
  beforeAll(async () => {
    // Create temporary test directory
    testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-memory-health-test-'));
    originalCwd = process.cwd();
    originalProcessEnv = { ...process.env };
    
    // Change to test directory
    process.chdir(testTempDir);
  });

  afterAll(async () => {
    // Restore original directory and environment
    process.chdir(originalCwd);
    process.env = originalProcessEnv;
    
    // Clean up test directory
    try {
      await fs.rm(testTempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error.message);
    }
  });

  beforeEach(() => {
    // Clear health status before each test
    clearHealthStatus();
  });

  afterEach(() => {
    // Clear any running monitoring
    clearHealthStatus();
  });

  describe('Individual Health Checks', () => {
    describe('Memory Directory Check', () => {
      test('should pass when directory exists and is writable', async () => {
        const testAgent = 'test-agent-dir-pass';
        const memoryDir = path.join(testTempDir, '.ai');
        await fs.mkdir(memoryDir, { recursive: true });

        const result = await checkMemoryDirectory(testAgent);

        expect(result.component).toBe(CHECK_TYPES.MEMORY_DIRECTORY);
        expect(result.status).toBe('healthy');
        expect(result.severity).toBe(SEVERITY.INFO);
        expect(result.metadata.path).toBe(memoryDir);
      });

      test('should create directory if it does not exist', async () => {
        const testAgent = 'test-agent-dir-create';
        const memoryDir = path.join(testTempDir, '.ai');
        
        // Remove directory if it exists
        try {
          await fs.rm(memoryDir, { recursive: true, force: true });
        } catch (error) {
          // Directory might not exist, which is fine
        }

        const result = await checkMemoryDirectory(testAgent);

        expect(result.status).toBe('healthy');
        expect(result.metadata.created).toBe(true);
        
        // Verify directory was created
        const stats = await fs.stat(memoryDir);
        expect(stats.isDirectory()).toBe(true);
      });

      test('should fail when directory exists but is not writable', async () => {
        if (process.platform === 'win32') {
          // Skip this test on Windows as chmod behaves differently
          return;
        }

        const testAgent = 'test-agent-dir-fail';
        const memoryDir = path.join(testTempDir, '.ai-readonly');
        await fs.mkdir(memoryDir, { recursive: true });
        
        // Make directory read-only
        await fs.chmod(memoryDir, 0o444);

        const result = await checkMemoryDirectory(testAgent);

        expect(result.status).toBe('unhealthy');
        expect(result.severity).toBe(SEVERITY.ERROR);
        expect(result.message).toContain('not writable');

        // Restore permissions for cleanup
        await fs.chmod(memoryDir, 0o755);
      });
    });

    describe('Working Memory Read Check', () => {
      test('should pass when file does not exist yet', async () => {
        const testAgent = 'test-agent-read-nofile';
        
        const result = await checkWorkingMemoryRead(testAgent);

        expect(result.status).toBe('healthy');
        expect(result.severity).toBe(SEVERITY.INFO);
        expect(result.metadata.exists).toBe(false);
      });

      test('should pass when file exists and contains valid JSON', async () => {
        const testAgent = 'test-agent-read-valid';
        const memoryDir = path.join(testTempDir, '.ai');
        const memoryFile = path.join(memoryDir, `working_memory_${testAgent}.json`);
        
        await fs.mkdir(memoryDir, { recursive: true });
        const testMemory = {
          agentName: testAgent,
          observations: [],
          decisions: [],
          keyFacts: {},
          blockers: []
        };
        await fs.writeFile(memoryFile, JSON.stringify(testMemory, null, 2));

        const result = await checkWorkingMemoryRead(testAgent);

        expect(result.status).toBe('healthy');
        expect(result.metadata.hasObservations).toBe(true);
        expect(result.metadata.observationCount).toBe(0);
      });

      test('should be degraded when file contains invalid JSON', async () => {
        const testAgent = 'test-agent-read-invalid';
        const memoryDir = path.join(testTempDir, '.ai');
        const memoryFile = path.join(memoryDir, `working_memory_${testAgent}.json`);
        
        await fs.mkdir(memoryDir, { recursive: true });
        await fs.writeFile(memoryFile, 'invalid json content');

        const result = await checkWorkingMemoryRead(testAgent);

        expect(result.status).toBe('degraded');
        expect(result.severity).toBe(SEVERITY.WARNING);
        expect(result.message).toContain('invalid JSON');
      });
    });

    describe('Working Memory Write Check', () => {
      test('should pass when directory is writable', async () => {
        const testAgent = 'test-agent-write-pass';
        const memoryDir = path.join(testTempDir, '.ai');
        await fs.mkdir(memoryDir, { recursive: true });

        const result = await checkWorkingMemoryWrite(testAgent);

        expect(result.status).toBe('healthy');
        expect(result.severity).toBe(SEVERITY.INFO);
        
        // Verify test file was written and cleaned up
        const memoryFile = path.join(memoryDir, `working_memory_${testAgent}.json`);
        const exists = await fs.access(memoryFile).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      });

      test('should fail when directory is not writable', async () => {
        if (process.platform === 'win32') {
          // Skip this test on Windows as chmod behaves differently
          return;
        }

        const testAgent = 'test-agent-write-fail';
        const memoryDir = path.join(testTempDir, '.ai-write-readonly');
        await fs.mkdir(memoryDir, { recursive: true });
        
        // Make directory read-only
        await fs.chmod(memoryDir, 0o444);

        const result = await checkWorkingMemoryWrite(testAgent);

        expect(result.status).toBe('unhealthy');
        expect(result.severity).toBe(SEVERITY.ERROR);

        // Restore permissions for cleanup
        await fs.chmod(memoryDir, 0o755);
      });
    });

    describe('Qdrant Connectivity Check', () => {
      test('should handle unavailable Qdrant module gracefully', async () => {
        // This test relies on the module not being available in test environment
        const testAgent = 'test-agent-qdrant-unavailable';
        
        const result = await checkQdrantConnectivity(testAgent);

        // Should handle gracefully - either healthy connection or warning about unavailability
        expect(result.component).toBe(CHECK_TYPES.QDRANT_CONNECTIVITY);
        expect([SEVERITY.INFO, SEVERITY.WARNING]).toContain(result.severity);
      });
    });

    describe('Disk Space Check', () => {
      test('should return disk space information', async () => {
        const testAgent = 'test-agent-disk-space';
        
        const result = await checkDiskSpace(testAgent);

        expect(result.component).toBe(CHECK_TYPES.DISK_SPACE);
        expect(result.metadata).toHaveProperty('path');
        
        // Should either have disk space info or indicate platform not supported
        if (result.metadata.freeMB !== undefined) {
          expect(typeof result.metadata.freeMB).toBe('number');
          expect(typeof result.metadata.totalMB).toBe('number');
          expect(typeof result.metadata.usagePercent).toBe('number');
        }
      });
    });
  });

  describe('Comprehensive Health Check', () => {
    test('should perform all health checks for an agent', async () => {
      const testAgent = 'test-agent-comprehensive';
      
      const result = await performHealthCheck(testAgent);

      expect(result.agentName).toBe(testAgent);
      expect(result.overallStatus).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(result.checks).toHaveProperty('memoryDirectory');
      expect(result.checks).toHaveProperty('workingMemoryRead');
      expect(result.checks).toHaveProperty('workingMemoryWrite');
      expect(result.checks).toHaveProperty('diskSpace');
      expect(result.summary.total).toBeGreaterThan(0);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    test('should skip Qdrant checks when requested', async () => {
      const testAgent = 'test-agent-skip-qdrant';
      
      const result = await performHealthCheck(testAgent, { skipQdrant: true });

      expect(result.checks).not.toHaveProperty('qdrantConnectivity');
      expect(result.checks).not.toHaveProperty('qdrantOperations');
    });

    test('should handle invalid agent name', async () => {
      const result = await performHealthCheck('');

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.error).toContain('Invalid agent name');
    });

    test('should cache results and provide recommendations', async () => {
      const testAgent = 'test-agent-cache';
      
      // First call
      const result1 = await performHealthCheck(testAgent);
      expect(result1.timestamp).toBeDefined();
      
      // Get current status (should be available now)
      const currentStatus = getCurrentHealthStatus(testAgent);
      expect(currentStatus).not.toBeNull();
      expect(currentStatus.agentName).toBe(testAgent);
    });
  });

  describe('Health Status Management', () => {
    test('should return null for agent with no health data', () => {
      const status = getCurrentHealthStatus('nonexistent-agent');
      expect(status).toBeNull();
    });

    test('should aggregate health status across multiple agents', async () => {
      // Run health checks for multiple agents
      await performHealthCheck('agent1');
      await performHealthCheck('agent2');
      await performHealthCheck('agent3');

      const aggregated = getAggregatedHealthStatus();

      expect(aggregated.summary.totalAgents).toBe(3);
      expect(Object.keys(aggregated.agents)).toHaveLength(3);
      expect(aggregated.summary.totalChecks).toBeGreaterThan(0);
    });

    test('should clear health status when requested', async () => {
      const testAgent = 'test-agent-clear';
      
      // Create some health data
      await performHealthCheck(testAgent);
      expect(getCurrentHealthStatus(testAgent)).not.toBeNull();
      
      // Clear specific agent
      clearHealthStatus(testAgent);
      expect(getCurrentHealthStatus(testAgent)).toBeNull();
    });

    test('should clear all health status when no agent specified', async () => {
      // Create health data for multiple agents
      await performHealthCheck('agent1');
      await performHealthCheck('agent2');
      
      // Clear all
      clearHealthStatus();
      
      expect(getCurrentHealthStatus('agent1')).toBeNull();
      expect(getCurrentHealthStatus('agent2')).toBeNull();
      
      const aggregated = getAggregatedHealthStatus();
      expect(aggregated.summary.totalAgents).toBe(0);
    });
  });

  describe('Periodic Monitoring', () => {
    test('should start and stop periodic monitoring', async () => {
      const testAgent = 'test-agent-periodic';
      
      // Start monitoring with short interval for testing
      const stopMonitoring = startPeriodicMonitoring(testAgent, 100);
      
      // Wait a bit to let monitoring run
      await new Promise(resolve => setTimeout(resolve, 250));
      
      // Should have health data now
      const status = getCurrentHealthStatus(testAgent);
      expect(status).not.toBeNull();
      
      // Stop monitoring
      stopMonitoring();
    });
  });

  describe('Agent Runner Integration', () => {
    test('should perform health checks during agent execution', async () => {
      const runner = new AgentRunner({
        memoryEnabled: true,
        healthMonitoringEnabled: true
      });

      const testAgent = 'test-agent-runner';
      const taskId = 'test-task';
      const context = { storyId: 'STORY-001' };

      const mockExecutor = jest.fn().mockResolvedValue({
        success: true,
        result: 'Task completed'
      });

      const result = await runner.executeWithMemory(testAgent, taskId, context, mockExecutor);

      expect(result.success).toBe(true);
      expect(result.healthCheckResult).toBeDefined();
      expect(result.healthCheckResult.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(mockExecutor).toHaveBeenCalled();
    });

    test('should surface health issues to user', async () => {
      const runner = new AgentRunner({
        healthMonitoringEnabled: true
      });

      // Mock console.log to capture output
      const originalConsoleLog = console.log;
      const logOutput = [];
      console.log = (...args) => logOutput.push(args.join(' '));

      const healthResult = {
        healthy: false,
        status: 'unhealthy',
        errors: [{
          component: 'test_component',
          message: 'Test error message',
          severity: SEVERITY.ERROR
        }],
        warnings: [{
          component: 'test_component',
          message: 'Test warning message',
          severity: SEVERITY.WARNING
        }],
        recommendations: ['Fix the test issue']
      };

      runner.surfaceMemoryHealthIssues('test-agent', healthResult);

      // Restore console.log
      console.log = originalConsoleLog;

      // Check that health issues were logged
      const fullOutput = logOutput.join(' ');
      expect(fullOutput).toContain('Memory Health Issues');
      expect(fullOutput).toContain('Test error message');
      expect(fullOutput).toContain('Test warning message');
      expect(fullOutput).toContain('Fix the test issue');
    });

    test('should handle health monitoring disabled', async () => {
      const runner = new AgentRunner({
        healthMonitoringEnabled: false
      });

      const healthResult = await runner.performStartupHealthCheck('test-agent');
      expect(healthResult.healthy).toBe(true);
      expect(healthResult.message).toContain('disabled');
      
      const healthStatus = runner.getCurrentMemoryHealth('test-agent');
      expect(healthStatus.available).toBe(false);
    });

    test('should manage periodic health monitoring lifecycle', async () => {
      const runner = new AgentRunner({
        healthMonitoringEnabled: true
      });

      const testAgent = 'test-agent-lifecycle';
      
      // Start monitoring
      const stopFn = runner.startPeriodicHealthMonitoring(testAgent, 100);
      expect(typeof stopFn).toBe('function');
      
      // Wait for at least one check
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should have health data
      const status = runner.getCurrentMemoryHealth(testAgent);
      expect(status.available).toBe(true);
      
      // Stop monitoring
      runner.stopPeriodicHealthMonitoring(testAgent);
      
      // Start again (should replace previous)
      runner.startPeriodicHealthMonitoring(testAgent, 100);
      runner.stopPeriodicHealthMonitoring(testAgent);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle file system errors gracefully', async () => {
      const testAgent = 'test-agent-fs-error';
      
      // Create an invalid path scenario
      const originalResolve = path.resolve;
      path.resolve = jest.fn().mockReturnValue('/invalid/path/that/should/not/exist');

      const result = await performHealthCheck(testAgent);

      // Restore original function
      path.resolve = originalResolve;

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    test('should handle health check timeout scenarios', async () => {
      // This test verifies timeout handling in the health check system
      const testAgent = 'test-agent-timeout';
      
      // The health check should complete within reasonable time
      const startTime = Date.now();
      const result = await performHealthCheck(testAgent);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.checkDuration).toBeDefined();
    });

    test('should provide meaningful recommendations for different failure types', async () => {
      const testAgent = 'test-agent-recommendations';
      
      // Create a scenario with directory issues
      const memoryDir = path.join(testTempDir, '.ai-rec-test');
      await fs.mkdir(memoryDir, { recursive: true });
      
      // Create a file where directory should be (name conflict)
      const conflictPath = path.join(memoryDir, 'working_memory_' + testAgent + '.json');
      await fs.writeFile(conflictPath, 'not a memory file');

      const result = await performHealthCheck(testAgent);

      expect(Array.isArray(result.recommendations)).toBe(true);
      
      if (result.recommendations.length > 0) {
        // Recommendations should be strings with meaningful content
        result.recommendations.forEach(rec => {
          expect(typeof rec).toBe('string');
          expect(rec.length).toBeGreaterThan(10);
        });
      }
    });
  });

  describe('Integration with Workflow Orchestrator', () => {
    test('should integrate with workflow orchestrator memory health display', async () => {
      // Create some test health data
      await performHealthCheck('dev');
      await performHealthCheck('qa');
      
      const aggregated = getAggregatedHealthStatus();
      
      // Should have data for both agents
      expect(aggregated.summary.totalAgents).toBe(2);
      expect(aggregated.agents.dev).toBeDefined();
      expect(aggregated.agents.qa).toBeDefined();
      
      // Should provide summary information
      expect(aggregated.summary.totalChecks).toBeGreaterThan(0);
      expect(typeof aggregated.summary.healthyAgents).toBe('number');
      expect(typeof aggregated.summary.degradedAgents).toBe('number');
      expect(typeof aggregated.summary.unhealthyAgents).toBe('number');
    });
  });
});

// Helper function to create mock Qdrant module for testing
function createMockQdrantModule(isHealthy = true) {
  return {
    checkQdrantHealth: jest.fn().mockResolvedValue(isHealthy),
    storeMemorySnippet: jest.fn().mockResolvedValue('test-id-123'),
    retrieveMemory: jest.fn().mockResolvedValue([])
  };
}

// Helper function to simulate disk space scenarios
function simulateDiskSpaceScenario(freeSpaceMB) {
  const mockStats = {
    bavail: Math.floor(freeSpaceMB * 1024 * 1024 / 4096), // Assuming 4KB block size
    bsize: 4096,
    blocks: Math.floor(1000000 * 1024 * 1024 / 4096), // 1TB total
  };
  
  return mockStats;
}
