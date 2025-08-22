#!/usr/bin/env node
/**
 * Minimal Agent CLI Shim
 *
 * Usage:
 *   node tools/agent.js "/dev *adhoc 'Refactor utils' --paths src/utils/legacy.ts src/index.ts"
 *
 * Currently supported:
 *   - /dev *adhoc → routes to bmad-core/utils/adhoc-runner.js
 *   - /orchestrator *reverse-align → routes to tools/workflow-orchestrator.js reverse-align
 *   - /orchestrator *refresh-manifest → routes to tools/workflow-orchestrator.js refresh-manifest
 */

const { spawn } = require('child_process');
const path = require('path');

function exitWithUsage() {
  console.log('Usage: node tools/agent.js "/dev *adhoc \"<desc>\" [--paths <p1> <p2> ...]"');
  process.exit(1);
}

function tokenize(input) {
  const tokens = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        buf += ch;
      }
    } else {
      if (ch === '"' || ch === '\'') {
        quote = ch;
      } else if (ch === ' ') {
        if (buf) { tokens.push(buf); buf = ''; }
      } else {
        buf += ch;
      }
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

function main() {
  const argStr = process.argv.slice(2).join(' ').trim();
  if (!argStr) return exitWithUsage();

  // Expect format: /agent *command [args...]
  const tokens = tokenize(argStr);
  if (tokens.length < 2 || !tokens[0].startsWith('/')) return exitWithUsage();

  const agent = tokens[0].slice(1).toLowerCase();
  const starCmd = tokens[1];
  const rest = tokens.slice(2);

  if (!starCmd.startsWith('*')) return exitWithUsage();
  const command = starCmd.slice(1).toLowerCase();

  if (agent === 'dev' && command === 'adhoc') {
    // Map to adhoc-runner.js
    const runner = path.join(process.cwd(), 'bmad-core', 'utils', 'adhoc-runner.js');

    // Translate to: node bmad-core/utils/adhoc-runner.js --desc "..." [--paths ...]
    // If a free-form description is provided without --desc, convert first non-flag to --desc
    const args = [];
    let i = 0;
    if (rest.length > 0) {
      if (!rest[0].startsWith('--')) {
        args.push('--desc', rest[0]);
        i = 1;
      }
      for (; i < rest.length; i++) args.push(rest[i]);
    }

    const child = spawn(process.execPath, [runner, ...args], { stdio: 'inherit' });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'dev' && command === 'develop-story') {
    // Map to dev-develop-story.js which dispatches the pre-implementation dependency task
    const runner = path.join(process.cwd(), 'tools', 'dev-develop-story.js');
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit' });
    child.on('exit', code => process.exit(code));
    return;
  }

  // Orchestrator shims → map star commands to workflow-orchestrator.js
  if ((agent === 'orchestrator' || agent === 'bmad-orchestrator')) {
    const orchestratorCLI = path.join(process.cwd(), 'tools', 'workflow-orchestrator.js');
    const passthrough = (subcmd) => {
      const child = spawn(process.execPath, [orchestratorCLI, subcmd, ...rest], { stdio: 'inherit' });
      child.on('exit', code => process.exit(code));
    };
    if (command === 'reverse-align') return passthrough('reverse-align');
    if (command === 'refresh-manifest') return passthrough('refresh-manifest');
    if (command === 'generate-stories') return passthrough('generate-stories');
    if (command === 'reverse-quality-gate') return passthrough('reverse-quality-gate');
    if (command === 'create-documentation-manifest') return passthrough('create-documentation-manifest');
    if (command === 'architect-rewrite') return passthrough('architect-rewrite');
    if (command === 'pm-update-prd') return passthrough('pm-update-prd');
  }

  console.error(`Unsupported routing: agent='${agent}', command='${command}'. Only '/dev *adhoc' is supported in this shim.`);
  process.exit(2);
}

main();
