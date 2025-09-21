const fs = require('fs').promises;
const path = require('path');

const DEFAULT_STATE = {
  taskId: null,
  currentStep: null,
  context: {}
};

class AgentMemoryStore {
  constructor(options = {}) {
    const defaultBaseDir = path.join(__dirname, '..', 'ai', 'working-memory', 'agents');
    this.baseDirectory = path.resolve(options.baseDirectory || defaultBaseDir);
    this.maxObservations = options.maxObservations || 100;
  }

  async initializeAgent(agentName) {
    const paths = await this.ensureAgentPaths(agentName);
    await fs.mkdir(paths.agentDir, { recursive: true });
    await this.writeJson(paths.statePath, DEFAULT_STATE);
    await this.writeJson(paths.planPath, []);
    await fs.mkdir(paths.subtaskDir, { recursive: true });
    await this.writeJson(paths.subtaskIndexPath, []);
    await this.writeObservations(paths.observationsPath, []);
    return paths;
  }

  async getAgentMemory(agentName) {
    const paths = await this.ensureAgentPaths(agentName);
    const state = await this.readJson(paths.statePath, DEFAULT_STATE);
    const plan = await this.readJson(paths.planPath, []);
    const subTaskIds = await this.readJson(paths.subtaskIndexPath, []);
    const subTasks = [];

    for (const subTaskId of subTaskIds) {
      const filePath = path.join(paths.subtaskDir, `${subTaskId}.json`);
      const subTask = await this.readJson(filePath, null);
      if (subTask) {
        subTasks.push(subTask);
      }
    }

    const observations = await this.readObservations(paths.observationsPath);

    return {
      taskId: state.taskId ?? null,
      currentStep: state.currentStep ?? null,
      context: state.context ?? {},
      plan,
      subTasks,
      observations
    };
  }

  async updateAgentMemory(agentName, memory) {
    const paths = await this.ensureAgentPaths(agentName);

    const statePayload = {
      taskId: memory.taskId ?? null,
      currentStep: memory.currentStep ?? null,
      context: memory.context ?? {}
    };

    await this.writeJson(paths.statePath, statePayload);
    await this.writeJson(paths.planPath, memory.plan ?? []);

    const subTasks = Array.isArray(memory.subTasks) ? memory.subTasks : [];
    const preservedFiles = new Set(['index.json']);
    const subTaskIds = [];

    await fs.mkdir(paths.subtaskDir, { recursive: true });

    for (const subTask of subTasks) {
      if (!subTask || !subTask.id) {
        continue;
      }
      const fileName = `${subTask.id}.json`;
      preservedFiles.add(fileName);
      subTaskIds.push(subTask.id);
      const targetPath = path.join(paths.subtaskDir, fileName);
      await this.writeJson(targetPath, subTask);
    }

    const existingEntries = await fs.readdir(paths.subtaskDir); // includes index.json
    for (const entry of existingEntries) {
      if (!preservedFiles.has(entry)) {
        await fs.rm(path.join(paths.subtaskDir, entry), { force: true });
      }
    }

    await this.writeJson(paths.subtaskIndexPath, subTaskIds);

    if (Array.isArray(memory.observations)) {
      const limited = memory.observations.slice(-this.maxObservations);
      await this.writeObservations(paths.observationsPath, limited);
    }

    return memory;
  }

  async recordObservation(agentName, observationRecord) {
    const paths = await this.ensureAgentPaths(agentName);
    const existing = await this.readObservations(paths.observationsPath);
    existing.push(observationRecord);
    const limited = existing.slice(-this.maxObservations);
    await this.writeObservations(paths.observationsPath, limited);
    return limited;
  }

  async clearAgent(agentName) {
    const paths = await this.ensureAgentPaths(agentName);
    await fs.rm(paths.agentDir, { recursive: true, force: true });
  }

  async ensureAgentPaths(agentName) {
    const agentDir = path.join(this.baseDirectory, agentName);
    const subtaskDir = path.join(agentDir, 'subtasks');
    return {
      agentDir,
      statePath: path.join(agentDir, 'state.json'),
      planPath: path.join(agentDir, 'plan.json'),
      subtaskDir,
      subtaskIndexPath: path.join(subtaskDir, 'index.json'),
      observationsPath: path.join(agentDir, 'observations.jsonl')
    };
  }

  async readJson(filePath, fallback) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return fallback;
      }
      throw error;
    }
  }

  async writeJson(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async readObservations(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      if (!content.trim()) {
        return [];
      }
      return content
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async writeObservations(filePath, observations) {
    const payload = observations.map(item => JSON.stringify(item)).join('\n');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, payload ? `${payload}\n` : '');
  }
}

module.exports = AgentMemoryStore;
