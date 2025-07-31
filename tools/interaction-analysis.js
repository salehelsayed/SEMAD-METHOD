#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { program } = require('commander');

/**
 * Analyze user-agent interactions and capture summaries
 */
class InteractionAnalyzer {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.memoryDir = path.join(rootDir, '.ai');
    this.logsDir = path.join(rootDir, 'logs');
    this.interactionsFile = path.join(this.memoryDir, 'interactions.json');
    this.agents = ['dev', 'qa', 'sm', 'analyst', 'pm', 'architect'];
  }

  /**
   * Load existing interactions data
   */
  loadInteractions() {
    if (fs.existsSync(this.interactionsFile)) {
      try {
        const content = fs.readFileSync(this.interactionsFile, 'utf8');
        return JSON.parse(content);
      } catch (error) {
        console.warn(chalk.yellow('⚠️  Could not load existing interactions data'));
        return this.createEmptyInteractionsData();
      }
    }
    return this.createEmptyInteractionsData();
  }

  /**
   * Create empty interactions data structure
   */
  createEmptyInteractionsData() {
    return {
      version: '1.0',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      summary: {
        totalInteractions: 0,
        totalAgents: 0,
        totalSessions: 0,
        averageSessionLength: 0,
        mostActiveAgent: null,
        commonInteractionTypes: []
      },
      agents: {},
      sessions: [],
      interactionTypes: {
        'story-creation': { count: 0, description: 'Story creation and planning' },
        'implementation': { count: 0, description: 'Code implementation tasks' },
        'qa-review': { count: 0, description: 'Quality assurance reviews' },
        'workflow-orchestration': { count: 0, description: 'Workflow management' },
        'memory-interaction': { count: 0, description: 'Memory system interactions' },
        'configuration': { count: 0, description: 'System configuration' },
        'validation': { count: 0, description: 'Validation and testing' },
        'elicitation': { count: 0, description: 'User input elicitation' }
      }
    };
  }

  /**
   * Analyze agent memory files for interaction patterns
   */
  analyzeAgentMemories() {
    console.log(chalk.blue('🧠 Analyzing Agent Memory Files...\n'));
    
    const interactions = this.loadInteractions();
    let analysisCount = 0;

    if (!this.agents || !Array.isArray(this.agents)) {
      console.warn(chalk.yellow('⚠️  No agents array configured, using defaults'));
      this.agents = ['dev', 'qa', 'sm', 'analyst', 'pm', 'architect'];
    }
    
    for (const agent of this.agents) {
      const memoryFile = path.join(this.memoryDir, `${agent}-memory.json`);
      
      if (fs.existsSync(memoryFile)) {
        try {
          const memory = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
          
          console.log(`📝 Analyzing ${agent} agent memory...`);
          
          // Initialize agent data if not exists
          if (!interactions.agents[agent]) {
            interactions.agents[agent] = {
              totalInteractions: 0,
              lastActive: null,
              interactionTypes: {},
              sessions: [],
              averageResponseTime: 0,
              successRate: 0
            };
          }

          const agentData = interactions.agents[agent];
          
          // Analyze memory structure for interaction indicators
          if (memory.shortTermMemory) {
            Object.keys(memory.shortTermMemory).forEach(key => {
              this.classifyInteraction(key, memory.shortTermMemory[key], agentData, interactions);
              analysisCount++;
            });
          }

          if (memory.longTermMemory) {
            Object.keys(memory.longTermMemory).forEach(key => {
              this.classifyInteraction(key, memory.longTermMemory[key], agentData, interactions);
              analysisCount++;
            });
          }

          if (memory.workingContext) {
            Object.keys(memory.workingContext).forEach(key => {
              this.classifyInteraction(key, memory.workingContext[key], agentData, interactions);
              analysisCount++;
            });
          }

          // Check for session data
          if (memory.sessions) {
            agentData.sessions = memory.sessions;
          }

          // Update last active timestamp
          if (memory.lastUpdated) {
            agentData.lastActive = memory.lastUpdated;
          } else if (memory.initialized) {
            agentData.lastActive = memory.initialized;
          }

          console.log(`   Found ${agentData.totalInteractions} interactions for ${agent}`);

        } catch (error) {
          console.error(chalk.red(`❌ Error analyzing ${agent} memory:`), error.message);
        }
      } else {
        console.log(chalk.yellow(`⚠️  No memory file found for ${agent} agent`));
      }
    }

    console.log(chalk.green(`\n✅ Analyzed ${analysisCount} memory entries across ${this.agents.length} agents`));
    return interactions;
  }

  /**
   * Classify interaction type based on key and data
   */
  classifyInteraction(key, data, agentData, interactions) {
    agentData.totalInteractions++;
    interactions.summary.totalInteractions++;

    let interactionType = 'configuration'; // default

    // Classify based on key patterns
    if (key.includes('story') || key.includes('epic')) {
      interactionType = 'story-creation';
    } else if (key.includes('implement') || key.includes('code') || key.includes('develop')) {
      interactionType = 'implementation';
    } else if (key.includes('qa') || key.includes('review') || key.includes('test')) {
      interactionType = 'qa-review';
    } else if (key.includes('workflow') || key.includes('orchestrat')) {
      interactionType = 'workflow-orchestration';
    } else if (key.includes('memory') || key.includes('persist')) {
      interactionType = 'memory-interaction';
    } else if (key.includes('valid') || key.includes('check')) {
      interactionType = 'validation';
    } else if (key.includes('elicit') || key.includes('prompt') || key.includes('input')) {
      interactionType = 'elicitation';
    }

    // Update counters
    agentData.interactionTypes[interactionType] = (agentData.interactionTypes[interactionType] || 0) + 1;
    interactions.interactionTypes[interactionType].count++;
  }

  /**
   * Analyze log files for additional interaction data
   */
  analyzeLogFiles() {
    console.log(chalk.blue('\n📋 Analyzing Log Files...\n'));
    
    if (!fs.existsSync(this.logsDir)) {
      console.log(chalk.yellow('⚠️  No logs directory found'));
      return {};
    }

    const logFiles = fs.readdirSync(this.logsDir)
      .filter(file => file.endsWith('.log') || file.endsWith('.txt'))
      .slice(0, 10); // Limit to 10 most recent logs

    console.log(`📂 Found ${logFiles.length} log files to analyze`);

    const logAnalysis = {
      totalLogEntries: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      agentMentions: {},
      commonPatterns: {}
    };

    logFiles.forEach(logFile => {
      const logPath = path.join(this.logsDir, logFile);
      try {
        const content = fs.readFileSync(logPath, 'utf8');
        if (!content) {
          console.log(`   📄 Skipping empty file: ${logFile}`);
          return;
        }
        const lines = content.split('\n');
        
        console.log(`   📄 Analyzing ${logFile}: ${lines.length} lines`);
        
        lines.forEach(line => {
          if (line.trim()) {
            logAnalysis.totalLogEntries++;
            
            // Count log levels
            if (line.toLowerCase().includes('error')) logAnalysis.errorCount++;
            else if (line.toLowerCase().includes('warn')) logAnalysis.warningCount++;
            else if (line.toLowerCase().includes('info')) logAnalysis.infoCount++;
            
            // Count agent mentions
            if (this.agents && Array.isArray(this.agents)) {
              this.agents.forEach(agent => {
                if (agent && line.toLowerCase().includes(agent)) {
                  logAnalysis.agentMentions[agent] = (logAnalysis.agentMentions[agent] || 0) + 1;
                }
              });
            }
          }
        });
      } catch (error) {
        console.error(chalk.red(`❌ Error reading ${logFile}:`), error.message);
      }
    });

    return logAnalysis;
  }

  /**
   * Generate interaction summary and insights
   */
  generateSummary(interactions, logAnalysis) {
    console.log(chalk.blue('\n📊 Generating Interaction Summary...\n'));
    
    // Update summary statistics
    interactions.summary.totalAgents = Object.keys(interactions.agents).length;
    interactions.summary.lastUpdated = new Date().toISOString();
    
    // Find most active agent
    let mostActive = null;
    let maxInteractions = 0;
    
    Object.entries(interactions.agents).forEach(([agent, data]) => {
      if (data.totalInteractions > maxInteractions) {
        maxInteractions = data.totalInteractions;
        mostActive = agent;
      }
    });
    
    interactions.summary.mostActiveAgent = mostActive;
    
    // Find common interaction types
    const sortedTypes = Object.entries(interactions.interactionTypes)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([type, data]) => ({ type, count: data.count }));
    
    interactions.summary.commonInteractionTypes = sortedTypes;
    
    // Add log analysis summary
    interactions.logAnalysis = logAnalysis;
    
    return interactions;
  }

  /**
   * Save interactions data
   */
  saveInteractions(interactions) {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    
    fs.writeFileSync(this.interactionsFile, JSON.stringify(interactions, null, 2));
    console.log(chalk.green(`💾 Interactions data saved to: ${path.relative(this.rootDir, this.interactionsFile)}`));
  }

  /**
   * Display analysis results
   */
  displayResults(interactions) {
    console.log('\n' + '='.repeat(70));
    console.log(chalk.bold('📊 User-Agent Interaction Analysis Results\n'));
    
    const { summary } = interactions;
    
    console.log(chalk.bold('📈 Overall Summary:'));
    console.log(`   Total Interactions: ${chalk.green(summary.totalInteractions)}`);
    console.log(`   Active Agents: ${chalk.green(summary.totalAgents)}`);
    console.log(`   Most Active Agent: ${chalk.cyan(summary.mostActiveAgent || 'N/A')}`);
    const createdDate = summary.created ? summary.created.split('T')[0] : 'Unknown';
    const updatedDate = summary.lastUpdated ? summary.lastUpdated.split('T')[0] : 'Unknown';
    console.log(`   Analysis Period: ${createdDate} to ${updatedDate}`);
    
    console.log(chalk.bold('\n🤖 Agent Activity:'));
    Object.entries(interactions.agents)
      .sort((a, b) => b[1].totalInteractions - a[1].totalInteractions)
      .forEach(([agent, data]) => {
        const lastActive = data.lastActive ? new Date(data.lastActive).toLocaleDateString() : 'Unknown';
        console.log(`   ${chalk.cyan(agent.padEnd(10))} ${chalk.green(data.totalInteractions.toString().padStart(3))} interactions (last: ${lastActive})`);
        
        // Show top interaction types for this agent
        const topTypes = Object.entries(data.interactionTypes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2);
        
        if (topTypes.length > 0) {
          const typeStr = topTypes.map(([type, count]) => `${type}(${count})`).join(', ');
          console.log(`   ${' '.repeat(15)}Top types: ${chalk.dim(typeStr)}`);
        }
      });
    
    console.log(chalk.bold('\n📋 Interaction Types:'));
    Object.entries(interactions.interactionTypes)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([type, data]) => {
        if (data.count > 0) {
          console.log(`   ${chalk.blue(type.padEnd(20))} ${chalk.green(data.count.toString().padStart(3))} - ${chalk.dim(data.description)}`);
        }
      });
    
    if (interactions.logAnalysis && interactions.logAnalysis.totalLogEntries > 0) {
      console.log(chalk.bold('\n📋 Log Analysis:'));
      console.log(`   Total Log Entries: ${chalk.green(interactions.logAnalysis.totalLogEntries)}`);
      console.log(`   Errors: ${chalk.red(interactions.logAnalysis.errorCount)}`);
      console.log(`   Warnings: ${chalk.yellow(interactions.logAnalysis.warningCount)}`);
      console.log(`   Info: ${chalk.blue(interactions.logAnalysis.infoCount)}`);
      
      if (Object.keys(interactions.logAnalysis.agentMentions).length > 0) {
        console.log(`   Agent Mentions in Logs:`);
        Object.entries(interactions.logAnalysis.agentMentions)
          .sort((a, b) => b[1] - a[1])
          .forEach(([agent, count]) => {
            console.log(`     ${chalk.cyan(agent)}: ${count} mentions`);
          });
      }
    }
    
    console.log(chalk.bold('\n💡 Recommendations:'));
    
    if (summary.totalInteractions === 0) {
      console.log(chalk.yellow('   • No interactions detected. Consider running some BMad workflows to generate data.'));
    } else {
      console.log(chalk.green('   • Interaction data is being captured successfully.'));
      
      if (summary.mostActiveAgent) {
        console.log(`   • ${summary.mostActiveAgent} agent is most active - consider monitoring its performance.`);
      }
      
      const topType = summary.commonInteractionTypes[0];
      if (topType) {
        console.log(`   • ${topType.type} is the most common interaction type (${topType.count} occurrences).`);
      }
    }
    
    return summary.totalInteractions > 0 ? 0 : 1;
  }

  /**
   * Export analysis data
   */
  exportAnalysis(interactions, format = 'json') {
    const timestamp = new Date().toISOString().split('T')[0];
    const exportFile = path.join(this.rootDir, `interaction-analysis-${timestamp}.${format}`);
    
    if (format === 'json') {
      fs.writeFileSync(exportFile, JSON.stringify(interactions, null, 2));
    } else if (format === 'csv') {
      // Create CSV export
      const csvLines = ['Agent,Interactions,Last Active,Top Interaction Type'];
      
      Object.entries(interactions.agents).forEach(([agent, data]) => {
        const topType = Object.entries(data.interactionTypes)
          .sort((a, b) => b[1] - a[1])[0];
        
        csvLines.push([
          agent,
          data.totalInteractions,
          data.lastActive || 'Unknown',
          topType ? topType[0] : 'None'
        ].join(','));
      });
      
      fs.writeFileSync(exportFile, csvLines.join('\n'));
    }
    
    console.log(chalk.green(`📤 Analysis exported to: ${path.relative(this.rootDir, exportFile)}`));
    return exportFile;
  }

  /**
   * Run complete interaction analysis
   */
  async run(options = {}) {
    console.log(chalk.bold('🔍 BMad User-Agent Interaction Analyzer\n'));
    console.log(`📂 Project: ${this.rootDir}`);
    console.log(`🗂️  Memory Directory: ${path.relative(this.rootDir, this.memoryDir)}\n`);
    
    try {
      // Analyze agent memories
      const interactions = this.analyzeAgentMemories();
      
      // Analyze log files
      const logAnalysis = this.analyzeLogFiles();
      
      // Generate summary
      const finalInteractions = this.generateSummary(interactions, logAnalysis);
      
      // Save interactions data
      this.saveInteractions(finalInteractions);
      
      // Export if requested
      if (options.export) {
        this.exportAnalysis(finalInteractions, options.exportFormat);
      }
      
      // Display results
      return this.displayResults(finalInteractions);
      
    } catch (error) {
      console.error(chalk.red('Interaction analysis failed:'), error.message);
      return 1;
    }
  }
}

// CLI setup
program
  .description('Analyze user-agent interactions and generate summaries')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-a, --agents <agents>', 'Comma-separated list of agents to analyze', 'dev,qa,sm,analyst,pm,architect')
  .option('-e, --export', 'Export analysis data to file')
  .option('-f, --export-format <format>', 'Export format (json, csv)', 'json')
  .option('-v, --verbose', 'Show detailed analysis information')
  .parse(process.argv);

async function main() {
  const options = program.opts();
  
  // Handle agents option safely - provide default if not specified
  const agentsOption = options.agents || 'dev,qa,sm,analyst,pm,architect';
  const agents = agentsOption.split(',').map(agent => agent.trim());
  const analyzer = new InteractionAnalyzer(options.directory);
  analyzer.agents = agents;
  
  try {
    const exitCode = await analyzer.run({
      export: options.export,
      exportFormat: options.exportFormat,
      verbose: options.verbose
    });
    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red('Command failed:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = InteractionAnalyzer;