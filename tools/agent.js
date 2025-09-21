#!/usr/bin/env node
/**
 * Universal Agent CLI Router
 *
 * Usage:
 *   node tools/agent.js "/<agent> *<command> [args...]"
 *
 * Examples:
 *   node tools/agent.js "/dev *adhoc 'Refactor utils' --paths src/utils/legacy.ts"
 *   node tools/agent.js "/qa *review docs/stories/story-1.md"
 *   node tools/agent.js "/sm *create-story"
 *   node tools/agent.js "/orchestrator *reverse-align"
 *
 * Supports all agents: dev, qa, pm, sm, analyst, architect, orchestrator
 * Natural language also supported: "/dev implement next story" or "/qa review"
 */

const { spawn } = require('child_process');
const path = require('path');

// Ensure we resolve paths relative to the repo root (one level up from tools/)
const projectRoot = path.resolve(__dirname, '..');

function greetAndIdle(agent) {
  const greetings = {
    sm: "Hi, I'm Bob, your Scrum Master. Type *help to see available commands.",
    qa: "Hello, I'm Quinn, your QA Architect. Type *help to see available commands.",
    dev: "Hi, I'm James, your Developer. Type *help to see available commands.",
    pm: "Hello, I'm John, your Product Manager. Type *help to see available commands.",
    analyst: "Hi, I'm Mary, your Business Analyst. Type *help to see available commands.",
    architect: "Hello, I'm Winston, your Architect. Type *help to see available commands.",
    po: "Hi, I'm Sarah, your Product Owner. Type *help to see available commands.",
    in: "Hello, I'm the Integration Inspector. Type *help to see available commands.",
    orchestrator: "Hello, I'm the BMad Orchestrator. Type *help to see available commands.",
    'bmad-orchestrator': "Hello, I'm the BMad Orchestrator. Type *help to see available commands.",
    'bmad-master': "Greetings, I'm the BMad Master. Type *help to see available commands."
  };
  const msg = greetings[agent];
  if (msg) {
    console.log(msg);
    return true;
  }
  return false;
}

function exitWithUsage() {
  console.log('Usage: node tools/agent.js "/<agent> *<command> [args...]"');
  console.log('   eg: node tools/agent.js "/dev *adhoc \"<desc>\" [--paths <p1> <p2> ...]"');
  console.log('Natural language also supported: "/dev implement next story" or "/dev help"');
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
  if (tokens.length < 1 || !tokens[0].startsWith('/')) return exitWithUsage();

  const agent = tokens[0].slice(1).toLowerCase();
  let starCmd = tokens[1];
  let rest = tokens.slice(2);

  // Idle-on-init guard: if user only activates an agent without a command, greet and wait
  if (!starCmd || !starCmd.length) {
    if (greetAndIdle(agent)) return;
  }

  // If user did not provide a *command, try to infer from natural language
  if (!starCmd || !starCmd.startsWith('*')) {
    const text = tokens.slice(1).join(' ').toLowerCase();
    // Quick inline mapping for common intents; prefer manifest if available
    const manifestCandidates = [
      path.join(projectRoot, '.semad-core', 'agents', 'intent-manifest.json'),
      path.join(projectRoot, 'semad-core', 'agents', 'intent-manifest.json'),
      path.join(projectRoot, 'semad-core', 'agents', 'intent-manifest.json'),
      path.join(projectRoot, '.semad-core', 'agents', 'intent-manifest.json')
    ];
    let inferred = null;
    try {
      for (const p of manifestCandidates) {
        if (require('fs').existsSync(p)) {
          const raw = require('fs').readFileSync(p, 'utf8');
          const manifest = JSON.parse(raw);
          const entries = (manifest[agent]?.aliases) || [];
          for (const e of entries) {
            if (text.includes(e.phrase)) { inferred = e.command; break; }
          }
          if (inferred) break;
        }
      }
    } catch (_) {}
    if (!inferred) {
      if (/help/.test(text)) inferred = '*help';
      else if (agent === 'dev' && /implement .*next story|next story/.test(text)) inferred = '*implement-next-story';
      else if (agent === 'dev' && /adhoc[- ]?debug|debug/.test(text)) inferred = '*adhoc-debug';
      else if (agent === 'dev' && /adhoc|ad hoc/.test(text)) inferred = '*adhoc';
    }
    if (inferred) {
      starCmd = inferred;
      rest = []; // keep free-form handled by downstream if needed
    } else {
      // If agent was activated in natural language without a *command, greet and idle
      if (greetAndIdle(agent)) return;
      return exitWithUsage();
    }
  }

  const command = starCmd.slice(1).toLowerCase();
  const fs = require('fs');

  // ============== DEV AGENT COMMANDS ==============
  if (agent === 'dev' && (command === 'adhoc' || command === 'adhoc-debug')) {
    // Resolve runner in semad-core first, then fallback to semad-core
    const tryPaths = (file) => [
      path.join(projectRoot, 'semad-core', 'utils', file),
      path.join(projectRoot, '.semad-core', 'utils', file)
    ];
    const candidates = command === 'adhoc' ? tryPaths('adhoc-runner.js') : tryPaths('adhoc-debug-runner.js');
    const runner = candidates.find(p => require('fs').existsSync(p)) || candidates[candidates.length - 1];

    // Translate to: node <runner> --desc/--error "..." [--paths ...]
    // If a free-form description is provided without --desc/--error, convert first non-flag to --desc for adhoc or --error for adhoc-debug
    const args = [];
    let i = 0;
    if (rest.length > 0) {
      if (!rest[0].startsWith('--')) {
        args.push(command === 'adhoc' ? '--desc' : '--error', rest[0]);
        i = 1;
      }
      for (; i < rest.length; i++) args.push(rest[i]);
    }

    const child = spawn(process.execPath, [runner, ...args], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'dev' && command === 'implement-next-story') {
    const runner = path.join(projectRoot, 'tools', 'dev-next-story.js');
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'dev' && command === 'devx3') {
    // Expect a story input; the runner will enforce it
    const runner = path.join(projectRoot, 'tools', 'dev-x3.js');
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  // Generic help passthrough for any agent
  if (command === 'help') {
    const helper = path.join(projectRoot, 'tools', 'agent-help.js');
    const child = spawn(process.execPath, [helper, agent], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'dev' && command === 'develop-story') {
    // Map to dev-develop-story.js which dispatches the pre-implementation dependency task
    const runner = path.join(projectRoot, 'tools', 'dev-develop-story.js');
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'dev' && command === 'address-qa-feedback') {
    // Resolve task path across new and legacy core paths, then run via TaskRunner directly
    const candidates = [
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'address-qa-feedback.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'address-qa-feedback.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'address-qa-feedback.yaml'),
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'address-qa-feedback.yaml')
    ];
    const taskPath = candidates.find(p => require('fs').existsSync(p)) || candidates[0];

    // Accept story path via: positional, --story <path>, or @<path>
    let storyPath = null;
    for (let i = 0; i < rest.length; i++) {
      const tok = rest[i];
      if (!tok) continue;
      if (tok === '--story' && rest[i + 1]) { storyPath = rest[i + 1]; break; }
      if (tok.startsWith('@') && tok.length > 1) { storyPath = tok.slice(1); break; }
      if (!tok.startsWith('-') && !storyPath) { storyPath = tok; break; }
    }
    const run = async () => {
      try {
        const TaskRunner = require('./task-runner');
        const runner = new TaskRunner(projectRoot);
        const context = { storyPath, allowMissingUserInput: true };
        const result = await runner.executeTask('dev', taskPath, context);
        // Emit a concise summary so Codex shows progress
        const ok = result && result.success !== false;
        console.log(`address-qa-feedback: ${ok ? 'success' : 'failed'}`);
        return ok ? 0 : 1;
      } catch (e) {
        console.error('address-qa-feedback failed:', e.message);
        return 1;
      }
    };
    run().then(code => process.exit(code));
    return;
  }

  if (agent === 'dev' && command === 'run-tests') {
    // Route to QA test runner
    const runner = path.join(projectRoot, 'tools', 'qa', 'run-test-quality.js');
    const env = { ...process.env, CI: process.env.CI || '1', JEST_FORCE_COLOR: '0', FORCE_COLOR: '0' };
    if (fs.existsSync(runner)) {
      const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot, env });
      child.on('exit', code => process.exit(code));
    } else {
      // Fallback to npm test (non-interactive)
      const args = ['test', '--silent'];
      if (rest && rest.length) args.push(...rest);
      const child = spawn('npm', args, { stdio: 'inherit', cwd: projectRoot, env });
      child.on('exit', code => process.exit(code));
    }
    return;
  }

  // ============== QA AGENT COMMANDS ==============
  if (agent === 'qa' && command === 'review') {
    const runner = path.join(projectRoot, 'tools', 'qa-review.js');
    // qa-review.js expects story path directly or will find stories to review
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'qa' && command === 'analyze-code-quality') {
    // Execute structured task via TaskRunner (non-interactive by default)
    const candidates = [
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'analyze-code-quality.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'analyze-code-quality.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'analyze-code-quality.yaml'),
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'analyze-code-quality.yaml')
    ];
    const taskPath = candidates.find(p => require('fs').existsSync(p)) || candidates[0];
    // Accept optional story path via positional, --story <path>, or @<path>
    let storyPath = null;
    for (let i = 0; i < rest.length; i++) {
      const tok = rest[i];
      if (!tok) continue;
      if (tok === '--story' && rest[i + 1]) { storyPath = rest[i + 1]; break; }
      if (tok.startsWith('@') && tok.length > 1) { storyPath = tok.slice(1); break; }
      if (!tok.startsWith('-') && !storyPath) { storyPath = tok; break; }
    }
    const run = async () => {
      try {
        const TaskRunner = require('./task-runner');
        const runner = new TaskRunner(projectRoot);
        const context = { allowMissingUserInput: true, storyPath, argv: rest };
        const result = await runner.executeTask('qa', taskPath, context);
        const ok = result && result.success !== false;
        console.log(`analyze-code-quality: ${ok ? 'success' : 'failed'}`);
        return ok ? 0 : 1;
      } catch (e) {
        console.error('analyze-code-quality failed:', e.message);
        return 1;
      }
    };
    run().then(code => process.exit(code));
    return;
  }

  if (agent === 'qa' && command === 'generate-coverage-report') {
    const runner = path.join(projectRoot, 'tools', 'qa', 'test-quality-gate.js');
    const env = { ...process.env, CI: process.env.CI || '1', JEST_FORCE_COLOR: '0', FORCE_COLOR: '0' };
    if (fs.existsSync(runner)) {
      const child = spawn(process.execPath, [runner, '--coverage', ...rest], { stdio: 'inherit', cwd: projectRoot, env });
      child.on('exit', code => process.exit(code));
    } else {
      // Fallback to npm coverage (non-interactive)
      const child = spawn('npm', ['run', 'coverage', ...rest], { stdio: 'inherit', cwd: projectRoot, env });
      child.on('exit', code => process.exit(code));
    }
    return;
  }

  if (agent === 'qa' && command === 'validate-docs-code-alignment') {
    // Delegate to orchestrator CLI validation to avoid interactive prompts
    const orchestratorCLI = path.join(projectRoot, 'tools', 'workflow-orchestrator.js');
    console.log('Validating documentation and code alignment...');
    const child = spawn(process.execPath, [orchestratorCLI, 'qa-validate-alignment', ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'qa' && command === 'validate-integration-safety') {
    const runner = path.join(projectRoot, 'tools', 'qa', 'integration-safety.js');
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'qa' && command === 'normalize-reports') {
    const runner = path.join(projectRoot, 'tools', 'qa', 'normalize-reports.js');
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'qa' && command === 'validate-feature-coverage') {
    // Run the feature coverage tool
    const runner = path.join(projectRoot, 'tools', 'feature-coverage.js');
    const env = { ...process.env, CI: process.env.CI || '1', JEST_FORCE_COLOR: '0', FORCE_COLOR: '0' };
    if (fs.existsSync(runner)) {
      const child = spawn(process.execPath, [runner, '--min-test-coverage', '80', '--report', '.ai/reports/feature-coverage.json', '--markdown', '.ai/reports/feature-coverage.md', ...rest], { stdio: 'inherit', cwd: projectRoot, env });
      child.on('exit', code => process.exit(code));
    } else {
      console.error('Feature coverage tool not found. Running basic test coverage instead.');
      const child = spawn('npm', ['run', 'test:coverage', ...rest], { stdio: 'inherit', cwd: projectRoot, env });
      child.on('exit', code => process.exit(code));
    }
    return;
  }

  if (agent === 'qa' && command === 'analyze-dependencies') {
    // Run dependency analysis structured task via TaskRunner
    const candidates = [
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'analyze-dependency-impacts-qa.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'analyze-dependency-impacts-qa.yaml')
    ];
    const taskPath = candidates.find(p => require('fs').existsSync(p)) || candidates[0];
    const run = async () => {
      try {
        const TaskRunner = require('./task-runner');
        const runner = new TaskRunner(projectRoot);
        const context = { allowMissingUserInput: true, argv: rest };
        const result = await runner.executeTask('qa', taskPath, context);
        const ok = result && result.success !== false;
        console.log(`analyze-dependencies: ${ok ? 'success' : 'failed'}`);
        return ok ? 0 : 1;
      } catch (e) {
        console.error('analyze-dependencies failed:', e.message);
        return 1;
      }
    };
    run().then(code => process.exit(code));
    return;
  }

  if (agent === 'qa' && (command === 'code-cleanup-analysis' || command === 'cleanup' || command === 'orphans')) {
    // Run the orphan/cleanup detection tool
    const runner = path.join(projectRoot, 'tools', 'find-orphans.js');
    if (fs.existsSync(runner)) {
      const args = ['--ignore', '**/node_modules/**,**/dist/**,**/build/**,**/coverage/**', '--json', '.ai/orphans-report.json', ...rest];
      const child = spawn(process.execPath, [runner, ...args], { stdio: 'inherit', cwd: projectRoot });
      child.on('exit', code => process.exit(code));
    } else {
      console.error('Orphan detection tool not found at:', runner);
      process.exit(1);
    }
    return;
  }

  // ============== PM AGENT COMMANDS ==============
  if (agent === 'pm' && command === 'validate-epic') {
    const runner = path.join(projectRoot, 'scripts', 'validate-epic-contract.js');
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'pm' && command === 'validate-feature-coverage') {
    // Run the feature coverage tool with optional args
    const runner = path.join(projectRoot, 'tools', 'feature-coverage.js');
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'pm' && (command === 'create-prd' || command === 'create-brownfield-prd')) {
    // Execute create-doc structured task directly via TaskRunner with selected template
    const templateName = command === 'create-brownfield-prd' ? 'brownfield-prd-tmpl.yaml' : 'prd-tmpl.yaml';
    const templateCandidates = [
      path.join(projectRoot, '.semad-core', 'templates', templateName),
      path.join(projectRoot, 'semad-core', 'templates', templateName),
      path.join(projectRoot, 'semad-core', 'templates', templateName),
      path.join(projectRoot, '.semad-core', 'templates', templateName)
    ];
    const templatePath = templateCandidates.find(p => require('fs').existsSync(p)) || templateCandidates[0];

    const taskCandidates = [
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'create-doc.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'create-doc.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'create-doc.yaml'),
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'create-doc.yaml')
    ];
    const taskPath = taskCandidates.find(p => require('fs').existsSync(p)) || taskCandidates[0];

    const run = async () => {
      try {
        const TaskRunner = require('./task-runner');
        const runner = new TaskRunner(projectRoot);
        const context = {
          template_name: path.basename(templatePath),
          template_path: templatePath,
          destination_path: 'docs/prd.md',
          allowMissingUserInput: true
        };
        const result = await runner.executeTask('pm', taskPath, context);
        const ok = result && result.success !== false;
        console.log(`create-prd(${path.basename(templatePath)}): ${ok ? 'success' : 'failed'}`);
        return ok ? 0 : 1;
      } catch (e) {
        console.error('create-prd failed:', e.message);
        return 1;
      }
    };
    run().then(code => process.exit(code));
    return;
  }

  if (agent === 'pm' && (command === 'update-prd-from-implementation' || command === 'document-missing-requirements')) {
    // These would need specific implementation
    console.log(`Executing PM command: ${command}`);
    const taskRunner = path.join(projectRoot, 'tools', 'task-runner.js');
    const child = spawn(process.execPath, [taskRunner, `--pm-${command}`, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'pm' && (command === 'brownfield-create-epic' || command === 'brownfield-create-story')) {
    // Run brownfield creation structured tasks via TaskRunner
    const candidates = [
      path.join(projectRoot, '.semad-core', 'structured-tasks', command === 'brownfield-create-epic' ? 'brownfield-create-epic.yaml' : 'brownfield-create-story.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', command === 'brownfield-create-epic' ? 'brownfield-create-epic.yaml' : 'brownfield-create-story.yaml'),
      path.join(projectRoot, 'bmad-core', 'structured-tasks', command === 'brownfield-create-epic' ? 'brownfield-create-epic.yaml' : 'brownfield-create-story.yaml'),
      path.join(projectRoot, '.bmad-core', 'structured-tasks', command === 'brownfield-create-epic' ? 'brownfield-create-epic.yaml' : 'brownfield-create-story.yaml')
    ];
    const taskPath = candidates.find(p => require('fs').existsSync(p)) || candidates[candidates.length - 1];

    const run = async () => {
      try {
        const TaskRunner = require('./task-runner');
        const runner = new TaskRunner(projectRoot);
        // Allow missing user input for non-interactive usage; forward args through context
        const context = { allowMissingUserInput: true, argv: rest };
        const result = await runner.executeTask('pm', taskPath, context);
        const ok = result && result.success !== false;
        console.log(`${command}: ${ok ? 'success' : 'failed'}`);
        return ok ? 0 : 1;
      } catch (e) {
        console.error(`${command} failed:`, e.message);
        return 1;
      }
    };
    run().then(code => process.exit(code));
    return;
  }

  // ============== PO AGENT COMMANDS ==============
  if (agent === 'po' && (command === 'create-epics' || command === 'create-epics-from-prd')) {
    const runner = path.join(projectRoot, 'tools', 'po', 'create-epics-from-prd.js');
    if (!require('fs').existsSync(runner)) {
      console.error('Epic creation tool not found at:', runner);
      process.exit(1);
    }
    const child = spawn(process.execPath, [runner, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  // ============== SM AGENT COMMANDS ==============
  if (agent === 'sm' && (command === 'create-story' || command === 'create-next-story')) {
    // Run the structured task directly via TaskRunner and print a concise summary
    const candidates = [
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'create-next-story.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'create-next-story.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'create-next-story.yaml'),
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'create-next-story.yaml')
    ];
    const taskPath = candidates.find(p => require('fs').existsSync(p)) || candidates[0];

    const run = async () => {
      try {
        const TaskRunner = require('./task-runner');
        const runner = new TaskRunner(projectRoot);
        const context = { allowMissingUserInput: true };
        const result = await runner.executeTask('sm', taskPath, context);
        const ok = result && result.success !== false;
        console.log(`create-next-story: ${ok ? 'success' : 'failed'}`);
        return ok ? 0 : 1;
      } catch (e) {
        console.error('create-next-story failed:', e.message);
        return 1;
      }
    };
    run().then(code => process.exit(code));
    return;
  }

  if (agent === 'sm' && command === 'correct-course') {
    // Run structured task directly via TaskRunner
    const candidates = [
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'correct-course.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'correct-course.yaml'),
      path.join(projectRoot, 'semad-core', 'structured-tasks', 'correct-course.yaml'),
      path.join(projectRoot, '.semad-core', 'structured-tasks', 'correct-course.yaml')
    ];
    const taskPath = candidates.find(p => require('fs').existsSync(p)) || candidates[0];

    const run = async () => {
      try {
        const TaskRunner = require('./task-runner');
        const runner = new TaskRunner(projectRoot);
        const context = { allowMissingUserInput: true };
        const result = await runner.executeTask('sm', taskPath, context);
        const ok = result && result.success !== false;
        console.log(`correct-course: ${ok ? 'success' : 'failed'}`);
        return ok ? 0 : 1;
      } catch (e) {
        console.error('correct-course failed:', e.message);
        return 1;
      }
    };
    run().then(code => process.exit(code));
    return;
  }

  if (agent === 'sm' && (command === 'story-checklist' || command === 'recreate-stories-from-code' || command === 'update-story-templates')) {
    // These would need specific implementation
    console.log(`Executing SM command: ${command}`);
    const taskRunner = path.join(projectRoot, 'tools', 'task-runner.js');
    const child = spawn(process.execPath, [taskRunner, `--sm-${command}`, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  if (agent === 'sm' && (command === 'scope-split' || command === 'team-split')) {
    // Route to scope split tool; keep team-split as backward-compatible alias
    const runner = path.join(projectRoot, 'tools', 'sm-scope-split.js');
    const fs = require('fs');
    if (!fs.existsSync(runner)) {
      console.error('Scope split tool not found at:', runner);
      process.exit(1);
    }
    // Normalize args to accept: positional, --story <path>, or @<path>
    let storyPath = null;
    const pass = [];
    for (let i = 0; i < rest.length; i++) {
      const tok = rest[i];
      if (!tok) continue;
      if (tok === '--story' && rest[i + 1]) {
        storyPath = rest[i + 1];
        i++;
        continue;
      }
      if (tok.startsWith('@') && tok.length > 1 && !storyPath) {
        storyPath = tok.slice(1);
        continue;
      }
      if (!tok.startsWith('-') && !storyPath) {
        storyPath = tok;
        continue;
      }
      pass.push(tok);
    }
    const args = storyPath ? [runner, storyPath, ...pass] : [runner, ...rest];
    const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  // ============== ANALYST AGENT COMMANDS ==============
  if (agent === 'analyst') {
    // All analyst commands use task runner with specific flags
    console.log(`Executing Analyst command: ${command}`);
    const taskRunner = path.join(projectRoot, 'tools', 'task-runner.js');
    const child = spawn(process.execPath, [taskRunner, `--analyst-${command}`, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  // ============== ARCHITECT AGENT COMMANDS ==============
  if (agent === 'architect') {
    // All architect commands use task runner with specific flags
    console.log(`Executing Architect command: ${command}`);
    const taskRunner = path.join(projectRoot, 'tools', 'task-runner.js');
    const child = spawn(process.execPath, [taskRunner, `--architect-${command}`, ...rest], { stdio: 'inherit', cwd: projectRoot });
    child.on('exit', code => process.exit(code));
    return;
  }

  // ============== ORCHESTRATOR AGENT COMMANDS ==============
  if ((agent === 'orchestrator' || agent === 'bmad-orchestrator')) {
    const orchestratorCLI = path.join(projectRoot, 'tools', 'workflow-orchestrator.js');

    // Special-case: dev-qa-iterative-session → stream in-session Dev↔QA handoffs like greenfield flow
    if (command === 'dev-qa-iterative-session') {
      const path = require('path');
      // Parse args: accept positional, --story/-s, or @<pathOrId>; and --max/-m
      let storyArg = null;
      let maxIterations = null;
      for (let i = 0; i < rest.length; i++) {
        const tok = rest[i];
        if (!tok) continue;
        if ((tok === '--story' || tok === '-s') && rest[i + 1]) { storyArg = rest[i + 1]; i++; continue; }
        if ((tok === '--max' || tok === '-m') && rest[i + 1]) { maxIterations = rest[i + 1]; i++; continue; }
        if (tok.startsWith('@') && tok.length > 1 && !storyArg) { storyArg = tok.slice(1); continue; }
        if (!tok.startsWith('-') && !storyArg) { storyArg = tok; continue; }
      }
      if (!storyArg) {
        console.error('Missing required option: --story <pathOrId>');
        process.exit(1);
      }

      // Stream the built-in orchestrator iterative flow to match greenfield UX
      const args = ['dev-qa-iterative', '--directory', projectRoot, '--story', storyArg];
      if (maxIterations) args.push('--max', String(maxIterations));
      const env = { ...process.env, BMAD_NONINTERACTIVE: '1', BMAD_ALLOW_MISSING_USER_INPUT: '1' };
      const child = spawn(process.execPath, [orchestratorCLI, ...args], { stdio: 'inherit', cwd: projectRoot, env });
      child.on('exit', code => process.exit(code));
      return;
    }

    const passthrough = (subcmd) => {
      const child = spawn(process.execPath, [orchestratorCLI, subcmd, ...rest], { stdio: 'inherit', cwd: projectRoot });
      child.on('exit', code => process.exit(code));
    };
    if (command === 'reverse-align') return passthrough('reverse-align');
    if (command === 'refresh-manifest') return passthrough('refresh-manifest');
    if (command === 'generate-stories') return passthrough('generate-stories');
    if (command === 'reverse-quality-gate') return passthrough('reverse-quality-gate');
    if (command === 'create-documentation-manifest') return passthrough('create-documentation-manifest');
    if (command === 'architect-rewrite') return passthrough('architect-rewrite');
    if (command === 'pm-update-prd') return passthrough('pm-update-prd');
    // New and generic passthroughs for orchestrator helpers/workflows
    if (command === 'create-epics-from-prd') return passthrough('create-epics-from-prd');
    if (command === 'validate-epics') return passthrough('validate-epics');
    if (command === 'brownfield-bootstrap') return passthrough('brownfield-bootstrap');
    if (command === 'brownfield-story-gen') return passthrough('brownfield-story-gen');
    // Fallback: attempt to run any orchestrator subcommand directly
    return passthrough(command);
  }

  console.error(`Unsupported routing: agent='${agent}', command='${command}'. Try '/${agent} *help' for available commands.`);
  process.exit(2);
}

main();
