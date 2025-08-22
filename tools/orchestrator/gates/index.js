#!/usr/bin/env node

const PlanningGate = require('./planning-gate');
const DevGate = require('./dev-gate');
const QAGate = require('./qa-gate');
const fs = require('fs').promises;
const path = require('path');

/**
 * Orchestrator Gates Manager
 * Coordinates workflow transition gates across the BMad development lifecycle
 */
class OrchestratorGates {
  constructor() {
    this.gates = {
      planning: new PlanningGate(),
      dev: new DevGate(),
      qa: new QAGate()
    };
    
    this.gateFlow = ['planning', 'dev', 'qa'];
    this.results = {
      timestamp: new Date().toISOString(),
      gateResults: {},
      overallStatus: 'pending'
    };
  }

  /**
   * Run a specific gate
   */
  async runGate(gateName, storyId = null) {
    console.log(`🚪 Running ${gateName} gate...`);
    
    if (!this.gates[gateName]) {
      throw new Error(`Unknown gate: ${gateName}. Available gates: ${Object.keys(this.gates).join(', ')}`);
    }

    let result;
    switch (gateName) {
      case 'planning':
        result = await this.gates.planning.checkPlanningGate();
        await this.gates.planning.saveResults(storyId || 'planning');
        break;
      case 'dev':
        if (!storyId) {
          throw new Error('Story ID is required for dev gate');
        }
        result = await this.gates.dev.checkDevGate(storyId);
        await this.gates.dev.saveResults(storyId);
        break;
      case 'qa':
        if (!storyId) {
          throw new Error('Story ID is required for QA gate');
        }
        result = await this.gates.qa.checkQAGate(storyId);
        await this.gates.qa.saveResults(storyId);
        break;
      default:
        throw new Error(`Unsupported gate: ${gateName}`);
    }

    this.results.gateResults[gateName] = result;
    
    if (result.passed) {
      console.log(`✅ ${gateName} gate PASSED`);
      return { gate: gateName, passed: true, result };
    } else {
      console.log(`❌ ${gateName} gate FAILED`);
      return { gate: gateName, passed: false, result };
    }
  }

  /**
   * Run all gates in sequence for a story
   */
  async runAllGates(storyId) {
    console.log(`🔄 Running complete gate sequence for story: ${storyId}`);
    
    const results = [];
    let allPassed = true;

    for (const gateName of this.gateFlow) {
      try {
        const gateResult = await this.runGate(gateName, storyId);
        results.push(gateResult);
        
        if (!gateResult.passed) {
          allPassed = false;
          console.log(`🛑 Gate sequence stopped at ${gateName} gate failure`);
          break;
        }
      } catch (error) {
        console.error(`❌ Error in ${gateName} gate: ${error.message}`);
        results.push({
          gate: gateName,
          passed: false,
          error: error.message
        });
        allPassed = false;
        break;
      }
    }

    this.results.overallStatus = allPassed ? 'passed' : 'failed';
    
    // Save comprehensive results
    await this.saveOverallResults(storyId, results);

    if (allPassed) {
      console.log(`\n🎉 All gates PASSED for story ${storyId}! Ready for deployment.`);
    } else {
      console.log(`\n🚫 Gate sequence FAILED for story ${storyId}. Review failures above.`);
    }

    return {
      passed: allPassed,
      results,
      overallStatus: this.results.overallStatus
    };
  }

  /**
   * Check what the next required gate is for a story
   */
  async getNextGate(storyId) {
    const resultsPath = path.resolve(__dirname, '..', '..', '..', '.ai', 'test-logs', `gates-${storyId}.json`);
    
    try {
      const existingResults = await fs.readFile(resultsPath, 'utf-8');
      const results = JSON.parse(existingResults);
      
      // Check which gates have passed
      for (const gateName of this.gateFlow) {
        if (!results[gateName] || !results[gateName].passed) {
          return gateName;
        }
      }
      
      return null; // All gates passed
      
    } catch (error) {
      // No existing results, start with planning
      return this.gateFlow[0];
    }
  }

  /**
   * Get status of all gates for a story
   */
  async getGateStatus(storyId) {
    const resultsPath = path.resolve(__dirname, '..', '..', '..', '.ai', 'test-logs', `gates-${storyId}.json`);
    
    try {
      const existingResults = await fs.readFile(resultsPath, 'utf-8');
      const results = JSON.parse(existingResults);
      
      const status = {};
      for (const gateName of this.gateFlow) {
        status[gateName] = {
          completed: !!results[gateName],
          passed: results[gateName]?.passed || false,
          timestamp: results[gateName]?.timestamp
        };
      }
      
      return status;
      
    } catch (error) {
      // No existing results
      const status = {};
      for (const gateName of this.gateFlow) {
        status[gateName] = {
          completed: false,
          passed: false,
          timestamp: null
        };
      }
      return status;
    }
  }

  /**
   * Save overall gate results
   */
  async saveOverallResults(storyId, gateResults) {
    const logsDir = path.resolve(__dirname, '..', '..', '..', '.ai', 'test-logs');
    await fs.mkdir(logsDir, { recursive: true });
    
    // Save summary results
    const summaryPath = path.join(logsDir, `gates-summary-${storyId}.json`);
    const summary = {
      storyId,
      timestamp: this.results.timestamp,
      overallStatus: this.results.overallStatus,
      gateResults: gateResults.map(gr => ({
        gate: gr.gate,
        passed: gr.passed,
        error: gr.error || null
      })),
      nextGate: await this.getNextGate(storyId)
    };
    
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`📄 Gate summary saved to: ${summaryPath}`);
    
    return summaryPath;
  }

  /**
   * Reset gate results for a story (for re-running)
   */
  async resetGates(storyId) {
    const resultsPath = path.resolve(__dirname, '..', '..', '..', '.ai', 'test-logs', `gates-${storyId}.json`);
    
    try {
      await fs.unlink(resultsPath);
      console.log(`🗑️  Reset gate results for story ${storyId}`);
    } catch (error) {
      console.log(`⚠️  No existing gate results to reset for story ${storyId}`);
    }
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const storyId = process.argv[3];
  
  const orchestrator = new OrchestratorGates();

  async function runCLI() {
    try {
      switch (command) {
        case 'planning':
          const planningResult = await orchestrator.runGate('planning', storyId);
          process.exit(planningResult.passed ? 0 : 1);
          break;
          
        case 'dev':
          if (!storyId) {
            console.error('Usage: node index.js dev <storyId>');
            process.exit(1);
          }
          const devResult = await orchestrator.runGate('dev', storyId);
          process.exit(devResult.passed ? 0 : 1);
          break;
          
        case 'qa':
          if (!storyId) {
            console.error('Usage: node index.js qa <storyId>');
            process.exit(1);
          }
          const qaResult = await orchestrator.runGate('qa', storyId);
          process.exit(qaResult.passed ? 0 : 1);
          break;
          
        case 'all':
          if (!storyId) {
            console.error('Usage: node index.js all <storyId>');
            process.exit(1);
          }
          const allResult = await orchestrator.runAllGates(storyId);
          process.exit(allResult.passed ? 0 : 1);
          break;
          
        case 'status':
          if (!storyId) {
            console.error('Usage: node index.js status <storyId>');
            process.exit(1);
          }
          const status = await orchestrator.getGateStatus(storyId);
          console.log('Gate Status:');
          console.log(JSON.stringify(status, null, 2));
          process.exit(0);
          break;
          
        case 'next':
          if (!storyId) {
            console.error('Usage: node index.js next <storyId>');
            process.exit(1);
          }
          const nextGate = await orchestrator.getNextGate(storyId);
          if (nextGate) {
            console.log(`Next required gate: ${nextGate}`);
          } else {
            console.log('All gates completed');
          }
          process.exit(0);
          break;
          
        case 'reset':
          if (!storyId) {
            console.error('Usage: node index.js reset <storyId>');
            process.exit(1);
          }
          await orchestrator.resetGates(storyId);
          process.exit(0);
          break;
          
        default:
          console.error('Usage: node index.js <planning|dev|qa|all|status|next|reset> [storyId]');
          console.error('');
          console.error('Commands:');
          console.error('  planning           - Run planning gate');
          console.error('  dev <storyId>      - Run development gate');
          console.error('  qa <storyId>       - Run QA gate');
          console.error('  all <storyId>      - Run all gates in sequence');
          console.error('  status <storyId>   - Show gate status');
          console.error('  next <storyId>     - Show next required gate');
          console.error('  reset <storyId>    - Reset gate results');
          process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  }

  runCLI();
}

module.exports = OrchestratorGates;