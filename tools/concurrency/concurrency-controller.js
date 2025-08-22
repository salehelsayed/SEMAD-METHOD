const fs = require('fs').promises;
const path = require('path');

class ConcurrencyController {
  constructor() {
    this.locks = new Map();
    this.sessions = new Map();
  }
  
  async acquireLock(resource, sessionId, timeout = 30000) {
    console.log(`[CONCURRENCY] Acquiring lock for ${resource} by ${sessionId}`);
    
    if (this.locks.has(resource)) {
      const existing = this.locks.get(resource);
      if (existing.sessionId !== sessionId) {
        throw new Error(`Resource ${resource} is locked by ${existing.sessionId}`);
      }
    }
    
    const lock = {
      sessionId,
      resource,
      acquiredAt: Date.now(),
      timeout
    };
    
    this.locks.set(resource, lock);
    
    // Auto-release after timeout
    setTimeout(() => {
      if (this.locks.get(resource)?.sessionId === sessionId) {
        this.releaseLock(resource, sessionId);
      }
    }, timeout);
    
    return lock;
  }
  
  async releaseLock(resource, sessionId) {
    console.log(`[CONCURRENCY] Releasing lock for ${resource} by ${sessionId}`);
    
    const lock = this.locks.get(resource);
    if (!lock || lock.sessionId !== sessionId) {
      throw new Error(`Cannot release lock for ${resource}: not owned by ${sessionId}`);
    }
    
    this.locks.delete(resource);
    return true;
  }
  
  async checkConflicts(files, sessionId) {
    console.log(`[CONCURRENCY] Checking conflicts for ${files.length} files`);
    
    const conflicts = [];
    
    for (const file of files) {
      const lock = this.locks.get(file);
      if (lock && lock.sessionId !== sessionId) {
        conflicts.push({
          file,
          lockedBy: lock.sessionId,
          since: lock.acquiredAt
        });
      }
    }
    
    return conflicts;
  }
  
  async registerSession(sessionId, agentType) {
    console.log(`[CONCURRENCY] Registering session ${sessionId} for ${agentType}`);
    
    this.sessions.set(sessionId, {
      id: sessionId,
      agentType,
      startedAt: Date.now(),
      locks: new Set()
    });
  }
  
  async getStatus() {
    return {
      activeLocks: Array.from(this.locks.entries()).map(([resource, lock]) => ({
        resource,
        sessionId: lock.sessionId,
        duration: Date.now() - lock.acquiredAt
      })),
      activeSessions: Array.from(this.sessions.values())
    };
  }
}

module.exports = { ConcurrencyController };

if (require.main === module) {
  const controller = new ConcurrencyController();
  
  // CLI interface
  const command = process.argv[2];
  const resource = process.argv[3];
  const sessionId = process.argv[4] || 'cli-session';
  
  switch (command) {
    case 'lock':
      controller.acquireLock(resource, sessionId).then(() => {
        console.log(`Lock acquired for ${resource}`);
      }).catch(console.error);
      break;
    case 'unlock':
      controller.releaseLock(resource, sessionId).then(() => {
        console.log(`Lock released for ${resource}`);
      }).catch(console.error);
      break;
    case 'status':
      controller.getStatus().then(status => {
        console.log(JSON.stringify(status, null, 2));
      });
      break;
    default:
      console.log('Usage: node concurrency-controller.js [lock|unlock|status] [resource] [sessionId]');
  }
}