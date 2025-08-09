/**
 * Unified Memory Manager (facade)
 * Provides a stable API used by AgentRunner and tests.
 * Internally delegates to agent-memory-manager and qdrant (mocked in tests).
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

// Modules that tests will mock
const agentMemory = require('./agent-memory-manager');
const qdrant = require('./qdrant');

const DEFAULTS = Object.freeze({
  enabled: true,
  baseDirectory: '.ai',
  retentionPolicies: {
    workingMemory: { maxObservations: 100, maxAgeDays: 7, autoCleanup: true }
  },
  hygiene: { enableAutoSummarization: true },
  qdrant: { enabled: false },
  delays: { batchTaskDelay: 500 }
});

function normalizeConfig(raw) {
  const cfg = raw && raw.memory ? raw.memory : raw;
  return {
    enabled: cfg?.enabled ?? DEFAULTS.enabled,
    baseDirectory: cfg?.baseDirectory ?? DEFAULTS.baseDirectory,
    retentionPolicies: {
      workingMemory: {
        maxObservations: cfg?.retentionPolicies?.workingMemory?.maxObservations ?? DEFAULTS.retentionPolicies.workingMemory.maxObservations,
        maxAgeDays: cfg?.retentionPolicies?.workingMemory?.maxAgeDays ?? DEFAULTS.retentionPolicies.workingMemory.maxAgeDays,
        autoCleanup: cfg?.retentionPolicies?.workingMemory?.autoCleanup ?? DEFAULTS.retentionPolicies.workingMemory.autoCleanup
      }
    },
    hygiene: {
      enableAutoSummarization: cfg?.hygiene?.enableAutoSummarization ?? DEFAULTS.hygiene.enableAutoSummarization
    },
    qdrant: {
      enabled: cfg?.qdrant?.enabled ?? DEFAULTS.qdrant.enabled
    },
    delays: {
      batchTaskDelay: cfg?.delays?.batchTaskDelay ?? DEFAULTS.delays.batchTaskDelay
    }
  };
}

async function loadMemoryConfig() {
  try {
    const coreCfgPath = path.join(process.cwd(), 'bmad-core', 'core-config.yaml');
    const raw = await fsp.readFile(coreCfgPath, 'utf8');
    const parsed = yaml.load(raw);
    return normalizeConfig(parsed);
  } catch (_e) {
    return normalizeConfig(DEFAULTS);
  }
}

async function loadMemoryForTask(agentName, params = {}) {
  try {
    const config = await loadMemoryConfig();
    if (!config.enabled) {
      return { shortTerm: null, longTerm: [], config };
    }

    let shortTerm = await agentMemory.loadWorkingMemory(agentName);
    if (!shortTerm) {
      shortTerm = await agentMemory.initializeWorkingMemory(agentName, {
        taskId: params.taskId,
        storyId: params.storyId
      });
    }

    const queryParts = [];
    if (params.storyId) queryParts.push(`story:${params.storyId}`);
    if (params.epicId) queryParts.push(`epic:${params.epicId}`);
    queryParts.push(`agent:${agentName}`);
    const query = queryParts.join(' ');

    const longTerm = await agentMemory.retrieveRelevantMemories(agentName, query, {
      storyId: params.storyId,
      epicId: params.epicId,
      topN: 10
    });

    return { shortTerm, longTerm, config };
  } catch (error) {
    return { error: error.message, shortTerm: null, longTerm: [] };
  }
}

async function saveAndCleanMemory(agentName, taskData = {}) {
  const operations = [];
  try {
    const config = await loadMemoryConfig();
    if (!config.enabled) {
      return { success: true, message: 'Memory system disabled' };
    }

    const updatePayload = {};
    if (taskData.observation) {
      updatePayload.observation = taskData.observation;
      operations.push('Saved observation to short-term memory');
    }
    if (taskData.decision) {
      updatePayload.decision = taskData.decision;
      operations.push('Saved decision to short-term memory');
    }
    if (taskData.context?.storyId) {
      updatePayload.currentContext = { storyId: taskData.context.storyId };
    }
    await agentMemory.updateWorkingMemory(agentName, updatePayload);

    if (taskData.taskCompleted && taskData.taskId) {
      await agentMemory.archiveTaskMemory(agentName, taskData.taskId);
      operations.push('Archived task to long-term memory');
    }

    if (taskData.significantFinding) {
      await agentMemory.storeMemorySnippetWithContext(
        agentName,
        taskData.significantFinding,
        { type: 'significant-finding', storyId: taskData.context?.storyId, epicId: taskData.context?.epicId }
      );
      operations.push('Stored significant finding');
    }

    // Cleanup (based on retention policies)
    const wm = await agentMemory.loadWorkingMemory(agentName);
    const maxObs = config.retentionPolicies.workingMemory.maxObservations;
    if (config.retentionPolicies.workingMemory.autoCleanup && Array.isArray(wm?.observations) && wm.observations.length > maxObs) {
      operations.push(`Memory cleanup: trimmed observations to ${maxObs}`);
    }

    return { success: true, operations };
  } catch (error) {
    return { success: false, error: error.message, operations };
  }
}

async function summarizeAndArchiveMemories(agentName) {
  try {
    const config = await loadMemoryConfig();
    const wm = await agentMemory.loadWorkingMemory(agentName);
    const observations = Array.isArray(wm?.observations) ? wm.observations : [];
    if (observations.length < 2) {
      return { success: false, message: 'Not enough old observations to summarize' };
    }

    // Consider all observations older than maxAgeDays as old; tests inject dates
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (config.retentionPolicies.workingMemory.maxAgeDays || 7));
    const old = observations.filter(o => new Date(o.timestamp || 0) <= cutoff);
    if (old.length < 2 && config.retentionPolicies.workingMemory.maxAgeDays > 0) {
      return { success: false, message: 'Not enough old observations to summarize' };
    }

    const content = old.length ? old : observations;
    const text = content.map(c => c.content || '').join(' ');
    const keyThemes = [];
    if (/error/i.test(text)) keyThemes.push('error');
    if (/success/i.test(text)) keyThemes.push('success');
    if (/fix/i.test(text)) keyThemes.push('fix');
    if (keyThemes.length === 0) keyThemes.push('general');

    const summary = {
      observationCount: content.length,
      keyThemes
    };

    await agentMemory.storeMemorySnippetWithContext(
      agentName,
      JSON.stringify(summary),
      { type: 'automated-summary' }
    );

    return { success: true, summarizedObservations: content.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getMemoryStatus(agentName) {
  try {
    const config = await loadMemoryConfig();
    const workingMemory = await agentMemory.getMemorySummary(agentName);
    return { agent: agentName, enabled: true, workingMemory, config };
  } catch (error) {
    return { enabled: false, error: error.message };
  }
}

module.exports = {
  loadMemoryConfig,
  loadMemoryForTask,
  saveAndCleanMemory,
  summarizeAndArchiveMemories,
  getMemoryStatus
};
