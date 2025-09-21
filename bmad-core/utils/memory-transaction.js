/**
 * Minimal MemoryTransaction shim for SEMAD-METHOD TaskRunner.
 * This stub satisfies imports in tools/task-runner.js without providing
 * any persistence semantics. It is sufficient for in-session workflows
 * that do not rely on transactional memory.
 */

class MemoryTransaction {
  constructor() {
    this.active = false;
  }
  async begin() { this.active = true; }
  async commit() { this.active = false; }
  async rollback() { this.active = false; }
}

module.exports = { MemoryTransaction };

