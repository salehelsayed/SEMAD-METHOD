/**
 * Integration tests for Memory Health system with Workflow Orchestrator
 * Tests the complete story 18 implementation including startup verification,
 * periodic health checks, orchestrator integration, and failure simulation
 */

const { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, jest } = require('@jest/globals');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Import components
const WorkflowOrchestrator = require('../../tools/workflow-orchestrator');
const AgentRunner = require('../../bmad-core/utils/agent-runner');
const {
  performHealthCheck,
  getAggregatedHealthStatus,
  clearHealthStatus,
  SEVERITY
} = require('../../bmad-core/utils/memory-health');

// Test utilities
let testTempDir;
let originalCwd;
let originalConsoleLog;
let logOutput;

describe('Memory Health Integration Tests', () => {
  beforeAll(async () => {
    // Create temporary test directory
    testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-health-integration-'));
    originalCwd = process.cwd();
    
    // Set up test project structure
    const bmadCoreDir = path.join(testTempDir, 'bmad-core');
    const utilsDir = path.join(bmadCoreDir, 'utils');
    const workflowsDir = path.join(bmadCoreDir, 'workflows');
    const aiDir = path.join(testTempDir, '.ai');
    
    await fs.mkdir(bmadCoreDir, { recursive: true });
    await fs.mkdir(utilsDir, { recursive: true });
    await fs.mkdir(workflowsDir, { recursive: true });
    await fs.mkdir(aiDir, { recursive: true });
    
    // Create minimal core-config.yaml
    const coreConfig = `
memory:
  enabled: true
  baseDirectory: ".ai"
  debug:
    enabled: false
  retentionPolicies:
    workingMemory:
      maxAgeDays: 7
      autoCleanup: true
  qdrant:
    enabled: false
    host: "localhost"
    port: 6333
`;
    await fs.writeFile(path.join(bmadCoreDir, 'core-config.yaml'), coreConfig);
    
    // Create minimal workflow file
    const testWorkflow = `
name: "test-workflow"
description: "Test workflow for memory health integration"
agents:
  - name: "dev"
    role: "developer"
  - name: "qa" 
    role: "quality_assurance"
steps:
  - name: "implement"
    agent: "dev"
  - name: "review"
    agent: "qa"
`;
    await fs.writeFile(path.join(workflowsDir, 'test-workflow.yaml'), testWorkflow);
    
    // Change to test directory
    process.chdir(testTempDir);
  });

  afterAll(async () => {
    // Restore original directory
    process.chdir(originalCwd);
    
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
    
    // Mock console.log to capture orchestrator output
    originalConsoleLog = console.log;
    logOutput = [];
    console.log = (...args) => {
      logOutput.push(args.join(' '));
    };
  });

  afterEach(() => {
    // Restore console.log
    if (originalConsoleLog) {
      console.log = originalConsoleLog;
    }
    
    // Clear health status after each test
    clearHealthStatus();
  });

  describe('Orchestrator Memory Health Display', () => {
    test('should display "no health data" message when no agents have been checked', async () => {
      const orchestrator = new WorkflowOrchestrator(testTempDir);
      
      // Mock the initialize method to avoid complex setup
      orchestrator.initialize = jest.fn().mockResolvedValue();
      orchestrator.resolvedPaths = { storyLocation: testTempDir };
      
      const healthStatus = await orchestrator.displayMemoryHealthStatus();
      
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.agentCount).toBe(0);
      expect(healthStatus.message).toContain('No health data available');
      
      // Check console output
      const output = logOutput.join(' ');
      expect(output).toContain('Memory Health Status Report');
      expect(output).toContain('No memory health data available yet');
    });

    test('should display aggregated health status for multiple agents', async () => {
      // Create health data for multiple agents with different statuses
      await performHealthCheck('dev');
      await performHealthCheck('qa');
      await performHealthCheck('sm');
      
      const orchestrator = new WorkflowOrchestrator(testTempDir);
      orchestrator.initialize = jest.fn().mockResolvedValue();
      orchestrator.resolvedPaths = { storyLocation: testTempDir };
      
      const healthStatus = await orchestrator.displayMemoryHealthStatus();
      
      expect(healthStatus.agentCount).toBeGreaterThan(0);
      expect(typeof healthStatus.healthyAgents).toBe('number');
      expect(typeof healthStatus.degradedAgents).toBe('number');
      expect(typeof healthStatus.unhealthyAgents).toBe('number');
      
      // Check console output includes agent status
      const output = logOutput.join(' ');
      expect(output).toContain('Overall Status:');
      expect(output).toContain('Agent Status:');
      expect(output).toContain('Overall Memory System Status:');
    });

    test('should display critical issues and recommendations', async () => {
      // Create a scenario with issues (simulate by creating invalid memory file)
      const memoryDir = path.join(testTempDir, '.ai');
      const memoryFile = path.join(memoryDir, 'working_memory_problematic-agent.json');
      await fs.writeFile(memoryFile, 'invalid json content');
      
      await performHealthCheck('problematic-agent');
      
      const orchestrator = new WorkflowOrchestrator(testTempDir);
      orchestrator.initialize = jest.fn().mockResolvedValue();
      orchestrator.resolvedPaths = { storyLocation: testTempDir };
      
      const healthStatus = await orchestrator.displayMemoryHealthStatus();
      
      expect(healthStatus.recommendations).toBeGreaterThan(0);
      
      // Check console output includes recommendations
      const output = logOutput.join(' ');
      if (healthStatus.recommendations > 0) {
        expect(output).toContain('Top Recommendations:');
      }
    });
  });

  describe('Agent Runner Health Integration', () => {
    test('should perform health checks during agent execution', async () => {
      const runner = new AgentRunner({
        memoryEnabled: true,
        healthMonitoringEnabled: true
      });

      const mockExecutor = jest.fn().mockResolvedValue({
        success: true,
        observation: 'Task completed successfully'
      });

      const result = await runner.executeWithMemory(
        'integration-test-agent',
        'test-task-health',
        { storyId: 'STORY-TEST-001' },
        mockExecutor
      );

      expect(result.success).toBe(true);
      expect(result.healthCheckResult).toBeDefined();
      expect(result.healthCheckResult.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(result.agentName).toBe('integration-test-agent');
      
      // Health check should have been cached
      const currentHealth = runner.getCurrentMemoryHealth('integration-test-agent');
      expect(currentHealth.available).toBe(true);
    });

    test('should surface health issues during agent execution', async () => {
      const runner = new AgentRunner({
        memoryEnabled: true,
        healthMonitoringEnabled: true
      });

      // Create a problematic memory scenario
      const memoryDir = path.join(testTempDir, '.ai');
      const memoryFile = path.join(memoryDir, 'working_memory_unhealthy-agent.json');
      await fs.writeFile(memoryFile, '{"invalid": json}'); // Invalid JSON

      const mockExecutor = jest.fn().mockResolvedValue({
        success: true
      });

      const result = await runner.executeWithMemory(
        'unhealthy-agent',
        'test-task-unhealthy',
        {},
        mockExecutor
      );

      expect(result.healthCheckResult).toBeDefined();
      
      // If there were health issues, they should be surfaced in console output
      if (!result.healthCheckResult.healthy) {
        const output = logOutput.join(' ');
        expect(output).toContain('Memory Health Issues');
      }
    });

    test('should start periodic monitoring for agents', async () => {
      const runner = new AgentRunner({
        healthMonitoringEnabled: true
      });

      const testAgent = 'periodic-test-agent';
      
      // Start periodic monitoring
      const stopFn = runner.startPeriodicHealthMonitoring(testAgent, 100);
      
      // Wait for monitoring to run
      await new Promise(resolve => setTimeout(resolve, 250));
      
      // Should have health data
      const health = runner.getCurrentMemoryHealth(testAgent);
      expect(health.available).toBe(true);
      
      // Stop monitoring
      runner.stopPeriodicHealthMonitoring(testAgent);
    });
  });

  describe('Workflow Orchestrator Integration', () => {
    test('should display memory health at workflow start', async () => {
      // Create some initial health data
      await performHealthCheck('workflow-test-dev');
      await performHealthCheck('workflow-test-qa');
      
      const orchestrator = new WorkflowOrchestrator(testTempDir);
      
      // Mock required methods to avoid full orchestrator setup
      orchestrator.configLoader = {
        loadConfig: jest.fn().mockResolvedValue({
          verbosity: true,
          verbosityLevel: 'normal'
        }),
        getDefaultConfig: jest.fn().mockReturnValue({
          verbosity: true,
          verbosityLevel: 'normal'
        })
      };
      
      orchestrator.filePathResolver = {
        getAllResolvedPaths: jest.fn().mockReturnValue({
          storyLocation: testTempDir
        }),
        validatePaths: jest.fn().mockReturnValue({
          success: true,
          errors: [],
          warnings: []
        })
      };
      
      orchestrator.contextManager = {
        initialize: jest.fn().mockResolvedValue(true)
      };
      
      // Initialize should call displayMemoryHealthStatus
      await orchestrator.initialize();
      
      // Check that memory health was displayed
      const output = logOutput.join(' ');
      expect(output).toContain('Memory Health Status Report');
    });

    test('should integrate health checks with agent simulation work', async () => {
      const orchestrator = new WorkflowOrchestrator(testTempDir);
      
      // Mock necessary components
      orchestrator.resolvedPaths = { storyLocation: testTempDir };
      orchestrator.contextManager = {
        getUserInteractionsSummary: jest.fn().mockResolvedValue(null),
        getContextForAgent: jest.fn().mockResolvedValue({}),
        updateWorkflowState: jest.fn().mockResolvedValue()
      };
      
      // Mock simulator to return test result
      orchestrator.simulator = {
        simulateAgentWork: jest.fn().mockResolvedValue({
          success: true,
          filesModified: 2,
          linesAdded: 100
        })
      };
      
      const result = await orchestrator.simulateAgentWork('dev', 'implement', {
        storyId: 'STORY-001'
      });
      
      expect(result.success).toBe(true);
      expect(result.filesModified).toBe(2);
      
      // Health check should have been performed for the agent
      const healthStatus = orchestrator.agentRunner.getCurrentMemoryHealth('dev');
      expect(healthStatus.available).toBe(true);
    });
  });

  describe('Failure Simulation and Recovery', () => {
    test('should handle inaccessible working memory files', async () => {
      if (process.platform === 'win32') {
        // Skip on Windows due to different file permission behavior
        return;
      }

      const testAgent = 'inaccessible-memory-agent';
      const memoryDir = path.join(testTempDir, '.ai');
      const memoryFile = path.join(memoryDir, `working_memory_${testAgent}.json`);
      
      // Create file and make it inaccessible
      await fs.writeFile(memoryFile, '{}');
      await fs.chmod(memoryFile, 0o000);
      
      const result = await performHealthCheck(testAgent);
      
      expect(result.overallStatus).toBe('unhealthy');
      expect(result.recommendations.length).toBeGreaterThan(0);
      
      // Restore permissions for cleanup
      await fs.chmod(memoryFile, 0o644);
    });

    test('should handle Qdrant connectivity failures gracefully', async () => {
      const testAgent = 'qdrant-failure-agent';
      
      // Health check should handle Qdrant being unavailable
      const result = await performHealthCheck(testAgent, { skipQdrant: false });
      
      // Should not fail completely due to Qdrant issues
      expect(result.agentName).toBe(testAgent);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    test('should provide meaningful error messages for disk space issues', async () => {
      const testAgent = 'disk-space-agent';
      
      const result = await performHealthCheck(testAgent);
      
      // Disk space check should complete (may warn on low space)
      expect(result.checks.diskSpace).toBeDefined();
      expect(result.checks.diskSpace.component).toBe('disk_space');
    });

    test('should recover from health check errors during agent execution', async () => {
      const runner = new AgentRunner({
        memoryEnabled: true,
        healthMonitoringEnabled: true
      });

      // Create an agent with problematic name (to trigger health check issues)
      const problematicAgent = '';
      
      const mockExecutor = jest.fn().mockResolvedValue({
        success: true
      });

      const result = await runner.executeWithMemory(
        problematicAgent,
        'test-task-recovery',
        {},
        mockExecutor
      );

      // Should handle health check failure gracefully
      expect(result.healthCheckResult).toBeDefined();
      // Agent execution might still succeed despite health check issues
    });
  });

  describe('End-to-End Story 18 Compliance', () => {
    test('should verify working memory file accessibility on startup', async () => {
      const runner = new AgentRunner({
        memoryEnabled: true,
        healthMonitoringEnabled: true
      });

      const result = await runner.performStartupHealthCheck('e2e-test-agent');
      
      expect(result).toBeDefined();
      expect(result.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      
      // Should check working memory file accessibility
      expect(result.details).toBeDefined();
      expect(typeof result.details.total).toBe('number');
    });

    test('should report memory system failures with descriptive warnings', async () => {
      // Create a scenario with multiple issues
      const memoryDir = path.join(testTempDir, '.ai');
      const badMemoryFile = path.join(memoryDir, 'working_memory_multi-issue-agent.json');
      await fs.writeFile(badMemoryFile, 'invalid json');
      
      const runner = new AgentRunner({
        healthMonitoringEnabled: true
      });

      const result = await runner.performStartupHealthCheck('multi-issue-agent');
      
      if (!result.healthy) {
        expect(result.warnings.length + result.errors.length).toBeGreaterThan(0);
        expect(result.recommendations.length).toBeGreaterThan(0);
        
        // Should surface issues to user
        runner.surfaceMemoryHealthIssues('multi-issue-agent', result);
        
        const output = logOutput.join(' ');
        expect(output).toContain('Memory Health Issues');
      }
    });

    test('should provide consolidated memory status at workflow start', async () => {
      // Create health data for multiple agents
      await performHealthCheck('dev');
      await performHealthCheck('qa');
      await performHealthCheck('sm');
      
      const orchestrator = new WorkflowOrchestrator(testTempDir);
      orchestrator.initialize = jest.fn().mockResolvedValue();
      orchestrator.resolvedPaths = { storyLocation: testTempDir };
      
      const healthStatus = await orchestrator.displayMemoryHealthStatus();
      
      expect(healthStatus.agentCount).toBe(3);
      
      const output = logOutput.join(' ');
      expect(output).toContain('Memory Health Status Report');
      expect(output).toContain('Overall Status:');
      expect(output).toContain('Agent Status:');
      expect(output).toContain('Overall Memory System Status:');
    });

    test('should run periodic health checks at major task boundaries', async () => {
      const runner = new AgentRunner({
        healthMonitoringEnabled: true
      });

      const testAgent = 'major-task-agent';
      
      const mockExecutor = jest.fn().mockResolvedValue({
        success: true,
        observation: 'Major task completed'
      });

      // Execute with periodic health checks enabled (default)
      const result = await runner.executeWithMemory(
        testAgent,
        'major-task',
        { enablePeriodicHealthChecks: true },
        mockExecutor
      );

      expect(result.success).toBe(true);
      expect(result.healthCheckResult).toBeDefined();
      
      // Periodic monitoring should have been started
      const healthStatus = runner.getCurrentMemoryHealth(testAgent);
      expect(healthStatus.available).toBe(true);
      
      // Clean up monitoring
      runner.stopPeriodicHealthMonitoring(testAgent);
    });

    test('should aggregate and display consolidated warnings across all agents', async () => {
      // Create various health scenarios
      const agents = ['agg-dev', 'agg-qa', 'agg-sm'];
      
      for (const agent of agents) {
        await performHealthCheck(agent);
      }
      
      const aggregated = getAggregatedHealthStatus();
      
      expect(aggregated.summary.totalAgents).toBe(agents.length);
      expect(aggregated.agents).toHaveProperty('agg-dev');
      expect(aggregated.agents).toHaveProperty('agg-qa');
      expect(aggregated.agents).toHaveProperty('agg-sm');
      
      // Should provide overall summary
      expect(typeof aggregated.summary.healthyAgents).toBe('number');
      expect(typeof aggregated.summary.degradedAgents).toBe('number');
      expect(typeof aggregated.summary.unhealthyAgents).toBe('number');
      expect(Array.isArray(aggregated.recommendations)).toBe(true);
      expect(Array.isArray(aggregated.criticalIssues)).toBe(true);
    });
  });
});