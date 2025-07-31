const AgentSimulator = require('../bmad-core/utils/agent-simulator');

describe('AgentSimulator', () => {
  let simulator;

  beforeEach(() => {
    simulator = new AgentSimulator({
      minDelay: 10,  // Fast tests
      maxDelay: 20
    });
  });

  describe('simulateAgentWork', () => {
    it('should simulate dev implementation work', async () => {
      const result = await simulator.simulateAgentWork('dev', 'implement', {});
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('filesModified');
      expect(result).toHaveProperty('linesAdded');
      expect(result).toHaveProperty('linesRemoved');
      expect(result).toHaveProperty('testsAdded');
      expect(result).toHaveProperty('coverage');
      expect(result.filesModified).toBeGreaterThanOrEqual(1);
      expect(result.coverage).toBeGreaterThanOrEqual(75);
    });

    it('should simulate dev fix work', async () => {
      const context = {
        qaFeedback: ['issue1', 'issue2']
      };
      const result = await simulator.simulateAgentWork('dev', 'fix', context);
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('issuesAddressed', 2);
      expect(result).toHaveProperty('testsUpdated');
    });

    it('should simulate QA review with decreasing issue probability', async () => {
      // Test multiple iterations
      const results = [];
      for (let i = 1; i <= 5; i++) {
        const result = await simulator.simulateAgentWork('qa', 'review', { iteration: i });
        results.push(result);
      }

      // Later iterations should have higher approval rates
      const approvalRates = results.map(r => r.approved ? 1 : 0);
      const earlyRate = approvalRates.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const lateRate = approvalRates.slice(3, 5).reduce((a, b) => a + b, 0) / 2;
      
      // This is probabilistic, so we can't guarantee, but late should tend to be higher
      expect(lateRate).toBeGreaterThanOrEqual(earlyRate);
    });

    it('should simulate analyst work', async () => {
      const result = await simulator.simulateAgentWork('analyst', 'analyze', {});
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('documentCreated', 'project-brief.md');
      expect(result).toHaveProperty('researchPoints');
      expect(result.researchPoints).toBeGreaterThanOrEqual(5);
    });

    it('should simulate PM work', async () => {
      const result = await simulator.simulateAgentWork('pm', 'plan', {});
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('documentCreated', 'prd.md');
      expect(result).toHaveProperty('userStoriesCreated');
      expect(result.userStoriesCreated).toBeGreaterThanOrEqual(5);
    });

    it('should simulate architect work', async () => {
      const result = await simulator.simulateAgentWork('architect', 'design', {});
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('documentCreated', 'architecture.md');
      expect(result).toHaveProperty('componentsDesigned');
      expect(result).toHaveProperty('techStackDefined', true);
    });

    it('should handle unknown agents gracefully', async () => {
      const result = await simulator.simulateAgentWork('unknown', 'action', {});
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('agent', 'unknown');
      expect(result).toHaveProperty('action', 'action');
      expect(result).toHaveProperty('completed');
    });
  });

  describe('generateQAIssues', () => {
    it('should generate between 1 and 3 issues', () => {
      const issues = simulator.generateQAIssues();
      
      expect(Array.isArray(issues)).toBe(true);
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues.length).toBeLessThanOrEqual(3);
      expect(issues.every(issue => typeof issue === 'string')).toBe(true);
    });

    it('should generate valid issue strings', () => {
      const issues = simulator.generateQAIssues();
      
      // All issues should be non-empty strings
      expect(issues.every(issue => typeof issue === 'string' && issue.length > 0)).toBe(true);
      
      // Issues should be from the known pool
      const knownIssues = [
        'Missing error handling in API endpoint',
        'Inconsistent variable naming convention',
        'Unit test coverage below threshold',
        'Missing JSDoc comments for public methods',
        'Potential null pointer exception',
        'Performance concern in data processing loop',
        'Missing input validation',
        'Hardcoded configuration values',
        'Accessibility issues in UI components',
        'SQL injection vulnerability',
        'Memory leak in event listeners',
        'Race condition in async operations'
      ];
      
      expect(issues.every(issue => knownIssues.includes(issue))).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should allow configuration of simulation parameters', () => {
      simulator.configure({
        minDelay: 100,
        maxDelay: 200,
        baseIssueChance: 0.9,
        issueDecayRate: 0.2
      });

      expect(simulator.minDelay).toBe(100);
      expect(simulator.maxDelay).toBe(200);
      expect(simulator.baseIssueChance).toBe(0.9);
      expect(simulator.issueDecayRate).toBe(0.2);
    });
  });
});