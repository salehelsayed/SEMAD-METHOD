/**
 * Story Complexity Analyzer
 * Analyzes story complexity against dynamic-plan-config.yaml thresholds
 * to determine if automatic plan adaptation should be applied
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class StoryComplexityAnalyzer {
  constructor() {
    this.config = null;
    this.loadConfig();
  }

  /**
   * Load the dynamic plan configuration
   */
  loadConfig() {
    try {
      // Try multiple paths for the config file
      const possiblePaths = [
        path.join(process.cwd(), '.bmad-core', 'config', 'dynamic-plan-config.yaml'),
        path.join(process.cwd(), 'bmad-core', 'config', 'dynamic-plan-config.yaml'),
        path.join(__dirname, '..', 'config', 'dynamic-plan-config.yaml')
      ];

      for (const configPath of possiblePaths) {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, 'utf8');
          this.config = yaml.load(configContent);
          console.log(`Loaded dynamic plan config from: ${configPath}`);
          break;
        }
      }

      if (!this.config) {
        console.warn('Dynamic plan config not found, using defaults');
        this.config = this.getDefaultConfig();
      }
    } catch (error) {
      console.error('Error loading dynamic plan config:', error);
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Get default configuration if config file not found
   */
  getDefaultConfig() {
    return {
      autoApplyThresholds: {
        taskCount: { threshold: 5 },
        fileCount: { threshold: 7 },
        apiEndpointCount: { threshold: 5 },
        dataModelCount: { threshold: 2 },
        totalFieldCount: { threshold: 20 },
        acceptanceCriteriaCount: { threshold: 8 }
      },
      complexityIndicators: [
        { pattern: 'and then' },
        { pattern: 'multiple.*components' },
        { pattern: 'migrate|migration' },
        { pattern: 'refactor.*existing' },
        { pattern: 'integrate.*with' }
      ],
      skipConditions: [],
      overrides: {
        forceAdaptation: [],
        neverAdapt: []
      }
    };
  }

  /**
   * Analyze a story for complexity
   * @param {Object} story - The story object with StoryContract
   * @param {String} storyContent - The full story content as text
   * @param {String} agentType - Type of agent (dev, qa, etc.) for agent-specific thresholds
   * @returns {Object} Analysis result with decision and reasoning
   */
  analyzeStory(story, storyContent = '', agentType = 'dev') {
    const result = {
      shouldApplyAdaptation: false,
      reasons: [],
      thresholdsExceeded: [],
      complexityScore: 0,
      details: {}
    };

    // Check if story has a StoryContract
    const contract = story.StoryContract || story;

    // Count various metrics
    const metrics = {
      taskCount: this.countTasks(story, storyContent),
      fileCount: (contract.filesToModify || []).length,
      apiEndpointCount: (contract.apiEndpoints || []).length,
      dataModelCount: (contract.dataModels || []).length,
      totalFieldCount: this.countTotalFields(contract.dataModels || []),
      acceptanceCriteriaCount: (contract.acceptanceCriteriaLinks || []).length
    };

    result.details = metrics;

    // Check override conditions first
    if (this.checkOverrides(story, storyContent, result)) {
      return result;
    }

    // Check skip conditions
    if (this.checkSkipConditions(story, result)) {
      result.shouldApplyAdaptation = false;
      return result;
    }

    // Check thresholds - use QA-specific thresholds if agent is QA
    const thresholds = agentType === 'qa' && this.config.qaSpecificThresholds 
      ? { ...this.config.autoApplyThresholds, ...this.config.qaSpecificThresholds }
      : this.config.autoApplyThresholds;
      
    // Add QA-specific metrics if agent is QA
    if (agentType === 'qa') {
      metrics.filesToReview = metrics.fileCount;
      metrics.componentsToReview = Math.ceil(metrics.fileCount / 3); // Estimate components
      metrics.qualityMetricsCount = 10; // Default quality metrics to check
      metrics.testCoverageAnalysis = (contract.tests || []).length;
      metrics.dependencyChainDepth = 3; // Default depth estimate
    }
    
    for (const [key, config] of Object.entries(thresholds)) {
      if (metrics[key] > config.threshold) {
        result.shouldApplyAdaptation = true;
        result.thresholdsExceeded.push({
          metric: key,
          value: metrics[key],
          threshold: config.threshold,
          description: config.description || `${key} exceeds threshold`
        });
        result.reasons.push(`${key}: ${metrics[key]}/${config.threshold}`);
      }
    }

    // Check complexity indicators in story content
    if (storyContent) {
      const indicators = agentType === 'qa' && this.config.qaComplexityIndicators
        ? [...this.config.complexityIndicators, ...this.config.qaComplexityIndicators]
        : this.config.complexityIndicators;
        
      for (const indicator of indicators) {
        const regex = new RegExp(indicator.pattern, 'i');
        if (regex.test(storyContent)) {
          result.shouldApplyAdaptation = true;
          result.reasons.push(`Pattern detected: "${indicator.pattern}"`);
          result.complexityScore += 10;
        }
      }
    }

    // Calculate complexity score
    result.complexityScore = this.calculateComplexityScore(metrics, result.thresholdsExceeded);

    return result;
  }

  /**
   * Count tasks in the story
   */
  countTasks(story, storyContent) {
    let count = 0;

    // Count checkboxes in story content
    if (storyContent) {
      const checkboxMatches = storyContent.match(/\[ \]/g) || [];
      count = checkboxMatches.length;
    }

    // Also check if there's a tasks array in the story object
    if (story.tasks && Array.isArray(story.tasks)) {
      count = Math.max(count, story.tasks.length);
    }

    return count;
  }

  /**
   * Count total fields across all data models
   */
  countTotalFields(dataModels) {
    let totalFields = 0;
    for (const model of dataModels) {
      if (model.fields) {
        totalFields += Object.keys(model.fields).length;
      }
    }
    return totalFields;
  }

  /**
   * Check override conditions
   */
  checkOverrides(story, storyContent, result) {
    // Check force adaptation conditions
    if (story.tags) {
      for (const condition of this.config.overrides.forceAdaptation || []) {
        if (condition.includes('tags.includes')) {
          const tag = condition.match(/'([^']+)'/)?.[1];
          if (tag && story.tags.includes(tag)) {
            result.shouldApplyAdaptation = true;
            result.reasons.push(`Force adaptation: tag '${tag}'`);
            return true;
          }
        }
      }

      // Check never adapt conditions
      for (const condition of this.config.overrides.neverAdapt || []) {
        if (condition.includes('tags.includes')) {
          const tag = condition.match(/'([^']+)'/)?.[1];
          if (tag && story.tags.includes(tag)) {
            result.shouldApplyAdaptation = false;
            result.reasons.push(`Skip adaptation: tag '${tag}'`);
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check skip conditions
   */
  checkSkipConditions(story, result) {
    for (const skipCondition of this.config.skipConditions || []) {
      if (skipCondition.condition.includes('story.type == ')) {
        const type = skipCondition.condition.match(/'([^']+)'/)?.[1];
        if (type && story.type === type) {
          result.reasons.push(`Skip condition: ${skipCondition.description}`);
          return true;
        }
      }
      
      if (skipCondition.condition.includes('story.status == ')) {
        const status = skipCondition.condition.match(/'([^']+)'/)?.[1];
        if (status && story.status === status) {
          result.reasons.push(`Skip condition: ${skipCondition.description}`);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Calculate overall complexity score
   */
  calculateComplexityScore(metrics, thresholdsExceeded) {
    let score = 0;
    
    // Base score from metrics
    score += metrics.taskCount * 2;
    score += metrics.fileCount * 3;
    score += metrics.apiEndpointCount * 4;
    score += metrics.dataModelCount * 5;
    score += Math.floor(metrics.totalFieldCount / 5) * 2;
    score += metrics.acceptanceCriteriaCount * 1;
    
    // Bonus for exceeded thresholds
    score += thresholdsExceeded.length * 10;
    
    return score;
  }

  /**
   * Generate a human-readable decision message
   */
  generateDecisionMessage(analysis) {
    if (analysis.shouldApplyAdaptation) {
      const mainReason = analysis.reasons[0] || 'complexity detected';
      return `📊 Story complexity detected (${mainReason}). Applying dynamic plan adaptation...`;
    } else {
      return '✅ Story is simple enough. Proceeding with direct implementation.';
    }
  }

  /**
   * Log the analysis decision
   */
  logDecision(analysis) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      decision: analysis.shouldApplyAdaptation ? 'APPLY' : 'SKIP',
      reasons: analysis.reasons,
      metrics: analysis.details,
      complexityScore: analysis.complexityScore
    };

    // Ensure .ai directory exists
    const aiDir = path.join(process.cwd(), '.ai');
    if (!fs.existsSync(aiDir)) {
      fs.mkdirSync(aiDir, { recursive: true });
    }

    // Append to adaptation log
    const logPath = path.join(aiDir, 'adaptation_decisions.log');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

    console.log(this.generateDecisionMessage(analysis));
    
    if (analysis.thresholdsExceeded.length > 0) {
      console.log('Thresholds exceeded:');
      for (const threshold of analysis.thresholdsExceeded) {
        console.log(`  - ${threshold.metric}: ${threshold.value}/${threshold.threshold}`);
      }
    }
  }
}

// Export for use in other modules
module.exports = StoryComplexityAnalyzer;

// CLI usage
if (require.main === module) {
  const analyzer = new StoryComplexityAnalyzer();
  
  // Get agent type from command line arguments
  const args = process.argv.slice(2);
  const agentType = args.find(arg => ['dev', 'qa'].includes(arg)) || 'dev';
  
  // Show usage if help requested
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node story-complexity-analyzer.js [dev|qa]');
    console.log('  dev - Analyze with dev agent thresholds (default)');
    console.log('  qa  - Analyze with QA agent thresholds');
    process.exit(0);
  }
  
  console.log(`Running analysis with ${agentType} agent thresholds...\n`);
  
  // Example usage
  const exampleStory = {
    StoryContract: {
      version: '1.0',
      story_id: '1.1',
      epic_id: '1',
      apiEndpoints: [
        { method: 'GET', path: '/api/users' },
        { method: 'POST', path: '/api/users' },
        { method: 'PUT', path: '/api/users/:id' },
        { method: 'DELETE', path: '/api/users/:id' },
        { method: 'GET', path: '/api/users/:id' },
        { method: 'GET', path: '/api/users/search' }
      ],
      filesToModify: [
        { path: 'src/controllers/userController.js' },
        { path: 'src/models/User.js' },
        { path: 'src/routes/userRoutes.js' },
        { path: 'test/user.test.js' },
        { path: 'src/middleware/auth.js' },
        { path: 'src/validators/userValidator.js' },
        { path: 'src/services/userService.js' },
        { path: 'src/utils/userHelpers.js' }
      ],
      acceptanceCriteriaLinks: ['AC-1.1.1', 'AC-1.1.2', 'AC-1.1.3'],
      dataModels: [
        {
          name: 'User',
          fields: {
            id: 'string',
            name: 'string',
            email: 'string',
            password: 'string',
            createdAt: 'date'
          }
        }
      ]
    }
  };

  const storyContent = `
  ## Story
  Create user management system with CRUD operations and then integrate with authentication
  
  ## Tasks
  [ ] Create user model
  [ ] Implement user controller
  [ ] Add validation middleware
  [ ] Create user routes
  [ ] Write unit tests
  [ ] Add integration tests
  [ ] Update documentation
  `;

  const analysis = analyzer.analyzeStory(exampleStory, storyContent, agentType);
  analyzer.logDecision(analysis);
  
  console.log('\nFull analysis:', JSON.stringify(analysis, null, 2));
}