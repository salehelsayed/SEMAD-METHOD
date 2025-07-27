const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

// Default values (can be overridden by rules file)
let MAX_STEPS = 5;
let CONJUNCTION_KEYWORDS = ['and', 'then', 'additionally', 'furthermore'];
let rules = null;

/**
 * Load dynamic plan rules from YAML file
 */
function loadRules() {
  try {
    const rulesPath = path.join(__dirname, '..', 'structured-tasks', 'dynamic-plan-rules.yaml');
    
    // Check if file exists
    if (!fs.existsSync(rulesPath)) {
      console.warn(`Dynamic plan rules file not found at ${rulesPath}, using defaults`);
      return;
    }
    
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');
    
    // Parse YAML with error handling
    try {
      rules = yaml.load(rulesContent);
    } catch (parseError) {
      console.error(`Failed to parse dynamic plan rules YAML: ${parseError.message}`);
      console.warn('Using default configuration due to parse error');
      return;
    }
    
    // Validate and update constants from rules
    if (rules && typeof rules === 'object') {
      if (rules.thresholds && typeof rules.thresholds.maxSteps === 'number' && rules.thresholds.maxSteps > 0) {
        MAX_STEPS = rules.thresholds.maxSteps;
      } else if (rules.thresholds && rules.thresholds.maxSteps !== undefined) {
        console.warn(`Invalid maxSteps value: ${rules.thresholds.maxSteps}, using default: ${MAX_STEPS}`);
      }
      
      if (rules.splitStrategies && 
          rules.splitStrategies.byConjunction && 
          Array.isArray(rules.splitStrategies.byConjunction.keywords) &&
          rules.splitStrategies.byConjunction.keywords.length > 0) {
        CONJUNCTION_KEYWORDS = rules.splitStrategies.byConjunction.keywords;
      } else if (rules.splitStrategies && 
                 rules.splitStrategies.byConjunction && 
                 rules.splitStrategies.byConjunction.keywords !== undefined) {
        console.warn('Invalid conjunction keywords in rules, using defaults');
      }
    } else {
      console.warn('Invalid rules structure, using defaults');
    }
    
    console.log(`Dynamic planner loaded with maxSteps: ${MAX_STEPS}, keywords: ${CONJUNCTION_KEYWORDS.join(', ')}`);
  } catch (error) {
    console.error(`Error loading dynamic plan rules: ${error.message}`);
    console.warn('Using default configuration due to load error');
  }
}

// Load rules on module initialization
loadRules();

/**
 * Splits an array of steps into chunks based on max step count or keywords
 * @param {Array} steps - Array of step objects
 * @returns {Array} Array of step chunks
 */
function splitSteps(steps) {
  const chunks = [];
  let currentChunk = [];
  
  // Build regex pattern from loaded keywords
  const conjunctionPattern = new RegExp(`^(${CONJUNCTION_KEYWORDS.join('|')})\\s`, 'i');
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // Check if step description starts with conjunction keywords
    const description = step.description || step.name || '';
    const startsWithConjunction = conjunctionPattern.test(description);
    
    // Start new chunk if:
    // 1. Current chunk has reached MAX_STEPS
    // 2. Step starts with conjunction and current chunk is not empty
    if (currentChunk.length >= MAX_STEPS || (startsWithConjunction && currentChunk.length > 0)) {
      chunks.push([...currentChunk]);
      currentChunk = [];
    }
    
    currentChunk.push(step);
  }
  
  // Add remaining steps
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Detects if multiple domains are involved in the task
 * @param {Object} task - Task object
 * @returns {boolean} True if multiple domains detected
 */
function hasMultipleDomains(task) {
  if (!rules || !rules.splitStrategies || !rules.splitStrategies.byDomain || !rules.splitStrategies.byDomain.domains) {
    return false;
  }
  
  const domains = rules.splitStrategies.byDomain.domains;
  const foundDomains = new Set();
  
  // Check task description
  if (task.description) {
    domains.forEach(domain => {
      if (task.description.toLowerCase().includes(domain.toLowerCase())) {
        foundDomains.add(domain);
      }
    });
  }
  
  // Check step descriptions
  if (task.steps && Array.isArray(task.steps)) {
    task.steps.forEach(step => {
      const stepText = (step.description || step.name || '').toLowerCase();
      domains.forEach(domain => {
        if (stepText.includes(domain.toLowerCase())) {
          foundDomains.add(domain);
        }
      });
    });
  }
  
  return foundDomains.size > 1;
}

/**
 * Detects if steps have complex dependencies
 * @param {Array} steps - Array of steps
 * @returns {boolean} True if complex dependencies detected
 */
function hasComplexDependencies(steps) {
  if (!steps || steps.length < 3) {
    return false;
  }
  
  // Look for dependency indicators
  const dependencyKeywords = ['depends on', 'requires', 'after', 'before', 'wait for', 'prerequisite'];
  let dependencyCount = 0;
  
  steps.forEach(step => {
    const stepText = (step.description || step.name || '').toLowerCase();
    if (dependencyKeywords.some(keyword => stepText.includes(keyword))) {
      dependencyCount++;
    }
  });
  
  // Consider it complex if more than 30% of steps have dependencies
  return dependencyCount > steps.length * 0.3;
}

/**
 * Analyzes a task and creates sub-tasks if needed based on complexity
 * @param {Object} memory - Current working memory
 * @param {Object} task - Task object with steps array
 * @param {Object} context - Optional context with token count
 * @returns {Object} Updated memory object
 */
function planAdaptation(memory, task, context = {}) {
  if (!task || !task.steps) {
    return memory;
  }
  
  // Build regex pattern from loaded keywords for description check
  const conjunctionPattern = new RegExp(`\\b(${CONJUNCTION_KEYWORDS.join('|')})\\b`, 'i');
  
  // Check all splitting conditions
  const conditions = {
    stepCount: task.steps.length > MAX_STEPS,
    conjunction: task.description && conjunctionPattern.test(task.description),
    multipleDomains: hasMultipleDomains(task),
    complexDependencies: hasComplexDependencies(task.steps),
    contextSize: context.tokenCount && rules && rules.thresholds && rules.thresholds.maxContextTokens && 
                 context.tokenCount > rules.thresholds.maxContextTokens
  };
  
  const needsSplitting = Object.values(conditions).some(condition => condition);
  
  if (!needsSplitting) {
    return memory;
  }
  
  // Log which conditions triggered splitting
  console.log('Task splitting triggered by:', Object.entries(conditions).filter(([_, v]) => v).map(([k, _]) => k).join(', '));
  
  // Initialize subTasks if not present
  if (!memory.subTasks) {
    memory.subTasks = [];
  }
  
  // Split steps into chunks
  const stepChunks = splitSteps(task.steps);
  
  // Create sub-tasks from chunks with unique IDs
  const newSubTasks = stepChunks.map((chunk, index) => {
    // Generate unique ID using timestamp and random component
    const uniqueId = crypto.randomBytes(4).toString('hex');
    const subTask = {
      id: `${memory.taskId}_sub_${Date.now()}_${uniqueId}`,
      title: `Sub-task ${index + 1} of ${task.title || memory.taskId}`,
      steps: chunk,
      status: 'pending',
      parentTaskId: memory.taskId
    };
    
    // Check if this sub-task also needs splitting (recursive decomposition)
    if (chunk.length > MAX_STEPS) {
      // Create a temporary memory for recursive planning
      const tempMemory = {
        taskId: subTask.id,
        subTasks: [],
        plan: []
      };
      
      // Recursively decompose the sub-task
      const decomposedMemory = planAdaptation(tempMemory, { steps: chunk, title: subTask.title }, context);
      
      // If sub-sub-tasks were created, store them and reference in the sub-task
      if (decomposedMemory.subTasks && decomposedMemory.subTasks.length > 0) {
        subTask.subTasks = decomposedMemory.subTasks;
        subTask.requiresDecomposition = true;
        console.log(`Sub-task ${subTask.id} was recursively decomposed into ${decomposedMemory.subTasks.length} sub-sub-tasks`);
      }
    }
    
    return subTask;
  });
  
  // Add sub-tasks to memory
  memory.subTasks.push(...newSubTasks);
  
  // Prepend sub-task IDs to plan
  const subTaskIds = newSubTasks.map(st => ({ id: st.id, status: 'pending' }));
  memory.plan = [...subTaskIds, ...memory.plan];
  
  return memory;
}

/**
 * Inserts a new sub-task into memory and updates the plan
 * NOTE: The caller must persist the returned memory using updateWorkingMemory()
 * 
 * Example usage:
 *   const updatedMemory = insertSubTask(memory, { 
 *     title: 'Handle database migration', 
 *     steps: [{ name: 'backup db' }, { name: 'run migration' }] 
 *   });
 *   await updateWorkingMemory(agentName, updatedMemory);
 * 
 * @param {Object} memory - Current working memory
 * @param {Object} subTask - Sub-task object with title and steps
 * @returns {Object} Updated memory object (must be persisted by caller)
 */
function insertSubTask(memory, subTask) {
  if (!memory.subTasks) {
    memory.subTasks = [];
  }
  
  // Generate unique sub-task ID
  const uniqueId = crypto.randomBytes(4).toString('hex');
  const newSubTask = {
    id: `${memory.taskId}_sub_${Date.now()}_${uniqueId}`,
    title: subTask.title,
    steps: subTask.steps,
    status: 'pending',
    parentTaskId: memory.taskId
  };
  
  // Add to subTasks array
  memory.subTasks.push(newSubTask);
  
  // Insert into plan (at current position or beginning)
  const currentStepIndex = memory.plan.findIndex(step => step.id === memory.currentStep);
  const insertIndex = currentStepIndex >= 0 ? currentStepIndex + 1 : 0;
  
  memory.plan.splice(insertIndex, 0, {
    id: newSubTask.id,
    status: 'pending'
  });
  
  return memory;
}

/**
 * Recursively processes sub-tasks to ensure none exceed MAX_STEPS
 * @param {Object} task - Task or sub-task to process
 * @param {number} maxDepth - Maximum recursion depth (default: 3)
 * @param {number} currentDepth - Current recursion depth
 * @returns {Object} Processed task with potential sub-tasks
 */
function processTaskRecursively(task, maxDepth = 3, currentDepth = 0) {
  if (!task.steps || task.steps.length <= MAX_STEPS || currentDepth >= maxDepth) {
    return task;
  }
  
  // Split the task
  const stepChunks = splitSteps(task.steps);
  
  task.subTasks = stepChunks.map((chunk, index) => {
    const uniqueId = crypto.randomBytes(4).toString('hex');
    const subTask = {
      id: `${task.id}_sub_${Date.now()}_${uniqueId}`,
      title: `Sub-task ${index + 1} of ${task.title}`,
      steps: chunk,
      status: 'pending',
      parentTaskId: task.id
    };
    
    // Recursively process this sub-task
    return processTaskRecursively(subTask, maxDepth, currentDepth + 1);
  });
  
  // Clear the parent task's steps since they're now in sub-tasks
  task.steps = [];
  task.hasSubTasks = true;
  
  return task;
}

module.exports = {
  planAdaptation,
  insertSubTask,
  processTaskRecursively,
  MAX_STEPS
};