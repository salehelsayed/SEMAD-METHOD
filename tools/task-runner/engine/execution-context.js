const { ContextKeys } = require('./constants');

class ExecutionContext {
  constructor({ agentName, task = null, baseContext = {}, memory = null } = {}) {
    this.agentName = agentName;
    this.task = task;
    this.memory = memory;
    this.state = this.normalizeContext(baseContext);
  }

  normalizeContext(context) {
    const initial = context && typeof context === 'object' ? context : {};

    if (!initial[ContextKeys.INPUTS] || typeof initial[ContextKeys.INPUTS] !== 'object') {
      initial[ContextKeys.INPUTS] = {};
    }

    if (!initial[ContextKeys.OUTPUTS] || typeof initial[ContextKeys.OUTPUTS] !== 'object') {
      initial[ContextKeys.OUTPUTS] = {};
    }

    return initial;
  }

  setTask(task) {
    this.task = task;
    return this;
  }

  attachMemory(memory) {
    this.memory = memory;
    return this;
  }

  getState() {
    return this.state;
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value;
    return value;
  }

  has(key) {
    return Object.prototype.hasOwnProperty.call(this.state, key);
  }

  merge(data = {}) {
    if (data && typeof data === 'object') {
      Object.assign(this.state, data);
    }
    return this.state;
  }

  setOutput(key, value) {
    this.state[ContextKeys.OUTPUTS][key] = value;
    return value;
  }

  getOutput(key) {
    return this.state[ContextKeys.OUTPUTS][key];
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  toJSON() {
    return this.snapshot();
  }
}

module.exports = ExecutionContext;
