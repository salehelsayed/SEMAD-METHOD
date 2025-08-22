#!/usr/bin/env node
/*
  Minimal structural validator for reverse-align MVP outputs.
  - Validates the presence and basic shape of:
    .ai/documentation-manifest.json
    .ai/reports/alignment-report.json
    .ai/reports/docs-code-alignment.json
  - Avoids external deps; uses simple checks for required keys/types.
*/
const fs = require('fs');
const path = require('path');

function readJSON(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { throw new Error(`Invalid JSON in ${p}: ${e.message}`); }
}

function assertType(val, type, ctx) {
  const ok = (type === 'array') ? Array.isArray(val) : typeof val === type;
  if (!ok) throw new Error(`Expected ${ctx} to be ${type}`);
}

function validateManifest(root) {
  const p = path.join(root, '.ai', 'documentation-manifest.json');
  const j = readJSON(p);
  // required top-level keys
  ['generatedAt', 'coreDocs', 'features', 'evidence', 'toolsDetected', 'repo'].forEach(k => {
    if (!(k in j)) throw new Error(`Manifest missing key: ${k}`);
  });
  assertType(j.generatedAt, 'string', 'manifest.generatedAt');
  assertType(j.coreDocs, 'object', 'manifest.coreDocs');
  assertType(j.features, 'array', 'manifest.features');
  // spot check first feature shape if present
  if (j.features.length) {
    const f = j.features[0];
    ['key', 'name', 'present'].forEach(k => { if (!(k in f)) throw new Error(`feature missing ${k}`); });
  }
  return true;
}

function validateAlignmentReport(root) {
  const p = path.join(root, '.ai', 'reports', 'alignment-report.json');
  const j = readJSON(p);
  if (!('docsCoverage' in j)) throw new Error('alignment-report missing docsCoverage');
  const c = j.docsCoverage;
  ['totalFeatures', 'mentioned', 'perDoc'].forEach(k => { if (!(k in c)) throw new Error(`docsCoverage missing ${k}`); });
  assertType(c.totalFeatures, 'number', 'docsCoverage.totalFeatures');
  assertType(c.mentioned, 'number', 'docsCoverage.mentioned');
  assertType(c.perDoc, 'object', 'docsCoverage.perDoc');
  return true;
}

function validateDocsCodeAlignment(root) {
  const p = path.join(root, '.ai', 'reports', 'docs-code-alignment.json');
  const j = readJSON(p);
  ['totalFeatures', 'mentioned', 'perDoc'].forEach(k => { if (!(k in j)) throw new Error(`docs-code-alignment missing ${k}`); });
  assertType(j.totalFeatures, 'number', 'docs-code-alignment.totalFeatures');
  assertType(j.mentioned, 'number', 'docs-code-alignment.mentioned');
  assertType(j.perDoc, 'object', 'docs-code-alignment.perDoc');
  return true;
}

function main() {
  const root = process.cwd();
  const results = [];
  try { validateManifest(root); results.push('manifest: OK'); }
  catch (e) { results.push('manifest: FAIL'); console.error(e.message); process.exitCode = 3; }
  try { validateAlignmentReport(root); results.push('alignment-report: OK'); }
  catch (e) { results.push('alignment-report: FAIL'); console.error(e.message); process.exitCode = 3; }
  try { validateDocsCodeAlignment(root); results.push('docs-code-alignment: OK'); }
  catch (e) { results.push('docs-code-alignment: FAIL'); console.error(e.message); process.exitCode = 3; }

  // Optional checks: generated shards
  try {
    const gArch = path.join(root, 'docs', 'architecture.generated', 'architecture.generated.md');
    const gPrd = path.join(root, 'docs', 'prd.generated', 'PRD.generated.md');
    if (fs.existsSync(gArch)) {
      const t = fs.readFileSync(gArch, 'utf8');
      if (!/BEGIN GENERATED: ARCHITECTURE/.test(t) || !/END GENERATED/.test(t)) throw new Error('architecture.generated missing markers');
      results.push('g-arch: OK');
    } else {
      results.push('g-arch: SKIP');
    }
    if (fs.existsSync(gPrd)) {
      const t = fs.readFileSync(gPrd, 'utf8');
      if (!/BEGIN GENERATED: PRD/.test(t) || !/END GENERATED/.test(t)) throw new Error('PRD.generated missing markers');
      results.push('g-prd: OK');
    } else {
      results.push('g-prd: SKIP');
    }
  } catch (e) { results.push('generated-shards: FAIL'); console.error(e.message); process.exitCode = 3; }

  // Optional: simple gate output
  try {
    const gate = path.join(root, '.ai', 'reports', 'simple-quality-gate.json');
    if (fs.existsSync(gate)) {
      const j = readJSON(gate);
      if (!('pass' in j) || !('checks' in j)) throw new Error('simple-quality-gate missing fields');
      if (j.missingCritical && !Array.isArray(j.missingCritical)) throw new Error('simple-quality-gate.missingCritical must be an array');
      results.push('simple-quality-gate: OK');
    } else {
      results.push('simple-quality-gate: SKIP');
    }
  } catch (e) { results.push('simple-quality-gate: FAIL'); console.error(e.message); process.exitCode = 3; }

  console.log(results.join('\n'));
  if (process.exitCode && process.exitCode !== 0) {
    console.error('Golden validation failed.');
    process.exit(process.exitCode);
  }
}

if (require.main === module) main();
