/**
 * Centralized Connection Manager
 * 
 * Manages all external connections (databases, services) in a centralized way.
 * Ensures proper connection pooling, error handling, and cleanup.
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const { Agent } = require('undici');
const { MEMORY_CONFIG } = require('./memory-config');
const EventEmitter = require('events');

class ConnectionManager extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map();
    this.connectionPools = new Map();
    this.healthStatus = new Map();
    this.reconnectTimers = new Map();
    this.isShuttingDown = false;

    // Handle process termination
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    process.on('beforeExit', () => this.shutdown());
  }

  /**
   * Get or create a Qdrant connection
   * @param {string} name - Connection name (default: 'default')
   * @param {Object} config - Connection configuration
   * @returns {QdrantClient} Qdrant client instance
   */
  getQdrantConnection(name = 'default', config = {}) {
    const key = `qdrant_${name}`;
    
    if (!this.connections.has(key) || !this.healthStatus.get(key)) {
      const agent = new Agent({ 
        keepAliveTimeout: 0,  // Disable keep-alive
        keepAliveMaxTimeout: 0,
        connections: config.maxConnections || 10
      });

      const client = new QdrantClient({ 
        host: config.host || MEMORY_CONFIG.QDRANT_HOST, 
        port: config.port || MEMORY_CONFIG.QDRANT_PORT,
        timeout: config.timeout || 5000,
        agent
      });

      this.connections.set(key, {
        type: 'qdrant',
        client,
        agent,
        config,
        created: Date.now(),
        lastUsed: Date.now()
      });

      this.healthStatus.set(key, true);
      this.emit('connection:created', { key, type: 'qdrant' });
    }

    const connection = this.connections.get(key);
    connection.lastUsed = Date.now();
    return connection.client;
  }

  /**
   * Check health of a specific connection
   * @param {string} key - Connection key
   * @returns {boolean} True if healthy
   */
  async checkConnectionHealth(key) {
    const connection = this.connections.get(key);
    if (!connection) return false;

    try {
      if (connection.type === 'qdrant') {
        await connection.client.getCollections();
      }
      // Add other connection type health checks here

      this.healthStatus.set(key, true);
      this.emit('connection:healthy', { key, type: connection.type });
      return true;
    } catch (error) {
      this.healthStatus.set(key, false);
      this.emit('connection:unhealthy', { key, type: connection.type, error: error.message });
      
      // Schedule reconnection attempt
      this.scheduleReconnect(key);
      return false;
    }
  }

  /**
   * Schedule a reconnection attempt
   * @param {string} key - Connection key
   * @param {number} delay - Delay in ms (default: 5000)
   */
  scheduleReconnect(key, delay = 5000) {
    if (this.reconnectTimers.has(key) || this.isShuttingDown) {
      return;
    }

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(key);
      
      const connection = this.connections.get(key);
      if (!connection) return;

      console.log(`Attempting to reconnect ${key}...`);
      
      // Close old connection
      await this.closeConnection(key, false);
      
      // Recreate connection
      if (connection.type === 'qdrant') {
        this.getQdrantConnection(key.replace('qdrant_', ''), connection.config);
      }
      
      // Check health
      const healthy = await this.checkConnectionHealth(key);
      if (!healthy) {
        // Exponential backoff
        this.scheduleReconnect(key, Math.min(delay * 2, 60000));
      }
    }, delay);

    this.reconnectTimers.set(key, timer);
  }

  /**
   * Get connection pool statistics
   * @returns {Object} Pool statistics
   */
  getPoolStats() {
    const stats = {};
    
    for (const [key, connection] of this.connections.entries()) {
      stats[key] = {
        type: connection.type,
        created: connection.created,
        lastUsed: connection.lastUsed,
        healthy: this.healthStatus.get(key) || false,
        age: Date.now() - connection.created,
        idle: Date.now() - connection.lastUsed
      };
    }
    
    return stats;
  }

  /**
   * Close a specific connection
   * @param {string} key - Connection key
   * @param {boolean} removeFromPool - Whether to remove from pool
   */
  async closeConnection(key, removeFromPool = true) {
    const connection = this.connections.get(key);
    if (!connection) return;

    try {
      if (connection.type === 'qdrant' && connection.agent) {
        await connection.agent.destroy();
      }
      // Add other connection type cleanup here

      this.emit('connection:closed', { key, type: connection.type });
    } catch (error) {
      console.error(`Error closing connection ${key}:`, error.message);
    }

    if (removeFromPool) {
      this.connections.delete(key);
      this.healthStatus.delete(key);
      
      // Clear any pending reconnect timers
      if (this.reconnectTimers.has(key)) {
        clearTimeout(this.reconnectTimers.get(key));
        this.reconnectTimers.delete(key);
      }
    }
  }

  /**
   * Close idle connections
   * @param {number} maxIdleTime - Maximum idle time in ms (default: 5 minutes)
   */
  async closeIdleConnections(maxIdleTime = 300000) {
    const now = Date.now();
    const connectionsToClose = [];

    for (const [key, connection] of this.connections.entries()) {
      if (now - connection.lastUsed > maxIdleTime) {
        connectionsToClose.push(key);
      }
    }

    for (const key of connectionsToClose) {
      console.log(`Closing idle connection: ${key}`);
      await this.closeConnection(key);
    }

    return connectionsToClose.length;
  }

  /**
   * Perform health check on all connections
   * @returns {Object} Health check results
   */
  async healthCheckAll() {
    const results = {};
    
    for (const key of this.connections.keys()) {
      results[key] = await this.checkConnectionHealth(key);
    }
    
    return results;
  }

  /**
   * Shutdown all connections gracefully
   */
  async shutdown() {
    if (this.isShuttingDown) return;
    
    console.log('Connection manager shutting down...');
    this.isShuttingDown = true;

    // Clear all reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Close all connections
    const closePromises = [];
    for (const key of this.connections.keys()) {
      closePromises.push(this.closeConnection(key));
    }

    await Promise.all(closePromises);
    
    console.log('All connections closed');
    this.emit('shutdown');
  }

  /**
   * Get connection by key with automatic health check
   * @param {string} key - Connection key
   * @returns {Object|null} Connection object or null
   */
  async getConnection(key) {
    const connection = this.connections.get(key);
    if (!connection) return null;

    // Check health if not checked recently
    const lastHealthCheck = connection.lastHealthCheck || 0;
    if (Date.now() - lastHealthCheck > 30000) {
      connection.lastHealthCheck = Date.now();
      await this.checkConnectionHealth(key);
    }

    return this.healthStatus.get(key) ? connection : null;
  }

  /**
   * Register connection middleware
   * @param {Function} middleware - Middleware function
   */
  use(middleware) {
    this.on('connection:created', middleware);
    this.on('connection:closed', middleware);
    this.on('connection:healthy', middleware);
    this.on('connection:unhealthy', middleware);
  }
}

// Create singleton instance
const connectionManager = new ConnectionManager();

// Store interval IDs to clear them later
let idleCleanupInterval = null;
let healthCheckInterval = null;

// Only start intervals if not in a subprocess that needs quick exit
const isSubprocess = process.argv.some(arg => arg.includes('AndExit'));

if (!isSubprocess) {
  // Schedule periodic idle connection cleanup
  idleCleanupInterval = setInterval(() => {
    if (!connectionManager.isShuttingDown) {
      connectionManager.closeIdleConnections().catch(console.error);
    }
  }, 60000); // Run every minute

  // Schedule periodic health checks
  healthCheckInterval = setInterval(() => {
    if (!connectionManager.isShuttingDown) {
      connectionManager.healthCheckAll().catch(console.error);
    }
  }, 30000); // Run every 30 seconds
}

// Add method to clear intervals
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

// Override shutdown to clear intervals
const originalShutdown = connectionManager.shutdown.bind(connectionManager);
connectionManager.shutdown = async function() {
  this.clearIntervals();
  return originalShutdown();
};

module.exports = connectionManager;