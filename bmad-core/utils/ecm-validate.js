#!/usr/bin/env node
/*
  ECM Validator (bundled in bmad-core)
  - Validates ECM table inside an EpicContract markdown file.
  - Checks coverage for REQ-* and INT-* declared in frontmatter.
  - Emits errors for missing coverage and invalid rows; warnings for soft issues.

  Usage:
    node .semad-core/utils/ecm-validate.js <path-to-epic.md>
*/

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error('ERROR: Cannot read file:', filePath);
    process.exit(1);
  }
}

function parseFrontmatter(md) {
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return { data: {}, body: md };
  let data = {};
  try {
    data = yaml.load(fmMatch[1]) || {};
  } catch (e) {
    console.error('ERROR: Failed to parse frontmatter YAML:', e.message);
    process.exit(1);
  }
  return { data, body: md.slice(fmMatch[0].length) };
}

function findEcmSection(body) {
  const lines = body.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    if (line.startsWith('## ') && line.includes('epic coverage matrix')) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;
  const table = [];
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s/.test(l)) break; // stop at next section
    table.push(l);
  }
  return table.join('\n');
}

function parseMarkdownTable(tableMd) {
  if (!tableMd) return { headers: [], rows: [] };
  const lines = tableMd.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return { headers: [], rows: [] };
  const headerLine = lines[0];
  const headers = headerLine.split('|').slice(1, -1).map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let i = 2; i < lines.length; i++) { // skip separator row index 1
    const parts = lines[i].split('|').slice(1, -1).map((c) => c.trim());
    if (parts.length !== headers.length) continue;
    rows.push(parts);
  }
  return { headers, rows };
}

function asSet(arr) { return new Set((arr || []).filter(Boolean)); }

function extractEpicIds(front) {
  const reqIds = asSet((front.requirements || []).map((r) => r.id).filter(Boolean));
  const intIds = asSet((front.integrationPoints || []).map((p) => p.id).filter(Boolean));
  return { reqIds, intIds };
}

function splitIds(cell) {
  if (!cell) return [];
  return cell.replace(/[\[\]]/g, '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

function validate(filePath) {
  const md = readFile(filePath);
  const { data: front, body } = parseFrontmatter(md);
  const ecmSection = findEcmSection(body);
  const { headers, rows } = parseMarkdownTable(ecmSection);
  const headerIndex = Object.fromEntries(headers.map((h, i) => [h, i]));

  const errors = [];
  const warnings = [];

  if (!headers.length || !('ecm id' in headerIndex)) {
    errors.push('ECM table not found or missing headers (expecting at least "ECM ID").');
  }

  const { reqIds: epicReqs, intIds: epicInts } = extractEpicIds(front);
  const coveredReqs = new Set();
  const coveredInts = new Set();
  const validDelta = new Set(['existing', 'extend', 'new']);

  rows.forEach((cells, idx) => {
    const get = (name) => cells[headerIndex[name]] || '';
    const rowNum = idx + 1;
    const ecmId = get('ecm id');
    if (!/^ECM-[A-Za-z0-9_-]+$/.test(ecmId)) {
      errors.push('Row ' + rowNum + ': Invalid or missing ECM ID (got "' + ecmId + '").');
    }
    const delta = (get('delta') || '').toLowerCase();
    if (delta && !validDelta.has(delta)) {
      errors.push('Row ' + rowNum + ': Invalid Delta value "' + delta + '" (expected existing|extend|new).');
    }
    const reqs = splitIds(get('req ids'));
    const ints = splitIds(get('int ids'));
    reqs.forEach((r) => { if (!epicReqs.has(r)) warnings.push('Row ' + rowNum + ': REQ ID "' + r + '" not found in epic frontmatter.'); if (epicReqs.has(r)) coveredReqs.add(r); });
    ints.forEach((p) => { if (!epicInts.has(p)) warnings.push('Row ' + rowNum + ': INT ID "' + p + '" not found in epic frontmatter.'); if (epicInts.has(p)) coveredInts.add(p); });
    const sourceRef = (get('sourceref') || '').trim();
    if (delta && delta !== 'new' && !sourceRef) {
      warnings.push('Row ' + rowNum + ': Delta is "' + delta + '" but SourceRef is empty.');
    }
  });

  const missingReqs = [...epicReqs].filter((r) => !coveredReqs.has(r));
  const missingInts = [...epicInts].filter((p) => !coveredInts.has(p));
  if (missingReqs.length) errors.push('Missing REQ coverage: ' + missingReqs.join(', '));
  if (missingInts.length) errors.push('Missing INT coverage: ' + missingInts.join(', '));

  console.log('ECM Validation Report: ' + path.basename(filePath));
  console.log('----------------------------------------');
  if (errors.length) { console.log('Errors:'); errors.forEach((e) => console.log('- ' + e)); } else { console.log('Errors: none'); }
  if (warnings.length) { console.log('Warnings:'); warnings.forEach((w) => console.log('- ' + w)); } else { console.log('Warnings: none'); }

  if (errors.length) process.exit(1);
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node .semad-core/utils/ecm-validate.js <path-to-epic.md>');
    process.exit(1);
  }
  validate(file);
}

if (require.main === module) {
  main();
}

