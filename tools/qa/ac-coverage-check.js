#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

function extractStoryContract(storyPath) {
  const content = readFileSafe(storyPath);
  if (!content) throw new Error(`Cannot read story file: ${storyPath}`);
  // Match YAML front matter or Story Contract section
  let m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) m = content.match(/##\s*Story Contract\s*\n\s*---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('No StoryContract YAML found');
  const parsed = yaml.load(m[1]);
  if (!parsed || !parsed.StoryContract) throw new Error('StoryContract missing in YAML');
  return parsed.StoryContract;
}

function ensureArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

function findStoryFileById(storyId) {
  const candidates = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && p.endsWith('.md') && p.includes('docs/stories/')) candidates.push(p);
    }
  }
  walk(process.cwd());
  for (const f of candidates) {
    try {
      const sc = extractStoryContract(f);
      if ((sc.story_id || '').toString() === storyId.toString()) return f;
    } catch {}
  }
  return null;
}

function runJestOnFiles(testFiles, outputFile) {
  const args = ['test', '--', '--json', `--outputFile=${outputFile}`, ...testFiles];
  const res = spawnSync('npm', args, { stdio: 'inherit' });
  return res.status === 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node tools/qa/ac-coverage-check.js <story-file|story-id>');
    process.exit(1);
  }
  let storyArg = args[0];
  let storyPath = fs.existsSync(storyArg) ? storyArg : findStoryFileById(storyArg);
  if (!storyPath) {
    console.error(`Could not resolve story path for '${storyArg}'`);
    process.exit(1);
  }

  const reportDir = path.resolve('.ai/reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonOut = path.join(reportDir, 'ac_coverage_test_results.json');
  const covJson = path.join(reportDir, 'ac_coverage_report.json');
  const covMd = path.join(reportDir, 'ac_coverage_report.md');

  const sc = extractStoryContract(storyPath);
  const matrix = sc.acceptanceTestMatrix;
  const items = matrix && Array.isArray(matrix.items) ? matrix.items : [];
  const mustHave = items.filter(i => i && (i.must_have === true || i.must_have === undefined));

  const findings = [];
  const missingFiles = [];
  const testFiles = [];

  for (const it of mustHave) {
    const files = ensureArray(it.test_files).map(tf => tf && (tf.path || tf.file || tf));
    const filesResolved = files.filter(Boolean).map(p => path.resolve(p));
    if (filesResolved.length === 0) {
      findings.push({ ac_id: it.ac_id || 'UNKNOWN', status: 'missing_tests', message: 'No test_files listed' });
      continue;
    }
    for (const f of filesResolved) {
      if (!fs.existsSync(f)) {
        missingFiles.push(f);
        findings.push({ ac_id: it.ac_id || 'UNKNOWN', status: 'missing_file', file: f });
      } else {
        testFiles.push(f);
      }
    }
  }

  // Deduplicate
  const uniqueTestFiles = Array.from(new Set(testFiles));

  let testsOk = true;
  if (uniqueTestFiles.length) {
    testsOk = runJestOnFiles(uniqueTestFiles, jsonOut);
  }

  // Summarize
  const summary = {
    story: path.basename(storyPath),
    storyPath,
    story_id: sc.story_id,
    total_required: mustHave.length,
    missing_files: missingFiles,
    tests_invoked: uniqueTestFiles,
    tests_passed: testsOk,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(covJson, JSON.stringify({ summary, findings }, null, 2));
  fs.writeFileSync(covMd, [
    `# AC Coverage Report`,
    `Story: ${summary.story} (ID: ${summary.story_id})`,
    `Required tests: ${summary.total_required}`,
    `Missing files: ${missingFiles.length}`,
    `Tests invoked: ${uniqueTestFiles.length}`,
    `Tests passed: ${testsOk ? 'YES' : 'NO'}`,
    ''
  ].join('\n'));

  if (missingFiles.length || !testsOk) {
    console.error('✗ AC Coverage FAILED');
    process.exit(2);
  }
  console.log('✓ AC Coverage PASSED');
  process.exit(0);
}

if (require.main === module) main();

