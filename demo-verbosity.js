#!/usr/bin/env node

/**
 * Demonstration of the new verbosity feature
 * Shows how the MCP/orchestrator provides transparency about its operations
 */

const { spawn } = require('child_process');
const chalk = require('chalk');

console.log(chalk.bold('=== BMad Orchestrator Verbosity Demo ===\n'));
console.log('This demo shows the new verbosity feature that provides transparency');
console.log('about what the Master Control Program (orchestrator) is doing.\n');

const demos = [
  {
    name: 'Silent Mode (--no-verbose)',
    description: 'Only shows essential output',
    args: ['run', '--story-file', 'story.md', '--flow-type', 'linear', '--no-verbose']
  },
  {
    name: 'Minimal Verbosity',
    description: 'Shows only critical messages and major milestones',
    args: ['run', '--story-file', 'story.md', '--flow-type', 'linear', '--verbose', 'minimal']
  },
  {
    name: 'Normal Verbosity (default)',
    description: 'Shows major tasks and agent actions',
    args: ['run', '--story-file', 'story.md', '--flow-type', 'linear', '--verbose', 'normal']
  },
  {
    name: 'Detailed Verbosity',
    description: 'Shows all activities with full context',
    args: ['run', '--story-file', 'story.md', '--flow-type', 'linear', '--verbose', 'detailed']
  }
];

async function runDemo(demo, index) {
  console.log(chalk.yellow(`\n${index + 1}. ${demo.name}`));
  console.log(chalk.dim(`   ${demo.description}\n`));
  console.log(chalk.cyan('Command:'), `node tools/workflow-orchestrator.js ${demo.args.join(' ')}`);
  console.log(chalk.dim('─'.repeat(80)));
  
  return new Promise((resolve) => {
    const proc = spawn('node', ['tools/workflow-orchestrator.js', ...demo.args], {
      stdio: 'pipe'
    });
    
    let output = '';
    let lineCount = 0;
    const maxLines = 25;
    
    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim() && lineCount < maxLines) {
          console.log(line);
          output += line + '\n';
          lineCount++;
        }
      }
      
      if (lineCount >= maxLines && proc.killed === false) {
        console.log(chalk.dim('\n... (output truncated for demo)'));
        proc.kill();
      }
    });
    
    proc.stderr.on('data', (data) => {
      if (lineCount < maxLines) {
        console.error(data.toString());
        lineCount++;
      }
    });
    
    proc.on('close', () => {
      console.log(chalk.dim('─'.repeat(80)));
      resolve();
    });
  });
}

async function main() {
  console.log(chalk.green('\nConfiguration Options:'));
  console.log('1. Command line: --verbose <level> or --no-verbose');
  console.log('2. Config file: Create .bmad-workflow.yaml with verbosity settings');
  console.log('3. Default: verbosity=true, verbosityLevel=normal\n');
  
  console.log(chalk.bold('Press Ctrl+C to stop the demo at any time.\n'));
  
  // Give user time to read
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Run each demo
  for (let i = 0; i < demos.length; i++) {
    await runDemo(demos[i], i);
    
    // Pause between demos
    if (i < demos.length - 1) {
      console.log(chalk.dim('\nPausing before next demo...'));
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log(chalk.bold.green('\n\n=== Demo Complete ==='));
  console.log('\nKey Takeaways:');
  console.log('• Use --no-verbose for CI/CD or batch processing');
  console.log('• Use normal verbosity for daily development');
  console.log('• Use detailed verbosity for debugging');
  console.log('• Configure defaults in .bmad-workflow.yaml\n');
  
  console.log('Example configuration file (.bmad-workflow.yaml):');
  console.log(chalk.dim(`
flowType: iterative
verbosity: true
verbosityLevel: normal
`));
}

main().catch(console.error);