#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const {
  loadStoryContract,
  normalizeStoryId,
  deriveWorkItems
} = require('../../semad-core/utils/story-contract');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(token);
    }
  }
  return out;
}

function ensureDir(targetFile) {
  const dir = path.dirname(targetFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const story = args.story || args._[0];
  if (!story) {
    console.error('Usage: run-dependency-plan --story <story.md> [--output <file>]');
    process.exit(2);
  }

  const rootDir = process.cwd();
  const storyPath = path.isAbsolute(story) ? story : path.join(rootDir, story);
  if (!fs.existsSync(storyPath)) {
    console.error(chalk.red(`Story not found: ${storyPath}`));
    process.exit(2);
  }

  let contract;
  try {
    ({ contract } = loadStoryContract(storyPath));
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(3);
  }

  const storyMeta = contract?.story || {};
  const storyId = storyMeta.storyId || normalizeStoryId(contract, storyPath);
  const workItems = deriveWorkItems(contract);
  const filesToModify = workItems.map(item => item.path).filter(Boolean);

  if (filesToModify.length === 0) {
    console.error(chalk.red('No filesToModify defined in StoryContract; cannot plan dependencies.'));
    process.exit(4);
  }

  const impactRadius = contract.impactRadius || {};
  const cleanupRequired = contract.cleanupRequired || {};
  const traceability = contract?.traceability || {};
  const integrationPoints = Array.isArray(traceability?.integrationPointIds)
    ? traceability.integrationPointIds
    : Array.isArray(contract?.integrationPointIds)
      ? contract.integrationPointIds
      : [];
  const performanceBudget = contract?.performanceBudget || {};
  const guardrails = contract?.guardrails || {};
  const integrationVerification = Array.isArray(contract?.integrationVerification)
    ? contract.integrationVerification
    : [];
  const rollbackPlan = contract?.rollbackPlan || {};
  const sliceType = storyMeta.sliceType || contract?.story_sliceType || null;
  const summary = {
    storyId,
    storyPath: path.relative(rootDir, storyPath),
    generatedAt: new Date().toISOString(),
    filesToModify,
    filesToCreate: workItems.filter(item => item.type === 'create').map(item => item.path),
    qualityGates: contract.qualityGates || {},
    impactRadius,
    cleanupRequired,
    guardrails,
    performanceBudget,
    integrationVerification,
    rollbackPlan,
    traceability,
    integrationPoints,
    sliceType,
    notes: {
      maxFilesAffected: impactRadius?.breakageBudget?.maxFilesAffected || null,
      requiresImpactScan: contract.qualityGates?.runImpactScan === true,
      requiresZeroUnused: contract.qualityGates?.zeroUnused === true || cleanupRequired.removeUnused === true
    }
  };

  const defaultOutput = path.join(rootDir, '.ai', 'dev', 'dependency', `${storyId}.json`);
  const outputPath = args.output
    ? (path.isAbsolute(args.output) ? args.output : path.join(rootDir, args.output))
    : defaultOutput;

  ensureDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

  console.log(chalk.blue('🔍 Dependency plan ready for implementation:'));
  console.log(chalk.green(`  Story: ${storyId}`));
  console.log(`  Files to touch (${filesToModify.length}):`);
  filesToModify.forEach(f => console.log(`    - ${f}`));
  if (impactRadius?.components?.length) {
    console.log('  Impacted components:');
    impactRadius.components.forEach(c => console.log(`    - ${c}`));
  }
  if (integrationPoints.length) {
    console.log('  Integration points:');
    integrationPoints.forEach(intId => console.log(`    - ${intId}`));
  }
  if (performanceBudget.p95 || performanceBudget.p99) {
    console.log('  Performance budget:');
    if (performanceBudget.p95) console.log(`    - p95: ${performanceBudget.p95}`);
    if (performanceBudget.p99) console.log(`    - p99: ${performanceBudget.p99}`);
  }
  if (Array.isArray(guardrails.mustDo) && guardrails.mustDo.length) {
    console.log('  Guardrails (must do):');
    guardrails.mustDo.forEach(item => console.log(`    - ${item}`));
  }
  if (Array.isArray(guardrails.outOfScope) && guardrails.outOfScope.length) {
    console.log('  Guardrails (out of scope):');
    guardrails.outOfScope.forEach(item => console.log(`    - ${item}`));
  }
  console.log(chalk.green('✅ Plan saved to:'), path.relative(rootDir, outputPath));

  return outputPath;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

module.exports = main;
