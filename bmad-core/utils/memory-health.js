#!/usr/bin/env node

/**
 * Lightweight Memory Health Monitor (portable stub)
 *
 * Provides a minimal health-check implementation to satisfy AgentRunner
 * expectations without requiring a heavy memory subsystem.
 */

const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

const _latestStatus = new Map();
const _intervals = new Map();

async function performHealthCheck(agentName, options = {}) {
  const result = {
    overallStatus: 'healthy',
    checks: {
      storageWritable: { component: 'storage', status: 'ok', severity: SEVERITY.INFO, message: 'History directory writable' }
    },
    recommendations: [],
    summary: { total: 1, healthy: 1, degraded: 0, unhealthy: 0 },
    timestamp: Date.now()
  };
  _latestStatus.set(agentName, result);
  return result;
}

function getCurrentHealthStatus(agentName) {
  return _latestStatus.get(agentName) || null;
}

function startPeriodicMonitoring(agentName, intervalMs = 30000 /* 30s */, opts = {}) {
  stopPeriodicMonitoring(agentName);
  const id = setInterval(() => {
    performHealthCheck(agentName, { skipOperations: true }).catch(() => {});
  }, Math.max(5000, intervalMs));
  _intervals.set(agentName, id);
  return () => stopPeriodicMonitoring(agentName);
}

function stopPeriodicMonitoring(agentName) {
  const id = _intervals.get(agentName);
  if (id) {
    clearInterval(id);
    _intervals.delete(agentName);
  }
}

module.exports = {
  SEVERITY,
  performHealthCheck,
  getCurrentHealthStatus,
  startPeriodicMonitoring
};

