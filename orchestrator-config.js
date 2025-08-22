// Orchestrator Configuration with Gates

const OrchestratorGates = require('./tools/orchestrator/gates');

module.exports = {
  // Workflow phases
  phases: {
    planning: {
      agents: ['analyst', 'pm', 'architect'],
      gate: 'planning',
      outputs: ['brief.json', 'PRD.json', 'architecture.json']
    },
    development: {
      agents: ['scrum-master', 'dev'],
      gate: 'dev',
      outputs: ['patch-plan.json', 'implementation']
    },
    qa: {
      agents: ['qa'],
      gate: 'qa',
      outputs: ['test-results.json', 'qa-report.md']
    }
  },
  
  // Gate enforcement hooks
  gates: {
    beforePhaseTransition: async (fromPhase, toPhase, context) => {
      const gates = new OrchestratorGates();
      
      if (fromPhase === 'planning' && toPhase === 'development') {
        await gates.enforceGate('planning');
      } else if (fromPhase === 'development' && toPhase === 'qa') {
        await gates.enforceGate('dev', context.storyId);
      } else if (fromPhase === 'qa' && toPhase === 'done') {
        await gates.enforceGate('qa', context.storyId);
      }
    }
  },
  
  // Error handling
  onGateFailure: (gate, error) => {
    console.error(`Gate ${gate} failed: ${error.message}`);
    // Could send notifications, create issues, etc.
  }
};
