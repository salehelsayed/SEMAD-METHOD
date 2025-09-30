#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const {
  loadStoryContract,
  normalizeStoryId
} = require('../semad-core/utils/story-contract');
const DevNextStoryRunner = require('./dev-next-story.js');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === '--story' && argv[i + 1]) {
      out.story = argv[i + 1];
      i++;
      continue;
    }
    if (token === '--verbose') {
      out.verbose = true;
      continue;
    }
    out._.push(token);
  }
  if (!out.story && out._.length > 0) {
    out.story = out._[0].startsWith('@') ? out._[0].slice(1) : out._[0];
  }
  return out;
}

function ensureDir(targetFile) {
  const dir = path.dirname(targetFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function summarizeTests(report) {
  if (!report || typeof report !== 'object') {
    return { passed: 0, failed: 0, total: 0 };
  }
  const suites = Array.isArray(report.testResults) ? report.testResults : [];
  let passed = 0;
  let failed = 0;
  suites.forEach(suite => {
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    assertions.forEach(assertion => {
      if (assertion.status === 'passed') passed++;
      else if (assertion.status === 'failed') failed++;
    });
  });
  return { passed, failed, total: passed + failed };
}

function summarizeChecklist(checklist) {
  if (!checklist || !Array.isArray(checklist.checklist)) {
    return { pending: [], total: 0 };
  }
  const pending = checklist.checklist.filter(item => !item || item.verified !== true);
  return {
    pending: pending.map(item => item.id),
    total: checklist.checklist.length
  };
}

function summarizeDevTasks(rootDir) {
  try {
    const p = path.join(rootDir, '.ai', 'dev_tasks.json');
    if (!fs.existsSync(p)) return { total: 0, completed: 0 };
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    const completed = tasks.filter(t => t && (t.status === 'done' || t.status === 'completed' || t.status === 'complete')).length;
    return { total: tasks.length, completed };
  } catch (e) {
    return { total: 0, completed: 0 };
  }
}

async function main() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  if (!args.story) {
    console.error('Usage: dev-x3 --story <docs/stories/story.md> [--verbose]');
    process.exit(2);
  }

  const storyPath = path.isAbsolute(args.story) ? args.story : path.join(rootDir, args.story);
  if (!fs.existsSync(storyPath)) {
    console.error(chalk.red('Story not found:'), path.relative(rootDir, storyPath));
    process.exit(2);
  }

  let contract;
  try {
    ({ contract } = loadStoryContract(storyPath));
  } catch (error) {
    console.error(chalk.red('Unable to load StoryContract:'), error.message);
    process.exit(3);
  }

  const storyId = normalizeStoryId(contract, storyPath);
  const runner = new DevNextStoryRunner(rootDir);
  const artifacts = runner.computeArtifactPaths(storyId);
  const progressPath = path.join(rootDir, '.ai', 'dev', `devx3-${storyId}.json`);

  console.log(chalk.bold(`⚙️  DevX3 workflow → ${storyId}`));
  console.log(`📄 Story: ${path.relative(rootDir, storyPath)}`);
  console.log('Passes: up to 3 consecutive dev agent executions\n');

  const passResults = [];
  let finalExit = 0;

  for (let pass = 1; pass <= 3; pass++) {
    console.log(chalk.blue(`────────────── Pass ${pass} / 3 ──────────────`));
    const exitCode = await runner.run({
      auto: true,
      quiet: true,
      storyOverride: storyPath,
      codex: false,
      verbose: args.verbose || false,
      finalStatus: 'Ready for Review'
    });

    const checklist = readJsonSafe(artifacts.checklistPath);
    const evidence = readJsonSafe(artifacts.acceptanceEvidencePath);
    const redReport = readJsonSafe(artifacts.redReportPath);
    const testReport = readJsonSafe(artifacts.greenReportPath);
    const checklistSummary = summarizeChecklist(checklist);
    const redSummary = summarizeTests(redReport);
    const testSummary = summarizeTests(testReport);
    const acceptanceComplete = Array.isArray(evidence?.acceptance)
      ? evidence.acceptance.every(item => item && item.verified === true)
      : false;

    // Present numbered sub-steps with observations and decisions (console-friendly)
    const rel = p => (p ? path.relative(rootDir, p) : null);
    const depExists = fs.existsSync(artifacts.dependencyPlanPath);
    const devTasks = summarizeDevTasks(rootDir);
    console.log(chalk.bold('Sub-steps:'));
    console.log(`  1. Dependency plan: ${depExists ? chalk.green('generated') : chalk.red('missing')} ${depExists ? '(' + rel(artifacts.dependencyPlanPath) + ')' : ''}`);
    console.log(`  2. TDD from acceptanceTestMatrix: red ${redSummary.passed}/${redSummary.total} passed → green ${testSummary.passed}/${testSummary.total} passed`);
    console.log(`  3. Implementation & validations: acceptance evidence ${evidence ? chalk.green('present') : chalk.red('missing')} ${evidence ? '(' + rel(artifacts.acceptanceEvidencePath) + ')' : ''}`);
    console.log(`  4. Tracking: tasks completed ${devTasks.completed}/${devTasks.total}; checklist verified ${checklistSummary.total - checklistSummary.pending.length}/${checklistSummary.total}`);
    console.log(`  5. Outstanding items: ${checklistSummary.pending.length ? chalk.yellow(checklistSummary.pending.join(', ')) : chalk.green('none')}`);

    passResults.push({
      pass,
      exitCode,
      checklistPending: checklistSummary.pending,
      checklistTotal: checklistSummary.total,
      tests: testSummary,
      redTests: redSummary,
      acceptanceComplete
    });

    if (exitCode !== 0) {
      console.log(chalk.red(`Pass ${pass} exited with code ${exitCode}.`));
      finalExit = exitCode;
      break;
    }

    if (acceptanceComplete) {
      console.log(chalk.green('All acceptance criteria verified; stopping DevX3 early.'));
      break;
    }

    finalExit = exitCode;
  }

  ensureDir(progressPath);
  const progressPayload = {
    storyId,
    storyPath: path.relative(rootDir, storyPath),
    generatedAt: new Date().toISOString(),
    passes: passResults
  };
  fs.writeFileSync(progressPath, JSON.stringify(progressPayload, null, 2));

  console.log('\nSummary:');
  passResults.forEach(result => {
    const status = result.exitCode === 0 ? chalk.green('PASS') : chalk.red('FAIL');
    const pendingNote = result.checklistPending.length
      ? chalk.yellow(`pending criteria: ${result.checklistPending.join(', ')}`)
      : chalk.green('acceptance complete');
    console.log(`  • Pass ${result.pass}: ${status} (exit ${result.exitCode}) – ${pendingNote}`);
  });
  console.log(`\nProgress log: ${path.relative(rootDir, progressPath)}`);

  const lastResult = passResults[passResults.length - 1] || { exitCode: 1 };
  if (passResults.length === 3 && lastResult.checklistPending.length) {
    console.log(chalk.red('\n❌ Acceptance criteria remain incomplete after three passes.'));
    console.log(chalk.yellow('Suggested actions: review checklist blockers, inspect test reports, and rerun dependency analysis.'));
    process.exit(lastResult.exitCode || 1);
  }

  process.exit(lastResult.exitCode || finalExit || 0);
}

main();
