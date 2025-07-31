/**
 * Memory Transaction Manager for atomic memory operations
 * Supports both synchronous and asynchronous memory interfaces with story/epic context
 */

const { MemoryStateError } = require('../errors/task-errors');
const { persistObservation, persistDecision } = require('./agent-memory-persistence');

class MemoryTransaction {
  constructor(memory, agentName = null, context = {}) {
    this.memory = memory;
    this.agentName = agentName;
    this.context = context; // Story/epic context
    this.originalState = null;
    this.updates = [];
    this.observations = []; // Track observations during transaction
    this.decisions = []; // Track decisions during transaction
    this.isActive = false;
    this.isAsync = this._detectAsyncMemory();
  }

  /**
   * Detect if memory interface is async
   */
  _detectAsyncMemory() {
    // Check if getAll returns a promise
    if (this.memory.getAll && typeof this.memory.getAll === 'function') {
      const result = this.memory.getAll();
      return result && typeof result.then === 'function';
    }
    return false;
  }

  /**
   * Begin a new transaction
   */
  async begin() {
    if (this.isActive) {
      throw new MemoryStateError('Transaction already in progress', 'BEGIN_TRANSACTION');
    }
    
    // Deep clone the current memory state
    if (this.isAsync) {
      this.originalState = JSON.parse(JSON.stringify(await this.memory.getAll()));
    } else {
      this.originalState = JSON.parse(JSON.stringify(this.memory.getAll()));
    }
    this.updates = [];
    this.isActive = true;
  }

  /**
   * Add an update to the transaction
   * @param {string} key - Memory key to update
   * @param {*} value - Value to set
   */
  update(key, value) {
    if (!this.isActive) {
      throw new MemoryStateError('No active transaction', 'UPDATE');
    }
    
    this.updates.push({ key, value });
  }

  /**
   * Add an observation to be persisted with the transaction
   * @param {string} observation - Observation text
   * @param {Object} options - Additional options
   */
  addObservation(observation, options = {}) {
    if (!this.isActive) {
      throw new MemoryStateError('No active transaction', 'ADD_OBSERVATION');
    }
    
    this.observations.push({
      observation,
      actionType: options.actionType || 'transaction-update',
      isSignificant: options.isSignificant !== false,
      metadata: {
        ...options.metadata,
        transactionId: Date.now()
      }
    });
  }

  /**
   * Add a decision to be persisted with the transaction
   * @param {string} decision - Decision made
   * @param {string} reasoning - Reasoning behind decision
   * @param {Object} options - Additional options
   */
  addDecision(decision, reasoning, options = {}) {
    if (!this.isActive) {
      throw new MemoryStateError('No active transaction', 'ADD_DECISION');
    }
    
    this.decisions.push({
      decision,
      reasoning,
      metadata: {
        ...options.metadata,
        transactionId: Date.now()
      }
    });
  }

  /**
   * Commit all updates to memory
   */
  async commit() {
    if (!this.isActive) {
      throw new MemoryStateError('No active transaction to commit', 'COMMIT');
    }

    try {
      // Apply all updates
      for (const { key, value } of this.updates) {
        if (this.isAsync) {
          await this.memory.set(key, value);
        } else {
          this.memory.set(key, value);
        }
      }
      
      // Persist observations and decisions if agent name is provided
      if (this.agentName) {
        // Persist observations
        for (const obs of this.observations) {
          await persistObservation(this.agentName, obs.observation, {
            actionType: obs.actionType,
            isSignificant: obs.isSignificant,
            metadata: {
              ...obs.metadata,
              context: this.context
            }
          });
        }
        
        // Persist decisions
        for (const dec of this.decisions) {
          await persistDecision(this.agentName, dec.decision, dec.reasoning, {
            metadata: {
              ...dec.metadata,
              context: this.context
            }
          });
        }
      }
      
      // Clear transaction state
      this.originalState = null;
      this.updates = [];
      this.observations = [];
      this.decisions = [];
      this.isActive = false;
    } catch (error) {
      // If any update fails, rollback
      await this.rollback();
      throw new MemoryStateError(
        `Failed to commit transaction: ${error.message}`,
        'COMMIT',
        { originalError: error.message }
      );
    }
  }

  /**
   * Rollback to original state
   */
  async rollback() {
    if (!this.isActive) {
      return; // Nothing to rollback
    }

    try {
      // Clear current memory
      const currentKeys = this.isAsync 
        ? Object.keys(await this.memory.getAll())
        : Object.keys(this.memory.getAll());
        
      for (const key of currentKeys) {
        if (this.isAsync) {
          await this.memory.delete(key);
        } else {
          this.memory.delete(key);
        }
      }
      
      // Restore original state
      if (this.originalState) {
        for (const [key, value] of Object.entries(this.originalState)) {
          if (this.isAsync) {
            await this.memory.set(key, value);
          } else {
            this.memory.set(key, value);
          }
        }
      }
    } catch (error) {
      throw new MemoryStateError(
        `Failed to rollback transaction: ${error.message}`,
        'ROLLBACK',
        { originalError: error.message }
      );
    } finally {
      // Clear transaction state
      this.originalState = null;
      this.updates = [];
      this.observations = [];
      this.decisions = [];
      this.isActive = false;
    }
  }

  /**
   * Execute a function within a transaction
   * @param {Function} fn - Function to execute
   * @returns {*} Result of the function
   */
  async execute(fn) {
    await this.begin();
    
    try {
      const result = await fn(this);
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }
}

module.exports = { MemoryTransaction };