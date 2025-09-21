#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

async function loadCoreConfig(rootDir) {
  const yaml = require('js-yaml');
  const candidates = [
    path.join(rootDir, 'semad-core', 'core-config.yaml'),
    path.join(rootDir, 'core-config.yaml')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, 'utf8');
      return yaml.load(txt) || {};
    }
  }
  throw new Error('core-config.yaml not found (looked in semad-core/core-config.yaml and core-config.yaml)');
}

function resolveStoryPath(rootDir, cfg, cliStory) {
  if (cliStory) {
    const abs = path.isAbsolute(cliStory) ? cliStory : path.join(rootDir, cliStory);
    if (!fs.existsSync(abs)) throw new Error(`Story file not found: ${abs}`);
    return abs;
  }
  // Fallback to next approved story
  const storiesDir = (() => {
    const loc = cfg.devStoryLocation || 'docs/stories';
    return path.isAbsolute(loc) ? loc : path.join(rootDir, loc);
  })();
  const { findNextApprovedStory } = require('../semad-core/utils/find-next-story');
  const res = findNextApprovedStory(storiesDir);
  if (!res.found) throw new Error(res.error || 'No approved story found');
  return res.path;
}

async function run() {
  const rootDir = process.cwd();
  // Ensure legacy alias for core paths (some utilities resolve 'bmad-core')
  try {
    const alias = path.join(rootDir, 'bmad-core');
    const dotCore = path.join(rootDir, '.semad-core');
    if (!fs.existsSync(alias) && fs.existsSync(dotCore)) {
      fs.symlinkSync('.semad-core', alias);
    }
  } catch (_) { /* non-fatal */ }
  const argv = process.argv.slice(2);
  // Simple arg parse: allow --story <path>
  let storyArg = null;
  let analyzeOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--story' && argv[i + 1]) { storyArg = argv[i + 1]; i++; }
    if (argv[i] === '--analyze-only' || argv[i] === '--analysis-only') { analyzeOnly = true; }
  }

  console.log(chalk.bold('🧭 Dev Agent – develop-story (pre-implementation dependency analysis)\n'));

  try {
    const cfg = await loadCoreConfig(rootDir);
    const storyPath = resolveStoryPath(rootDir, cfg, storyArg);
    console.log(`📖 Story: ${path.relative(rootDir, storyPath)}`);

    // Execute the pre-implementation structured task
    const WorkflowExecutor = require('../semad-core/utils/workflow-executor');
    const exec = new WorkflowExecutor(rootDir, { flowType: 'standard' });
    console.log(chalk.blue('🔎 Running analyze-dependencies-before-implementation task...'));
    await exec.executeStructuredTask('analyze-dependencies-before-implementation', { storyPath });

    console.log(chalk.green('✅ Pre-implementation dependency analysis completed.'));
    console.log(chalk.dim('Artifacts: .ai/dependency_analysis.json, .ai/dependency_impact_report.md'));

    // Initialize or persist dev task list for external tooling
    try {
      const TaskTracker = require('../semad-core/utils/simple-task-tracker');
      const tracker = new TaskTracker();
      tracker.setAgent('dev');
      // Seed with a minimal workflow if not present yet
      const devTasksPath = path.join(rootDir, '.ai', 'dev_tasks.json');
      if (!fs.existsSync(devTasksPath)) {
        tracker.startWorkflow('develop-story', [
          { name: 'Pre-implementation dependency analysis', status: 'completed' }
        ]);
        tracker.saveDevTasks(devTasksPath);
      }
    } catch (e) {
      console.warn(chalk.yellow('⚠️  Could not initialize dev task list:'), e.message);
    }

    if (analyzeOnly) {
      console.log('\nAnalysis-only mode: skipping implementation.');
      return;
    }

    // Proceed to full implementation of the same story via dev-next-story
    console.log('\n' + chalk.blue('🚀 Proceeding to implement the same story...'));
    const { spawnSync } = require('child_process');
    const res = spawnSync(process.execPath, [path.join('tools', 'dev-next-story.js'), '--auto', '--quiet', '--story', storyPath], {
      cwd: rootDir,
      stdio: 'inherit'
    });
    const code = res.status ?? res.code ?? 1;
    if (code !== 0) {
      console.error(chalk.red(`Implementation step reported non-zero exit (${code}).`));
      process.exit(code);
    } else {
      console.log(chalk.green('Implementation completed.'));
    }
  } catch (e) {
    console.error(chalk.red('❌ develop-story pre-task failed:'), e.message);
    process.exit(1);
  }
}

run();
