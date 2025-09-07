#!/usr/bin/env node
/*
 * Dev Guard: lightweight impact + cleanup + report runner
 * - Impact scan: dependency-cruiser JSON into .ai/reports/impact-map.json
 * - Cleanup: run knip (if available) to detect unused exports/files
 * - Report: aggregates results into .ai/reports/dev-guard-summary.json
 *
 * Usage examples:
 *   node tools/dev-guard.js --impact-scan --cleanup --report
 *   node tools/dev-guard.js --impact-scan --paths tools scripts semad-core
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
  const teamStoryIdx = args.indexOf('--team-story');
  const teamStoryPath = teamStoryIdx >= 0 ? args[teamStoryIdx + 1] : null;
  const checkFilesIdx = args.indexOf('--check-files');
  const checkFilesCsv = checkFilesIdx >= 0 ? args[checkFilesIdx + 1] : null;
  const wantScopeCheck = !!teamStoryPath;
  const pathsIdx = args.indexOf('--paths');
  const customPaths = pathsIdx >= 0 ? args.slice(pathsIdx + 1).filter((x) => !x.startsWith('--')) : [];
  const scanPaths = customPaths.length ? customPaths : ['tools', 'scripts', 'semad-core'];

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

  // Optional: Scope guard against team story file list
  if (wantScopeCheck && teamStoryPath) {
    try {
      const abs = path.isAbsolute(teamStoryPath) ? teamStoryPath : path.join(process.cwd(), teamStoryPath);
      const txt = fs.readFileSync(abs, 'utf-8');
      const m = txt.match(/^---\n([\s\S]*?)\n---\n?/);
      const body = txt.slice(m ? m[0].length : 0);
      const allowed = new Set((() => {
        // Reuse Files to Modify block in team story
        const lines = body.split(/\r?\n/);
        const out = [];
        let inSec = false;
        for (const line of lines) {
          if (/^###\s+Files\s+to\s+Modify/i.test(line)) { inSec = true; continue; }
          if (inSec && /^##\s+/.test(line)) break;
          if (inSec) {
            const m1 = line.match(/^\s*-\s+`?([^`:\n]+)`?\s*:/);
            const m2 = line.match(/^\s*-\s+`?([^`\n]+)`?\s*$/);
            const p = m1 ? m1[1].trim() : (m2 ? m2[1].trim() : null);
            if (p) out.push(p);
          }
        }
        return out;
      })());

      let checkList = [];
      if (checkFilesCsv) {
        checkList = checkFilesCsv.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (checkList.length) {
        const outside = checkList.filter(p => !allowed.has(p));
        if (outside.length) {
          console.warn('[dev-guard] Scope warning: files outside team story scope:', outside.join(', '));
          results.scopeGuard = { ok: false, outside };
        } else {
          results.scopeGuard = { ok: true };
        }
      } else {
        results.scopeGuard = { ok: null, note: 'No --check-files provided' };
      }
    } catch (e) {
      results.scopeGuard = { ok: null, error: e.message };
    }
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
