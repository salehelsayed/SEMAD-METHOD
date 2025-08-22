#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

async function loadCoreConfig(rootDir) {
  const yaml = require('js-yaml');
  const candidates = [
    path.join(rootDir, 'bmad-core', 'core-config.yaml'),
    path.join(rootDir, 'core-config.yaml')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, 'utf8');
      return yaml.load(txt) || {};
    }
  }
  throw new Error('core-config.yaml not found (looked in bmad-core/core-config.yaml and core-config.yaml)');
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
  const { findNextApprovedStory } = require('../bmad-core/utils/find-next-story');
  const res = findNextApprovedStory(storiesDir);
  if (!res.found) throw new Error(res.error || 'No approved story found');
  return res.path;
}

async function run() {
  const rootDir = process.cwd();
  const argv = process.argv.slice(2);
  // Simple arg parse: allow --story <path>
  let storyArg = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--story' && argv[i + 1]) { storyArg = argv[i + 1]; i++; }
  }

  console.log(chalk.bold('🧭 Dev Agent – develop-story (pre-implementation dependency analysis)\n'));

  try {
    const cfg = await loadCoreConfig(rootDir);
    const storyPath = resolveStoryPath(rootDir, cfg, storyArg);
    console.log(`📖 Story: ${path.relative(rootDir, storyPath)}`);

    // Execute the pre-implementation structured task
    const WorkflowExecutor = require('../bmad-core/utils/workflow-executor');
    const exec = new WorkflowExecutor(rootDir, { flowType: 'standard' });
    console.log(chalk.blue('🔎 Running analyze-dependencies-before-implementation task...'));
    await exec.executeStructuredTask('analyze-dependencies-before-implementation', { storyPath });

    console.log(chalk.green('✅ Pre-implementation dependency analysis completed.'));
    console.log(chalk.dim('Artifacts: .ai/dependency_analysis.json, .ai/dependency_impact_report.md'));
    console.log('\nYou can now proceed with implementation or run your preferred dev workflow.');
  } catch (e) {
    console.error(chalk.red('❌ develop-story pre-task failed:'), e.message);
    process.exit(1);
  }
}

run();

