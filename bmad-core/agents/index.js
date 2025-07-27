const fs = require('fs-extra');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', 'ai');
const MAX_OBSERVATIONS = 100;

async function initializeWorkingMemory(agentName) {
  const memoryFile = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
  const initialMemory = {
    taskId: null,
    plan: [],
    currentStep: null,
    context: {},
    observations: [],
    subTasks: []
  };
  
  await fs.ensureDir(MEMORY_DIR);
  await fs.writeJson(memoryFile, initialMemory, { spaces: 2 });
  
  return memoryFile;
}

async function updateWorkingMemory(agentName, updates) {
  const memoryFile = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
  
  let memory = {};
  if (await fs.pathExists(memoryFile)) {
    memory = await fs.readJson(memoryFile);
  } else {
    memory = {
      taskId: null,
      plan: [],
      currentStep: null,
      context: {},
      observations: [],
      subTasks: []
    };
  }
  
  // Merge all updates into memory (future-proof for arbitrary fields)
  Object.assign(memory, updates);
  
  // Handle special cases that need custom merging logic
  if (updates.context !== undefined && typeof memory.context === 'object' && typeof updates.context === 'object') {
    // Merge context objects instead of replacing
    memory.context = { ...memory.context, ...updates.context };
  }
  
  if (updates.plan !== undefined && !Array.isArray(updates.plan)) {
    // If plan update is a single item, append it instead of replacing array
    memory.plan = memory.plan || [];
    memory.plan.push(updates.plan);
  }
  
  if (updates.observations !== undefined && !Array.isArray(updates.observations)) {
    // If observations update is a single item, append it
    memory.observations = memory.observations || [];
    memory.observations.push(updates.observations);
    
    // Enforce maximum history length
    if (memory.observations.length > MAX_OBSERVATIONS) {
      memory.observations.shift();
    }
  }
  
  if (updates.subTasks !== undefined && !Array.isArray(updates.subTasks)) {
    // If subTasks update is a single item, append it
    memory.subTasks = memory.subTasks || [];
    memory.subTasks.push(updates.subTasks);
  }
  
  await fs.writeJson(memoryFile, memory, { spaces: 2 });
  
  return memory;
}

async function recordObservation(agentName, stepId, observation) {
  const memoryFile = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
  
  let memory = {};
  if (await fs.pathExists(memoryFile)) {
    memory = await fs.readJson(memoryFile);
  } else {
    memory = {
      taskId: null,
      plan: [],
      currentStep: null,
      context: {},
      observations: [],
      subTasks: []
    };
  }
  
  memory.observations.push({
    stepId,
    observation,
    timestamp: new Date().toISOString()
  });

  // Enforce maximum history length by discarding the oldest entry
  if (memory.observations.length > MAX_OBSERVATIONS) {
    memory.observations.shift();
  }
  
  await fs.writeJson(memoryFile, memory, { spaces: 2 });
  
  return memory;
}

async function getWorkingMemory(agentName) {
  const memoryFile = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
  
  if (await fs.pathExists(memoryFile)) {
    return await fs.readJson(memoryFile);
  }
  
  return null;
}

async function clearWorkingMemory(agentName) {
  const memoryFile = path.join(MEMORY_DIR, `working_memory_${agentName}.json`);
  
  try {
    if (await fs.pathExists(memoryFile)) {
      await fs.remove(memoryFile);
    }
    return true;
  } catch (error) {
    console.error(`Failed to clear working memory for ${agentName}:`, error.message);
    return false;
  }
}

module.exports = {
  initializeWorkingMemory,
  updateWorkingMemory,
  recordObservation,
  getWorkingMemory,
  clearWorkingMemory
};