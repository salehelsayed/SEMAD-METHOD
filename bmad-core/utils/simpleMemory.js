/**
 * Simple Memory Module
 * Provides a simple interface that maps to the task tracker for structured tasks
 * This is a bridge module to support the transition from complex memory to simple tracking
 */

const { getTracker } = require('./memory-compatibility-wrapper');

/**
 * Save context for an agent
 * Maps to tracker workflow initialization and agent setting
 */
async function saveContext(params) {
  const { agentName, context } = params;
  const tracker = getTracker();
  
  // Set agent if provided
  if (agentName) {
    tracker.setAgent(agentName);
  }
  
  // Log context update
  if (context) {
    const message = `Context updated: ${context.currentTask || 'N/A'} - Status: ${context.status || 'active'}`;
    tracker.log(message, 'info');
    
    // If we have task info and starting a new workflow, initialize it
    if (context.currentTask && context.status === 'in-progress' && !tracker.workflow) {
      const tasks = context.context?.completedTasks || [];
      tasks.push({ name: context.currentTask, id: context.currentTask });
      tracker.startWorkflow(`story-${context.currentStory}`, tasks);
    }
    
    // If marking as completed, complete the current task
    if (context.status === 'completed') {
      const notes = context.context?.decisions || 'Task completed';
      tracker.completeCurrentTask(notes);
    }
  }
  
  return { success: true, timestamp: new Date().toISOString() };
}

/**
 * Log an entry to the tracker
 * Maps different entry types to appropriate tracker methods
 */
async function logEntry(params) {
  const { agentName, type, content, metadata } = params;
  const tracker = getTracker();
  
  // Ensure agent is set
  if (agentName && (!tracker.workflow || tracker.workflow.agentName !== agentName)) {
    tracker.setAgent(agentName);
  }
  
  // Format message based on type
  let message = content;
  let logType = 'info';
  
  switch (type) {
    case 'decision':
      message = `Decision: ${content}`;
      if (metadata?.rationale) {
        message += ` - Rationale: ${metadata.rationale}`;
      }
      break;
      
    case 'pattern':
      message = `Pattern identified: ${content}`;
      if (metadata?.description) {
        message += ` - ${metadata.description}`;
      }
      break;
      
    case 'observation':
      message = `Observation: ${content}`;
      break;
      
    case 'completion':
      message = `Completed: ${content}`;
      logType = 'success';
      break;
      
    case 'story-completion':
      message = `Story Complete: ${content}`;
      logType = 'success';
      // Save debug log for story completion
      tracker.saveDebugLog();
      break;
      
    default:
      message = `${type}: ${content}`;
  }
  
  // Add metadata context to message if available
  if (metadata?.story) {
    message = `[Story ${metadata.story}] ${message}`;
  }
  
  // Log the entry
  tracker.log(message, logType);
  
  return { 
    success: true, 
    logged: true,
    timestamp: new Date().toISOString(),
    type: type,
    metadata: metadata
  };
}

/**
 * Helper to get current progress
 * Useful for structured tasks that need to check progress
 */
async function getProgress() {
  const tracker = getTracker();
  return tracker.getProgress();
}

/**
 * Helper to get progress report
 * Returns formatted progress string
 */
async function getProgressReport() {
  const tracker = getTracker();
  return tracker.getProgressReport();
}

module.exports = {
  saveContext,
  logEntry,
  getProgress,
  getProgressReport
};