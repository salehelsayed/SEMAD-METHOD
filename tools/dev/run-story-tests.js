#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  loadStoryContract,
  deriveAcceptanceCriteria,
  deriveTestFiles
} = require('../../semad-core/utils/story-contract');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else { out[key] = true; }
    } else { out._.push(a); }
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
    console.error('Usage: run-story-tests --story <path-to-story.md>');
    process.exit(2);
  }
  const projectRoot = process.cwd();
  const storyPath = path.isAbsolute(story) ? story : path.join(projectRoot, story);
  if (!fs.existsSync(storyPath)) {
    console.error('Story not found:', storyPath);
    process.exit(2);
  }

  let contract;
  try {
    ({ contract } = loadStoryContract(storyPath));
  } catch (error) {
    console.error(error.message);
    process.exit(3);
  }

  const acceptance = deriveAcceptanceCriteria(storyPath, contract);
  const uniqueFiles = deriveTestFiles(storyPath, contract, acceptance)
    .map(p => path.isAbsolute(p) ? p : path.join(projectRoot, p))
    .filter(p => fs.existsSync(p));

  if (uniqueFiles.length === 0) {
    console.log('No test files defined for this story. Nothing to run.');
    process.exit(0);
  }

  // Announce exactly which tests will run (story-scoped only)
  const relFiles = uniqueFiles.map(p => path.relative(projectRoot, p));
  console.log('\nStory-scoped test run (this story only)');
  console.log('Files:');
  relFiles.forEach(f => console.log('  - ' + f));

  let reportPath = null;
  if (args.report) {
    reportPath = path.isAbsolute(args.report)
      ? args.report
      : path.join(projectRoot, args.report);
    ensureDir(reportPath);
    console.log('Report:', path.relative(projectRoot, reportPath));
  }

  // Run only specified tests using Jest's exact-path mode to avoid picking up the full suite
  // Forward to the test script: npm test -- --runTestsByPath <file1> <file2> ...
  const jestArgs = ['--runTestsByPath', ...uniqueFiles];
  if (reportPath) {
    jestArgs.unshift(`--outputFile=${reportPath}`);
    jestArgs.unshift('--json');
  }

  const argsList = ['test', '--silent', '--', ...jestArgs];
  const env = { ...process.env, CI: process.env.CI || '1' };
  const res = spawnSync('npm', argsList, { stdio: 'inherit', cwd: projectRoot, env });
  const code = res.status ?? res.code ?? 1;
  process.exit(code);
}

main();
