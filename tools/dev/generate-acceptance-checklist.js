#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const {
  loadStoryContract,
  normalizeStoryId,
  deriveAcceptanceCriteria,
  deriveAcceptanceChecklist
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
    console.error('Usage: generate-acceptance-checklist --story <story.md> [--output <file>]');
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

  const storyId = normalizeStoryId(contract, storyPath);
  const acceptanceCriteria = deriveAcceptanceCriteria(storyPath, contract);
  const checklistItems = deriveAcceptanceChecklist(storyPath, contract, acceptanceCriteria);
  const storyMeta = contract?.story || {};
  const traceability = contract?.traceability || {};

  const payload = {
    version: 1,
    storyId,
    storyPath: path.relative(rootDir, storyPath),
    generatedAt: new Date().toISOString(),
    sliceType: storyMeta.sliceType || contract?.story_sliceType || null,
    storyOwner: storyMeta.owner || null,
    guardrails: contract?.guardrails || {},
    performanceBudget: contract?.performanceBudget || {},
    traceability,
    integrationVerification: contract?.integrationVerification || [],
    rollbackPlan: contract?.rollbackPlan || {},
    totalItems: checklistItems.length,
    checklist: checklistItems
  };

  const defaultOutput = path.join(rootDir, '.ai', 'dev', 'checklists', `${storyId}.json`);
  const outputPath = args.output
    ? (path.isAbsolute(args.output) ? args.output : path.join(rootDir, args.output))
    : defaultOutput;

  ensureDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  console.log(chalk.green('✅ Acceptance checklist generated:'), path.relative(rootDir, outputPath));
  checklistItems.forEach(item => {
    console.log(`  - ${item.id}: ${item.description}`);
  });

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
