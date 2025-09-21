#!/usr/bin/env node
/**
 * SM: Codebase Inventory
 *
 * Scans the project for existing capabilities so SM stories can reference
 * reusable code and avoid re-implementations. Outputs both a JSON manifest
 * and a concise Markdown summary suitable for embedding in stories.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, '.ai', 'reports', 'sm');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonSafe(p) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return null;
}

function listFiles(dir, exts, ignoreDirs) {
  const out = [];
  function walk(d) {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        const rel = path.relative(ROOT, p);
        if (ignoreDirs.some(x => rel === x || rel.startsWith(x + path.sep))) continue;
        walk(p);
      } else if (e.isFile()) {
        if (!exts || exts.some(ext => p.endsWith(ext))) out.push(p);
      }
    }
  }
  walk(dir);
  return out;
}

function detectFrameworks(pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const has = (k) => deps && Object.prototype.hasOwnProperty.call(deps, k);
  const yes = [];
  const maybe = [];
  if (has('react')) yes.push('react');
  if (has('next')) yes.push('next');
  if (has('vite')) yes.push('vite');
  if (has('redux') || has('@reduxjs/toolkit')) yes.push('redux');
  if (has('express')) yes.push('express');
  if (has('koa')) maybe.push('koa');
  if (has('fastify')) maybe.push('fastify');
  if (has('nestjs')) yes.push('nestjs');
  if (has('typeorm') || has('prisma')) yes.push('orm');
  if (has('jest')) yes.push('jest');
  if (has('vitest')) yes.push('vitest');
  if (has('mocha')) maybe.push('mocha');
  if (has('winston') || has('pino')) yes.push('logging');
  if (has('axios')) yes.push('axios');
  if (has('@tanstack/react-query') || has('react-query')) yes.push('react-query');
  if (has('zod') || has('joi')) yes.push('validation');
  if (has('feature-toggle') || has('unleash-client') || has('launchdarkly-node-client-sdk')) maybe.push('feature-flags');
  return { yes, maybe };
}

function classifyPath(p) {
  // Simple heuristics by directory
  const rel = path.relative(ROOT, p);
  const parts = rel.split(path.sep);
  const dir = parts.slice(0, parts.length - 1).join('/');
  const file = parts[parts.length - 1];
  const f = file.toLowerCase();
  const d = dir.toLowerCase();
  if (/node_modules|\.git|\.ai|dist|build|coverage|\.semad-core|semad-core|bmad-core/.test(rel)) return 'ignored';
  if (/tests?|__tests__|specs?/.test(d) || /\.test\.|\.spec\./.test(f)) return 'tests';
  if (/tools|scripts/.test(d)) return 'tools';
  if (/utils|helpers|common|shared/.test(d)) return 'utils';
  if (/services|api|clients?/.test(d)) return 'services';
  if (/controllers?/.test(d)) return 'controllers';
  if (/components|widgets|ui|views/.test(d)) return 'components';
  if (/hooks/.test(d) || /^use[A-Z].*\.(t|j)sx?$/.test(file)) return 'hooks';
  return 'source';
}

function extractJsTsExports(content) {
  const out = { functions: [], classes: [], constants: [], modules: [] };
  // Functions and classes
  const reExports = [
    /export\s+function\s+(\w+)\s*\(/g,
    /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(?/g,
    /export\s+let\s+(\w+)\s*=\s*/g,
    /export\s+class\s+(\w+)\s*(?:extends|\{)/g,
    /module\.exports\s*=\s*\{([\s\S]*?)\}/g,
    /exports\.(\w+)\s*=\s*/g,
  ];
  for (const re of reExports) {
    let m;
    while ((m = re.exec(content))) {
      if (re === reExports[0]) out.functions.push(m[1]);
      else if (re === reExports[1] || re === reExports[2]) out.constants.push(m[1]);
      else if (re === reExports[3]) out.classes.push(m[1]);
      else if (re === reExports[4]) {
        const block = m[1];
        const names = (block.match(/\b(\w+)\s*:/g) || []).map(s => s.replace(/[:\s]/g, ''));
        out.modules.push(...names);
      } else if (re === reExports[5]) out.modules.push(m[1]);
    }
  }
  // React hooks (useX) declarations
  const hookMatches = content.match(/export\s+(?:const|function)\s+(use[A-Z]\w*)/g) || [];
  for (const h of hookMatches) {
    const name = h.split(/\s+/).pop();
    if (name && !out.functions.includes(name)) out.functions.push(name);
  }
  return out;
}

function analyzeJsTs(files) {
  const summary = [];
  for (const p of files) {
    let content = '';
    try { content = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
    const kind = classifyPath(p);
    const ex = extractJsTsExports(content);
    if (ex.functions.length || ex.classes.length || ex.constants.length || ex.modules.length) {
      summary.push({ path: path.relative(ROOT, p), kind, exports: ex });
    }
  }
  return summary;
}

function analyzePython(files) {
  const summary = [];
  for (const p of files) {
    let content = '';
    try { content = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
    const kind = classifyPath(p);
    const fns = (content.match(/^def\s+(\w+)\s*\(/gm) || []).map(s => s.replace(/^def\s+|\s*\(.*/g, ''));
    const classes = (content.match(/^class\s+(\w+)/gm) || []).map(s => s.replace(/^class\s+|\s*:.*/g, ''));
    if (fns.length || classes.length) {
      summary.push({ path: path.relative(ROOT, p), kind, exports: { functions: fns, classes, constants: [], modules: [] } });
    }
  }
  return summary;
}

function toMarkdown(inv) {
  const lines = [];
  lines.push('# Existing Capabilities (Auto-Scanned)');
  if (inv.pkgName) lines.push(`- Project: ${inv.pkgName}`);
  if (inv.frameworks && (inv.frameworks.yes.length || inv.frameworks.maybe.length)) {
    const yes = inv.frameworks.yes.join(', ');
    const maybe = inv.frameworks.maybe.join(', ');
    lines.push(`- Frameworks: ${yes || 'n/a'}${maybe ? ` (maybe: ${maybe})` : ''}`);
  }
  if (inv.testFrameworks.length) lines.push(`- Test frameworks: ${inv.testFrameworks.join(', ')}`);
  if (inv.scripts.length) lines.push(`- NPM scripts: ${inv.scripts.map(s => s.name).slice(0, 10).join(', ')}${inv.scripts.length > 10 ? '…' : ''}`);
  lines.push('');

  const buckets = {
    utils: [], services: [], controllers: [], components: [], hooks: [], tools: [], tests: [], source: []
  };
  for (const f of inv.jsTs) buckets[f.kind]?.push(f);
  for (const f of inv.python) buckets[f.kind]?.push(f);

  function listBucket(label, arr) {
    if (!arr || arr.length === 0) return;
    lines.push(`## ${label}`);
    const top = arr.slice(0, 50);
    for (const item of top) {
      const xs = [];
      const e = item.exports || {};
      if (e.functions && e.functions.length) xs.push(`fn: ${e.functions.slice(0, 5).join(', ')}`);
      if (e.classes && e.classes.length) xs.push(`class: ${e.classes.slice(0, 5).join(', ')}`);
      if (e.modules && e.modules.length) xs.push(`mod: ${e.modules.slice(0, 5).join(', ')}`);
      lines.push(`- ${item.path}${xs.length ? ` (${xs.join('; ')})` : ''}`);
    }
    if (arr.length > top.length) lines.push(`… and ${arr.length - top.length} more`);
    lines.push('');
  }

  listBucket('Utilities', buckets.utils);
  listBucket('Services / APIs', buckets.services);
  listBucket('Controllers', buckets.controllers);
  listBucket('Components / UI', buckets.components);
  listBucket('Hooks', buckets.hooks);
  listBucket('Tools / Scripts', buckets.tools);
  listBucket('Tests', buckets.tests);

  // Compact summary for general source files
  const srcCount = (buckets.source || []).length;
  if (srcCount) lines.push(`_Additional source files analyzed: ${srcCount}_`);

  // Reuse guidance
  lines.push('');
  lines.push('### Reuse Guidance');
  lines.push('- Prefer listed utilities/services before adding new ones.');
  lines.push('- Align with discovered test frameworks and project scripts.');
  lines.push('- If a similar function/class exists, extend or refactor rather than duplicate.');
  return lines.join('\n');
}

function main() {
  // package.json basics
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = readJsonSafe(pkgPath) || { name: null, scripts: {}, dependencies: {}, devDependencies: {} };
  const frameworks = detectFrameworks(pkg);
  const testFrameworks = ['jest', 'vitest', 'mocha', 'playwright', 'cypress'].filter(k => (pkg.dependencies && pkg.dependencies[k]) || (pkg.devDependencies && pkg.devDependencies[k]));
  const scripts = Object.entries(pkg.scripts || {}).map(([name, cmd]) => ({ name, cmd }));

  // Collect files
  const ignoreDirs = ['node_modules', '.git', '.ai', 'dist', 'build', 'coverage', '.semad-core', 'semad-core', 'bmad-core'];
  const roots = ['src', 'lib', 'app', 'server', 'packages', 'services', 'utils', 'tools'];
  const fileRoots = roots.map(r => path.join(ROOT, r)).filter(fs.existsSync);
  // Always include project root for monorepos/custom layouts
  if (!fileRoots.includes(ROOT)) fileRoots.push(ROOT);

  const jsTs = new Set();
  const py = new Set();
  for (const r of fileRoots) {
    for (const f of listFiles(r, ['.ts', '.tsx', '.js', '.jsx'], ignoreDirs)) jsTs.add(f);
    for (const f of listFiles(r, ['.py'], ignoreDirs)) py.add(f);
  }

  // Analyze
  const jsTsSummary = analyzeJsTs(Array.from(jsTs));
  const pySummary = analyzePython(Array.from(py));

  const inventory = {
    pkgName: pkg.name || null,
    frameworks,
    testFrameworks,
    scripts,
    jsTs: jsTsSummary,
    python: pySummary,
    generatedAt: new Date().toISOString()
  };

  ensureDir(REPORT_DIR);
  const jsonPath = path.join(REPORT_DIR, 'codebase-inventory.json');
  const mdPath = path.join(REPORT_DIR, 'codebase-inventory.md');
  fs.writeFileSync(jsonPath, JSON.stringify(inventory, null, 2), 'utf8');
  const md = toMarkdown(inventory);
  fs.writeFileSync(mdPath, md, 'utf8');

  // Print concise MD to stdout for task runners to pipe into context
  process.stdout.write(md + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('Inventory failed:', e.message);
    process.exit(1);
  }
}

module.exports = {};

