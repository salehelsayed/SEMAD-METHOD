#!/usr/bin/env node
/*
 * Dev Guard: lightweight impact + cleanup + report runner
 * - Impact scan: dependency-cruiser JSON into .ai/reports/impact-map.json
 * - Cleanup: run knip (if available) to detect unused exports/files
 * - Report: aggregates results into .ai/reports/dev-guard-summary.json
 *
 * Usage examples:
 *   node tools/dev-guard.js --impact-scan --cleanup --report
 *   node tools/dev-guard.js --impact-scan --paths tools scripts bmad-core
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJSON(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function readJSONSafe(filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(text);
    }
  } catch (_) {}
  return fallback;
}

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf-8', ...options });
  return { code: res.status ?? res.code ?? 0, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function hasNpx() {
  const r = run('bash', ['-lc', 'command -v npx >/dev/null 2>&1; echo $?']);
  return r.stdout.trim() === '0';
}

function runDepCruiser(paths) {
  const outFile = path.join('.ai', 'reports', 'impact-map.json');
  const args = [
    'dependency-cruiser',
    '-c', '.dependency-cruiser.js',
    '--ts-pre-compilation-deps=false',
    '--output-type', 'json',
    ...paths,
  ];
  if (!hasNpx()) {
    return { ok: false, reason: 'npx-not-found', outFile };
  }
  const res = run('npx', args);
  if (res.code === 0 && res.stdout) {
    try {
      const json = JSON.parse(res.stdout);
      writeJSON(outFile, json);
      return { ok: true, outFile };
    } catch (e) {
      return { ok: false, reason: 'invalid-json', error: e.message, outFile };
    }
  }
  return { ok: false, reason: 'exec-failed', stderr: res.stderr, code: res.code, outFile };
}

function runKnip() {
  const outFile = path.join('.ai', 'reports', 'cleanup-report.json');
  if (!hasNpx()) return { ok: false, reason: 'npx-not-found', outFile };
  const res = run('npx', ['knip', '--reporter', 'json']);
  if (res.code === 0 && res.stdout) {
    try {
      const json = JSON.parse(res.stdout);
      writeJSON(outFile, json);
      return { ok: true, outFile };
    } catch (e) {
      return { ok: false, reason: 'invalid-json', error: e.message, outFile };
    }
  }
  // knip sometimes returns non-zero but prints JSON; try parse regardless
  try {
    if (res.stdout) {
      const json = JSON.parse(res.stdout);
      writeJSON(outFile, json);
      return { ok: true, outFile, code: res.code };
    }
  } catch (_) {}
  return { ok: false, reason: 'exec-failed', stderr: res.stderr, code: res.code, outFile };
}

function summarizeKnip(json) {
  if (!json) return { unusedFiles: 0, unusedDependencies: 0, issues: 0 };
  const files = Array.isArray(json.files) ? json.files.length : 0;
  const deps = Array.isArray(json.dependencies) ? json.dependencies.length : 0;
  const issues = Array.isArray(json.issues) ? json.issues.length : 0;
  return { unusedFiles: files, unusedDependencies: deps, issues };
}

function main() {
  const args = process.argv.slice(2);
  const wantImpact = args.includes('--impact-scan');
  const wantCleanup = args.includes('--cleanup');
  const wantReport = args.includes('--report');
  const pathsIdx = args.indexOf('--paths');
  const customPaths = pathsIdx >= 0 ? args.slice(pathsIdx + 1).filter((x) => !x.startsWith('--')) : [];
  const scanPaths = customPaths.length ? customPaths : ['tools', 'scripts', 'bmad-core'];

  ensureDir(path.join('.ai', 'reports'));

  const results = { startedAt: new Date().toISOString(), scanPaths };

  if (wantImpact) {
    const r = runDepCruiser(scanPaths);
    results.impact = r;
  }

  if (wantCleanup) {
    const r = runKnip();
    results.cleanup = r;
  }

  if (wantReport) {
    const impact = readJSONSafe(path.join('.ai', 'reports', 'impact-map.json'));
    const cleanup = readJSONSafe(path.join('.ai', 'reports', 'cleanup-report.json'));
    const summary = {
      paths: scanPaths,
      impact: impact ? {
        modules: Array.isArray(impact.modules) ? impact.modules.length : null,
        summary: impact.summary || null,
      } : null,
      cleanup: summarizeKnip(cleanup),
    };
    writeJSON(path.join('.ai', 'reports', 'dev-guard-summary.json'), summary);
    results.summary = { outFile: path.join('.ai', 'reports', 'dev-guard-summary.json') };
  }

  results.finishedAt = new Date().toISOString();
  writeJSON(path.join('.ai', 'reports', 'dev-guard-run.json'), results);

  const failures = [results.impact, results.cleanup].filter(
    (r) => r && r.ok === false && r.reason !== 'npx-not-found'
  );
  if (failures.length) {
    console.error('[dev-guard] Some steps failed:', failures.map((f) => f.reason || f.code).join(', '));
    process.exitCode = 1;
  } else {
    console.log('[dev-guard] Completed. See .ai/reports for outputs.');
  }
}

main();

