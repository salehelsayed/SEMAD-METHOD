#!/usr/bin/env node

/**
 * Minimal Ad-hoc Task Runner for Dev Agent
 * - Logs start/completion to .ai via track-progress
 * - Optionally runs dependency impact analysis for provided paths
 * - Writes a short Markdown report to .ai/adhoc/
 */

const fs = require('fs');
const path = require('path');
const { analyzeBatchImpact, generateImpactReport, quickRiskAssessment } = require('./dependency-impact-checker');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function logObservation(message) {
  try {
    spawnSync(process.execPath, ['.bmad-core/utils/track-progress.js', 'observation', 'dev', message], { stdio: 'inherit' });
  } catch (_) {
    try {
      spawnSync(process.execPath, ['bmad-core/utils/track-progress.js', 'observation', 'dev', message], { stdio: 'inherit' });
    } catch (e) {
      console.warn('Could not record observation:', e.message);
    }
  }
}

function logKeyfact(message) {
  try {
    spawnSync(process.execPath, ['.bmad-core/utils/track-progress.js', 'keyfact', 'dev', message], { stdio: 'inherit' });
  } catch (_) {
    try {
      spawnSync(process.execPath, ['bmad-core/utils/track-progress.js', 'keyfact', 'dev', message], { stdio: 'inherit' });
    } catch (e) {
      console.warn('Could not record keyfact:', e.message);
    }
  }
}

function parseArgs(argv) {
  const args = { desc: '', paths: [] };
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--desc' || t === '--description') {
      args.desc = tokens[++i] || '';
    } else if (t === '--paths') {
      // Collect until next flag or end
      const paths = [];
      while (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        paths.push(tokens[++i]);
      }
      args.paths.push(...paths);
    } else if (!t.startsWith('--') && !args.desc) {
      // Allow positional description as first non-flag
      args.desc = t;
    }
  }
  return args;
}

function loadCoreConfig() {
  const candidates = [
    path.join(process.cwd(), 'bmad-core', 'core-config.yaml'),
    path.join(process.cwd(), '.bmad-core', 'core-config.yaml'),
    path.join(process.cwd(), 'core-config.yaml')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const cfg = yaml.load(raw) || {};
        return { path: p, config: cfg };
      } catch (e) {
        return { path: p, config: {}, error: e.message };
      }
    }
  }
  return { path: null, config: {} };
}

async function main() {
  const { desc, paths } = parseArgs(process.argv);
  if (!desc) {
    console.log('Usage: adhoc-runner.js --desc "<task description>" [--paths <path1> <path2> ...]');
    process.exit(1);
  }

  ensureDir('.ai/adhoc');
  const startedAt = new Date();
  logObservation(`Ad-hoc task started: ${desc}`);

  // Load baseline context from core-config: devLoadAlwaysFiles
  const core = loadCoreConfig();
  const baselineFiles = Array.isArray(core.config?.devLoadAlwaysFiles) ? core.config.devLoadAlwaysFiles : [];
  const baselineStatus = baselineFiles.map(fp => {
    const abs = path.isAbsolute(fp) ? fp : path.join(process.cwd(), fp);
    try {
      const stat = fs.statSync(abs);
      return { file: fp, exists: true, size: stat.size, mtime: stat.mtime.toISOString() };
    } catch (_) {
      return { file: fp, exists: false };
    }
  });

  let reportPath = null;
  let summary = 'No paths provided; skipped impact analysis.';

  if (paths && paths.length > 0) {
    try {
      const risk = await quickRiskAssessment(paths);
      const impact = await analyzeBatchImpact(paths);
      const report = generateImpactReport(impact, { includeDetails: true, maxDetailsPerFile: 5, format: 'markdown' });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      reportPath = path.join('.ai/adhoc', `adhoc-impact-${ts}.md`);
      fs.writeFileSync(reportPath, report, 'utf8');

      const high = risk.high.length, med = risk.medium.length, low = risk.low.length;
      summary = `Impact analysis completed: high=${high}, medium=${med}, low=${low}, report=${reportPath}`;
      logKeyfact(summary);
    } catch (e) {
      summary = `Impact analysis failed: ${e.message}`;
      console.warn(summary);
      logKeyfact(summary);
    }
  }

  const durationMs = Date.now() - startedAt.getTime();
  logObservation(`Ad-hoc task completed: ${desc} (${Math.round(durationMs / 1000)}s)`);

  // Append baseline context details to report file if created, else print summary
  const baselineSection = ['\n## Baseline Context (devLoadAlwaysFiles)', `- core-config: ${core.path || '(not found)'}`]
    .concat(baselineStatus.map(s => `- ${s.file} → ${s.exists ? `exists (${s.size} bytes, mtime ${s.mtime})` : 'MISSING'}`))
    .join('\n');

  if (reportPath) {
    fs.appendFileSync(reportPath, `\n${baselineSection}\n`, 'utf8');
  }

  console.log('\nAd-hoc task summary');
  console.log('- Description:', desc);
  console.log('- Paths:', paths && paths.length ? paths.join(', ') : '(none)');
  console.log('- Result:', summary);
  console.log('- Baseline files:', baselineFiles.length);
  if (reportPath) console.log('- Report:', reportPath);
}

main().catch(err => {
  console.error('Ad-hoc runner error:', err);
  process.exit(1);
});
