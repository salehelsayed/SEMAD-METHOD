/**
 * Vector memory adapter (Qdrant) - no-op placeholder.
 * Implementations should provide connect, store, search, and health checks.
 */

async function connect() { return { connected: false, reason: 'not configured' }; }
async function store() { return { stored: false, reason: 'not configured' }; }
async function search() { return []; }
async function health() { return { status: 'degraded', reason: 'not configured' }; }

module.exports = { connect, store, search, health };

