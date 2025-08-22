#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

/**
 * Metrics and Monitoring System for BMad Method
 * 
 * This collector parses .ai/test-logs/* and preflight/gates outputs to compute
 * KPIs for validation system health and quality metrics.
 */
class MetricsCollector {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.testLogsDir = path.join(this.projectRoot, '.ai', 'test-logs');
    this.reportsDir = options.reportsDir || this.testLogsDir;
    this.verbose = options.verbose || false;
    
    // Initialize metrics structure
    this.metrics = {
      contractPassRate: { passed: 0, total: 0, rate: 0, trend: 'stable' },
      timeToGreen: { samples: [], average: 0, median: 0, trend: 'stable' },
      diffChurn: { samples: [], average: 0, median: 0, trend: 'stable' },
      referenceCheckFailureRate: { failed: 0, total: 0, rate: 0, trend: 'stable' },
      driftAlarms: { count: 0, last24h: 0, trend: 'stable' },
      rollbackCount: { total: 0, last7days: 0, trend: 'stable' },
      gateMetrics: {
        planning: { passed: 0, total: 0, rate: 0, trend: 'stable' },
        dev: { passed: 0, total: 0, rate: 0, trend: 'stable' },
        qa: { passed: 0, total: 0, rate: 0, trend: 'stable' }
      },
      preflightChecks: {
        schema: { passed: 0, total: 0, rate: 0, trend: 'stable' },
        contract: { passed: 0, total: 0, rate: 0, trend: 'stable' },
        grounding: { passed: 0, total: 0, rate: 0, trend: 'stable' },
        lint: { passed: 0, total: 0, rate: 0, trend: 'stable' },
        type: { passed: 0, total: 0, rate: 0, trend: 'stable' },
        build: { passed: 0, total: 0, rate: 0, trend: 'stable' }
      },
      trends: {
        periodAnalysis: '7 days',
        overallTrend: 'stable',
        improvingMetrics: [],
        decliningMetrics: [],
        stableMetrics: []
      }
    };
  }

  async collect() {
    if (this.verbose) {
      console.log('Starting metrics collection...');
    }

    try {
      await this.ensureDirectoriesExist();
      
      // Collect from various log sources
      await this.collectTaskTrackerLogs();
      await this.collectSchemaCheckLogs();
      await this.collectGateLogs();
      await this.collectPreflightLogs();
      await this.collectReferenceCheckLogs();
      await this.collectRollbackLogs();
      await this.collectDriftAlarms();
      
      // Calculate derived metrics
      this.calculateRates();
      await this.calculateAverages();
      await this.calculateTrends();
      
      if (this.verbose) {
        console.log('Metrics collection completed successfully');
      }
      
      return this.metrics;
    } catch (error) {
      console.error('Error during metrics collection:', error.message);
      throw error;
    }
  }

  async ensureDirectoriesExist() {
    try {
      await fs.mkdir(this.testLogsDir, { recursive: true });
      await fs.mkdir(this.reportsDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to create directories:', error.message);
      throw new Error(`Unable to create required directories: ${error.message}`);
    }
  }

  async collectTaskTrackerLogs() {
    if (this.verbose) console.log('Collecting task tracker logs...');
    
    try {
      const pattern = path.join(this.testLogsDir, 'task-tracker_*.json');
      const files = await glob(pattern);
      
      if (files.length === 0) {
        if (this.verbose) console.log('  No task tracker logs found');
        return;
      }
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          if (!content.trim()) {
            console.warn(`  Empty task tracker log file: ${file}`);
            continue;
          }
          
          const data = JSON.parse(content);
          
          if (data.workflow && data.summary) {
            // Extract time-to-green (completion time)
            if (data.summary.elapsedTime) {
              const timeMs = this.parseElapsedTime(data.summary.elapsedTime);
              if (timeMs > 0) {
                this.metrics.timeToGreen.samples.push(timeMs);
              }
            }
            
            // Contract compliance - check if workflow completed successfully
            const success = data.summary.percentComplete === 100 || 
                           data.summary.remainingTasks === 0;
            
            this.metrics.contractPassRate.total++;
            if (success) {
              this.metrics.contractPassRate.passed++;
            }
            
            if (this.verbose) {
              console.log(`  Processed task tracker: ${data.workflow.name || 'unknown'} - ${success ? 'SUCCESS' : 'INCOMPLETE'}`);
            }
          } else {
            console.warn(`  Invalid task tracker log structure in ${file}`);
          }
        } catch (error) {
          console.warn(`  Failed to parse task tracker log ${file}: ${error.message}`);
        }
      }
    } catch (error) {
      console.warn(`Failed to collect task tracker logs: ${error.message}`);
    }
  }

  async collectSchemaCheckLogs() {
    if (this.verbose) console.log('Collecting schema check logs...');
    
    const schemaLogPath = path.join(this.testLogsDir, 'schema-check.json');
    
    try {
      const content = await fs.readFile(schemaLogPath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.results && Array.isArray(data.results)) {
        for (const result of data.results) {
          this.metrics.preflightChecks.schema.total++;
          if (result.status === 'PASS') {
            this.metrics.preflightChecks.schema.passed++;
          }
        }
      }
    } catch (error) {
      if (this.verbose) {
        console.warn('No schema check logs found:', error.message);
      }
    }
  }

  async collectGateLogs() {
    if (this.verbose) console.log('Collecting gate logs...');
    
    // Look for gate check results in various locations
    const gatePattern = path.join(this.testLogsDir, 'gates-*.json');
    const files = await glob(gatePattern);
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const data = JSON.parse(content);
        
        // Handle the structured gate log format found in gates-*.json files
        // These files contain multiple gates (planning, dev, qa) with detailed checks
        for (const [gateName, gateData] of Object.entries(data)) {
          if (gateName === 'lastUpdated') continue; // Skip metadata
          
          if (gateData && typeof gateData.passed === 'boolean' && this.metrics.gateMetrics[gateName]) {
            this.metrics.gateMetrics[gateName].total++;
            if (gateData.passed) {
              this.metrics.gateMetrics[gateName].passed++;
            }
            
            if (this.verbose) {
              console.log(`  Found ${gateName} gate: ${gateData.passed ? 'PASS' : 'FAIL'}`);
            }
          }
        }
        
        // Also handle legacy format for backwards compatibility
        if (data.gate && typeof data.passed === 'boolean') {
          const gateName = data.gate;
          if (this.metrics.gateMetrics[gateName]) {
            this.metrics.gateMetrics[gateName].total++;
            if (data.passed) {
              this.metrics.gateMetrics[gateName].passed++;
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to parse gate log ${file}:`, error.message);
      }
    }
  }

  async collectPreflightLogs() {
    if (this.verbose) console.log('Collecting preflight logs...');
    
    // Collect dedicated preflight log files
    const preflightPattern = path.join(this.testLogsDir, 'preflight-*.json');
    const files = await glob(preflightPattern);
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const data = JSON.parse(content);
        
        // Process different preflight check types
        this.processPreflightData(data);
      } catch (error) {
        console.warn(`Failed to parse preflight log ${file}:`, error.message);
      }
    }
    
    // Also extract preflight data from gate logs that contain preflight checks
    const gatePattern = path.join(this.testLogsDir, 'gates-*.json');
    const gateFiles = await glob(gatePattern);
    
    for (const file of gateFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const data = JSON.parse(content);
        
        // Extract preflight checks from dev gates
        if (data.dev && data.dev.checks) {
          for (const check of data.dev.checks) {
            if (check.name && check.name.includes('preflight')) {
              // Parse preflight:all output to extract individual check results
              if (check.name === 'preflight:all') {
                this.parsePreflightAllOutput(check);
              } else {
                // Handle individual preflight checks
                const checkType = this.mapCheckNameToType(check.name);
                if (checkType && this.metrics.preflightChecks[checkType]) {
                  this.metrics.preflightChecks[checkType].total++;
                  if (check.passed) {
                    this.metrics.preflightChecks[checkType].passed++;
                  }
                  
                  if (this.verbose) {
                    console.log(`  Found preflight check ${checkType}: ${check.passed ? 'PASS' : 'FAIL'}`);
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to extract preflight data from gate log ${file}:`, error.message);
      }
    }
  }

  async collectReferenceCheckLogs() {
    if (this.verbose) console.log('Collecting reference check logs...');
    
    const refCheckPath = path.join(this.projectRoot, '.ai', 'reference-check.json');
    
    try {
      const content = await fs.readFile(refCheckPath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.summary) {
        this.metrics.referenceCheckFailureRate.total++;
        if (!data.summary.passed || data.summary.errorsFound > 0) {
          this.metrics.referenceCheckFailureRate.failed++;
        }
      }
    } catch (error) {
      if (this.verbose) {
        console.warn('No reference check logs found:', error.message);
      }
    }
  }

  async collectRollbackLogs() {
    if (this.verbose) console.log('Collecting rollback logs...');
    
    const rollbackPattern = path.join(this.testLogsDir, '*rollback*.json');
    const files = await glob(rollbackPattern);
    
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const data = JSON.parse(content);
        
        this.metrics.rollbackCount.total++;
        
        if (data.timestamp) {
          const rollbackTime = new Date(data.timestamp).getTime();
          if (rollbackTime > sevenDaysAgo) {
            this.metrics.rollbackCount.last7days++;
          }
        }
      } catch (error) {
        console.warn(`Failed to parse rollback log ${file}:`, error.message);
      }
    }
  }

  async collectDriftAlarms() {
    if (this.verbose) console.log('Collecting drift alarms...');
    
    const driftPattern = path.join(this.testLogsDir, '*drift*.json');
    const files = await glob(driftPattern);
    
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const data = JSON.parse(content);
        
        this.metrics.driftAlarms.count++;
        
        if (data.timestamp) {
          const alarmTime = new Date(data.timestamp).getTime();
          if (alarmTime > twentyFourHoursAgo) {
            this.metrics.driftAlarms.last24h++;
          }
        }
      } catch (error) {
        console.warn(`Failed to parse drift log ${file}:`, error.message);
      }
    }
  }

  processPreflightData(data) {
    // Handle different preflight check result formats
    if (data.checks) {
      for (const [checkType, result] of Object.entries(data.checks)) {
        if (this.metrics.preflightChecks[checkType]) {
          this.metrics.preflightChecks[checkType].total++;
          if (result.success || result.passed) {
            this.metrics.preflightChecks[checkType].passed++;
          }
        }
      }
    }
    
    // Handle individual check results
    if (data.type && this.metrics.preflightChecks[data.type]) {
      this.metrics.preflightChecks[data.type].total++;
      if (data.success || data.passed) {
        this.metrics.preflightChecks[data.type].passed++;
      }
    }
  }

  parsePreflightAllOutput(check) {
    // Parse the output of preflight:all to extract individual check results
    const output = check.output || '';
    const error = check.error || '';
    const allText = output + ' ' + error;
    
    // Map of preflight commands to metric types
    const commandMap = {
      'preflight:schema': 'schema',
      'preflight:contract': 'contract', 
      'preflight:grounding': 'grounding',
      'preflight:lint': 'lint',
      'preflight:type': 'type',
      'preflight:build': 'build'
    };
    
    // Extract which checks were run and their results
    for (const [command, checkType] of Object.entries(commandMap)) {
      if (allText.includes(command)) {
        this.metrics.preflightChecks[checkType].total++;
        
        // Determine if the check passed based on overall result and error messages
        const checkPassed = check.passed && !allText.toLowerCase().includes(`${command} failed`);
        if (checkPassed) {
          this.metrics.preflightChecks[checkType].passed++;
        }
        
        if (this.verbose) {
          console.log(`  Extracted preflight check ${checkType}: ${checkPassed ? 'PASS' : 'FAIL'}`);
        }
      }
    }
  }

  mapCheckNameToType(checkName) {
    // Map various check names to our standardized types
    const nameMap = {
      'preflight:schema': 'schema',
      'preflight:contract': 'contract',
      'preflight:grounding': 'grounding', 
      'preflight:lint': 'lint',
      'preflight:type': 'type',
      'preflight:build': 'build',
      'schema-check': 'schema',
      'contract-check': 'contract',
      'grounding-check': 'grounding',
      'lint-check': 'lint',
      'type-check': 'type',
      'build-check': 'build'
    };
    
    return nameMap[checkName] || null;
  }

  parseElapsedTime(timeStr) {
    // Parse various time formats: "5s", "2m", "1h", "123ms"
    if (typeof timeStr === 'number') return timeStr;
    if (typeof timeStr !== 'string') return 0;
    
    const match = timeStr.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2] || 'ms';
    
    switch (unit) {
      case 'ms': return value;
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return value;
    }
  }

  calculateRates() {
    // Contract pass rate
    if (this.metrics.contractPassRate.total > 0) {
      this.metrics.contractPassRate.rate = 
        (this.metrics.contractPassRate.passed / this.metrics.contractPassRate.total * 100);
    }
    
    // Reference check failure rate
    if (this.metrics.referenceCheckFailureRate.total > 0) {
      this.metrics.referenceCheckFailureRate.rate = 
        (this.metrics.referenceCheckFailureRate.failed / this.metrics.referenceCheckFailureRate.total * 100);
    }
    
    // Gate success rates
    for (const gate of Object.keys(this.metrics.gateMetrics)) {
      const gateData = this.metrics.gateMetrics[gate];
      if (gateData.total > 0) {
        gateData.rate = (gateData.passed / gateData.total * 100);
      }
    }
    
    // Preflight check success rates
    for (const check of Object.keys(this.metrics.preflightChecks)) {
      const checkData = this.metrics.preflightChecks[check];
      if (checkData.total > 0) {
        checkData.rate = (checkData.passed / checkData.total * 100);
      }
    }
  }

  async calculateAverages() {
    // Time to green averages
    if (this.metrics.timeToGreen.samples.length > 0) {
      const samples = this.metrics.timeToGreen.samples;
      const sum = samples.reduce((a, b) => a + b, 0);
      this.metrics.timeToGreen.average = sum / samples.length;
      
      // Calculate median
      const sorted = [...samples].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      this.metrics.timeToGreen.median = sorted.length % 2 === 0 
        ? (sorted[mid - 1] + sorted[mid]) / 2 
        : sorted[mid];
    }
    
    // Diff churn averages - analyze git commit statistics
    await this.calculateDiffChurn();
  }

  async calculateTrends() {
    if (this.verbose) console.log('Calculating trends...');
    
    try {
      // Look for historical metric reports to compare against
      const historicalPattern = path.join(this.reportsDir, 'metrics-*.json');
      const historicalFiles = await glob(historicalPattern);
      
      // Filter to get reports from the last 7 days
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentFiles = historicalFiles.filter(file => {
        const stats = require('fs').statSync(file);
        return stats.mtime.getTime() > sevenDaysAgo;
      }).sort();
      
      if (recentFiles.length < 2) {
        if (this.verbose) console.log('  Insufficient historical data for trend analysis');
        this.setDefaultTrends();
        return;
      }
      
      // Compare current metrics with historical data
      const historicalMetrics = await this.loadHistoricalMetrics(recentFiles);
      this.analyzeTrends(historicalMetrics);
      
    } catch (error) {
      console.warn('Failed to calculate trends:', error.message);
      this.setDefaultTrends();
    }
  }

  async loadHistoricalMetrics(files) {
    const metrics = [];
    
    for (const file of files.slice(-5)) { // Take last 5 reports for trend analysis
      try {
        const content = await fs.readFile(file, 'utf-8');
        const data = JSON.parse(content);
        if (data.kpis) {
          metrics.push({
            timestamp: data.generatedAt,
            kpis: data.kpis
          });
        }
      } catch (error) {
        console.warn(`Failed to load historical metrics from ${file}:`, error.message);
      }
    }
    
    return metrics;
  }

  analyzeTrends(historicalMetrics) {
    if (historicalMetrics.length === 0) {
      this.setDefaultTrends();
      return;
    }
    
    const improvingMetrics = [];
    const decliningMetrics = [];
    const stableMetrics = [];
    
    // Analyze contract pass rate trend
    const contractRates = historicalMetrics.map(m => m.kpis.contractPassRate.rate);
    this.metrics.contractPassRate.trend = this.calculateMetricTrend(contractRates, 'higher_better');
    this.categorizeMetric('Contract Pass Rate', this.metrics.contractPassRate.trend, improvingMetrics, decliningMetrics, stableMetrics);
    
    // Analyze time to green trend
    const timeToGreenAvgs = historicalMetrics.map(m => m.kpis.timeToGreen.average);
    this.metrics.timeToGreen.trend = this.calculateMetricTrend(timeToGreenAvgs, 'lower_better');
    this.categorizeMetric('Time to Green', this.metrics.timeToGreen.trend, improvingMetrics, decliningMetrics, stableMetrics);
    
    // Analyze reference check failure rate trend
    const refFailureRates = historicalMetrics.map(m => m.kpis.referenceCheckFailureRate.rate);
    this.metrics.referenceCheckFailureRate.trend = this.calculateMetricTrend(refFailureRates, 'lower_better');
    this.categorizeMetric('Reference Check Failure Rate', this.metrics.referenceCheckFailureRate.trend, improvingMetrics, decliningMetrics, stableMetrics);
    
    // Analyze gate metrics trends
    for (const gateName of Object.keys(this.metrics.gateMetrics)) {
      const gateRates = historicalMetrics.map(m => m.kpis.gateMetrics[gateName]?.rate || 0);
      this.metrics.gateMetrics[gateName].trend = this.calculateMetricTrend(gateRates, 'higher_better');
      this.categorizeMetric(`${gateName} Gate`, this.metrics.gateMetrics[gateName].trend, improvingMetrics, decliningMetrics, stableMetrics);
    }
    
    // Analyze preflight check trends
    for (const checkName of Object.keys(this.metrics.preflightChecks)) {
      const checkRates = historicalMetrics.map(m => m.kpis.preflightChecks[checkName]?.rate || 0);
      this.metrics.preflightChecks[checkName].trend = this.calculateMetricTrend(checkRates, 'higher_better');
      this.categorizeMetric(`${checkName} Check`, this.metrics.preflightChecks[checkName].trend, improvingMetrics, decliningMetrics, stableMetrics);
    }
    
    // Set overall trend summary
    this.metrics.trends.improvingMetrics = improvingMetrics;
    this.metrics.trends.decliningMetrics = decliningMetrics;
    this.metrics.trends.stableMetrics = stableMetrics;
    
    // Determine overall trend
    if (decliningMetrics.length > improvingMetrics.length) {
      this.metrics.trends.overallTrend = 'declining';
    } else if (improvingMetrics.length > decliningMetrics.length) {
      this.metrics.trends.overallTrend = 'improving';
    } else {
      this.metrics.trends.overallTrend = 'stable';
    }
    
    if (this.verbose) {
      console.log(`  Trend analysis: ${improvingMetrics.length} improving, ${decliningMetrics.length} declining, ${stableMetrics.length} stable`);
    }
  }

  calculateMetricTrend(values, direction) {
    if (values.length < 2) return 'stable';
    
    // Remove any null/undefined values
    const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validValues.length < 2) return 'stable';
    
    // Calculate linear trend
    const n = validValues.length;
    const xValues = Array.from({length: n}, (_, i) => i);
    const yValues = validValues;
    
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Determine trend based on slope and direction preference
    const threshold = 0.1; // Minimum slope to consider as trending
    
    if (Math.abs(slope) < threshold) {
      return 'stable';
    }
    
    if (direction === 'higher_better') {
      return slope > 0 ? 'improving' : 'declining';
    } else {
      return slope < 0 ? 'improving' : 'declining';
    }
  }

  categorizeMetric(metricName, trend, improving, declining, stable) {
    switch (trend) {
      case 'improving':
        improving.push(metricName);
        break;
      case 'declining':
        declining.push(metricName);
        break;
      default:
        stable.push(metricName);
    }
  }

  setDefaultTrends() {
    // Set default trends when insufficient historical data
    const allMetrics = [
      'Contract Pass Rate',
      'Time to Green', 
      'Reference Check Failure Rate',
      'planning Gate',
      'dev Gate',
      'qa Gate',
      'schema Check',
      'contract Check',
      'grounding Check',
      'lint Check',
      'type Check',
      'build Check'
    ];
    
    this.metrics.trends.stableMetrics = allMetrics;
    this.metrics.trends.improvingMetrics = [];
    this.metrics.trends.decliningMetrics = [];
    this.metrics.trends.overallTrend = 'stable';
  }

  async calculateDiffChurn() {
    try {
      // Get recent commits (last 7 days) to analyze code churn
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sinceDate = sevenDaysAgo.toISOString().split('T')[0];
      
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Get git stats for recent commits
      const gitCommand = `git log --since="${sinceDate}" --pretty=format: --numstat | awk 'NF==3 {added+=$1; deleted+=$2; files++} END {printf "%d %d %d", added, deleted, files}'`;
      
      const { stdout } = await execAsync(gitCommand, { cwd: this.projectRoot });
      const [added, deleted, files] = stdout.trim().split(' ').map(Number);
      
      if (files > 0) {
        const totalChurn = added + deleted;
        const avgChurnPerFile = totalChurn / files;
        
        this.metrics.diffChurn.samples.push(totalChurn);
        this.metrics.diffChurn.average = avgChurnPerFile;
        this.metrics.diffChurn.median = totalChurn;
        
        if (this.verbose) {
          console.log(`  Git analysis: ${totalChurn} lines changed across ${files} files (avg: ${avgChurnPerFile.toFixed(1)} per file)`);
        }
      }
    } catch (error) {
      if (this.verbose) {
        console.log('  Git analysis not available:', error.message);
      }
      // Keep defaults (0) if git analysis fails
    }
  }

  async generateReport(format = 'both') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `metrics-${timestamp}`;
    
    const report = {
      generatedAt: new Date().toISOString(),
      period: this.getReportingPeriod(),
      kpis: this.metrics,
      summary: this.generateSummary(),
      recommendations: this.generateRecommendations()
    };
    
    if (format === 'json' || format === 'both') {
      const jsonFile = path.join(this.reportsDir, `${baseName}.json`);
      await fs.writeFile(jsonFile, JSON.stringify(report, null, 2));
      if (this.verbose) console.log(`JSON report saved to: ${jsonFile}`);
    }
    
    if (format === 'markdown' || format === 'both') {
      const markdownContent = await this.generateMarkdownReport(report);
      const mdFile = path.join(this.reportsDir, `${baseName}.md`);
      await fs.writeFile(mdFile, markdownContent);
      if (this.verbose) console.log(`Markdown report saved to: ${mdFile}`);
    }
    
    return report;
  }

  async generateMarkdownReport(report) {
    const templatePath = path.join(__dirname, 'report.md.tmpl');
    
    try {
      let template = await fs.readFile(templatePath, 'utf-8');
      
      // Replace basic template variables
      template = template.replace(/{{GENERATED_AT}}/g, report.generatedAt);
      template = template.replace(/{{PERIOD}}/g, report.period);
      template = template.replace(/{{CONTRACT_PASS_RATE}}/g, report.kpis.contractPassRate.rate.toFixed(2));
      template = template.replace(/{{AVG_TIME_TO_GREEN}}/g, this.formatDuration(report.kpis.timeToGreen.average));
      template = template.replace(/{{REFERENCE_FAILURE_RATE}}/g, report.kpis.referenceCheckFailureRate.rate.toFixed(2));
      template = template.replace(/{{DRIFT_ALARMS_24H}}/g, report.kpis.driftAlarms.last24h);
      template = template.replace(/{{ROLLBACKS_7D}}/g, report.kpis.rollbackCount.last7days);
      
      // Add status indicators for each metric
      template = template.replace(/{{CONTRACT_STATUS}}/g, this.getStatusIndicator(report.kpis.contractPassRate.rate, 95, true));
      template = template.replace(/{{TIME_TO_GREEN_STATUS}}/g, this.getTimeToGreenStatus(report.kpis.timeToGreen.average));
      template = template.replace(/{{REFERENCE_CHECK_STATUS}}/g, this.getStatusIndicator(report.kpis.referenceCheckFailureRate.rate, 5, false));
      template = template.replace(/{{DRIFT_STATUS}}/g, this.getDriftStatus(report.kpis.driftAlarms.last24h));
      template = template.replace(/{{ROLLBACK_STATUS}}/g, this.getRollbackStatus(report.kpis.rollbackCount.last7days));
      
      // Add trend information
      template = template.replace(/{{CONTRACT_TREND}}/g, this.getTrendDescription(report.kpis.contractPassRate.trend));
      template = template.replace(/{{REFERENCE_TREND}}/g, this.getTrendDescription(report.kpis.referenceCheckFailureRate.trend));
      template = template.replace(/{{GATE_TREND}}/g, report.kpis.trends.overallTrend);
      template = template.replace(/{{PERFORMANCE_TREND}}/g, this.getTrendDescription(report.kpis.timeToGreen.trend));
      template = template.replace(/{{BUILD_TREND}}/g, this.getTrendDescription(report.kpis.preflightChecks.build.trend));
      template = template.replace(/{{STABILITY_TREND}}/g, report.kpis.trends.overallTrend);
      
      // Generate enhanced tables
      const gateTable = this.generateGateMetricsTable(report.kpis.gateMetrics);
      template = template.replace(/{{GATE_METRICS_TABLE}}/g, gateTable);
      
      const preflightTable = this.generatePreflightMetricsTable(report.kpis.preflightChecks);
      template = template.replace(/{{PREFLIGHT_METRICS_TABLE}}/g, preflightTable);
      
      // Add recommendations
      const recommendationsSection = report.recommendations.map(rec => `- ${rec}`).join('\n');
      template = template.replace(/{{RECOMMENDATIONS}}/g, recommendationsSection);
      
      return template;
    } catch (error) {
      // Fallback to basic template if template file doesn't exist
      return this.generateBasicMarkdownReport(report);
    }
  }

  getStatusIndicator(value, threshold, higherIsBetter) {
    let status;
    if (higherIsBetter) {
      status = value >= threshold ? '🟢 Good' : value >= (threshold * 0.8) ? '🟡 Fair' : '🔴 Needs Attention';
    } else {
      status = value <= threshold ? '🟢 Good' : value <= (threshold * 2) ? '🟡 Fair' : '🔴 Needs Attention';
    }
    return status;
  }

  getTimeToGreenStatus(averageMs) {
    const minutes = averageMs / (1000 * 60);
    if (minutes <= 5) return '🟢 Good';
    if (minutes <= 15) return '🟡 Fair';
    return '🔴 Needs Attention';
  }

  getDriftStatus(count) {
    if (count === 0) return '🟢 Good';
    if (count <= 2) return '🟡 Fair';
    return '🔴 Needs Attention';
  }

  getRollbackStatus(count) {
    if (count <= 1) return '🟢 Good';
    if (count <= 3) return '🟡 Fair';
    return '🔴 Needs Attention';
  }

  getTrendDescription(trend) {
    switch (trend) {
      case 'improving': return 'been improving';
      case 'declining': return 'been declining';
      default: return 'remained stable';
    }
  }

  generateBasicMarkdownReport(report) {
    return `# BMad Method Metrics Report

Generated: ${report.generatedAt}
Period: ${report.period}

## Key Performance Indicators

### Contract Pass Rate
- **Rate**: ${report.kpis.contractPassRate.rate.toFixed(2)}%
- **Total Contracts**: ${report.kpis.contractPassRate.total}
- **Passed**: ${report.kpis.contractPassRate.passed}

### Time to Green
- **Average**: ${this.formatDuration(report.kpis.timeToGreen.average)}
- **Median**: ${this.formatDuration(report.kpis.timeToGreen.median)}
- **Samples**: ${report.kpis.timeToGreen.samples.length}

### Reference Check Failure Rate
- **Rate**: ${report.kpis.referenceCheckFailureRate.rate.toFixed(2)}%
- **Total Checks**: ${report.kpis.referenceCheckFailureRate.total}
- **Failed**: ${report.kpis.referenceCheckFailureRate.failed}

### System Health
- **Drift Alarms (24h)**: ${report.kpis.driftAlarms.last24h}
- **Rollbacks (7d)**: ${report.kpis.rollbackCount.last7days}

## Gate Metrics

${this.generateGateMetricsTable(report.kpis.gateMetrics)}

## Preflight Check Metrics

${this.generatePreflightMetricsTable(report.kpis.preflightChecks)}

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}
`;
  }

  generateGateMetricsTable(gateMetrics) {
    let table = '| Gate | Success Rate | Passed | Total | Trend |\n';
    table += '|------|--------------|--------:|-------:|-------|\n';
    
    for (const [gate, metrics] of Object.entries(gateMetrics)) {
      const trendIcon = this.getTrendIcon(metrics.trend);
      table += `| ${gate} | ${metrics.rate.toFixed(2)}% | ${metrics.passed} | ${metrics.total} | ${trendIcon} ${metrics.trend} |\n`;
    }
    
    return table;
  }

  generatePreflightMetricsTable(preflightChecks) {
    let table = '| Check | Success Rate | Passed | Total | Trend |\n';
    table += '|-------|--------------|--------:|-------:|-------|\n';
    
    for (const [check, metrics] of Object.entries(preflightChecks)) {
      const trendIcon = this.getTrendIcon(metrics.trend);
      table += `| ${check} | ${metrics.rate.toFixed(2)}% | ${metrics.passed} | ${metrics.total} | ${trendIcon} ${metrics.trend} |\n`;
    }
    
    return table;
  }

  getTrendIcon(trend) {
    switch (trend) {
      case 'improving': return '📈';
      case 'declining': return '📉';
      default: return '➡️';
    }
  }

  generateSummary() {
    return {
      overallHealth: this.calculateOverallHealth(),
      totalContracts: this.metrics.contractPassRate.total,
      totalGateChecks: Object.values(this.metrics.gateMetrics).reduce((sum, gate) => sum + gate.total, 0),
      totalPreflightChecks: Object.values(this.metrics.preflightChecks).reduce((sum, check) => sum + check.total, 0),
      trends: {
        overall: this.metrics.trends.overallTrend,
        improving: this.metrics.trends.improvingMetrics.length,
        declining: this.metrics.trends.decliningMetrics.length,
        stable: this.metrics.trends.stableMetrics.length
      }
    };
  }

  calculateOverallHealth() {
    const contractRate = this.metrics.contractPassRate.rate;
    const avgGateRate = this.calculateAverageGateRate();
    const avgPreflightRate = this.calculateAveragePreflightRate();
    
    // Weight different metrics
    const overallScore = (contractRate * 0.4) + (avgGateRate * 0.3) + (avgPreflightRate * 0.3);
    
    if (overallScore >= 95) return 'Excellent';
    if (overallScore >= 85) return 'Good';
    if (overallScore >= 70) return 'Fair';
    return 'Needs Attention';
  }

  calculateAverageGateRate() {
    const rates = Object.values(this.metrics.gateMetrics).map(gate => gate.rate);
    return rates.length > 0 ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0;
  }

  calculateAveragePreflightRate() {
    const rates = Object.values(this.metrics.preflightChecks).map(check => check.rate);
    return rates.length > 0 ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0;
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.metrics.contractPassRate.rate < 90) {
      recommendations.push('Contract pass rate is below 90%. Review story contracts and validation processes.');
    }
    
    if (this.metrics.timeToGreen.average > 300000) { // 5 minutes
      recommendations.push('Average time to green exceeds 5 minutes. Consider optimizing build/test processes.');
    }
    
    if (this.metrics.referenceCheckFailureRate.rate > 10) {
      recommendations.push('Reference check failure rate is high. Review code quality and reference resolution.');
    }
    
    if (this.metrics.driftAlarms.last24h > 0) {
      recommendations.push(`${this.metrics.driftAlarms.last24h} drift alarms in the last 24 hours. Investigate system stability.`);
    }
    
    if (this.metrics.rollbackCount.last7days > 2) {
      recommendations.push('Multiple rollbacks in the last 7 days. Review deployment and testing procedures.');
    }
    
    // Gate-specific recommendations
    for (const [gate, metrics] of Object.entries(this.metrics.gateMetrics)) {
      if (metrics.rate < 80 && metrics.total > 0) {
        recommendations.push(`${gate} gate success rate is below 80%. Review ${gate} gate requirements and processes.`);
      }
    }
    
    if (recommendations.length === 0) {
      recommendations.push('All metrics are within acceptable ranges. Continue monitoring for trends.');
    }
    
    return recommendations;
  }

  getReportingPeriod() {
    // For now, return "All time" - could be enhanced to support date ranges
    return 'All time';
  }

  formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }
}

// CLI interface
if (require.main === module) {
  const argv = process.argv.slice(2);
  const options = {
    verbose: argv.includes('--verbose') || argv.includes('-v'),
    format: 'both'
  };
  
  // Parse format option
  const formatIndex = argv.findIndex(arg => arg === '--format');
  if (formatIndex !== -1 && argv[formatIndex + 1]) {
    options.format = argv[formatIndex + 1];
  }
  
  const collector = new MetricsCollector(options);
  
  collector.collect()
    .then(() => collector.generateReport(options.format))
    .then(report => {
      console.log('\nMetrics Collection Summary:');
      console.log(`- Contract Pass Rate: ${report.kpis.contractPassRate.rate.toFixed(2)}%`);
      console.log(`- Avg Time to Green: ${collector.formatDuration(report.kpis.timeToGreen.average)}`);
      console.log(`- Reference Failure Rate: ${report.kpis.referenceCheckFailureRate.rate.toFixed(2)}%`);
      console.log(`- Overall Health: ${report.summary.overallHealth}`);
      console.log('\nReports generated successfully.');
    })
    .catch(error => {
      console.error('Failed to collect metrics:', error.message);
      process.exit(1);
    });
}

module.exports = { MetricsCollector };