/**
 * Agent Simulator for BMad Workflow Orchestrator
 * Provides realistic simulation of agent work for testing and demonstration
 */

const VerboseLogger = require('./verbose-logger');

class AgentSimulator {
  constructor(options = {}) {
    this.minDelay = options.minDelay || 1000;
    this.maxDelay = options.maxDelay || 2000;
    this.baseIssueChance = options.baseIssueChance || 0.7;
    this.issueDecayRate = options.issueDecayRate || 0.5;
    this.logger = new VerboseLogger(options.loggerConfig || {});
  }

  /**
   * Configure logger settings
   */
  configureLogger(config) {
    this.logger.configure(config);
  }

  /**
   * Simulate agent work with realistic delays and outcomes
   * @param {string} agent - The agent type (dev, qa, etc.)
   * @param {string} action - The action being performed
   * @param {Object} context - Execution context
   * @returns {Object} Simulated result
   */
  async simulateAgentWork(agent, action, context) {
    this.logger.taskStart(`Simulating ${agent} agent work`, `Action: ${action}`, 'detailed');
    
    // Simulate processing time
    const delay = this.minDelay + Math.random() * (this.maxDelay - this.minDelay);
    await new Promise(resolve => setTimeout(resolve, delay));

    switch (agent) {
      case 'dev':
        return this.simulateDevWork(action, context);
      case 'qa':
        return this.simulateQAWork(action, context);
      case 'analyst':
        return this.simulateAnalystWork(action, context);
      case 'pm':
        return this.simulatePMWork(action, context);
      case 'architect':
        return this.simulateArchitectWork(action, context);
      case 'sm':
        return this.simulateSMWork(action, context);
      default:
        return this.simulateGenericWork(agent, action, context);
    }
  }

  /**
   * Simulate Dev agent work
   */
  simulateDevWork(action, context) {
    if (action === 'implement' || action === 'implement_story') {
      return {
        success: true,
        filesModified: Math.floor(Math.random() * 5) + 1,
        linesAdded: Math.floor(Math.random() * 200) + 50,
        linesRemoved: Math.floor(Math.random() * 50) + 10,
        testsAdded: Math.floor(Math.random() * 10) + 2,
        coverage: 75 + Math.random() * 20
      };
    } else if (action === 'fix' || action === 'address_qa_feedback') {
      return {
        success: true,
        filesModified: Math.floor(Math.random() * 3) + 1,
        linesAdded: Math.floor(Math.random() * 50) + 10,
        linesRemoved: Math.floor(Math.random() * 20) + 5,
        issuesAddressed: context.qaFeedback?.length || 0,
        testsUpdated: Math.floor(Math.random() * 5) + 1
      };
    }
    
    return { success: true, action: action };
  }

  /**
   * Simulate QA agent work - Review only, no implementation
   */
  simulateQAWork(action, context) {
    const iteration = context.iteration || 1;
    const issueChance = this.baseIssueChance * Math.pow(this.issueDecayRate, iteration - 1);
    
    if (Math.random() > issueChance) {
      return {
        approved: true,
        issues: [],
        testsPassed: true,
        coverage: context.implementation?.coverage || 85,
        performanceMetrics: {
          loadTime: Math.random() * 2 + 0.5,
          responseTime: Math.random() * 100 + 50
        },
        report: {
          status: 'Approved',
          summary: 'Code meets quality standards and all acceptance criteria',
          recommendations: []
        }
      };
    } else {
      const issues = this.generateQAIssues();
      return {
        approved: false,
        issues: issues,
        testsPassed: Math.random() > 0.3,
        coverage: context.implementation?.coverage || 75,
        severity: this.calculateSeverity(issues),
        report: {
          status: 'Needs Fixes',
          summary: `Found ${issues.length} issues requiring Dev agent attention`,
          recommendations: issues.map(issue => ({
            issue: issue,
            action: 'Dev agent should implement fix',
            priority: this.getIssuePriority(issue)
          }))
        }
      };
    }
  }

  /**
   * Generate realistic QA issues
   */
  generateQAIssues() {
    const issuePool = [
      { issue: 'Missing error handling in API endpoint', severity: 'high' },
      { issue: 'Inconsistent variable naming convention', severity: 'low' },
      { issue: 'Unit test coverage below threshold', severity: 'medium' },
      { issue: 'Missing JSDoc comments for public methods', severity: 'low' },
      { issue: 'Potential null pointer exception', severity: 'high' },
      { issue: 'Performance concern in data processing loop', severity: 'medium' },
      { issue: 'Missing input validation', severity: 'high' },
      { issue: 'Hardcoded configuration values', severity: 'medium' },
      { issue: 'Accessibility issues in UI components', severity: 'medium' },
      { issue: 'SQL injection vulnerability', severity: 'critical' },
      { issue: 'Memory leak in event listeners', severity: 'high' },
      { issue: 'Race condition in async operations', severity: 'high' }
    ];
    
    const numIssues = Math.floor(Math.random() * 3) + 1;
    const selectedIssues = [];
    
    for (let i = 0; i < numIssues; i++) {
      const randomIndex = Math.floor(Math.random() * issuePool.length);
      const issue = issuePool[randomIndex];
      if (!selectedIssues.find(i => i.issue === issue.issue)) {
        selectedIssues.push(issue.issue);
      }
    }
    
    return selectedIssues;
  }

  /**
   * Calculate overall severity based on issues
   */
  calculateSeverity(issues) {
    if (issues.some(i => i.includes('vulnerability') || i.includes('injection'))) {
      return 'critical';
    }
    if (issues.some(i => i.includes('null pointer') || i.includes('memory leak'))) {
      return 'high';
    }
    if (issues.length > 2) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get priority for a specific issue
   */
  getIssuePriority(issue) {
    if (issue.includes('vulnerability') || issue.includes('injection')) {
      return 'critical';
    }
    if (issue.includes('null pointer') || issue.includes('memory leak') || issue.includes('error handling')) {
      return 'high';
    }
    if (issue.includes('performance') || issue.includes('validation')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Simulate Analyst agent work
   */
  simulateAnalystWork(action, context) {
    return {
      success: true,
      documentCreated: 'project-brief.md',
      sectionsCompleted: ['overview', 'requirements', 'constraints', 'risks'],
      researchPoints: Math.floor(Math.random() * 10) + 5,
      stakeholdersIdentified: Math.floor(Math.random() * 5) + 2
    };
  }

  /**
   * Simulate PM agent work
   */
  simulatePMWork(action, context) {
    return {
      success: true,
      documentCreated: 'prd.md',
      featuresIdentified: Math.floor(Math.random() * 8) + 3,
      userStoriesCreated: Math.floor(Math.random() * 15) + 5,
      acceptanceCriteria: Math.floor(Math.random() * 20) + 10,
      priorityAssigned: true
    };
  }

  /**
   * Simulate Architect agent work
   */
  simulateArchitectWork(action, context) {
    return {
      success: true,
      documentCreated: 'architecture.md',
      componentsDesigned: Math.floor(Math.random() * 10) + 5,
      diagramsCreated: Math.floor(Math.random() * 5) + 2,
      decisionsDocumented: Math.floor(Math.random() * 8) + 3,
      techStackDefined: true
    };
  }

  /**
   * Simulate Scrum Master agent work
   */
  simulateSMWork(action, context) {
    if (action === 'validate_story') {
      // SM performs story validation checks
      const validationChance = 0.8; // 80% chance of validation success
      const hasIssues = Math.random() > validationChance;
      
      const validationChecks = [
        'Story acceptance criteria completeness',
        'Story contract structure',
        'Epic alignment verification',
        'Dependencies identification',
        'Risk assessment'
      ];
      
      if (!hasIssues) {
        return {
          success: true,
          approved: true,
          validationChecks,
          recommendations: [],
          issues: [],
          storyReadiness: 'ready',
          report: {
            status: 'Approved',
            summary: 'Story meets all validation criteria and is ready for development',
            validationScore: 95 + Math.random() * 5
          }
        };
      } else {
        const issues = this.generateSMValidationIssues();
        return {
          success: true,
          approved: false,
          validationChecks,
          issues,
          recommendations: issues.map(issue => `Address: ${issue}`),
          storyReadiness: 'needs_refinement',
          report: {
            status: 'Needs Refinement',
            summary: `Story validation found ${issues.length} issues requiring attention`,
            validationScore: 60 + Math.random() * 20
          }
        };
      }
    }
    
    return {
      success: true,
      action: action,
      agent: 'sm',
      completed: new Date().toISOString()
    };
  }

  /**
   * Generate SM validation issues
   */
  generateSMValidationIssues() {
    const issuePool = [
      'Acceptance criteria lack specific success metrics',
      'Story dependencies not clearly identified',
      'Risk assessment missing for complex features',
      'Story too large - consider breaking into smaller stories',
      'Business value not clearly articulated',
      'Technical approach needs refinement',
      'Story contract missing implementation details',
      'Epic alignment could be stronger',
      'Definition of Done criteria incomplete',
      'Story estimation may be inaccurate'
    ];
    
    const numIssues = Math.floor(Math.random() * 3) + 1;
    const selectedIssues = [];
    
    for (let i = 0; i < numIssues; i++) {
      const randomIndex = Math.floor(Math.random() * issuePool.length);
      const issue = issuePool[randomIndex];
      if (!selectedIssues.includes(issue)) {
        selectedIssues.push(issue);
      }
    }
    
    return selectedIssues;
  }

  /**
   * Simulate generic agent work
   */
  simulateGenericWork(agent, action, context) {
    return {
      success: true,
      agent: agent,
      action: action,
      completed: new Date().toISOString(),
      duration: Math.floor(Math.random() * 5000) + 1000
    };
  }

  /**
   * Configure simulation parameters
   */
  configure(options) {
    Object.assign(this, options);
  }

  /**
   * Reset simulation state
   */
  reset() {
    // Reset any stateful simulation data if needed
  }
}

module.exports = AgentSimulator;