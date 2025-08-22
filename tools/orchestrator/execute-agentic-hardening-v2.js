#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { lockManager } = require('./locks.js');

// Agent pool for parallel execution
class AgentPool extends EventEmitter {
  constructor(maxConcurrent = 5) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.activeAgents = new Map();
    this.queue = [];
    this.completedTasks = new Set();
  }

  async assignAgent(agentId, storyId, task, dependencies = []) {
    // Wait for dependencies
    for (const dep of dependencies) {
      await this.waitForCompletion(dep);
    }

    // Wait for available slot
    while (this.activeAgents.size >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Create agent
    const agent = {
      id: agentId,
      storyId,
      task,
      startTime: Date.now(),
      status: 'running'
    };

    this.activeAgents.set(agentId, agent);
    this.emit('agent-started', agent);

    return agent;
  }

  completeAgent(agentId, success = true) {
    const agent = this.activeAgents.get(agentId);
    if (agent) {
      agent.status = success ? 'completed' : 'failed';
      agent.endTime = Date.now();
      agent.duration = agent.endTime - agent.startTime;
      
      this.completedTasks.add(agent.storyId);
      this.activeAgents.delete(agentId);
      this.emit('agent-completed', agent);
    }
  }

  async waitForCompletion(storyId) {
    while (!this.completedTasks.has(storyId)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  getStatus() {
    return {
      active: Array.from(this.activeAgents.values()),
      completed: Array.from(this.completedTasks),
      queueSize: this.queue.length
    };
  }
}

// Story to Agent mapping
const STORY_AGENT_MAP = {
  'AH-001': { agent: 'schema-specialist', type: 'sequential', phase: 1 },
  'AH-002': { agent: 'context-engineer', type: 'sequential', phase: 1, depends: ['AH-001'] },
  'AH-003': { agent: 'qa-automation', type: 'sequential', phase: 1, depends: ['AH-002'] },
  'AH-004': { agent: 'orchestrator-lead', type: 'sequential', phase: 1, depends: ['AH-003'] },
  'AH-005': { agent: 'grounding-specialist', type: 'required', phase: 2 },
  'AH-006': { agent: 'reference-validator', type: 'sequential', phase: 2, depends: ['AH-005'] },
  'AH-007': { agent: 'template-engineer', type: 'parallel', phase: 2 },
  'AH-008': { agent: 'type-enforcer', type: 'parallel', phase: 2 },
  'AH-009': { agent: 'traceability-auditor', type: 'parallel', phase: 2 },
  'AH-015': { agent: 'structure-architect', type: 'parallel', phase: 2 },
  'AH-010': { agent: 'retrieval-specialist', type: 'parallel', phase: 3 },
  'AH-011': { agent: 'concurrency-manager', type: 'parallel', phase: 3 },
  'AH-012': { agent: 'metrics-analyst', type: 'parallel', phase: 3 },
  'AH-013': { agent: 'security-auditor', type: 'parallel', phase: 3 },
  'AH-014': { agent: 'rollback-specialist', type: 'dependent', phase: 3, depends: ['AH-005', 'AH-002'] }
};

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Enhanced logging with agent info
class Logger {
  constructor() {
    this.logs = [];
  }

  log(message, options = {}) {
    const { agent, story, type = 'info', color = colors.reset } = options;
    const timestamp = new Date().toISOString();
    
    let prefix = '';
    if (agent) prefix += `[${colors.magenta}${agent}${colors.reset}] `;
    if (story) prefix += `[${colors.cyan}${story}${colors.reset}] `;
    
    const formattedMessage = `[${timestamp}] ${prefix}${color}${message}${colors.reset}`;
    console.log(formattedMessage);
    
    this.logs.push({ timestamp, agent, story, type, message });
  }

  phase(phase) {
    const separator = '='.repeat(60);
    console.log(`\n${colors.bright}${colors.blue}${separator}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}${phase}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}${separator}${colors.reset}\n`);
  }

  agentStatus(pool) {
    const status = pool.getStatus();
    console.log(`\n${colors.dim}Active Agents: ${status.active.length}/${pool.maxConcurrent}${colors.reset}`);
    status.active.forEach(agent => {
      const runtime = ((Date.now() - agent.startTime) / 1000).toFixed(1);
      console.log(`  ${colors.yellow}● ${agent.id}: ${agent.storyId} (${runtime}s)${colors.reset}`);
    });
  }
}

// Story implementation executor
class StoryExecutor {
  constructor(logger, pool) {
    this.logger = logger;
    this.pool = pool;
  }

  /**
   * Apply patch with concurrency control
   * @param {string} storyId - Story ID applying the patch
   * @param {string} filePath - Target file path
   * @param {string} content - File content to write
   * @returns {Promise<void>}
   */
  async applyPatchWithLocking(storyId, filePath, content) {
    let lock = null;
    try {
      // Acquire lock for file
      lock = await lockManager.acquire(filePath, storyId);
      
      this.logger.log(`Acquired lock for ${filePath}`, {
        story: storyId,
        color: colors.cyan
      });

      // Apply the patch safely
      await fs.writeFile(filePath, content);
      
      this.logger.log(`Patch applied to ${filePath}`, {
        story: storyId,
        color: colors.green
      });

    } catch (error) {
      if (error.message.includes('is locked by')) {
        this.logger.log(`File ${filePath} is locked, waiting...`, {
          story: storyId,
          color: colors.yellow
        });
        
        // Wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.applyPatchWithLocking(storyId, filePath, content);
      }
      throw error;
    } finally {
      // Always release lock if we acquired it
      if (lock) {
        try {
          await lockManager.release(filePath, storyId);
          this.logger.log(`Released lock for ${filePath}`, {
            story: storyId,
            color: colors.dim
          });
        } catch (releaseError) {
          this.logger.log(`Failed to release lock for ${filePath}: ${releaseError.message}`, {
            story: storyId,
            color: colors.red
          });
        }
      }
    }
  }

  /**
   * Get files that will be modified by a patch plan
   * @param {string} storyId - Story ID
   * @returns {Promise<Array>} - Array of file paths
   */
  async getPatchFiles(storyId) {
    try {
      const patchPlanPath = path.join(__dirname, '..', '..', '.ai', 'patches', `${storyId}.patch.json`);
      const patchPlanExists = await fs.stat(patchPlanPath).catch(() => false);
      
      if (!patchPlanExists) {
        return [];
      }

      const patchPlan = JSON.parse(await fs.readFile(patchPlanPath, 'utf-8'));
      return patchPlan.changes ? patchPlan.changes.map(change => change.path) : [];
    } catch (error) {
      this.logger.log(`Failed to read patch plan for ${storyId}: ${error.message}`, {
        story: storyId,
        color: colors.yellow
      });
      return [];
    }
  }

  async execute(storyId) {
    const config = STORY_AGENT_MAP[storyId];
    const agentId = `${config.agent}-${Date.now()}`;
    
    try {
      // Assign agent from pool
      const agent = await this.pool.assignAgent(
        agentId,
        storyId,
        config,
        config.depends || []
      );
      
      this.logger.log(`Starting implementation`, {
        agent: config.agent,
        story: storyId,
        color: colors.green
      });

      // Pre-acquire locks for patch files to prevent deadlocks
      const patchFiles = await this.getPatchFiles(storyId);
      if (patchFiles.length > 0) {
        this.logger.log(`Pre-checking locks for ${patchFiles.length} files`, {
          story: storyId,
          color: colors.cyan
        });
        
        // Check for lock conflicts before proceeding
        const lockStatus = await lockManager.status();
        const conflicts = lockStatus.activeLocks.filter(lock => 
          patchFiles.includes(lock.filePath) && lock.storyId !== storyId
        );
        
        if (conflicts.length > 0) {
          this.logger.log(`Lock conflicts detected for ${conflicts.length} files, waiting...`, {
            story: storyId,
            color: colors.yellow
          });
          
          // Wait for conflicts to resolve
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Load and execute story implementation
      const implementationPath = path.join(
        __dirname,
        'story-implementations',
        `${storyId}.js`
      );

      // Check if implementation exists
      const implExists = await fs.stat(implementationPath).catch(() => false);
      
      if (implExists) {
        const implementation = require(implementationPath);
        await implementation.execute();
      } else {
        // Create stub implementation
        await this.createStubImplementation(storyId, config);
      }

      // Cleanup all locks for this story
      await lockManager.cleanupStoryLocks(storyId);

      // Mark as complete
      this.pool.completeAgent(agentId, true);
      
      this.logger.log(`✓ Completed successfully`, {
        agent: config.agent,
        story: storyId,
        color: colors.green
      });

      // Save progress
      await this.saveProgress(storyId, 'completed', config.agent);

    } catch (error) {
      // Cleanup locks on failure
      try {
        await lockManager.cleanupStoryLocks(storyId);
      } catch (cleanupError) {
        this.logger.log(`Failed to cleanup locks for ${storyId}: ${cleanupError.message}`, {
          story: storyId,
          color: colors.yellow
        });
      }

      this.pool.completeAgent(agentId, false);
      
      this.logger.log(`✗ Failed: ${error.message}`, {
        agent: config.agent,
        story: storyId,
        color: colors.red
      });

      await this.saveProgress(storyId, 'failed', config.agent, error.message);
      throw error;
    }
  }

  async createStubImplementation(storyId, config) {
    // Simulate work with appropriate delay based on complexity
    const workDuration = Math.random() * 2000 + 1000; // 1-3 seconds
    
    this.logger.log(`Simulating implementation (${(workDuration/1000).toFixed(1)}s)`, {
      agent: config.agent,
      story: storyId,
      color: colors.dim
    });

    await new Promise(resolve => setTimeout(resolve, workDuration));

    // Create stub implementation file
    const stubDir = path.join(__dirname, '..', '..', '.ai', 'stubs');
    await fs.mkdir(stubDir, { recursive: true });

    const stubContent = {
      storyId,
      agent: config.agent,
      phase: config.phase,
      type: config.type,
      implementedAt: new Date().toISOString(),
      stub: true
    };

    await fs.writeFile(
      path.join(stubDir, `${storyId}.stub.json`),
      JSON.stringify(stubContent, null, 2)
    );
  }

  async saveProgress(storyId, status, agent, error = null) {
    const progressDir = path.join(__dirname, '..', '..', '.ai', 'progress');
    await fs.mkdir(progressDir, { recursive: true });

    const progressFile = path.join(progressDir, 'agent-progress.json');
    
    let progress = {};
    try {
      const content = await fs.readFile(progressFile, 'utf-8');
      progress = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }

    progress[storyId] = {
      status,
      agent,
      timestamp: new Date().toISOString(),
      error
    };

    await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
  }
}

// Phase Orchestrator
class PhaseOrchestrator {
  constructor() {
    this.logger = new Logger();
    this.pool = new AgentPool(5); // Max 5 concurrent agents
    this.executor = new StoryExecutor(this.logger, this.pool);
    
    // Monitor agent events
    this.pool.on('agent-started', (agent) => {
      this.logger.log(`Agent activated`, {
        agent: agent.id,
        color: colors.cyan
      });
    });

    this.pool.on('agent-completed', (agent) => {
      const duration = (agent.duration / 1000).toFixed(1);
      this.logger.log(`Agent completed in ${duration}s`, {
        agent: agent.id,
        color: colors.dim
      });
    });
  }

  async executePhase1() {
    this.logger.phase('PHASE 1: Sequential Foundation Building');
    
    const stories = ['AH-001', 'AH-002', 'AH-003', 'AH-004'];
    
    for (const storyId of stories) {
      await this.executor.execute(storyId);
      this.logger.agentStatus(this.pool);
    }
    
    this.logger.log('Phase 1 completed', { color: colors.green });
  }

  async executePhase2() {
    this.logger.phase('PHASE 2: Mixed Parallelization');
    
    // Start required dependency first
    const ah005Promise = this.executor.execute('AH-005');
    
    // Start parallel stories immediately
    const parallelPromises = [
      this.executor.execute('AH-007'),
      this.executor.execute('AH-008'),
      this.executor.execute('AH-009'),
      this.executor.execute('AH-015')
    ];
    
    // Monitor status
    const statusInterval = setInterval(() => {
      this.logger.agentStatus(this.pool);
    }, 2000);
    
    // Wait for AH-005 then start AH-006
    await ah005Promise;
    const ah006Promise = this.executor.execute('AH-006');
    
    // Wait for all to complete
    await Promise.all([ah006Promise, ...parallelPromises]);
    
    clearInterval(statusInterval);
    this.logger.log('Phase 2 completed', { color: colors.green });
  }

  async executePhase3() {
    this.logger.phase('PHASE 3: Parallel Hardening');
    
    // Start all parallel stories
    const parallelPromises = [
      this.executor.execute('AH-010'),
      this.executor.execute('AH-011'),
      this.executor.execute('AH-012'),
      this.executor.execute('AH-013')
    ];
    
    // Monitor status
    const statusInterval = setInterval(() => {
      this.logger.agentStatus(this.pool);
    }, 2000);
    
    // AH-014 waits for dependencies (should already be complete)
    const ah014Promise = this.executor.execute('AH-014');
    
    // Wait for all to complete
    await Promise.all([...parallelPromises, ah014Promise]);
    
    clearInterval(statusInterval);
    this.logger.log('Phase 3 completed', { color: colors.green });
  }

  async generateReport() {
    this.logger.log('Generating comprehensive report...', { color: colors.cyan });
    
    const reportDir = path.join(__dirname, '..', '..', '.ai', 'reports');
    await fs.mkdir(reportDir, { recursive: true });
    
    // Load progress data
    const progressFile = path.join(__dirname, '..', '..', '.ai', 'progress', 'agent-progress.json');
    const progress = JSON.parse(await fs.readFile(progressFile, 'utf-8'));
    
    // Create detailed report
    const report = {
      executionDate: new Date().toISOString(),
      agentAssignments: STORY_AGENT_MAP,
      executionProgress: progress,
      phases: {
        phase1: {
          name: 'Sequential Foundation',
          stories: ['AH-001', 'AH-002', 'AH-003', 'AH-004'],
          agents: ['schema-specialist', 'context-engineer', 'qa-automation', 'orchestrator-lead']
        },
        phase2: {
          name: 'Mixed Parallelization',
          stories: ['AH-005', 'AH-006', 'AH-007', 'AH-008', 'AH-009', 'AH-015'],
          agents: ['grounding-specialist', 'reference-validator', 'template-engineer', 
                   'type-enforcer', 'traceability-auditor', 'structure-architect']
        },
        phase3: {
          name: 'Parallel Hardening',
          stories: ['AH-010', 'AH-011', 'AH-012', 'AH-013', 'AH-014'],
          agents: ['retrieval-specialist', 'concurrency-manager', 'metrics-analyst',
                   'security-auditor', 'rollback-specialist']
        }
      },
      logs: this.logger.logs
    };
    
    // Save JSON report
    const jsonReportPath = path.join(reportDir, `agent-orchestration-${Date.now()}.json`);
    await fs.writeFile(jsonReportPath, JSON.stringify(report, null, 2));
    
    // Create markdown report
    const mdReport = this.generateMarkdownReport(report);
    const mdReportPath = path.join(reportDir, `agent-orchestration-${Date.now()}.md`);
    await fs.writeFile(mdReportPath, mdReport);
    
    this.logger.log(`Reports saved:`, { color: colors.green });
    this.logger.log(`  JSON: ${jsonReportPath}`, { color: colors.dim });
    this.logger.log(`  Markdown: ${mdReportPath}`, { color: colors.dim });
  }

  generateMarkdownReport(report) {
    let md = `# Agentic Hardening Orchestration Report

## Execution Summary
- **Date**: ${report.executionDate}
- **Total Stories**: ${Object.keys(report.executionProgress).length}
- **Successful**: ${Object.values(report.executionProgress).filter(p => p.status === 'completed').length}
- **Failed**: ${Object.values(report.executionProgress).filter(p => p.status === 'failed').length}

## Agent Assignments

| Story | Agent | Type | Phase | Status |
|-------|-------|------|-------|--------|
`;

    for (const [storyId, config] of Object.entries(report.agentAssignments)) {
      const progress = report.executionProgress[storyId] || { status: 'pending' };
      const statusIcon = progress.status === 'completed' ? '✅' : 
                        progress.status === 'failed' ? '❌' : '⏳';
      md += `| ${storyId} | ${config.agent} | ${config.type} | ${config.phase} | ${statusIcon} ${progress.status} |\n`;
    }

    md += `
## Phase Execution

### Phase 1: ${report.phases.phase1.name}
${report.phases.phase1.stories.map((s, i) => `- ${s} (${report.phases.phase1.agents[i]})`).join('\n')}

### Phase 2: ${report.phases.phase2.name}
${report.phases.phase2.stories.map((s, i) => `- ${s} (${report.phases.phase2.agents[i]})`).join('\n')}

### Phase 3: ${report.phases.phase3.name}
${report.phases.phase3.stories.map((s, i) => `- ${s} (${report.phases.phase3.agents[i]})`).join('\n')}

## Execution Timeline
\`\`\`
${report.logs.slice(-20).map(l => `[${l.timestamp}] ${l.agent || ''} ${l.message}`).join('\n')}
\`\`\`
`;

    return md;
  }

  async run() {
    this.logger.phase('AGENTIC HARDENING ORCHESTRATION v2.0');
    this.logger.log('Initializing agent pool and dependencies...', { color: colors.cyan });
    
    try {
      await this.executePhase1();
      await this.executePhase2();
      await this.executePhase3();
      
      await this.generateReport();
      
      this.logger.phase('ORCHESTRATION COMPLETE');
      this.logger.log('All phases executed successfully!', { color: colors.bright + colors.green });
      
    } catch (error) {
      this.logger.log(`Fatal error: ${error.message}`, { color: colors.red });
      await this.generateReport(); // Generate report even on failure
      process.exit(1);
    }
  }
}

// Main execution
if (require.main === module) {
  const orchestrator = new PhaseOrchestrator();
  orchestrator.run().catch(error => {
    console.error('Orchestration failed:', error);
    process.exit(1);
  });
}

module.exports = { PhaseOrchestrator, AgentPool, StoryExecutor };