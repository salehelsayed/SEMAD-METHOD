#!/usr/bin/env node
/**
 * Normalize QA outputs into standardized locations and names:
 * - Orphans report (.ai/orphans-report.json) → .ai/reports/qa/cleanup-orphans-<ts>.{json,md}
 * - Other known QA JSONs can be mirrored similarly in the future.
 */
const fs = require('fs');
const path = require('path');
const { writeQaReport } = require('./report-utils');

function ts() { return new Date().toISOString().replace(/[:.]/g, '-'); }

function normalizeOrphans(root) {
  const src = path.join(root, '.ai', 'orphans-report.json');
  if (!fs.existsSync(src)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
    const payload = { issues: [], warnings: [] };
    // Expect common keys; if unknown, wrap as a single issue
    if (Array.isArray(raw.orphans)) {
      raw.orphans.forEach(f => payload.issues.push({ file: f.path || f, issue: 'orphaned file' }));
    } else {
      payload.issues.push({ target: 'orphans-report', issue: 'normalized copy', msg: 'See original .ai/orphans-report.json' });
    }
    return writeQaReport('cleanup-orphans', payload, { context: { source: src } });
  } catch (e) {
    console.error('Failed to normalize orphans report:', e.message);
    return null;
  }
}

function main() {
  const root = process.cwd();
  const out1 = normalizeOrphans(root);
  if (out1) console.log('Normalized orphans →', out1.jsonPath);
  else console.log('No orphans report found to normalize.');
}

main();

