const AgentMemoryStore = require('./agent-memory-store');

const MAX_OBSERVATIONS = 100;
const memoryStore = new AgentMemoryStore({ maxObservations: MAX_OBSERVATIONS });

async function initializeWorkingMemory(agentName) {
  const paths = await memoryStore.initializeAgent(agentName);
  return paths.statePath;
}

async function updateWorkingMemory(agentName, updates) {
  const memory = await memoryStore.getAgentMemory(agentName);
  const specialUpdates = {};

  if (updates.context !== undefined && typeof memory.context === 'object' && typeof updates.context === 'object') {
    specialUpdates.context = { ...memory.context, ...updates.context };
  }

  if (updates.plan !== undefined) {
    if (Array.isArray(updates.plan)) {
      specialUpdates.plan = updates.plan;
    } else {
      specialUpdates.plan = [...(memory.plan || []), updates.plan];
    }
  }

  if (updates.observations !== undefined) {
    if (Array.isArray(updates.observations)) {
      specialUpdates.observations = updates.observations;
    } else {
      const observations = [...(memory.observations || []), updates.observations];
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
      specialUpdates.subTasks = [...(memory.subTasks || []), updates.subTasks];
    }
  }

  const validFields = ['taskId', 'plan', 'currentStep', 'context', 'observations', 'subTasks'];
  const filteredUpdates = {};
  for (const key of validFields) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      filteredUpdates[key] = updates[key];
    }
  }

  const nextMemory = {
    ...memory,
    ...filteredUpdates,
    ...specialUpdates
  };

  await memoryStore.updateAgentMemory(agentName, nextMemory);
  return nextMemory;
}

async function recordObservation(agentName, stepId, observation) {
  const observationRecord = {
    stepId,
    observation,
    timestamp: new Date().toISOString()
  };

  await memoryStore.recordObservation(agentName, observationRecord);
  return memoryStore.getAgentMemory(agentName);
}

async function getWorkingMemory(agentName) {
  return memoryStore.getAgentMemory(agentName);
}

async function clearWorkingMemory(agentName) {
  try {
    await memoryStore.clearAgent(agentName);
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
