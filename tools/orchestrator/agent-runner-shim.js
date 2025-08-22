// Minimal AgentRunner shim for installations lacking unified memory modules
class AgentRunnerShim {
  constructor() {}
  configureLogger() {}
  async executeWithMemory(agent, taskId, context, fn) {
    // Directly execute provided function, passing through context
    const executionResult = await fn(context);
    return { success: true, executionResult, healthCheckResult: { healthy: true } };
  }
  surfaceMemoryHealthIssues() {}
}

module.exports = AgentRunnerShim;

