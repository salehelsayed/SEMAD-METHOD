#!/usr/bin/env node
/**
 * Minimal dependency reachability report generator.
 * - Scans JS/TS files under typical roots (tools, scripts, bmad-core, src)
 * - Builds a local import graph (require/import/export from)
 * - Seeds entrypoints from:
 *   - tools/workflow-orchestrator.js
 *   - tools/cli.js
 *   - Any file with a node shebang (#!/usr/bin/env node)
 *   - scripts/*.js
 * - Writes .ai/dep-report.json with { unreachable: [relPaths] }
 */
const fs = require('fs');
const path = require('path');

function toPosix(p) { return String(p || '').replace(/\\/g, '/'); }

function collectSourceFiles(rootDir, roots = ['tools', 'scripts', 'bmad-core', 'src']) {
  const files = [];
  for (const r of roots) {
    const abs = path.join(rootDir, r);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const dir = stack.pop();
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const it of ents) {
        if (it.name === 'node_modules' || it.name.startsWith('.')) continue;
        const full = path.join(dir, it.name);
        if (it.isDirectory()) { stack.push(full); continue; }
        if (/\.(js|ts|mjs|cjs|tsx)$/.test(it.name)) files.push(full);
      }
    }
  }
  return files;
}

function tryResolve(fromFile, spec) {
  if (!spec || !spec.startsWith('.')) return null;
  const base = path.dirname(fromFile);
  const cand = path.resolve(base, spec);
  const exts = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
  const candidates = [cand, ...exts.map(e => cand + e), ...exts.map(e => path.join(cand, 'index' + e))];
  for (const p of candidates) {
    try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch {}
  }
  return null;
}

function buildGraph(rootDir, files) {
  const importRegexes = [
    /import\s+[^'";]+\s+from\s+['"]([^'\"]+)['"]/g,
    /import\s*\(\s*['"]([^'\"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'\"]+)['"]\s*\)/g,
    /export\s+\*\s+from\s+['"]([^'\"]+)['"]/g,
    /export\s+\{[^}]*\}\s+from\s+['"]([^'\"]+)['"]/g
  ];
  const graph = new Map(); // rel -> Set(rel)
  const rel = (p) => toPosix(path.relative(rootDir, p));
  for (const full of files) {
    const key = rel(full);
    if (!graph.has(key)) graph.set(key, new Set());
    let text = '';
    try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
    for (const re of importRegexes) {
      let m; const rx = new RegExp(re.source, 'g');
      while ((m = rx.exec(text)) !== null) {
        const spec = m[1];
        const resolved = tryResolve(full, spec);
        if (!resolved) continue;
        const tgt = rel(resolved);
        if (!graph.has(key)) graph.set(key, new Set());
        graph.get(key).add(tgt);
      }
    }
  }
  return graph;
}

function detectEntrypoints(rootDir, files) {
  const rel = (p) => toPosix(path.relative(rootDir, p));
  const set = new Set();
  const candidates = [
    path.join(rootDir, 'tools', 'workflow-orchestrator.js'),
    path.join(rootDir, 'tools', 'cli.js')
  ];
  for (const c of candidates) if (fs.existsSync(c)) set.add(rel(c));
  // scripts/*.js
  const scriptsDir = path.join(rootDir, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    for (const name of fs.readdirSync(scriptsDir)) {
      const full = path.join(scriptsDir, name);
      if (fs.existsSync(full) && fs.statSync(full).isFile() && /\.js$/.test(name)) set.add(rel(full));
    }
  }
  // Shebang files under tools
  for (const full of files) {
    if (!/tools\//.test(rel(full))) continue;
    try {
      const head = fs.readFileSync(full, 'utf8').slice(0, 128);
      if (/^#!\/.+node/.test(head)) set.add(rel(full));
    } catch {}
  }
  return set;
}

function computeReachable(graph, entrypoints) {
  const seen = new Set();
  const stack = [...entrypoints];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    const outs = graph.get(n) || new Set();
    for (const to of outs) if (!seen.has(to)) stack.push(to);
  }
  return seen;
}

function generate(rootDir) {
  const filesAbs = collectSourceFiles(rootDir);
  const filesRel = filesAbs.map(p => toPosix(path.relative(rootDir, p)));
  const graph = buildGraph(rootDir, filesAbs);
  const entrypoints = detectEntrypoints(rootDir, filesAbs);
  const reachable = computeReachable(graph, entrypoints);
  const all = new Set(filesRel);
  const unreachable = [...all].filter(p => !reachable.has(p));
  return { unreachable };
}

function main() {
  const root = process.cwd();
  const outDir = path.join(root, '.ai');
  const outPath = path.join(outDir, 'dep-report.json');
  const rep = generate(root);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rep, null, 2));
  console.log(`Wrote ${outPath} with ${rep.unreachable.length} unreachable file(s).`);
}

if (require.main === module) main();

module.exports = { generate };

