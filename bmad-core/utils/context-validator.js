/**
 * Context Validator - Validates agent context before proceeding with actions
 * Prevents agents from hallucinating requirements by ensuring sufficient context exists
 */

// Import functions dynamically to avoid circular dependencies
const getMemoryManager = () => require('./agent-memory-manager');

// Import required functions from memory manager
const { checkContextSufficiency, loadWorkingMemory, retrieveRelevantMemories } = require('./agent-memory-manager');

/**
 * Validate context for story creation (SM agent)
 * @param {string} agentName - Name of the agent
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
async function validateStoryCreationContext(agentName, options = {}) {
  try {
    const requiredContext = ['epicId'];
    const contextCheck = await checkContextSufficiency(agentName, requiredContext);
    
    const validation = {
      agentName,
      action: 'story-creation',
      timestamp: new Date().toISOString(),
      sufficient: contextCheck.sufficient,
      issues: [],
      recommendations: []
    };
    
    if (!contextCheck.sufficient) {
      validation.issues.push(...contextCheck.missing.map(missing => `Missing ${missing}`));
      
      if (contextCheck.missing.includes('epicId')) {
        validation.recommendations.push('Request epic information from user before creating story');
      }
    }
    
    // Check for PRD/Architecture availability
    const workingMemory = await loadWorkingMemory(agentName);
    if (workingMemory) {
      const hasArchitectureRef = workingMemory.keyFacts && 
        Object.keys(workingMemory.keyFacts).some(key => key.includes('architecture'));
      const hasPrdRef = workingMemory.keyFacts && 
        Object.keys(workingMemory.keyFacts).some(key => key.includes('prd'));
        
      if (!hasArchitectureRef) {
        validation.issues.push('No architecture reference found in memory');
        validation.recommendations.push('Load architecture document before creating story');
      }
      
      if (!hasPrdRef) {
        validation.issues.push('No PRD reference found in memory');
        validation.recommendations.push('Load PRD document before creating story');
      }
    }
    
    validation.sufficient = validation.issues.length === 0;
    return validation;
  } catch (error) {
    return {
      agentName,
      action: 'story-creation',
      sufficient: false,
      error: error.message,
      issues: ['Context validation failed'],
      recommendations: ['Manually verify all required context before proceeding']
    };
  }
}

/**
 * Validate context for story implementation (Dev agent)
 * @param {string} agentName - Name of the agent
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
async function validateImplementationContext(agentName, options = {}) {
  try {
    const requiredContext = ['storyId', 'taskId'];
    const contextCheck = await checkContextSufficiency(agentName, requiredContext);
    
    const validation = {
      agentName,
      action: 'story-implementation',
      timestamp: new Date().toISOString(),
      sufficient: contextCheck.sufficient,
      issues: [],
      recommendations: []
    };
    
    if (!contextCheck.sufficient) {
      validation.issues.push(...contextCheck.missing.map(missing => `Missing ${missing}`));
      
      if (contextCheck.missing.includes('storyId')) {
        validation.recommendations.push('Load story before beginning implementation');
      }
      
      if (contextCheck.missing.includes('taskId')) {
        validation.recommendations.push('Identify current task from story before proceeding');
      }
    }
    
    // Check for StoryContract
    const workingMemory = await loadWorkingMemory(agentName);
    if (workingMemory) {
      const hasStoryContract = workingMemory.keyFacts && 
        Object.keys(workingMemory.keyFacts).some(key => key.includes('StoryContract'));
        
      if (!hasStoryContract) {
        validation.issues.push('No StoryContract found in memory');
        validation.recommendations.push('Load and validate StoryContract before implementation');
      }
      
      // Check for recent similar implementations
      if (workingMemory.currentContext?.storyId) {
        const similarMemories = await retrieveRelevantMemories(
          agentName,
          `similar implementation story ${workingMemory.currentContext.storyId}`,
          { topN: 3 }
        );
        
        if (similarMemories.length > 0) {
          validation.recommendations.push(`Found ${similarMemories.length} similar implementation(s) - review for patterns`);
        }
      }
    }
    
    validation.sufficient = validation.issues.length === 0;
    return validation;
  } catch (error) {
    return {
      agentName,
      action: 'story-implementation',
      sufficient: false,
      error: error.message,
      issues: ['Context validation failed'],
      recommendations: ['Manually verify all required context before proceeding']
    };
  }
}

/**
 * Validate context for code review (QA agent)
 * @param {string} agentName - Name of the agent
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
async function validateReviewContext(agentName, options = {}) {
  try {
    const requiredContext = ['storyId'];
    const contextCheck = await checkContextSufficiency(agentName, requiredContext);
    
    const validation = {
      agentName,
      action: 'code-review',
      timestamp: new Date().toISOString(),
      sufficient: contextCheck.sufficient,
      issues: [],
      recommendations: []
    };
    
    if (!contextCheck.sufficient) {
      validation.issues.push(...contextCheck.missing.map(missing => `Missing ${missing}`));
      
      if (contextCheck.missing.includes('storyId')) {
        validation.recommendations.push('Load story context before conducting review');
      }
    }
    
    // Check for technical preferences
    const workingMemory = await loadWorkingMemory(agentName);
    if (workingMemory) {
      const hasTechnicalPrefs = workingMemory.keyFacts && 
        Object.keys(workingMemory.keyFacts).some(key => key.includes('technical-preferences'));
        
      if (!hasTechnicalPrefs) {
        validation.recommendations.push('Load technical preferences for consistent review standards');
      }
      
      // Check for review patterns from similar stories
      if (workingMemory.currentContext?.storyId) {
        const reviewMemories = await retrieveRelevantMemories(
          agentName,
          `code review quality issues story ${workingMemory.currentContext.storyId}`,
          { topN: 3 }
        );
        
        if (reviewMemories.length > 0) {
          validation.recommendations.push(`Found ${reviewMemories.length} similar review(s) - check for recurring issues`);
        }
      }
    }
    
    validation.sufficient = validation.issues.length === 0;
    return validation;
  } catch (error) {
    return {
      agentName,
      action: 'code-review',
      sufficient: false,
      error: error.message,
      issues: ['Context validation failed'],
      recommendations: ['Manually verify all required context before proceeding']
    };
  }
}

/**
 * Generic context validation for any agent action
 * @param {string} agentName - Name of the agent
 * @param {string} action - Action being performed
 * @param {Array} requiredContext - Required context keys
 * @param {Object} options - Additional validation options
 * @returns {Object} Validation result
 */
async function validateGenericContext(agentName, action, requiredContext = [], options = {}) {
  try {
    const contextCheck = await checkContextSufficiency(agentName, requiredContext);
    
    const validation = {
      agentName,
      action,
      timestamp: new Date().toISOString(),
      sufficient: contextCheck.sufficient,
      issues: [],
      recommendations: []
    };
    
    if (!contextCheck.sufficient) {
      validation.issues.push(...contextCheck.missing.map(missing => `Missing ${missing}`));
      validation.recommendations.push('Request missing context from user before proceeding');
    }
    
    // Check for active blockers
    const workingMemory = await loadWorkingMemory(agentName);
    if (workingMemory) {
      const activeBlockers = workingMemory.blockers?.filter(b => !b.resolved) || [];
      if (activeBlockers.length > 0) {
        validation.issues.push(`${activeBlockers.length} unresolved blocker(s)`);
        validation.recommendations.push('Resolve active blockers before proceeding with new work');
      }
    }
    
    validation.sufficient = validation.issues.length === 0;
    return validation;
  } catch (error) {
    return {
      agentName,
      action,
      sufficient: false,
      error: error.message,
      issues: ['Context validation failed'],
      recommendations: ['Manually verify all required context before proceeding']
    };
  }
}

/**
 * Validate agent has sufficient context to avoid hallucination
 * @param {string} agentName - Name of the agent
 * @param {string} requestType - Type of request (story-creation, implementation, review, etc.)
 * @param {Object} options - Validation options
 * @returns {Object} Comprehensive validation result
 */
async function validateAgentContext(agentName, requestType, options = {}) {
  try {
    let validation;
    
    switch (requestType) {
      case 'story-creation':
        validation = await validateStoryCreationContext(agentName, options);
        break;
      case 'implementation':
        validation = await validateImplementationContext(agentName, options);
        break;
      case 'review':
        validation = await validateReviewContext(agentName, options);
        break;
      default:
        validation = await validateGenericContext(
          agentName, 
          requestType, 
          options.requiredContext || [],
          options
        );
    }
    
    // Add overall recommendation if context is insufficient
    if (!validation.sufficient) {
      validation.recommendations.unshift(
        'CRITICAL: Agent lacks sufficient context - explicitly request missing information from user to prevent hallucination'
      );
    }
    
    return validation;
  } catch (error) {
    return {
      agentName,
      requestType,
      sufficient: false,
      error: error.message,
      issues: ['Context validation system error'],
      recommendations: [
        'Context validation failed - manually verify all required context',
        'Do not proceed without explicit user confirmation of context'
      ]
    };
  }
}

/**
 * Get formatted context validation message for agent
 * @param {Object} validation - Validation result
 * @returns {string} Formatted message
 */
function formatValidationMessage(validation) {
  if (validation.sufficient) {
    return `✅ Context validation passed for ${validation.agentName} - ${validation.action}`;
  }
  
  let message = `❌ Context validation failed for ${validation.agentName} - ${validation.action}\n\n`;
  
  if (validation.issues.length > 0) {
    message += `Issues found:\n${validation.issues.map(issue => `• ${issue}`).join('\n')}\n\n`;
  }
  
  if (validation.recommendations.length > 0) {
    message += `Recommendations:\n${validation.recommendations.map(rec => `• ${rec}`).join('\n')}`;
  }
  
  return message;
}

module.exports = {
  validateStoryCreationContext,
  validateImplementationContext,
  validateReviewContext,
  validateGenericContext,
  validateAgentContext,
  formatValidationMessage
};