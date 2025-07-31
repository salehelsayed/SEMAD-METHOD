/**
 * Memory Summarizer - Creates intelligent summaries for long-term memory storage
 * Condenses agent experiences into meaningful patterns and learnings
 */

// Import functions dynamically to avoid circular dependencies
const getMemoryManager = () => require('./agent-memory-manager');
const { storeContextualMemory } = require('./qdrant');

/**
 * Create a comprehensive summary of an agent's session
 * @param {string} agentName - Name of the agent
 * @param {Object} options - Summarization options
 * @returns {Object} Session summary
 */
async function createSessionSummary(agentName, options = {}) {
  try {
    const { loadWorkingMemory } = getMemoryManager();
    const workingMemory = await loadWorkingMemory(agentName);
    if (!workingMemory) {
      return {
        success: false,
        error: 'No working memory found to summarize'
      };
    }
    
    const summary = {
      agentName,
      sessionId: workingMemory.sessionId,
      timespan: {
        started: workingMemory.initialized,
        ended: new Date().toISOString(),
        duration: calculateDuration(workingMemory.initialized)
      },
      context: workingMemory.currentContext,
      workCompleted: summarizeWorkCompleted(workingMemory),
      keyLearnings: extractKeyLearnings(workingMemory),
      patternsIdentified: identifyPatterns(workingMemory),
      challengesEncountered: summarizeChallenges(workingMemory),
      effectiveStrategies: identifyEffectiveStrategies(workingMemory),
      statistics: generateStatistics(workingMemory),
      recommendations: generateRecommendations(workingMemory)
    };
    
    // Store summary in long-term memory
    const summaryText = formatSummaryForStorage(summary);
    const memoryId = await storeContextualMemory(
      agentName,
      summaryText,
      {
        storyId: workingMemory.currentContext?.storyId,
        epicId: workingMemory.currentContext?.epicId,
        type: 'session-summary',
        sessionId: workingMemory.sessionId,
        agentType: getAgentType(agentName)
      }
    );
    
    return {
      success: true,
      summary,
      memoryId,
      summaryText
    };
  } catch (error) {
    console.error(`Failed to create session summary for ${agentName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Summarize work completed during the session
 * @param {Object} workingMemory - Agent's working memory
 * @returns {Object} Work summary
 */
function summarizeWorkCompleted(workingMemory) {
  const completedTaskCount = workingMemory.completedTasks?.length || 0;
  const totalObservations = workingMemory.observations?.length || 0;
  const decisionsCount = workingMemory.decisions?.length || 0;
  
  return {
    tasksCompleted: completedTaskCount,
    observationsRecorded: totalObservations,
    decisionsMade: decisionsCount,
    keyFactsLearned: Object.keys(workingMemory.keyFacts || {}).length,
    currentPlanStatus: {
      totalSteps: workingMemory.plan?.length || 0,
      currentStep: workingMemory.currentStep,
      planCompleted: !workingMemory.currentStep && completedTaskCount > 0
    }
  };
}

/**
 * Extract key learnings from the session
 * @param {Object} workingMemory - Agent's working memory
 * @returns {Array} Key learnings
 */
function extractKeyLearnings(workingMemory) {
  const learnings = [];
  
  // Extract from key facts
  if (workingMemory.keyFacts) {
    Object.entries(workingMemory.keyFacts).forEach(([key, fact]) => {
      learnings.push({
        type: 'key-fact',
        learning: fact.content,
        context: fact.context,
        timestamp: fact.timestamp
      });
    });
  }
  
  // Extract from important decisions
  if (workingMemory.decisions && workingMemory.decisions.length > 0) {
    const importantDecisions = workingMemory.decisions
      .filter(decision => decision.reasoning && decision.reasoning.length > 50)
      .slice(-3); // Last 3 important decisions
      
    importantDecisions.forEach(decision => {
      learnings.push({
        type: 'decision-learning',
        learning: `Decision: ${decision.decision} - Reasoning: ${decision.reasoning}`,
        context: decision.context,
        timestamp: decision.timestamp
      });
    });
  }
  
  // Extract from resolved blockers
  if (workingMemory.blockers) {
    const resolvedBlockers = workingMemory.blockers.filter(b => b.resolved);
    resolvedBlockers.forEach(blocker => {
      learnings.push({
        type: 'problem-solution',
        learning: `Problem: ${blocker.blocker} - Solution: ${blocker.resolution}`,
        context: blocker.context,
        timestamp: blocker.resolvedAt
      });
    });
  }
  
  return learnings.slice(0, 10); // Limit to top 10 learnings
}

/**
 * Identify patterns in agent behavior and work
 * @param {Object} workingMemory - Agent's working memory
 * @returns {Array} Identified patterns
 */
function identifyPatterns(workingMemory) {
  const patterns = [];
  
  // Analyze observation patterns
  if (workingMemory.observations && workingMemory.observations.length > 3) {
    const observationTypes = workingMemory.observations
      .map(obs => obs.content.split(' ')[0]) // First word often indicates type
      .reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      
    Object.entries(observationTypes)
      .filter(([type, count]) => count > 2)
      .forEach(([type, count]) => {
        patterns.push({
          type: 'observation-pattern',
          pattern: `Frequently observes ${type}-related activities`,
          frequency: count,
          significance: count > 5 ? 'high' : 'medium'
        });
      });
  }
  
  // Analyze decision patterns
  if (workingMemory.decisions && workingMemory.decisions.length > 2) {
    const hasConsistentReasoning = workingMemory.decisions
      .every(d => d.reasoning && d.reasoning.length > 20);
      
    if (hasConsistentReasoning) {
      patterns.push({
        type: 'decision-pattern',
        pattern: 'Consistently provides detailed reasoning for decisions',
        significance: 'high'
      });
    }
  }
  
  // Analyze blocker patterns
  if (workingMemory.blockers && workingMemory.blockers.length > 1) {
    const blockerTypes = workingMemory.blockers
      .map(b => b.blocker.toLowerCase())
      .reduce((acc, blocker) => {
        const key = blocker.includes('test') ? 'testing' :
                   blocker.includes('config') ? 'configuration' :
                   blocker.includes('depend') ? 'dependencies' : 'other';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      
    Object.entries(blockerTypes)
      .filter(([type, count]) => count > 1)
      .forEach(([type, count]) => {
        patterns.push({
          type: 'blocker-pattern',
          pattern: `Recurring ${type} issues`,
          frequency: count,
          significance: 'medium'
        });
      });
  }
  
  return patterns;
}

/**
 * Summarize challenges encountered
 * @param {Object} workingMemory - Agent's working memory
 * @returns {Object} Challenges summary
 */
function summarizeChallenges(workingMemory) {
  const activeBlockers = workingMemory.blockers?.filter(b => !b.resolved) || [];
  const resolvedBlockers = workingMemory.blockers?.filter(b => b.resolved) || [];
  
  return {
    totalChallenges: workingMemory.blockers?.length || 0,
    activeChallenges: activeBlockers.length,
    resolvedChallenges: resolvedBlockers.length,
    resolutionRate: workingMemory.blockers?.length > 0 
      ? Math.round((resolvedBlockers.length / workingMemory.blockers.length) * 100)
      : 100,
    commonChallengeTypes: identifyCommonChallenges(workingMemory.blockers || []),
    unresolvedIssues: activeBlockers.map(b => ({
      issue: b.blocker,
      context: b.context,
      timestamp: b.timestamp
    }))
  };
}

/**
 * Identify effective strategies used
 * @param {Object} workingMemory - Agent's working memory
 * @returns {Array} Effective strategies
 */
function identifyEffectiveStrategies(workingMemory) {
  const strategies = [];
  
  // Strategy: Good planning
  if (workingMemory.plan && workingMemory.plan.length > 0) {
    strategies.push({
      strategy: 'Structured Planning',
      evidence: `Created ${workingMemory.plan.length}-step plan`,
      effectiveness: 'high'
    });
  }
  
  // Strategy: Proactive observation
  if (workingMemory.observations && workingMemory.observations.length > 10) {
    strategies.push({
      strategy: 'Detailed Observation Recording',
      evidence: `Recorded ${workingMemory.observations.length} observations`,
      effectiveness: 'high'
    });
  }
  
  // Strategy: Quick blocker resolution
  const resolvedBlockers = workingMemory.blockers?.filter(b => b.resolved) || [];
  if (resolvedBlockers.length > 0) {
    const avgResolutionTime = calculateAverageResolutionTime(resolvedBlockers);
    strategies.push({
      strategy: 'Effective Problem Resolution',
      evidence: `Resolved ${resolvedBlockers.length} blockers with avg resolution time`,
      effectiveness: avgResolutionTime < 1000 * 60 * 60 ? 'high' : 'medium' // < 1 hour
    });
  }
  
  return strategies;
}

/**
 * Generate statistics for the session
 * @param {Object} workingMemory - Agent's working memory
 * @returns {Object} Statistics
 */
function generateStatistics(workingMemory) {
  return {
    memoryUtilization: {
      observationSlots: `${workingMemory.observations?.length || 0}/50`,
      keyFactCount: Object.keys(workingMemory.keyFacts || {}).length,
      planSteps: workingMemory.plan?.length || 0
    },
    productivity: {
      tasksPerHour: calculateTasksPerHour(workingMemory),
      observationsPerTask: calculateObservationsPerTask(workingMemory),
      decisionToActionRatio: calculateDecisionToActionRatio(workingMemory)
    },
    quality: {
      blockerResolutionRate: calculateBlockerResolutionRate(workingMemory),
      detailLevel: calculateDetailLevel(workingMemory),
      contextConsistency: calculateContextConsistency(workingMemory)
    }
  };
}

/**
 * Generate recommendations for future sessions
 * @param {Object} workingMemory - Agent's working memory
 * @returns {Array} Recommendations
 */
function generateRecommendations(workingMemory) {
  const recommendations = [];
  
  // Memory management recommendations
  if (workingMemory.observations && workingMemory.observations.length > 40) {
    recommendations.push({
      type: 'memory-management',
      recommendation: 'Consider archiving old observations more frequently to maintain memory efficiency'
    });
  }
  
  // Planning recommendations
  if (!workingMemory.plan || workingMemory.plan.length === 0) {
    recommendations.push({
      type: 'planning',
      recommendation: 'Create structured plans before starting work to improve efficiency'
    });
  }
  
  // Blocker management recommendations
  const activeBlockers = workingMemory.blockers?.filter(b => !b.resolved) || [];
  if (activeBlockers.length > 2) {
    recommendations.push({
      type: 'blocker-management',
      recommendation: 'Focus on resolving existing blockers before taking on new tasks'
    });
  }
  
  // Context recommendations
  if (!workingMemory.currentContext?.storyId) {
    recommendations.push({
      type: 'context',
      recommendation: 'Always establish story context before beginning work to prevent confusion'
    });
  }
  
  return recommendations;
}

/**
 * Helper functions for calculations
 */
function calculateDuration(startTime) {
  const start = new Date(startTime);
  const end = new Date();
  const durationMs = end - start;
  
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
}

function getAgentType(agentName) {
  const agentTypes = {
    'sm': 'scrum-master',
    'dev': 'developer',
    'qa': 'quality-assurance'
  };
  return agentTypes[agentName] || 'unknown';
}

function identifyCommonChallenges(blockers) {
  const challengeTypes = {};
  blockers.forEach(blocker => {
    const type = blocker.blocker.toLowerCase();
    const key = type.includes('test') ? 'testing' :
               type.includes('config') ? 'configuration' :
               type.includes('depend') ? 'dependencies' :
               type.includes('api') ? 'api-issues' : 'other';
    challengeTypes[key] = (challengeTypes[key] || 0) + 1;
  });
  
  return Object.entries(challengeTypes)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([type, count]) => ({ type, count }));
}

function calculateAverageResolutionTime(resolvedBlockers) {
  const totalTime = resolvedBlockers.reduce((sum, blocker) => {
    const created = new Date(blocker.timestamp);
    const resolved = new Date(blocker.resolvedAt);
    return sum + (resolved - created);
  }, 0);
  
  return resolvedBlockers.length > 0 ? totalTime / resolvedBlockers.length : 0;
}

function calculateTasksPerHour(workingMemory) {
  const duration = new Date() - new Date(workingMemory.initialized);
  const hours = duration / (1000 * 60 * 60);
  const tasks = workingMemory.completedTasks?.length || 0;
  return hours > 0 ? Math.round((tasks / hours) * 100) / 100 : 0;
}

function calculateObservationsPerTask(workingMemory) {
  const observations = workingMemory.observations?.length || 0;
  const tasks = workingMemory.completedTasks?.length || 1;
  return Math.round((observations / tasks) * 100) / 100;
}

function calculateDecisionToActionRatio(workingMemory) {
  const decisions = workingMemory.decisions?.length || 0;
  const observations = workingMemory.observations?.length || 1;
  return Math.round((decisions / observations) * 100) / 100;
}

function calculateBlockerResolutionRate(workingMemory) {
  const totalBlockers = workingMemory.blockers?.length || 0;
  if (totalBlockers === 0) return 100;
  
  const resolvedBlockers = workingMemory.blockers.filter(b => b.resolved).length;
  return Math.round((resolvedBlockers / totalBlockers) * 100);
}

function calculateDetailLevel(workingMemory) {
  const observations = workingMemory.observations || [];
  const avgLength = observations.reduce((sum, obs) => sum + obs.content.length, 0) / observations.length;
  return avgLength > 100 ? 'high' : avgLength > 50 ? 'medium' : 'low';
}

function calculateContextConsistency(workingMemory) {
  const observations = workingMemory.observations || [];
  const withContext = observations.filter(obs => obs.context && obs.context.storyId).length;
  const rate = observations.length > 0 ? (withContext / observations.length) * 100 : 100;
  return Math.round(rate);
}

function formatSummaryForStorage(summary) {
  return `Session Summary for ${summary.agentName} (${summary.timespan.duration})
  
Work Completed:
- Tasks: ${summary.workCompleted.tasksCompleted}
- Observations: ${summary.workCompleted.observationsRecorded}
- Decisions: ${summary.workCompleted.decisionsMade}
- Key Facts: ${summary.workCompleted.keyFactsLearned}

Key Learnings:
${summary.keyLearnings.slice(0, 3).map(l => `- ${l.learning}`).join('\n')}

Patterns Identified:
${summary.patternsIdentified.slice(0, 3).map(p => `- ${p.pattern}`).join('\n')}

Challenges: ${summary.challengesEncountered.totalChallenges} total (${summary.challengesEncountered.resolutionRate}% resolved)

Context: Story ${summary.context.storyId || 'N/A'}, Epic ${summary.context.epicId || 'N/A'}`;
}

module.exports = {
  createSessionSummary,
  summarizeWorkCompleted,
  extractKeyLearnings,
  identifyPatterns,
  summarizeChallenges,
  identifyEffectiveStrategies,
  generateStatistics,
  generateRecommendations
};