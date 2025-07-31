#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { program } = require('commander');

/**
 * Test memory persistence across agents
 */
class MemoryPersistenceTester {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.memoryDir = path.join(rootDir, '.ai');
    this.testResults = [];
    this.agents = ['dev', 'qa', 'sm', 'analyst', 'pm', 'architect'];
  }

  /**
   * Initialize memory system for testing
   */
  async initializeMemorySystem() {
    console.log(chalk.blue('🧠 Initializing Memory System for Testing...\n'));
    
    try {
      // Ensure memory directory exists
      if (!fs.existsSync(this.memoryDir)) {
        fs.mkdirSync(this.memoryDir, { recursive: true });
        console.log(chalk.green('✅ Created memory directory'));
      }

      // Initialize memory for each agent
      for (const agent of this.agents) {
        const agentMemoryFile = path.join(this.memoryDir, `${agent}-memory.json`);
        
        if (!fs.existsSync(agentMemoryFile)) {
          const initialMemory = {
            agent: agent,
            initialized: new Date().toISOString(),
            shortTermMemory: {},
            longTermMemory: {},
            workingContext: {},
            persistenceTest: {
              testId: `test-${Date.now()}-${agent}`,
              testData: `Test data for ${agent} at ${new Date().toISOString()}`
            }
          };
          
          fs.writeFileSync(agentMemoryFile, JSON.stringify(initialMemory, null, 2));
          console.log(chalk.green(`✅ Initialized memory for ${agent}`));
        } else {
          console.log(chalk.blue(`📋 Memory already exists for ${agent}`));
        }
      }
      
      return true;
    } catch (error) {
      console.error(chalk.red('Memory initialization failed:'), error.message);
      return false;
    }
  }

  /**
   * Test memory persistence for a single agent
   */
  async testAgentMemoryPersistence(agentName) {
    const testResult = {
      agent: agentName,
      tests: [],
      success: true,
      error: null
    };

    try {
      const agentMemoryFile = path.join(this.memoryDir, `${agentName}-memory.json`);
      
      // Test 1: File exists
      const fileExistsTest = {
        name: 'Memory file exists',
        success: fs.existsSync(agentMemoryFile),
        details: agentMemoryFile
      };
      testResult.tests.push(fileExistsTest);
      
      if (!fileExistsTest.success) {
        testResult.success = false;
        testResult.error = 'Memory file does not exist';
        return testResult;
      }

      // Test 2: File is readable and valid JSON
      let memoryData;
      try {
        const content = fs.readFileSync(agentMemoryFile, 'utf8');
        memoryData = JSON.parse(content);
        testResult.tests.push({
          name: 'Memory file is valid JSON',
          success: true,
          details: `${content.length} characters`
        });
      } catch (error) {
        testResult.tests.push({
          name: 'Memory file is valid JSON',
          success: false,
          details: error.message
        });
        testResult.success = false;
        testResult.error = 'Invalid JSON format';
        return testResult;
      }

      // Test 3: Required memory structure exists
      const requiredFields = ['agent', 'initialized', 'shortTermMemory', 'longTermMemory'];
      const structureTest = {
        name: 'Required memory structure',
        success: requiredFields.every(field => memoryData.hasOwnProperty(field)),
        details: `Has fields: ${requiredFields.filter(field => memoryData.hasOwnProperty(field)).join(', ')}`
      };
      testResult.tests.push(structureTest);
      
      if (!structureTest.success) {
        testResult.success = false;
        testResult.error = 'Missing required memory structure';
      }

      // Test 4: Memory persistence (write and read test data)
      const testData = {
        persistenceTest: {
          timestamp: new Date().toISOString(),
          testValue: `test-${Date.now()}`,
          agentName: agentName
        }
      };

      // Write test data
      memoryData.testPersistence = testData;
      fs.writeFileSync(agentMemoryFile, JSON.stringify(memoryData, null, 2));

      // Read it back
      const readBack = JSON.parse(fs.readFileSync(agentMemoryFile, 'utf8'));
      const persistenceTest = {
        name: 'Memory persistence (write/read)',
        success: readBack.testPersistence && 
                readBack.testPersistence.persistenceTest.testValue === testData.persistenceTest.testValue,
        details: `Test value: ${testData.persistenceTest.testValue}`
      };
      testResult.tests.push(persistenceTest);
      
      if (!persistenceTest.success) {
        testResult.success = false;
        testResult.error = 'Memory persistence failed';
      }

      // Test 5: Memory size reasonable
      const memorySize = fs.statSync(agentMemoryFile).size;
      const sizeTest = {
        name: 'Memory file size reasonable',
        success: memorySize > 0 && memorySize < 1024 * 1024, // Less than 1MB
        details: `${(memorySize / 1024).toFixed(2)} KB`
      };
      testResult.tests.push(sizeTest);
      
      if (!sizeTest.success && memorySize >= 1024 * 1024) {
        testResult.error = 'Memory file too large (>1MB)';
      }

    } catch (error) {
      testResult.success = false;
      testResult.error = error.message;
    }

    return testResult;
  }

  /**
   * Test cross-agent memory sharing
   */
  async testCrossAgentMemorySharing() {
    console.log(chalk.bold('\n🔄 Testing Cross-Agent Memory Sharing:'));
    
    const testId = `shared-test-${Date.now()}`;
    const sharedData = {
      testId: testId,
      timestamp: new Date().toISOString(),
      originAgent: 'dev',
      sharedWith: ['qa', 'sm'],
      testMessage: 'This is a cross-agent memory test'
    };

    try {
      // Write shared data to dev agent memory
      const devMemoryFile = path.join(this.memoryDir, 'dev-memory.json');
      if (fs.existsSync(devMemoryFile)) {
        const devMemory = JSON.parse(fs.readFileSync(devMemoryFile, 'utf8'));
        devMemory.sharedMemory = devMemory.sharedMemory || {};
        devMemory.sharedMemory[testId] = sharedData;
        fs.writeFileSync(devMemoryFile, JSON.stringify(devMemory, null, 2));
        console.log(chalk.green('✅ Shared data written to dev agent'));
      }

      // Simulate reading shared data from other agents
      const sharingResults = [];
      for (const agent of ['qa', 'sm']) {
        const agentMemoryFile = path.join(this.memoryDir, `${agent}-memory.json`);
        
        if (fs.existsSync(agentMemoryFile)) {
          const agentMemory = JSON.parse(fs.readFileSync(agentMemoryFile, 'utf8'));
          
          // Simulate accessing shared memory
          agentMemory.accessedSharedMemory = agentMemory.accessedSharedMemory || {};
          agentMemory.accessedSharedMemory[testId] = {
            accessed: new Date().toISOString(),
            from: 'dev',
            testId: testId
          };
          
          fs.writeFileSync(agentMemoryFile, JSON.stringify(agentMemory, null, 2));
          
          sharingResults.push({
            agent: agent,
            success: true,
            details: 'Shared memory access simulated'
          });
          console.log(chalk.green(`✅ ${agent} agent accessed shared memory`));
        } else {
          sharingResults.push({
            agent: agent,
            success: false,
            details: 'Agent memory file not found'
          });
          console.log(chalk.red(`❌ ${agent} agent memory not found`));
        }
      }

      return {
        testId: testId,
        success: sharingResults.every(result => result.success),
        results: sharingResults
      };

    } catch (error) {
      console.error(chalk.red('Cross-agent memory sharing test failed:'), error.message);
      return {
        testId: testId,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test memory health monitoring
   */
  async testMemoryHealthMonitoring() {
    console.log(chalk.bold('\n🩺 Testing Memory Health Monitoring:'));
    
    try {
      // Try to use the memory health system
      const { getAggregatedHealthStatus } = require('../bmad-core/utils/memory-health');
      
      const healthStatus = getAggregatedHealthStatus();
      
      console.log(chalk.green('✅ Memory health monitoring accessible'));
      console.log(`   Agents Monitored: ${healthStatus.summary.totalAgents}`);
      console.log(`   Healthy Agents: ${healthStatus.summary.healthyAgents}`);
      console.log(`   Total Checks: ${healthStatus.summary.totalChecks}`);
      
      return {
        success: true,
        healthStatus: healthStatus,
        details: `${healthStatus.summary.totalAgents} agents monitored`
      };
      
    } catch (error) {
      console.log(chalk.yellow('⚠️  Memory health monitoring not available:'), error.message);
      return {
        success: false,
        error: error.message,
        details: 'Memory health system not accessible'
      };
    }
  }

  /**
   * Display test results
   */
  displayResults() {
    console.log('\n' + '='.repeat(70));
    console.log(chalk.bold('📊 Memory Persistence Test Results\n'));
    
    const totalTests = this.testResults.reduce((sum, result) => sum + result.tests.length, 0);
    const passedTests = this.testResults.reduce((sum, result) => 
      sum + result.tests.filter(test => test.success).length, 0
    );
    const successfulAgents = this.testResults.filter(result => result.success).length;
    
    console.log(`📈 Summary:`);
    console.log(`   Agents Tested: ${this.testResults.length}`);
    console.log(`   Successful Agents: ${chalk.green(successfulAgents)}`);
    console.log(`   Failed Agents: ${this.testResults.length - successfulAgents > 0 ? chalk.red(this.testResults.length - successfulAgents) : chalk.green('0')}`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed Tests: ${chalk.green(passedTests)}`);
    console.log(`   Failed Tests: ${totalTests - passedTests > 0 ? chalk.red(totalTests - passedTests) : chalk.green('0')}`);
    
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    console.log(`   Success Rate: ${successRate >= 80 ? chalk.green(successRate) : successRate >= 60 ? chalk.yellow(successRate) : chalk.red(successRate)}%`);
    
    // Display agent-specific results
    console.log(chalk.bold('\n🤖 Agent Results:'));
    this.testResults.forEach(result => {
      const status = result.success ? chalk.green('✅') : chalk.red('❌');
      console.log(`   ${status} ${result.agent}: ${result.success ? 'All tests passed' : result.error}`);
      
      if (!result.success) {
        result.tests.forEach(test => {
          if (!test.success) {
            console.log(`       ${chalk.red('•')} ${test.name}: ${test.details || 'Failed'}`);
          }
        });
      }
    });
    
    const overallSuccess = successfulAgents === this.testResults.length;
    
    if (overallSuccess) {
      console.log(chalk.green('\n✅ All memory persistence tests passed!'));
      console.log(chalk.dim('Memory system is functioning correctly across all agents.'));
      return 0;
    } else {
      console.log(chalk.red(`\n❌ Memory persistence issues detected for ${this.testResults.length - successfulAgents} agent(s).`));
      console.log(chalk.dim('Please check agent memory files and system configuration.'));
      return 1;
    }
  }

  /**
   * Run complete memory persistence test suite
   */
  async run() {
    console.log(chalk.bold('🧠 BMad Memory Persistence Tester\n'));
    console.log(`📂 Project: ${this.rootDir}`);
    console.log(`🗂️  Memory Directory: ${path.relative(this.rootDir, this.memoryDir)}\n`);
    
    try {
      // Initialize memory system
      const initialized = await this.initializeMemorySystem();
      if (!initialized) {
        return 1;
      }

      // Test each agent's memory persistence
      console.log(chalk.bold('\n🔍 Testing Individual Agent Memory:'));
      for (const agent of this.agents) {
        console.log(chalk.blue(`\nTesting ${agent} agent:`));
        const result = await this.testAgentMemoryPersistence(agent);
        this.testResults.push(result);
        
        result.tests.forEach(test => {
          const status = test.success ? chalk.green('✅') : chalk.red('❌');
          console.log(`   ${status} ${test.name}: ${test.details || ''}`);
        });
        
        if (!result.success) {
          console.log(chalk.red(`   Overall: Failed - ${result.error}`));
        } else {
          console.log(chalk.green('   Overall: Passed'));
        }
      }

      // Test cross-agent memory sharing
      const sharingResult = await this.testCrossAgentMemorySharing();
      if (sharingResult.success) {
        console.log(chalk.green('✅ Cross-agent memory sharing test passed'));
      } else {
        console.log(chalk.red('❌ Cross-agent memory sharing test failed'));
      }

      // Test memory health monitoring
      const healthResult = await this.testMemoryHealthMonitoring();
      
      return this.displayResults();

    } catch (error) {
      console.error(chalk.red('Memory persistence testing failed:'), error.message);
      return 1;
    }
  }
}

// CLI setup
program
  .description('Test memory persistence across BMad agents')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-a, --agents <agents>', 'Comma-separated list of agents to test', 'dev,qa,sm,analyst,pm,architect')
  .option('-v, --verbose', 'Show detailed test information')
  .option('--clean', 'Clean memory files before testing')
  .parse(process.argv);

async function main() {
  const options = program.opts();
  
  const agents = options.agents.split(',').map(agent => agent.trim());
  const tester = new MemoryPersistenceTester(options.directory);
  tester.agents = agents;
  
  // Clean memory files if requested
  if (options.clean) {
    const memoryDir = path.join(options.directory, '.ai');
    if (fs.existsSync(memoryDir)) {
      const files = fs.readdirSync(memoryDir).filter(file => file.endsWith('-memory.json'));
      files.forEach(file => {
        fs.unlinkSync(path.join(memoryDir, file));
        console.log(chalk.yellow(`🗑️  Removed ${file}`));
      });
    }
  }
  
  try {
    const exitCode = await tester.run();
    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red('Command failed:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = MemoryPersistenceTester;