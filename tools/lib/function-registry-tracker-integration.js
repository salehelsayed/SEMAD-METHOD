/**
 * Function Registry Integration for Simple Task Tracker
 * Add these functions to the existing function-registry.js FUNCTION_REGISTRY object
 */

// Import at the top of function-registry.js:
// const { getTracker } = require(resolveModule('utils/memory-compatibility-wrapper', '../../bmad-core/utils/memory-compatibility-wrapper'));
// const simpleMemory = require(resolveModule('utils/simpleMemory', '../../bmad-core/utils/simpleMemory'));

// Add to FUNCTION_REGISTRY object:
const TRACKER_FUNCTIONS = {
  // Simple memory functions for structured tasks
  'simpleMemory.saveContext': async (params) => {
    const simpleMemory = require('../../bmad-core/utils/simpleMemory');
    return await simpleMemory.saveContext(params);
  },
  
  'simpleMemory.logEntry': async (params) => {
    const simpleMemory = require('../../bmad-core/utils/simpleMemory');
    return await simpleMemory.logEntry(params);
  },
  
  'simpleMemory.getProgress': async () => {
    const simpleMemory = require('../../bmad-core/utils/simpleMemory');
    return await simpleMemory.getProgress();
  },
  
  'simpleMemory.getProgressReport': async () => {
    const simpleMemory = require('../../bmad-core/utils/simpleMemory');
    return await simpleMemory.getProgressReport();
  },
  
  // Direct tracker functions
  trackProgress: async (workflow, task, status, notes) => {
    const { getTracker } = require('../../bmad-core/utils/memory-compatibility-wrapper');
    const tracker = getTracker();
    
    if (!tracker.workflow) {
      // Initialize workflow if not already started
      tracker.startWorkflow(workflow, [{ name: task }]);
    }
    
    if (status === 'completed') {
      return { success: tracker.completeCurrentTask(notes), timestamp: new Date().toISOString() };
    } else if (status === 'skipped') {
      return { success: tracker.skipCurrentTask(notes), timestamp: new Date().toISOString() };
    } else {
      tracker.log(`Task ${task}: ${status}`, 'info');
      return { success: true, timestamp: new Date().toISOString() };
    }
  },
  
  saveDebugLog: async (directory = '.ai') => {
    const { getTracker } = require('../../bmad-core/utils/memory-compatibility-wrapper');
    const tracker = getTracker();
    const filepath = tracker.saveDebugLog(directory);
    return { success: true, filepath, timestamp: new Date().toISOString() };
  },
  
  // Console logging (already exists but included for completeness)
  'console.log': async (params) => {
    const message = params.message || JSON.stringify(params);
    console.log(message);
    return { success: true, logged: true };
  }
};

// Parameter mappings for the new functions
const TRACKER_PARAM_MAPPINGS = {
  'simpleMemory.saveContext': ['params'],
  'simpleMemory.logEntry': ['params'],
  'simpleMemory.getProgress': [],
  'simpleMemory.getProgressReport': [],
  'trackProgress': ['workflow', 'task', 'status', 'notes'],
  'saveDebugLog': ['directory']
};

// Export for integration
module.exports = {
  TRACKER_FUNCTIONS,
  TRACKER_PARAM_MAPPINGS
};