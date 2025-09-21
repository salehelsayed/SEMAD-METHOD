/**
 * Minimal TaskRecovery shim to satisfy TaskRunner imports in light-weight installs.
 */
class TaskRecovery {
  constructor(_memory) {
    this.memory = _memory || { getAll: () => ({}) };
  }
  async recoverFromError(_error, _context) {
    return { recovered: false, actions: [] };
  }
}

module.exports = { TaskRecovery };

