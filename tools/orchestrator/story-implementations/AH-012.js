#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// AH-012: Metrics & Monitoring
async function execute() {
  console.log('[AH-012] Implementing Metrics & Monitoring...');
  
  const toolsDir = path.join(__dirname, '..', '..');
  const monitoringDir = path.join(toolsDir, 'monitoring');
  
  await fs.mkdir(monitoringDir, { recursive: true });
  
  // Create metrics-collector.js
  const metricsCollector = `const fs = require('fs').promises;
const path = require('path');

class MetricsCollector {
  constructor() {
    this.metrics = {
      gateChecks: [],
      storyCompletions: [],
      errors: [],
      performance: []
    };
  }
  
  async recordGateCheck(gate, passed, duration, details = {}) {
    const metric = {
      timestamp: new Date().toISOString(),
      gate,
      passed,
      duration,
      details
    };
    
    this.metrics.gateChecks.push(metric);
    await this.persistMetrics();
    
    console.log(\`[METRICS] Gate check: \${gate} - \${passed ? 'PASS' : 'FAIL'} (\${duration}ms)\`);
  }
  
  async recordStoryCompletion(storyId, duration, agent, success = true) {
    const metric = {
      timestamp: new Date().toISOString(),
      storyId,
      duration,
      agent,
      success
    };
    
    this.metrics.storyCompletions.push(metric);
    await this.persistMetrics();
    
    console.log(\`[METRICS] Story completion: \${storyId} by \${agent} - \${success ? 'SUCCESS' : 'FAILED'} (\${duration}ms)\`);
  }
  
  async recordError(error, context = {}) {
    const metric = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      context
    };
    
    this.metrics.errors.push(metric);
    await this.persistMetrics();
    
    console.log(\`[METRICS] Error recorded: \${error.message}\`);
  }
  
  async generateReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalGateChecks: this.metrics.gateChecks.length,
        gateSuccessRate: this.calculateSuccessRate(this.metrics.gateChecks),
        totalStories: this.metrics.storyCompletions.length,
        storySuccessRate: this.calculateSuccessRate(this.metrics.storyCompletions),
        totalErrors: this.metrics.errors.length,
        avgStoryDuration: this.calculateAvgDuration(this.metrics.storyCompletions)
      },
      trends: {
        gateCheckTrends: this.analyzeGateTrends(),
        errorTrends: this.analyzeErrorTrends(),
        performanceTrends: this.analyzePerformanceTrends()
      },
      details: this.metrics
    };
    
    return report;
  }
  
  calculateSuccessRate(metrics) {
    if (metrics.length === 0) return 0;
    const successful = metrics.filter(m => m.passed || m.success).length;
    return (successful / metrics.length * 100).toFixed(2);
  }
  
  calculateAvgDuration(metrics) {
    if (metrics.length === 0) return 0;
    const total = metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    return (total / metrics.length).toFixed(2);
  }
  
  analyzeGateTrends() {
    const byGate = {};
    this.metrics.gateChecks.forEach(check => {
      if (!byGate[check.gate]) {
        byGate[check.gate] = { total: 0, passed: 0 };
      }
      byGate[check.gate].total++;
      if (check.passed) byGate[check.gate].passed++;
    });
    
    return Object.entries(byGate).map(([gate, stats]) => ({
      gate,
      successRate: (stats.passed / stats.total * 100).toFixed(2),
      totalChecks: stats.total
    }));
  }
  
  analyzeErrorTrends() {
    const errorTypes = {};
    this.metrics.errors.forEach(error => {
      const type = error.context.type || 'unknown';
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    });
    
    return Object.entries(errorTypes).map(([type, count]) => ({ type, count }));
  }
  
  analyzePerformanceTrends() {
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    const recentCompletions = this.metrics.storyCompletions
      .filter(c => new Date(c.timestamp).getTime() > last24h);
    
    return {
      storiesLast24h: recentCompletions.length,
      avgDurationLast24h: this.calculateAvgDuration(recentCompletions)
    };
  }
  
  async persistMetrics() {
    const metricsFile = path.join(process.cwd(), '.ai', 'metrics.json');
    await fs.mkdir(path.dirname(metricsFile), { recursive: true });
    await fs.writeFile(metricsFile, JSON.stringify(this.metrics, null, 2));
  }
  
  async loadMetrics() {
    try {
      const metricsFile = path.join(process.cwd(), '.ai', 'metrics.json');
      const data = await fs.readFile(metricsFile, 'utf-8');
      this.metrics = JSON.parse(data);
    } catch (error) {
      // Metrics file doesn't exist yet
    }
  }
}

module.exports = { MetricsCollector };

if (require.main === module) {
  const collector = new MetricsCollector();
  
  collector.loadMetrics().then(async () => {
    const report = await collector.generateReport();
    console.log(JSON.stringify(report, null, 2));
  });
}`;
  
  await fs.writeFile(path.join(monitoringDir, 'metrics-collector.js'), metricsCollector);
  
  console.log('[AH-012] ✓ Metrics & Monitoring implementation complete');
}

module.exports = { execute };