/**
 * Example configuration for integrating real agents with the BMad Workflow Orchestrator
 * 
 * This file demonstrates how to configure the orchestrator to work with actual agent
 * implementations instead of simulations.
 */

const WorkflowOrchestrator = require('../tools/workflow-orchestrator');
const WorkflowExecutor = require('../bmad-core/utils/workflow-executor');

// Example agent implementations (replace with your actual agents)
const devAgent = {
  execute: async (context) => {
    console.log('Dev agent executing with context:', context);
    // Your actual dev agent implementation here
    // Return format should match the simulator output
    return {
      success: true,
      filesModified: ['src/feature.js', 'tests/feature.test.js'],
      linesAdded: 150,
      linesRemoved: 20,
      testsAdded: 5,
      coverage: 85
    };
  }
};

const qaAgent = {
  execute: async (context) => {
    console.log('QA agent reviewing:', context);
    // Your actual QA agent implementation here
    // Return format should match the simulator output
    return {
      approved: true,
      issues: [],
      testsPassed: true,
      coverage: 85,
      performanceMetrics: {
        loadTime: 1.2,
        responseTime: 75
      }
    };
  }
};

// Configure the WorkflowExecutor with real agent callbacks
const configureProductionOrchestrator = (rootDir) => {
  const executor = new WorkflowExecutor(rootDir, {
    flowType: 'iterative',
    maxIterations: 5,
    callbacks: {
      dev: async (step, context) => {
        return await devAgent.execute(context);
      },
      qa: async (step, context) => {
        return await qaAgent.execute(context);
      },
      analyst: async (step, context) => {
        // Add your analyst agent implementation
        return {
          success: true,
          documentCreated: 'project-brief.md'
        };
      },
      pm: async (step, context) => {
        // Add your PM agent implementation
        return {
          success: true,
          documentCreated: 'prd.md'
        };
      },
      architect: async (step, context) => {
        // Add your architect agent implementation
        return {
          success: true,
          documentCreated: 'architecture.md'
        };
      }
    }
  });

  return executor;
};

// Example usage with custom agent integration
const runWithRealAgents = async () => {
  const rootDir = process.cwd();
  const orchestrator = new WorkflowOrchestrator(rootDir);
  
  // Replace the simulator with real agent callbacks
  orchestrator.simulateAgentWork = async (agent, action, context) => {
    const executor = configureProductionOrchestrator(rootDir);
    const step = { agent, action };
    const result = await executor.executeStep(step, context);
    return result.data;
  };

  // Run the orchestrator with real agents
  await orchestrator.run({
    storyFile: 'stories/feature.md',
    flowType: 'iterative'
  });
};

// Advanced configuration with custom simulation parameters
const configureSimulationMode = () => {
  const orchestrator = new WorkflowOrchestrator(process.cwd());
  
  // Configure simulation parameters
  orchestrator.simulator.configure({
    minDelay: 500,        // Faster simulation
    maxDelay: 1000,
    baseIssueChance: 0.5, // Lower chance of issues
    issueDecayRate: 0.3   // Issues decrease more slowly
  });

  return orchestrator;
};

module.exports = {
  configureProductionOrchestrator,
  runWithRealAgents,
  configureSimulationMode,
  // Export example agents for reference
  exampleAgents: {
    devAgent,
    qaAgent
  }
};