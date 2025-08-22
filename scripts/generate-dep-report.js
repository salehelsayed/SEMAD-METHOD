#!/usr/bin/env node
/*
  Generate .ai/dep-report.json from dependency-cruiser output.
  - Executes: npx dependency-cruiser -c .dependency-cruiser.js --output-type json <roots>
  - Roots default to: tools scripts bmad-core docs common
  - Produces a minimal report with entrypoints, unreachable (orphans), cycles, and forbidden edges.
*/
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCruise(roots) {
  const cmd = `npx --yes dependency-cruiser -c .dependency-cruiser.js --ts-pre-compilation-deps=false --output-type json ${roots.join(' ')}`;
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

function buildReport(json) {
  const modules = Array.isArray(json.modules) ? json.modules : [];
  // Build reverse edges to identify roots (entrypoints)
  const incoming = new Map();
  const bySource = new Map();
  for (const m of modules) {
    bySource.set(m.source, m);
    if (!incoming.has(m.source)) incoming.set(m.source, 0);
    const deps = Array.isArray(m.dependencies) ? m.dependencies : [];
    for (const d of deps) {
      const to = d.resolved || d.module || d.to || d.couldNotResolve || d;
      if (typeof to === 'string') {
        incoming.set(to, (incoming.get(to) || 0) + 1);
      }
    }
  }
  const entrypoints = modules
    .filter(m => (incoming.get(m.source) || 0) === 0)
    .map(m => m.source)
    .filter(p => /^(tools|scripts|bmad-core|docs|common)\//.test(p));

  // Unreachable (orphans) — modules with no dependents and not referenced (heuristic)
  const unreachable = modules
    .filter(m => (incoming.get(m.source) || 0) === 0 && !(entrypoints.includes(m.source)))
    .map(m => m.source);

  // Violations
  const violations = Array.isArray(json.summary?.violations) ? json.summary.violations : [];
  const cycles = [];
  const forbidden = [];
  for (const v of violations) {
    const name = v.rule?.name || v.name || '';
    if (/circular/i.test(name) && Array.isArray(v.cycle) && v.cycle.length) {
      cycles.push(v.cycle.map(c => c.from || c.to || c).filter(Boolean));
    } else if (name) {
      const from = v.from?.resolved || v.from?.source || v.from?.path || v.from;
      const to = v.to?.resolved || v.to?.source || v.to?.path || v.to;
      if (from && to) forbidden.push({ rule: name, from, to });
    }
  }

  return { entrypoints, unreachable, cycles, forbidden };
}

function main() {
  const roots = process.argv.slice(2).filter(Boolean);
  const defaultRoots = ['tools', 'scripts', 'bmad-core', 'docs', 'common'];
  const cruise = runCruise(roots.length ? roots : defaultRoots);
  const report = buildReport(cruise);
  const outDir = path.join(process.cwd(), '.ai');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'dep-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Dependency report written to ${outPath}`);
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error('Failed to generate dep report:', e.message); process.exit(1); }
}

