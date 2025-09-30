#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const {
  loadStoryContract,
  deriveAcceptanceCriteria,
  deriveTestFiles,
  deriveWorkItems,
  deriveAcceptanceChecklist,
  normalizeStoryId,
  readStoryFile
} = require('../../semad-core/utils/story-contract');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function ensureDir(targetPath) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const story = args.story || args._[0];
  if (!story) {
    console.error('Usage: derive-story-workplan --story <path-to-story.md> [--output <file>]');
    process.exit(2);
  }

  const rootDir = process.cwd();
  const storyPath = path.isAbsolute(story) ? story : path.join(rootDir, story);

  let contractData;
  try {
    contractData = loadStoryContract(storyPath);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(3);
  }

  const { contract } = contractData;
  const { body } = readStoryFile(storyPath);
  const acceptance = deriveAcceptanceCriteria(storyPath, contract, body);
  const testFiles = deriveTestFiles(storyPath, contract, acceptance).map(filePath => 
    path.relative(rootDir, filePath)
  );
  const workItems = deriveWorkItems(contract);
  const storyMeta = contract?.story || {};
  const storyId = storyMeta.storyId || normalizeStoryId(contract, storyPath);
  const title = storyMeta.title || contract?.title || contract?.story_title || path.basename(storyPath, path.extname(storyPath));
  const sliceType = storyMeta.sliceType || contract?.story_sliceType || null;
  const storyOwner = storyMeta.owner || null;
  const traceability = contract?.traceability || {};
  const integrationPoints = Array.isArray(traceability?.integrationPointIds)
    ? traceability.integrationPointIds
    : Array.isArray(contract?.integrationPointIds)
      ? contract.integrationPointIds
      : [];
  const performanceBudget = contract?.performanceBudget || null;
  const guardrails = contract?.guardrails || {};
  const integrationVerification = Array.isArray(contract?.integrationVerification)
    ? contract.integrationVerification
    : [];
  const rollbackPlan = contract?.rollbackPlan || {};

  const acceptanceChecklist = deriveAcceptanceChecklist(storyPath, contract, acceptance);

  const plan = {
    storyId,
    title,
    storyPath: path.relative(rootDir, storyPath),
    generatedAt: new Date().toISOString(),
    sliceType,
    storyOwner,
    acceptanceCriteria: acceptance.map(item => ({
      id: item.id,
      description: item.description,
      tests: item.tests,
      source: item.source
    })),
    acceptanceChecklist,
    testFiles,
    workItems,
    criteriaWork: acceptanceChecklist.map(item => ({
      id: item.id,
      description: item.description,
      relatedFiles: item.relatedFiles,
      tests: item.tests
    })),
    impactRadius: contract?.impactRadius || {},
    qualityGates: contract?.qualityGates || {},
    cleanupRequired: contract?.cleanupRequired || {},
    traceability,
    integrationVerification,
    rollbackPlan,
    performanceBudget,
    guardrails,
    integrationPoints,
    filesToModify: workItems.filter(item => item.type !== 'create').map(item => item.path),
    filesToCreate: workItems.filter(item => item.type === 'create').map(item => item.path)
  };

  if (!plan.acceptanceCriteria.length) {
    console.warn(chalk.yellow('Warning: No acceptance criteria detected; generated placeholder.'));
  }

  const defaultOutput = path.join('.ai', 'dev', 'workplans', `${storyId}.json`);
  const outputPath = args.output ? (path.isAbsolute(args.output) ? args.output : path.join(rootDir, args.output)) : path.join(rootDir, defaultOutput);
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2));

  console.log(chalk.green('✅ Workplan generated: '), path.relative(rootDir, outputPath));
  if (plan.testFiles.length === 0) {
    console.log(chalk.yellow('⚠️  No concrete test files found. Consider adding acceptance tests.'));
  } else {
    console.log(chalk.blue('🧪 Scoped tests:'));
    plan.testFiles.forEach(file => console.log('  -', file));
  }

  console.log(chalk.blue('📄 Files to touch:'));
  if (plan.workItems.length === 0) {
    console.log('  - (none listed in StoryContract)');
  } else {
    plan.workItems.forEach(item => {
      console.log(`  - ${item.path} (${item.type})${item.reason ? ` → ${item.reason}` : ''}`);
    });
  }

  if (integrationPoints.length) {
    console.log(chalk.blue('🔗 Integration points:'));
    integrationPoints.forEach(intId => console.log(`  - ${intId}`));
  }

  if (performanceBudget) {
    console.log(chalk.blue('⏱️  Performance budget:'));
    if (performanceBudget.p95) console.log(`  - p95: ${performanceBudget.p95}`);
    if (performanceBudget.p99) console.log(`  - p99: ${performanceBudget.p99}`);
  }

  if (guardrails?.mustDo || guardrails?.outOfScope) {
    console.log(chalk.blue('🚧 Guardrails:'));
    if (Array.isArray(guardrails.mustDo) && guardrails.mustDo.length) {
      console.log('  Must do:');
      guardrails.mustDo.forEach(item => console.log(`    - ${item}`));
    }
    if (Array.isArray(guardrails.outOfScope) && guardrails.outOfScope.length) {
      console.log('  Out of scope:');
      guardrails.outOfScope.forEach(item => console.log(`    - ${item}`));
    }
  }

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
