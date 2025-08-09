// Deprecated shim for legacy imports using camelCase path
let warned = false;
function warnOnce() {
  if (!warned) {
    warned = true;
    console.warn('[DEPRECATED] bmad-core/utils/simpleMemory.js is deprecated. Use bmad-core/utils/memory/adapters/file.js');
  }
}

const adapter = require('./memory/adapters/file');

async function saveToLongTermMemoryAndExit(params) {
  warnOnce();
  const { agent, type = 'observation', content, metadata = {} } = params || {};
  await adapter.logEntry(agent, type, content, metadata);
  if (metadata.story || metadata.task) {
    const context = (await adapter.loadContext(agent)) || {};
    context.currentStory = metadata.story || context.currentStory;
    context.currentTask = metadata.task || context.currentTask;
    await adapter.saveContext(agent, context);
  }
  return { success: true };
}

async function updateWorkingMemoryAndExit(params) {
  warnOnce();
  const { agent, context } = params || {};
  await adapter.saveContext(agent, context || {});
  return { success: true };
}

module.exports = new Proxy({}, {
  get(_t, prop) {
    warnOnce();
    if (prop === 'saveToLongTermMemoryAndExit') return saveToLongTermMemoryAndExit;
    if (prop === 'updateWorkingMemoryAndExit') return updateWorkingMemoryAndExit;
    return adapter[prop];
  }
});

