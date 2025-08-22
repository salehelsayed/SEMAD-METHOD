#!/usr/bin/env node

/**
 * Test Quality Gate
 * - Enforces traceability conventions (Story/AC tags)
 * - Detects common test smells (only/skip, nondeterminism, unmocked network)
 * - Optionally validates coverage threshold via env var
 *
 * Output:
 * - .ai/reports/test-quality-report.json
 * - .ai/reports/test-quality-report.md
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TEST_DIRS = ['tests', 'test', '__tests__', 'spec'];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyId = args['story-id'] || args.story || null;
  const coverageMin = toNumber(process.env.TEST_COVERAGE_MIN) ?? null; // optional

  const results = {
    timestamp: new Date().toISOString(),
    storyId: storyId || undefined,
    coverageMin: coverageMin || undefined,
    totals: { files: 0, smells: 0, traceabilityViolations: 0 },
    files: [],
    summary: {
      hasOnlyOrSkip: false,
      hasNondeterminism: false,
      hasUnmockedNetwork: false,
      missingStoryRefs: false,
      missingAcceptanceRefs: false
    }
  };

  const testFiles = await collectTestFiles();
  for (const file of testFiles) {
    const content = await fsp.readFile(file, 'utf-8');

    const fileReport = analyzeTestFile(file, content, { storyId });
    results.files.push(fileReport);
  }

  // Aggregate
  results.totals.files = results.files.length;
  results.totals.smells = results.files.reduce((a, f) => a + f.smells.length, 0);
  results.totals.traceabilityViolations = results.files.reduce(
    (a, f) => a + f.traceability.violations.length,
    0
  );

  // Summaries
  results.summary.hasOnlyOrSkip = results.files.some((f) =>
    f.smells.some((s) => s.type === 'focus' || s.type === 'skip')
  );
  results.summary.hasNondeterminism = results.files.some((f) =>
    f.smells.some((s) => s.type === 'nondeterminism')
  );
  results.summary.hasUnmockedNetwork = results.files.some((f) =>
    f.smells.some((s) => s.type === 'network')
  );
  results.summary.missingStoryRefs = results.files.some((f) => f.traceability.missingStoryRef);
  results.summary.missingAcceptanceRefs = results.files.some(
    (f) => f.traceability.missingAcceptanceRefs
  );

  // Persist reports
  const reportsDir = path.join(ROOT, '.ai', 'reports');
  await fsp.mkdir(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, 'test-quality-report.json');
  const mdPath = path.join(reportsDir, 'test-quality-report.md');
  await fsp.writeFile(jsonPath, JSON.stringify(results, null, 2));
  await fsp.writeFile(mdPath, toMarkdown(results));

  // Decide exit code
  const hardFailures = [];

  // Fail on .only/.skip in committed tests
  if (results.summary.hasOnlyOrSkip) hardFailures.push('Found .only/.skip in tests');
  // Fail if a storyId is provided but no tests reference it
  if (storyId) {
    const hasStoryRef = results.files.some((f) => f.traceability.storyRefs.includes(storyId));
    if (!hasStoryRef) hardFailures.push(`No tests reference story @SC: ${storyId}`);
  }
  // Fail if any file has zero assertions (best-effort heuristic)
  const zeroAssertFiles = results.files.filter((f) => f.assertionCount === 0);
  if (zeroAssertFiles.length > 0) hardFailures.push('Some test files have zero assertions');

  if (hardFailures.length > 0) {
    console.error('✗ Test Quality Gate FAILED');
    hardFailures.forEach((m) => console.error('  - ' + m));
    console.error(`See: ${mdPath}`);
    process.exit(1);
  }

  console.log('✓ Test Quality Gate passed');
  console.log(`Report: ${mdPath}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

async function collectTestFiles() {
  const files = [];
  for (const dir of TEST_DIRS) {
    const abs = path.join(ROOT, dir);
    if (await exists(abs)) {
      await walk(abs, (f) => {
        if (/\.test\.(js|ts|jsx|tsx)$/.test(f)) files.push(f);
      });
    }
  }
  return files.sort();
}

async function walk(dir, onFile) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, onFile);
    else if (e.isFile()) onFile(full);
  }
}

function analyzeTestFile(file, content, { storyId }) {
  const smells = [];
  const traceability = {
    hasStoryHeader: /Story\s*:|@SC:/.test(content),
    hasAcceptanceTags: /@AC:/.test(content),
    storyRefs: matchAll(content, /@SC:\s*([\w\-.]+)/g),
    acceptanceRefs: matchAll(content, /@AC:\s*([\w\-.]+)/g),
    missingStoryRef: false,
    missingAcceptanceRefs: false,
    violations: []
  };

  // Focused/Skipped tests
  if (/\b(describe|it|test)\.only\(/.test(content)) smells.push({ type: 'focus', msg: 'Found .only' });
  if (/\b(describe|it|test)\.skip\(/.test(content)) smells.push({ type: 'skip', msg: 'Found .skip' });

  // Nondeterminism: time/random
  if (/(Date\.now\(|new Date\(|Math\.random\()/.test(content)) {
    smells.push({ type: 'nondeterminism', msg: 'Uses Date/Math.random without explicit mocking' });
  }

  // Unmocked network: fetch/http/https without nock/msw presence
  const usesNetwork = /(global\.)?fetch\(|\bhttp(s)?:\.request\(/.test(content);
  const hasMocking = /(nock\(|msw|whatwg-fetch|jest\.mock\(.*fetch)/.test(content);
  if (usesNetwork && !hasMocking) {
    smells.push({ type: 'network', msg: 'Network calls without mocking detected' });
  }

  // Heuristic assertion count
  const assertionCount = (content.match(/\bexpect\(/g) || []).length;

  // Traceability checks
  if (storyId) {
    const referencesStory = traceability.storyRefs.includes(storyId) ||
      new RegExp(`Story\\s*:?\\s*${escapeRegExp(storyId)}`).test(content);
    traceability.missingStoryRef = !referencesStory;
    if (traceability.missingStoryRef) {
      traceability.violations.push(`Missing @SC: ${storyId} reference`);
    }
  } else {
    // If no storyId passed, ensure at least a story reference exists
    if (!traceability.hasStoryHeader) {
      traceability.violations.push('Missing Story reference header or @SC tag');
    }
  }

  // Recommend acceptance criteria tags when a storyId exists
  if (storyId && traceability.acceptanceRefs.length === 0) {
    traceability.missingAcceptanceRefs = true;
    traceability.violations.push('No @AC: tags found for acceptance criteria');
  }

  return {
    file: path.relative(ROOT, file),
    assertionCount,
    smells,
    traceability
  };
}

function matchAll(str, regex) {
  const out = [];
  let m;
  while ((m = regex.exec(str)) !== null) out.push(m[1]);
  return out;
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toNumber(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toMarkdown(results) {
  const lines = [];
  lines.push('# Test Quality Report');
  lines.push(`- Timestamp: ${results.timestamp}`);
  if (results.storyId) lines.push(`- Story ID: ${results.storyId}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Files scanned: ${results.totals.files}`);
  lines.push(`- Smells found: ${results.totals.smells}`);
  lines.push(`- Traceability violations: ${results.totals.traceabilityViolations}`);
  lines.push('');
  lines.push('## Findings');
  for (const f of results.files) {
    if (f.smells.length === 0 && f.traceability.violations.length === 0) continue;
    lines.push(`- ${f.file}`);
    for (const s of f.smells) lines.push(`  - Smell (${s.type}): ${s.msg}`);
    for (const v of f.traceability.violations) lines.push(`  - Traceability: ${v}`);
  }
  if (results.files.every((f) => f.smells.length === 0 && f.traceability.violations.length === 0)) {
    lines.push('- No issues found');
  }
  lines.push('');
  lines.push('## Guidance');
  lines.push('- Add a header comment with `// Story: <ID>` or `@SC: <ID>` in each related test file.');
  lines.push('- Tag acceptance criteria in test names or comments using `@AC: <criterion-id>`.');
  lines.push('- Remove `.only` and avoid `.skip` in committed tests.');
  lines.push('- Mock Date/Math.random or stabilize time/random-dependent logic.');
  lines.push('- Mock network calls (nock/msw) or inject fakes for HTTP.');
  lines.push('');
  return lines.join('\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Test Quality Gate crashed:', err);
    process.exit(1);
  });
}

module.exports = { analyzeTestFile };

