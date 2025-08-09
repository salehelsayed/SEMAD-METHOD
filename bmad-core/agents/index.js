const fs = require('fs-extra');
const path = require('path');

const MEMORY_DIR = path.join(process.cwd(), '.ai');
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
  
  // Handle special cases that need custom merging logic before Object.assign
  const specialUpdates = {};
  
  if (updates.context !== undefined && typeof memory.context === 'object' && typeof updates.context === 'object') {
    // Merge context objects instead of replacing
    specialUpdates.context = { ...memory.context, ...updates.context };
  }
  
  if (updates.plan !== undefined) {
    if (Array.isArray(updates.plan)) {
      specialUpdates.plan = updates.plan;
    } else {
      // If plan update is a single item, append it instead of replacing array
      specialUpdates.plan = [...(memory.plan || []), updates.plan];
    }
  }
  
  if (updates.observations !== undefined) {
    if (Array.isArray(updates.observations)) {
      specialUpdates.observations = updates.observations;
    } else {
      // If observations update is a single item, append it
      const observations = [...(memory.observations || []), updates.observations];
      // Enforce maximum history length
      if (observations.length > MAX_OBSERVATIONS) {
        observations.shift();
      }
      specialUpdates.observations = observations;
    }
  }
  
  if (updates.subTasks !== undefined) {
    if (Array.isArray(updates.subTasks)) {
      specialUpdates.subTasks = updates.subTasks;
    } else {
      // If subTasks update is a single item, append it
      specialUpdates.subTasks = [...(memory.subTasks || []), updates.subTasks];
    }
  }
  
  // Define valid memory fields
  const validFields = ['taskId', 'plan', 'currentStep', 'context', 'observations', 'subTasks'];
  
  // Filter updates to only include valid fields
  const filteredUpdates = {};
  for (const key of validFields) {
    if (key in updates) {
      filteredUpdates[key] = updates[key];
    }
  }
  
  // Merge filtered updates and special updates into memory
  Object.assign(memory, filteredUpdates, specialUpdates);
  
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
  
  // Return default structure when file doesn't exist
  return {
    taskId: null,
    plan: [],
    currentStep: null,
    context: {},
    observations: []
  };
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
