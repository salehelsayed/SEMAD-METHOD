const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

// Extractor version for cache invalidation
const EXTRACTOR_VERSION = '1.0.0';

// Load suppress patterns from .ai/extractor-suppress.json or .jsonc
function loadSuppress(rootDir) {
  const p1 = path.join(rootDir, '.ai', 'extractor-suppress.json');
  const p2 = path.join(rootDir, '.ai', 'extractor-suppress.jsonc');
  try {
    if (fs.existsSync(p1)) return JSON.parse(fs.readFileSync(p1, 'utf8')) || [];
  } catch (_) {}
  try {
    if (fs.existsSync(p2)) {
      const raw = fs.readFileSync(p2, 'utf8');
      // naive strip // comments
      const stripped = raw.replace(/(^|\n)\s*\/\/.*$/g, '');
      return JSON.parse(stripped) || [];
    }
  } catch (_) {}
  return [];
}

function fileHash(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

// Helper: stable ID based on primary source path + optional symbol
function makeId(sourcePath, symbol) {
  const norm = String(sourcePath || '').replace(/\\/g, '/');
  return symbol ? `${norm}#${symbol}` : norm;
}

function nowIso() {
  return new Date().toISOString();
}

function toPosix(p) { return String(p || '').replace(/\\/g, '/'); }

// Extract CLI commands from workflow-orchestrator.js (.command('name'))
function extractCLI(rootDir) {
  const cliFile = path.join(rootDir, 'tools', 'workflow-orchestrator.js');
  const entities = [];
  const relations = [];
  if (!fs.existsSync(cliFile)) return { entities, relations };
  const text = fs.readFileSync(cliFile, 'utf8');
  const re = /\.command\(['"]([^'"\)]+)['"]\)/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const src = 'tools/workflow-orchestrator.js';
    const upTo = text.slice(0, m.index);
    const line = upTo.split(/\r?\n/).length;
    // Attempt to capture option flags declared within this command block
    let flags = [];
    try {
      const nextIdx = text.slice(m.index + m[0].length).search(/\n\s*program\n\s*\.command\(/);
      const endIdx = nextIdx >= 0 ? m.index + m[0].length + nextIdx : text.length;
      const block = text.slice(m.index, endIdx);
      flags = Array.from(block.matchAll(/\.option\(\s*['"][^'"]*--([a-zA-Z0-9-:]+)[^'"]*['"]/g)).map(mm => `flag:--${mm[1]}`);
    } catch (_) {}
    entities.push({
      id: makeId(src, `cli:${name}`),
      type: 'cli',
      name,
      description: `CLI command ${name}`,
      sourcePaths: [src],
      symbols: Array.from(new Set([`command:${name}`].concat(flags))),
      relations: [],
      tests: [],
      labels: [],
      lifecycle: 'active',
      confidence: 0.9,
      evidence: [{ file: src, line, extractor: 'cli', timestamp: nowIso() }],
      lastSeen: nowIso(),
      storyLinks: []
    });
  }
  return { entities, relations };
}

// Extract CI jobs from GitHub workflows
function extractCI(rootDir) {
  const dir = path.join(rootDir, '.github', 'workflows');
  const entities = [];
  const relations = [];
  if (!fs.existsSync(dir)) return { entities, relations };
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const f of files) {
    const rel = path.join('.github/workflows', f);
    try {
      const obj = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8')) || {};
      // Gather triggers from 'on'
      const triggers = [];
      try {
        const on = obj.on || obj['on'];
        if (Array.isArray(on)) triggers.push(...on.map(String));
        else if (on && typeof on === 'object') triggers.push(...Object.keys(on).map(String));
      } catch (_) {}
      const jobs = obj.jobs || {};
      Object.keys(jobs).forEach(jobName => {
        entities.push({
          id: makeId(rel, `job:${jobName}`),
          type: 'ci_job',
          name: jobName,
          description: `CI job ${jobName} from ${f}`,
          sourcePaths: [rel],
          symbols: [`job:${jobName}`],
          relations: [],
          tests: [],
          labels: (triggers && triggers.length ? triggers.map(t => `trigger:${t}`) : []),
          lifecycle: 'active',
          confidence: 1.0,
          evidence: [{ file: rel, line: null, extractor: 'ci', timestamp: nowIso() }],
          lastSeen: nowIso(),
          storyLinks: []
        });
      });
    } catch (_) {}
  }
  return { entities, relations };
}

// Extract env/config keys from .env* files and orchestrator-config
function extractEnvAndConfig(rootDir) {
  const entities = [];
  const relations = [];
  const envFiles = ['.env', '.env.local', '.env.local.example'].map(p => path.join(rootDir, p)).filter(p => fs.existsSync(p));
  const envByRel = new Map();
  for (const full of envFiles) {
    const rel = path.relative(rootDir, full).replace(/\\/g, '/');
    const content = fs.readFileSync(full, 'utf8');
    const keys = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => l.split('=')[0].trim());
    const ent = {
      id: makeId(rel),
      type: 'env',
      name: path.basename(rel),
      description: `Environment file ${rel}`,
      sourcePaths: [rel],
      symbols: keys,
      relations: [],
      tests: [],
      labels: [],
      lifecycle: 'active',
      confidence: 0.8,
      evidence: [{ file: rel, line: null, extractor: 'env', timestamp: nowIso() }],
      lastSeen: nowIso(),
      storyLinks: []
    };
    entities.push(ent);
    envByRel.set(rel, ent);
  }

  const conf = path.join(rootDir, 'orchestrator-config.js');
  if (fs.existsSync(conf)) {
    const rel = 'orchestrator-config.js';
    entities.push({
      id: makeId(rel),
      type: 'config',
      name: 'orchestrator-config',
      description: 'Orchestrator configuration',
      sourcePaths: [rel],
      symbols: [],
      relations: [],
      tests: [],
      labels: [],
      lifecycle: 'active',
      confidence: 0.7,
      evidence: [{ file: rel, line: null, extractor: 'config', timestamp: nowIso() }],
      lastSeen: nowIso(),
      storyLinks: []
    });
  }
  // Scan code for env key usage and attach as evidence/relations
  try {
    const files = collectSourceFiles(rootDir, ['tools', 'scripts', 'bmad-core', 'src']);
    for (const full of files) {
      const relFile = toPosix(path.relative(rootDir, full));
      let text = '';
      try { text = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }
      const re = /process\.env\.([A-Z0-9_]+)/g;
      let m;
      const seenKeys = new Set();
      while ((m = re.exec(text))) {
        const key = m[1];
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        // Attach usage to any env entity that declares this key
        for (const ent of entities.filter(e => e.type === 'env' && Array.isArray(e.symbols) && e.symbols.includes(key))) {
          ent.evidence.push({ file: relFile, line: null, extractor: 'env_usage', timestamp: nowIso() });
          relations.push({ type: 'uses', fromId: makeId(relFile), toId: ent.id, evidencePath: relFile });
        }
      }
    }
  } catch (_) {}
  return { entities, relations };
}

// Collect candidate source files under key roots (avoids node_modules)
function collectSourceFiles(rootDir, roots = ['tools', 'scripts', 'bmad-core'], onlyPaths = null) {
  const files = [];
  for (const r of roots) {
    const abs = path.join(rootDir, r);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const dir = stack.pop();
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
      for (const it of ents) {
        if (it.name === 'node_modules' || it.name.startsWith('.')) continue;
        const full = path.join(dir, it.name);
        if (it.isDirectory()) { stack.push(full); continue; }
        if (/\.(js|ts|mjs|cjs)$/.test(it.name)) files.push(full);
      }
    }
  }
  // Filter to only requested relative paths when provided
  if (onlyPaths && onlyPaths.size) {
    const setLc = new Set(Array.from(onlyPaths).map(p => toPosix(p).toLowerCase()));
    return files
      .map(f => toPosix(path.relative(rootDir, f)))
      .filter(rel => setLc.has(rel.toLowerCase()))
      .map(rel => path.join(rootDir, rel));
  }
  return files;
}

// Extract modules and symbol exports under key directories
function extractModules(rootDir, { suppress = [], cache, onlyPaths } = {}) {
  const entities = [];
  const relations = [];
  const { minimatch } = require('glob');
  const mm = (a, b) => (typeof minimatch === 'function' ? minimatch(a, b) : a === b);
  const isSuppressed = (p) => suppress.some(g => mm(p, g));
  const files = collectSourceFiles(rootDir, ['tools', 'scripts', 'bmad-core', 'src'], onlyPaths);
  for (const full of files) {
    const rel = toPosix(path.relative(rootDir, full));
    if (isSuppressed(rel)) continue;
    // If running incrementally and this file is not in onlyPaths, but we have cache, reuse without reading
    if (onlyPaths && onlyPaths.size && !onlyPaths.has(rel) && cache && cache.files[rel] && Array.isArray(cache.files[rel].entities)) {
      entities.push(...cache.files[rel].entities);
      relations.push(...(cache.files[rel].relations || []));
      continue;
    }
    let content = '';
    try { content = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }

    // Cache check
    const h = fileHash(content);
    const cacheHit = cache && cache.files[rel] && cache.files[rel].hash === h && Array.isArray(cache.files[rel].entities);
    if (cacheHit) {
      entities.push(...cache.files[rel].entities);
      relations.push(...(cache.files[rel].relations || []));
      continue;
    }

    const now = nowIso();
    const moduleEntity = {
      id: makeId(rel),
      type: 'module',
      name: rel,
      description: `Module file ${rel}`,
      sourcePaths: [rel],
      symbols: [],
      relations: [],
      tests: [],
      labels: [],
      lifecycle: 'active',
      confidence: 0.6,
      evidence: [{ file: rel, line: null, extractor: 'module', timestamp: now }],
      lastSeen: now,
      storyLinks: []
    };
    const perFileEntities = [moduleEntity];
    const perFileRelations = [];

    // Exported symbols → add symbol-level entities
    try {
      const exportPatterns = [
        /export\s+function\s+(\w+)\s*\(/g,
        /export\s+class\s+(\w+)\s*/g,
        /export\s+(?:const|let|var)\s+(\w+)/g,
        /module\.exports\s*=\s*\{([\s\S]*?)\}/g,
        /exports\.(\w+)\s*=\s*/g,
        /export\s+default\s+function\s+(\w+)/g
      ];
      for (const re of exportPatterns) {
        let m;
        while ((m = re.exec(content))) {
          const block = m[1];
          const names = re.source.includes('{') ? String(block).split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean) : [block];
          for (const sym of names) {
            const id = makeId(rel, sym);
            if (!perFileEntities.find(e => e.id === id)) {
              perFileEntities.push({
                id,
                type: 'module',
                name: sym,
                description: '',
                sourcePaths: [rel],
                symbols: [sym],
                relations: [],
                tests: [],
                labels: [],
                lifecycle: 'active',
                confidence: 0.6,
                evidence: [{ file: rel, line: null, extractor: 'module', timestamp: now }],
                lastSeen: now,
                storyLinks: []
              });
            }
            // Optional richer relation: module exposes symbol
            perFileRelations.push({ type: 'exposes', fromId: makeId(rel), toId: makeId(rel, sym), evidencePath: rel });
          }
        }
      }
    } catch (_) {}

    // Import/require edges → depends_on relations
    try {
      const edgeRe = /(require\(|from\s+)["'](\.?\.?\/[^"']+)["']/g;
      let mm;
      while ((mm = edgeRe.exec(content))) {
        const targetRaw = mm[2];
        const resolved = path.resolve(path.dirname(full), targetRaw);
        const candidates = [
          resolved,
          `${resolved}.js`, `${resolved}.ts`, `${resolved}.mjs`, `${resolved}.cjs`,
          path.join(resolved, 'index.js'), path.join(resolved, 'index.ts')
        ];
        const hit = candidates.find(p => fs.existsSync(p));
        if (!hit) continue;
        const relTo = toPosix(path.relative(rootDir, hit));
        if (isSuppressed(relTo)) continue;
        perFileRelations.push({ type: 'depends_on', fromId: makeId(rel), toId: makeId(relTo), evidencePath: `${rel} -> ${relTo}` });
      }
    } catch (_) {}

    entities.push(...perFileEntities);
    relations.push(...perFileRelations);
    if (cache) {
      cache.files[rel] = { hash: h, entities: perFileEntities, relations: perFileRelations };
    }
  }
  return { entities, relations };
}

// Very simple route detection (common express patterns)
function extractRoutes(rootDir, { suppress = [], cache, onlyPaths } = {}) {
  const entities = [];
  const relations = [];
  const { minimatch } = require('glob');
  const mm = (a, b) => (typeof minimatch === 'function' ? minimatch(a, b) : a === b);
  const isSuppressed = (p) => suppress.some(g => mm(p, g));
  const files = collectSourceFiles(rootDir, ['tools', 'bmad-core', 'src'], onlyPaths);
  const routeRe = /(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'\"]+)['"]/g;
  for (const full of files) {
    const rel = toPosix(path.relative(rootDir, full));
    if (isSuppressed(rel)) continue;
    if (onlyPaths && onlyPaths.size && !onlyPaths.has(rel) && cache && cache.files[rel] && cache.files[rel].routes) {
      entities.push(...(cache.files[rel].routes.entities || []));
      relations.push(...(cache.files[rel].routes.relations || []));
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    const h = fileHash(text);
    const cacheHit = cache && cache.files[rel] && cache.files[rel].hash === h && Array.isArray(cache.files[rel].routes);
    if (cacheHit) {
      entities.push(...(cache.files[rel].routes.entities || []));
      relations.push(...(cache.files[rel].routes.relations || []));
      continue;
    }
    let m;
    const perEntities = [];
    const perRelations = [];
    while ((m = routeRe.exec(text))) {
      const method = m[2].toUpperCase();
      const route = m[3];
      const name = `${method} ${route}`;
      const upTo = text.slice(0, m.index);
      const line = upTo.split(/\r?\n/).length;
      perEntities.push({
        id: makeId(rel, `route:${method}:${route}`),
        type: 'route',
        name,
        description: `Route ${name}`,
        sourcePaths: [rel],
        symbols: [name],
        relations: [],
        tests: [],
        labels: [],
        lifecycle: 'active',
        confidence: 0.5,
        evidence: [{ file: rel, line, extractor: 'route', timestamp: nowIso() }],
        lastSeen: nowIso(),
        storyLinks: []
      });
    }
    entities.push(...perEntities);
    relations.push(...perRelations);
    if (cache) {
      cache.files[rel] = cache.files[rel] || { hash: h };
      cache.files[rel].hash = h;
      cache.files[rel].routes = { entities: perEntities, relations: perRelations };
    }
  }
  return { entities, relations };
}

// Extract APIs (derive from route patterns into API entities + relation routes_to)
function extractAPIs(rootDir, { suppress = [], cache, onlyPaths } = {}) {
  const entities = [];
  const relations = [];
  const { minimatch } = require('glob');
  const mm = (a, b) => (typeof minimatch === 'function' ? minimatch(a, b) : a === b);
  const isSuppressed = (p) => suppress.some(g => mm(p, g));
  const files = collectSourceFiles(rootDir, ['tools', 'bmad-core', 'src'], onlyPaths);
  const routeRe = /(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'\"]+)['"]/g;
  for (const full of files) {
    const rel = toPosix(path.relative(rootDir, full));
    if (isSuppressed(rel)) continue;
    if (onlyPaths && onlyPaths.size && !onlyPaths.has(rel) && cache && cache.files[rel] && cache.files[rel].apis) {
      entities.push(...(cache.files[rel].apis.entities || []));
      relations.push(...(cache.files[rel].apis.relations || []));
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    const h = fileHash(text);
    const cacheHit = cache && cache.files[rel] && cache.files[rel].hash === h && Array.isArray(cache.files[rel].apis);
    if (cacheHit) {
      entities.push(...(cache.files[rel].apis.entities || []));
      relations.push(...(cache.files[rel].apis.relations || []));
      continue;
    }
    let m;
    const perEntities = [];
    const perRelations = [];
    while ((m = routeRe.exec(text))) {
      const method = m[2].toUpperCase();
      const route = m[3];
      const apiId = `api:${route}#${method}`;
      const apiEnt = {
        id: apiId,
        type: 'api',
        name: `${method} ${route}`,
        description: '',
        sourcePaths: [rel],
        symbols: [],
        relations: [],
        tests: [],
        labels: [],
        lifecycle: 'active',
        confidence: 0.6,
        evidence: [{ file: rel, line: null, extractor: 'api', timestamp: nowIso() }],
        lastSeen: nowIso(),
        storyLinks: []
      };
      perEntities.push(apiEnt);
      // Link to corresponding route entity when present
      const routeId = makeId(rel, `route:${method}:${route}`);
      perRelations.push({ type: 'routes_to', fromId: apiId, toId: routeId, evidencePath: rel });
    }
    entities.push(...perEntities);
    relations.push(...perRelations);
    if (cache) {
      cache.files[rel] = cache.files[rel] || { hash: h };
      cache.files[rel].hash = h;
      cache.files[rel].apis = { entities: perEntities, relations: perRelations };
    }
  }
  return { entities, relations };
}

// Extract models (ORM entities, validation schemas)
function extractModels(rootDir, { suppress = [], cache, onlyPaths } = {}) {
  const entities = [];
  const relations = [];
  const { minimatch } = require('glob');
  const mm = (a, b) => (typeof minimatch === 'function' ? minimatch(a, b) : a === b);
  const isSuppressed = (p) => suppress.some(g => mm(p, g));
  const files = collectSourceFiles(rootDir, ['tools', 'bmad-core', 'scripts', 'src'], onlyPaths);
  const patterns = [
    { kind: 'mongoose', re: /mongoose\.model\(\s*['"]([^'"]+)['"]/g },
    { kind: 'mongoose', re: /new\s+mongoose\.Schema\s*\(/g },
    { kind: 'sequelize', re: /sequelize\.define\(\s*['"]([^'"]+)['"]/g },
    { kind: 'zod', re: /\b(\w+)\s*=\s*z\.object\s*\(/g },
    { kind: 'joi', re: /\b(\w+)\s*=\s*Joi\.object\s*\(/g },
    { kind: 'yup', re: /\b(\w+)\s*=\s*yup\.object\s*\(/g }
  ];
  for (const full of files) {
    const rel = toPosix(path.relative(rootDir, full));
    if (isSuppressed(rel)) continue;
    if (onlyPaths && onlyPaths.size && !onlyPaths.has(rel) && cache && cache.files[rel] && cache.files[rel].models) {
      entities.push(...(cache.files[rel].models.entities || []));
      relations.push(...(cache.files[rel].models.relations || []));
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    const h = fileHash(text);
    const cacheHit = cache && cache.files[rel] && cache.files[rel].hash === h && Array.isArray(cache.files[rel].models);
    if (cacheHit) {
      entities.push(...(cache.files[rel].models.entities || []));
      relations.push(...(cache.files[rel].models.relations || []));
      continue;
    }
    const perEntities = [];
    const perRelations = [];
    for (const p of patterns) {
      let m;
      while ((m = p.re.exec(text))) {
        const name = m[1] || path.basename(rel).replace(/\.[^.]+$/, '');
        const id = makeId(rel, `model:${name}`);
        perEntities.push({
          id,
          type: 'model',
          name,
          description: `${p.kind} model/schema` ,
          sourcePaths: [rel],
          symbols: [name],
          relations: [],
          tests: [],
          labels: [],
          lifecycle: 'active',
          confidence: 0.5,
          evidence: [{ file: rel, line: null, extractor: 'model', timestamp: nowIso() }],
          lastSeen: nowIso(),
          storyLinks: []
        });
        // Optional: owning module exposes this model symbol
        perRelations.push({ type: 'exposes', fromId: makeId(rel), toId: id, evidencePath: rel });
      }
    }
    entities.push(...perEntities);
    relations.push(...perRelations);
    if (cache) {
      cache.files[rel] = cache.files[rel] || { hash: h };
      cache.files[rel].hash = h;
      cache.files[rel].models = { entities: perEntities, relations: perRelations };
    }
  }
  return { entities, relations };
}

// Lifecycle classification using .ai/dep-report.json (unreachable paths)
function applyLifecycle(rootDir, entities, { suppress = [] } = {}) {
  let unreachable = [];
  try {
    const depPath = path.join(rootDir, '.ai', 'dep-report.json');
    if (fs.existsSync(depPath)) {
      const dep = JSON.parse(fs.readFileSync(depPath, 'utf8')) || {};
      unreachable = Array.isArray(dep.unreachable) ? dep.unreachable.map(String) : [];
    }
  } catch (_) {}
  const { minimatch } = require('glob');
  const mm = (a, b) => (typeof minimatch === 'function' ? minimatch(a, b) : a === b);
  const isUnreachable = (p) => unreachable.some(u => mm(p, u));
  const isSuppressed = (p) => suppress.some(g => mm(p, g));
  for (const e of entities) {
    const allPaths = Array.isArray(e.sourcePaths) ? e.sourcePaths : [];
    let lifecycle = null;
    // Respect suppress list: treat as active
    if (allPaths.length && allPaths.some(isSuppressed)) {
      e.lifecycle = 'active';
      continue;
    }
    // Honor annotations first
    try {
      const first = allPaths[0] && path.join(rootDir, allPaths[0]);
      if (first && fs.existsSync(first)) {
        const text = fs.readFileSync(first, 'utf8');
        if (/@deprecated/i.test(text)) { e.lifecycle = 'deprecated'; continue; }
        if (/@dynamic|@keep/i.test(text)) { lifecycle = 'active'; }
      }
    } catch (_) {}
    if (!lifecycle) {
      lifecycle = (allPaths.length && allPaths.every(isUnreachable)) ? 'unused' : 'active';
    }
    e.lifecycle = lifecycle;
  }
}

async function extractEntities(rootDir, options = {}) {
  const suppress = loadSuppress(rootDir);
  // simple on-disk cache for speed
  const cachePath = path.join(rootDir, '.ai', 'reverse', 'extractor-cache.json');
  const profile = { startedAt: new Date().toISOString(), extractorVersion: EXTRACTOR_VERSION, filesScanned: 0, cacheHits: 0, entities: 0, relations: 0, incremental: false };
  let cache = { version: EXTRACTOR_VERSION, files: {} };
  try {
    const raw = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : null;
    if (raw && raw.version === EXTRACTOR_VERSION && raw.files) cache = raw;
  } catch (_) {}

  // Measure roughly how many files we touch via cache tracking
  const beforeFiles = Object.keys(cache.files).length;
  const onlyPaths = options.onlyPaths instanceof Set ? new Set(Array.from(options.onlyPaths).map(p => toPosix(p))) : null;
  if (onlyPaths && onlyPaths.size) profile.incremental = true;
  const mod = extractModules(rootDir, { suppress, cache, onlyPaths });
  const rt = extractRoutes(rootDir, { suppress, cache, onlyPaths });
  const apis = extractAPIs(rootDir, { suppress, cache, onlyPaths });
  const models = extractModels(rootDir, { suppress, cache, onlyPaths });
  const buckets = [
    extractCLI(rootDir),
    extractCI(rootDir),
    extractEnvAndConfig(rootDir),
    mod, rt, apis, models
  ];

  // Merge
  const entities = [];
  const relations = [];
  for (const b of buckets) {
    if (b && Array.isArray(b.entities)) entities.push(...b.entities);
    if (b && Array.isArray(b.relations)) relations.push(...b.relations);
  }

  // Deduplicate entities by id (last one wins)
  const map = new Map();
  for (const e of entities) map.set(e.id, e);
  const merged = Array.from(map.values());
  applyLifecycle(rootDir, merged, { suppress });

  // Link tests[] to entities using heuristics
  try {
    const tests = collectTestFiles(rootDir);
    const tIndex = indexTests(rootDir, tests);
    for (const e of merged) {
      const fpaths = Array.isArray(e.sourcePaths) ? e.sourcePaths : [];
      const nameLc = String(e.name || '').toLowerCase();
      const hits = new Set();
      for (const sp of fpaths) {
        const rel = toPosix(sp);
        const a = tIndex.byPath.get(rel) || [];
        a.forEach(x => hits.add(x));
      }
      const byName = tIndex.byName.get(nameLc) || [];
      byName.forEach(x => hits.add(x));
      if (hits.size) e.tests = Array.from(hits).slice(0, 10);
    }
  } catch (_) {}

  // Sort deterministically
  merged.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  relations.sort((a, b) => {
    const sa = `${a.fromId}|${a.type}|${a.toId}`;
    const sb = `${b.fromId}|${b.type}|${b.toId}`;
    return sa.localeCompare(sb);
  });

  // Persist cache
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ version: EXTRACTOR_VERSION, files: cache.files }, null, 2));
  } catch (_) {}

  // Write profiling info
  try {
    const afterFiles = Object.keys(cache.files).length;
    profile.filesScanned = afterFiles; // approximates unique files known to cache
    // Count cache hits by checking entries that were reused this run
    let hits = 0;
    for (const [rel, meta] of Object.entries(cache.files)) {
      if (meta && meta.entities && meta.hash) hits++;
    }
    profile.cacheHits = Math.max(0, hits - (afterFiles - beforeFiles));
    profile.entities = merged.length;
    profile.relations = relations.length;
    profile.finishedAt = new Date().toISOString();
    profile.elapsedMs = Date.now() - Date.parse(profile.startedAt);
    const reportsDir = path.join(rootDir, '.ai', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'extractor-profile.json'), JSON.stringify(profile, null, 2));
  } catch (_) {}

  return { entities: merged, relations };
}

// Test collection helpers
function collectTestFiles(rootDir) {
  const dirs = ['tests', 'test', '__tests__', 'spec'];
  const out = [];
  for (const d of dirs) {
    const base = path.join(rootDir, d);
    if (!fs.existsSync(base)) continue;
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
      for (const it of ents) {
        const full = path.join(dir, it.name);
        if (it.isDirectory()) { if (!it.name.startsWith('.')) stack.push(full); }
        else if (/\.test\.(js|ts|jsx|tsx)$/.test(it.name)) out.push(full);
      }
    }
  }
  return out;
}

function indexTests(rootDir, testFiles) {
  const byPath = new Map(); // sourceRel -> [testRel]
  const byName = new Map(); // lowerName -> [testRel]
  for (const full of testFiles) {
    let text = '';
    try { text = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }
    const relTest = toPosix(path.relative(rootDir, full));
    // Heuristic: extract quoted relative imports and words
    const imports = Array.from(text.matchAll(/["'](\.?\.?\/[^"']+)["']/g)).map(m => m[1]);
    for (const imp of imports) {
      const resolved = path.resolve(path.dirname(full), imp);
      const candidates = [resolved, `${resolved}.js`, `${resolved}.ts`, `${resolved}.mjs`, `${resolved}.cjs`, path.join(resolved, 'index.js'), path.join(resolved, 'index.ts')];
      const hit = candidates.find(p => fs.existsSync(p));
      if (hit) {
        const relSrc = toPosix(path.relative(rootDir, hit));
        const arr = byPath.get(relSrc) || [];
        if (!arr.includes(relTest)) { arr.push(relTest); byPath.set(relSrc, arr); }
      }
    }
    // Names in tests (simple tokens)
    const tokens = Array.from(new Set((text.match(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g) || []).map(s => s.toLowerCase())));
    for (const t of tokens) {
      const arr = byName.get(t) || [];
      if (!arr.includes(relTest)) { arr.push(relTest); byName.set(t, arr); }
    }
  }
  return { byPath, byName };
}

module.exports = { extractEntities, EXTRACTOR_VERSION };
