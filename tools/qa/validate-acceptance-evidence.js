#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { normalizeStoryId, loadStoryContract } = require('../../semad-core/utils/story-contract');

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

function resolveEvidencePath(rootDir, args) {
  if (args.evidence) {
    return path.isAbsolute(args.evidence)
      ? args.evidence
      : path.join(rootDir, args.evidence);
  }

  const storyArg = args.story || args._[0];
  if (!storyArg) {
    throw new Error('Provide --story <story.md> or --evidence <file>.');
  }

  const storyPath = path.isAbsolute(storyArg)
    ? storyArg
    : path.join(rootDir, storyArg);
  if (!fs.existsSync(storyPath)) {
    throw new Error(`Story not found: ${storyPath}`);
  }

  const { contract } = loadStoryContract(storyPath);
  const storyId = normalizeStoryId(contract, storyPath);
  return path.join(rootDir, '.ai', 'dev', 'acceptance', `${storyId}.json`);
}

function main() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));

  let evidencePath;
  try {
    evidencePath = resolveEvidencePath(rootDir, args);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(2);
  }

  if (!fs.existsSync(evidencePath)) {
    console.error(chalk.red(`Evidence file not found: ${evidencePath}`));
    process.exit(3);
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  } catch (error) {
    console.error(chalk.red(`Failed to parse evidence file: ${error.message}`));
    process.exit(4);
  }

  const acceptance = Array.isArray(payload.acceptance) ? payload.acceptance : [];
  if (!acceptance.length) {
    console.error(chalk.red('Evidence file contains no acceptance entries.'));
    process.exit(5);
  }

  const missing = acceptance.filter(item => !item.verified || !Array.isArray(item.evidence) || item.evidence.length === 0);
  if (missing.length) {
    console.error(chalk.red('Acceptance evidence incomplete. Missing coverage for:'));
    missing.forEach(item => {
      console.error(`  - ${item.id}: ${item.description}`);
    });
    process.exit(6);
  }

  console.log(chalk.green('✅ Acceptance evidence verified:'), path.relative(rootDir, evidencePath));
  acceptance.forEach(item => {
    console.log(`  - ${item.id} (${item.evidence.length} evidence entries)`);
  });
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
