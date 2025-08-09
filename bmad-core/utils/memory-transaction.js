/**
 * MemoryTransaction stub used by tools/task-runner and tests.
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

