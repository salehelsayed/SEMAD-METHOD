/**
 * Centralized Connection Manager (generic)
 *
 * Provides a lightweight registry for external connections so agents
 * can reuse handles and perform basic health checks without relying on
 * vendor-specific implementations.
 */

const EventEmitter = require('events');

class ConnectionManager extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map();
    this.healthStatus = new Map();
    this.reconnectTimers = new Map();
    this.isShuttingDown = false;

    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    process.on('beforeExit', () => this.shutdown());
  }

  /**
   * Register a connection handle.
   *
   * @param {string} key Unique identifier for the connection
   * @param {*} client The underlying connection/client instance
   * @param {Object} options Optional metadata ({ type, config, healthCheck, reconnect, close })
   * @returns {*} The registered client instance
   */
  registerConnection(key, client, options = {}) {
    const entry = {
      type: options.type || 'generic',
      client,
      config: options.config || {},
      healthCheck: typeof options.healthCheck === 'function' ? options.healthCheck : null,
      reconnect: typeof options.reconnect === 'function' ? options.reconnect : null,
      close: typeof options.close === 'function' ? options.close : null,
      created: Date.now(),
      lastUsed: Date.now()
    };

    this.connections.set(key, entry);
    this.healthStatus.set(key, true);
    this.emit('connection:created', { key, type: entry.type });
    return client;
  }

  /**
   * Retrieve a connection by key.
   * @param {string} key
   * @returns {*} The client instance or null if not found/healthy
   */
  async getConnection(key) {
    const entry = this.connections.get(key);
    if (!entry) {
      return null;
    }

    entry.lastUsed = Date.now();

    // Trigger background health check if stale
    const lastHealthCheck = entry.lastHealthCheck || 0;
    if (Date.now() - lastHealthCheck > 30000) {
      entry.lastHealthCheck = Date.now();
      await this.checkConnectionHealth(key);
    }

    return this.healthStatus.get(key) ? entry.client : null;
  }

  /**
   * Perform a health check for a registered connection.
   * @param {string} key
   * @returns {boolean} True when healthy.
   */
  async checkConnectionHealth(key) {
    const entry = this.connections.get(key);
    if (!entry) {
      return false;
    }

    try {
      if (entry.healthCheck) {
        await entry.healthCheck(entry.client, entry.config);
      }

      this.healthStatus.set(key, true);
      this.emit('connection:healthy', { key, type: entry.type });
      return true;
    } catch (error) {
      this.healthStatus.set(key, false);
      this.emit('connection:unhealthy', { key, type: entry.type, error: error.message });
      this.scheduleReconnect(key);
      return false;
    }
  }

  /**
   * Attempt to reconnect a connection using the supplied reconnect handler.
   * @param {string} key
   * @param {number} delay Delay before attempting in milliseconds (default 5000)
   */
  scheduleReconnect(key, delay = 5000) {
    if (this.reconnectTimers.has(key) || this.isShuttingDown) {
      return;
    }

    const entry = this.connections.get(key);
    if (!entry || !entry.reconnect) {
      return;
    }

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(key);
      if (this.isShuttingDown) {
        return;
      }

      try {
        const newClient = await entry.reconnect(entry.client, entry.config);
        if (newClient) {
          entry.client = newClient;
          entry.lastUsed = Date.now();
          this.healthStatus.set(key, true);
          this.emit('connection:reconnected', { key, type: entry.type });
        }
      } catch (error) {
        this.healthStatus.set(key, false);
        this.emit('connection:reconnect-failed', { key, type: entry.type, error: error.message });
        this.scheduleReconnect(key, Math.min(delay * 2, 60000));
      }
    }, delay);

    this.reconnectTimers.set(key, timer);
  }

  /**
   * Close and optionally remove a connection.
   * @param {string} key
   * @param {boolean} removeFromPool
   */
  async closeConnection(key, removeFromPool = true) {
    const entry = this.connections.get(key);
    if (!entry) {
      return;
    }

    try {
      if (entry.close) {
        await entry.close(entry.client, entry.config);
      } else if (entry.client) {
        await entry.client.close?.();
        await entry.client.destroy?.();
        await entry.client.end?.();
      }

      this.emit('connection:closed', { key, type: entry.type });
    } catch (error) {
      console.error(`Error closing connection ${key}:`, error.message);
    }

    if (removeFromPool) {
      this.connections.delete(key);
      this.healthStatus.delete(key);
      if (this.reconnectTimers.has(key)) {
        clearTimeout(this.reconnectTimers.get(key));
        this.reconnectTimers.delete(key);
      }
    }
  }

  /**
   * Close idle connections.
   * @param {number} maxIdleTime Maximum idle time in milliseconds
   */
  async closeIdleConnections(maxIdleTime = 300000) {
    const now = Date.now();
    const targets = [];

    for (const [key, entry] of this.connections.entries()) {
      if (now - entry.lastUsed > maxIdleTime) {
        targets.push(key);
      }
    }

    for (const key of targets) {
      await this.closeConnection(key);
    }

    return targets.length;
  }

  /**
   * Run health checks on all registered connections.
   */
  async healthCheckAll() {
    const results = {};
    for (const key of this.connections.keys()) {
      results[key] = await this.checkConnectionHealth(key);
    }
    return results;
  }

  /**
   * Shutdown all connections gracefully.
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    const closePromises = [];
    for (const key of this.connections.keys()) {
      closePromises.push(this.closeConnection(key));
    }

    await Promise.all(closePromises);
    this.emit('shutdown');
  }

  /**
   * Convenience helper: get stats for all connections.
   */
  getPoolStats() {
    const stats = {};
    for (const [key, entry] of this.connections.entries()) {
      stats[key] = {
        type: entry.type,
        created: entry.created,
        lastUsed: entry.lastUsed,
        healthy: this.healthStatus.get(key) || false,
        age: Date.now() - entry.created,
        idle: Date.now() - entry.lastUsed
      };
    }
    return stats;
  }

  /**
   * Middleware registration helper.
   */
  use(middleware) {
    this.on('connection:created', middleware);
    this.on('connection:closed', middleware);
    this.on('connection:healthy', middleware);
    this.on('connection:unhealthy', middleware);
    this.on('connection:reconnected', middleware);
    this.on('connection:reconnect-failed', middleware);
  }

  /**
   * Legacy API shim for removed Qdrant integration.
   */
  getQdrantConnection() {
    throw new Error('Qdrant integration has been retired. Update tasks to use local documentation search.');
  }
}

const connectionManager = new ConnectionManager();

let idleCleanupInterval = null;
let healthCheckInterval = null;
const isSubprocess = process.argv.some(arg => arg.includes('AndExit'));

if (!isSubprocess) {
  idleCleanupInterval = setInterval(() => {
    if (!connectionManager.isShuttingDown) {
      connectionManager.closeIdleConnections().catch(console.error);
    }
  }, 60000);

  healthCheckInterval = setInterval(() => {
    if (!connectionManager.isShuttingDown) {
      connectionManager.healthCheckAll().catch(console.error);
    }
  }, 30000);
}

connectionManager.clearIntervals = () => {
  if (idleCleanupInterval) {
    clearInterval(idleCleanupInterval);
    idleCleanupInterval = null;
  }
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
};

const originalShutdown = connectionManager.shutdown.bind(connectionManager);
connectionManager.shutdown = async function shutdownWrapper() {
  this.clearIntervals();
  return originalShutdown();
};

module.exports = connectionManager;
