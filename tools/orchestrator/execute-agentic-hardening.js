#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Story execution status tracking
const storyStatus = {};
const progressLog = [];

// Log helper
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const color = type === 'success' ? colors.green :
                 type === 'error' ? colors.red :
                 type === 'warning' ? colors.yellow :
                 type === 'phase' ? colors.cyan :
                 colors.reset;
  
  const logMessage = `[${timestamp}] ${color}${message}${colors.reset}`;
  console.log(logMessage);
  progressLog.push({ timestamp, type, message });
}

// Create directory if it doesn't exist
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Execute a single story implementation
async function executeStory(storyId) {
  log(`Starting execution of ${storyId}`, 'info');
  storyStatus[storyId] = 'in_progress';
  
  try {
    const storyFile = path.join(__dirname, '..', '..', 'docs', 'stories', 'agentic-hardening', `${storyId}-*.md`);
    
    // Read story contract to understand requirements
    const storyFiles = await fs.readdir(path.dirname(storyFile.replace('*', '')));
    const actualFile = storyFiles.find(f => f.startsWith(storyId));
    
    if (!actualFile) {
      throw new Error(`Story file not found for ${storyId}`);
    }
    
    // Execute story-specific implementation
    const implementer = require(`./story-implementations/${storyId}.js`);
    await implementer.execute();
    
    storyStatus[storyId] = 'completed';
    log(`✓ Successfully completed ${storyId}`, 'success');
    
    // Save progress
    await saveProgress(storyId, 'completed');
    
  } catch (error) {
    storyStatus[storyId] = 'failed';
    log(`✗ Failed to execute ${storyId}: ${error.message}`, 'error');
    await saveProgress(storyId, 'failed', error.message);
    throw error;
  }
}

// Save progress to file
async function saveProgress(storyId, status, error = null) {
  const progressDir = path.join(__dirname, '..', '..', '.ai', 'progress');
  await ensureDir(progressDir);
  
  const progressFile = path.join(progressDir, 'agentic-hardening-progress.json');
  
  let progress = {};
  try {
    const content = await fs.readFile(progressFile, 'utf-8');
    progress = JSON.parse(content);
  } catch {
    // File might not exist yet
  }
  
  progress[storyId] = {
    status,
    timestamp: new Date().toISOString(),
    error
  };
  
  await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
}

// Wait for a story to complete
async function waitForStory(storyId) {
  while (storyStatus[storyId] !== 'completed' && storyStatus[storyId] !== 'failed') {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (storyStatus[storyId] === 'failed') {
    throw new Error(`Dependency ${storyId} failed`);
  }
}

// Execute Phase 1: Sequential stories
async function executePhase1() {
  log('=== PHASE 1: Sequential Execution ===', 'phase');
  
  const phase1Stories = ['AH-001', 'AH-002', 'AH-003', 'AH-004'];
  
  for (const storyId of phase1Stories) {
    await executeStory(storyId);
  }
  
  log('Phase 1 completed successfully', 'success');
}

// Execute Phase 2: Mixed parallelization
async function executePhase2() {
  log('=== PHASE 2: Mixed Parallelization ===', 'phase');
  
  // Start AH-005 first (required dependency)
  const ah005Promise = executeStory('AH-005');
  
  // Start parallel stories immediately
  const parallelStories = ['AH-007', 'AH-008', 'AH-009', 'AH-015'];
  const parallelPromises = parallelStories.map(storyId => executeStory(storyId));
  
  // Wait for AH-005 to complete before starting AH-006
  await ah005Promise;
  const ah006Promise = executeStory('AH-006');
  
  // Wait for all Phase 2 stories to complete
  await Promise.all([ah006Promise, ...parallelPromises]);
  
  log('Phase 2 completed successfully', 'success');
}

// Execute Phase 3: Parallel with dependencies
async function executePhase3() {
  log('=== PHASE 3: Parallel with Dependencies ===', 'phase');
  
  // Start parallel stories
  const parallelStories = ['AH-010', 'AH-011', 'AH-012', 'AH-013'];
  const parallelPromises = parallelStories.map(storyId => executeStory(storyId));
  
  // AH-014 requires AH-005 and AH-002 to be complete
  // These should already be done from previous phases
  await waitForStory('AH-005');
  await waitForStory('AH-002');
  
  const ah014Promise = executeStory('AH-014');
  
  // Wait for all Phase 3 stories to complete
  await Promise.all([...parallelPromises, ah014Promise]);
  
  log('Phase 3 completed successfully', 'success');
}

// Generate summary report
async function generateSummaryReport() {
  log('Generating orchestration summary report...', 'info');
  
  const reportDir = path.join(__dirname, '..', '..', '.ai', 'reports');
  await ensureDir(reportDir);
  
  const report = {
    executionDate: new Date().toISOString(),
    phases: {
      phase1: {
        stories: ['AH-001', 'AH-002', 'AH-003', 'AH-004'],
        status: 'completed'
      },
      phase2: {
        stories: {
          sequential: ['AH-005', 'AH-006'],
          parallel: ['AH-007', 'AH-008', 'AH-009', 'AH-015']
        },
        status: 'completed'
      },
      phase3: {
        stories: {
          parallel: ['AH-010', 'AH-011', 'AH-012', 'AH-013'],
          dependent: ['AH-014']
        },
        status: 'completed'
      }
    },
    storyStatus,
    progressLog,
    summary: {
      totalStories: Object.keys(storyStatus).length,
      completed: Object.values(storyStatus).filter(s => s === 'completed').length,
      failed: Object.values(storyStatus).filter(s => s === 'failed').length
    }
  };
  
  const reportFile = path.join(reportDir, `agentic-hardening-report-${Date.now()}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  
  // Also create a markdown summary
  const mdReport = `# Agentic Hardening Orchestration Report

## Execution Summary
- **Date**: ${report.executionDate}
- **Total Stories**: ${report.summary.totalStories}
- **Completed**: ${report.summary.completed}
- **Failed**: ${report.summary.failed}

## Phase 1: Sequential Execution
${report.phases.phase1.stories.map(s => `- ${s}: ${storyStatus[s]}`).join('\n')}

## Phase 2: Mixed Parallelization
### Sequential Dependencies:
${report.phases.phase2.stories.sequential.map(s => `- ${s}: ${storyStatus[s]}`).join('\n')}

### Parallel Execution:
${report.phases.phase2.stories.parallel.map(s => `- ${s}: ${storyStatus[s]}`).join('\n')}

## Phase 3: Parallel with Dependencies
### Parallel Execution:
${report.phases.phase3.stories.parallel.map(s => `- ${s}: ${storyStatus[s]}`).join('\n')}

### Dependent Execution:
${report.phases.phase3.stories.dependent.map(s => `- ${s}: ${storyStatus[s]}`).join('\n')}

## Execution Log
\`\`\`
${progressLog.map(l => `[${l.timestamp}] ${l.message}`).join('\n')}
\`\`\`
`;
  
  const mdReportFile = path.join(reportDir, `agentic-hardening-report-${Date.now()}.md`);
  await fs.writeFile(mdReportFile, mdReport);
  
  log(`Summary report saved to ${reportFile}`, 'success');
  log(`Markdown report saved to ${mdReportFile}`, 'success');
}

// Main orchestration function
async function orchestrate() {
  log('Starting Agentic Hardening Orchestration', 'phase');
  log('================================================', 'phase');
  
  try {
    // Execute phases in order
    await executePhase1();
    await executePhase2();
    await executePhase3();
    
    // Generate final report
    await generateSummaryReport();
    
    log('================================================', 'phase');
    log('All phases completed successfully!', 'success');
    
  } catch (error) {
    log(`Orchestration failed: ${error.message}`, 'error');
    
    // Still generate report even on failure
    await generateSummaryReport();
    
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  orchestrate().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { orchestrate, executeStory };