const { resolveModule } = require('../utils');

const { CleanupRegistry } = require(resolveModule('utils/cleanup-registry', '../semad-core/utils/cleanup-registry'));
const { TaskRecovery } = require(resolveModule('utils/task-recovery', '../semad-core/utils/task-recovery'));
const { getWorkingMemory, updateWorkingMemory } = require(resolveModule('agents/index', '../semad-core/agents/index'));

class MemoryManager {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.cleanupRegistry = new CleanupRegistry();
    this.taskRecovery = null;
    this.checkpoints = new Map();
  }

  ensureTaskRecovery() {
    if (this.taskRecovery) {
      return this.taskRecovery;
    }

    const memoryModule = {
      getAll: () => ({}),
      get: () => null,
      set: () => {},
      delete: () => {},
      clear: () => {}
    };

    this.taskRecovery = new TaskRecovery(memoryModule);
    return this.taskRecovery;
  }

  getTaskRecovery() {
    return this.taskRecovery;
  }

  registerCleanup(fn, description) {
    this.cleanupRegistry.register(fn, description);
  }

  async executeCleanup() {
    return this.cleanupRegistry.executeAndClear();
  }

  async fetchWorkingMemory(agentName) {
    return getWorkingMemory(agentName);
  }

  async persistWorkingMemory(agentName, memory) {
    return updateWorkingMemory(agentName, memory);
  }

  async initializeWorkingMemory(agentName) {
    const agentsIndexPath = resolveModule('agents/index', '../semad-core/agents/index');
    const { initializeWorkingMemory } = require(agentsIndexPath);
    await initializeWorkingMemory(agentName);
    return this.fetchWorkingMemory(agentName);
  }

  createCheckpoint(agentName, checkpointId, state) {
    this.checkpoints.set(this._checkpointKey(agentName, checkpointId), state);
  }

  getCheckpoint(agentName, checkpointId) {
    return this.checkpoints.get(this._checkpointKey(agentName, checkpointId));
  }

  clearCheckpoint(agentName, checkpointId) {
    this.checkpoints.delete(this._checkpointKey(agentName, checkpointId));
  }

  _checkpointKey(agentName, checkpointId) {
    return `${agentName}:${checkpointId}`;
  }
}

module.exports = MemoryManager;
