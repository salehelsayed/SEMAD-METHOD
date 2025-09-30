#!/usr/bin/env node
/**
 * Lints for YAML StoryContract blocks in story frontmatter and flags them for removal.
 * Pointer-first XML is the required format. YAML-only or dual-presence is flagged.
 *
 * Usage:
 *   node scripts/lint-yaml-storycontracts.js [--warn-only]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function findStoryFiles(root) {
  const dir = path.join(root, 'docs', 'stories');
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && p.endsWith('.md')) out.push(p);
    }
  }
  walk(dir);
  return out;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  try { return yaml.load(m[1]) || {}; } catch { return {}; }
}

function loadCoreConfig(root) {
  const candidates = [
    path.join(root, 'bmad-core', 'core-config.yaml'),
    path.join(root, '.semad-core', 'core-config.yaml')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return yaml.load(fs.readFileSync(p, 'utf8')) || {}; } catch { return {}; }
    }
  }
  return {};
}

function main() {
  const args = process.argv.slice(2);
  const warnOnly = args.includes('--warn-only');
  const root = process.cwd();
  const cfg = loadCoreConfig(root);
  const format = String(cfg?.storyContract?.format || 'xml').toLowerCase();
  const files = findStoryFiles(root);

  const violations = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    const fm = parseFrontmatter(txt);
    const hasYaml = fm && typeof fm === 'object' && Object.prototype.hasOwnProperty.call(fm, 'StoryContract');
    const xmlKey = fm ? Object.keys(fm).find(k => /^StoryContractXml$/i.test(k)) : null;
    const hasXml = !!(xmlKey && fm[xmlKey]);

    // Violation rules
    // - In xml mode: any YAML presence is a violation
    // - In both mode: dual presence is a violation (prefer pointer-only)
    if (format === 'xml') {
      if (hasYaml) violations.push({ file: f, reason: 'YAML contract found in XML-only mode' });
    } else {
      if (hasYaml && hasXml) violations.push({ file: f, reason: 'Both YAML and XML present; remove YAML' });
    }
  }

  if (violations.length) {
    console.error('YAML StoryContract lint violations:');
    for (const v of violations) console.error(` - ${path.relative(root, v.file)}: ${v.reason}`);
    if (!warnOnly) process.exit(2);
  } else {
    console.log('No YAML StoryContract violations found.');
  }
}

if (require.main === module) main();

