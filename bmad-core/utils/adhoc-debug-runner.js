#!/usr/bin/env node
/**
 * Dev Agent Ad-hoc Debug Runner (*adhoc-debug)
 *
 * Purpose: Perform a thorough, root-cause oriented debug capture for a provided error description.
 * - Creates an isolated evidence bundle under .ai/adhoc/debug/<timestamp>
 * - Captures baseline context (git, env, runtime, configs)
 * - Runs optional dependency impact analysis for provided paths
 * - Optionally executes a reproduction command N times with profiling/diagnostic env
 * - Produces summary.md and findings.json with links to evidence
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');
const { analyzeBatchImpact, generateImpactReport, quickRiskAssessment } = require('./dependency-impact-checker');

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function log(kind, message) {
  const tries = [
    ['.semad-core/utils/track-progress.js', kind, 'dev', message],
    ['semad-core/utils/track-progress.js', kind, 'dev', message],
    ['.semad-core/utils/track-progress.js', kind, 'dev', message],
    ['semad-core/utils/track-progress.js', kind, 'dev', message],
  ];
  for (const t of tries) {
    try { const r = spawnSync(process.execPath, t, { stdio: 'ignore' }); if ((r.status ?? 0) === 0) return; } catch {}
  }
}

async function promptGuided(args) {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(res => rl.question(q, ans => res(ans.trim())));
    (async () => {
      if (!args.error) args.error = await ask('Problem (one sentence): ');
      if (!args.where) args.where = await ask('Where (screen/URL/endpoint): ');
      if (!args.when) args.when = await ask('When (timestamp/time range, include timezone): ');
      if (!args.errorId) args.errorId = await ask('Error/Trace ID (if shown): ');
      const steps = await ask('Steps to reproduce (3-5 bullets, optional): ');
      args.userSteps = steps;
      rl.close();
      resolve();
    })();
  });
}

function saveUserLog(args, out) {
  try {
    let content = '';
    if (args.logFile && fs.existsSync(args.logFile)) {
      content = fs.readFileSync(args.logFile, 'utf8');
    } else if (args.stdinLog && !process.stdin.isTTY) {
      content = fs.readFileSync(0, 'utf8');
    }
    if (content) {
      const dest = path.join(out.logs, 'user-provided.log');
      fs.writeFileSync(dest, content);
      const lines = content.split(/\r?\n/);
      const errs = lines.filter(l => /error|exception|fatal/i.test(l)).slice(0, 200);
      const ids = Array.from(new Set(lines.map(l => (l.match(/(req[_-]?id|trace[_-]?id)[:=\s]+([\w-]+)/i) || [])[2]).filter(Boolean)));
      fs.writeFileSync(path.join(out.reports, 'user-log-signatures.json'), safeJSON({ errors: errs.slice(0,100), traceIds: ids }));
      return { saved: true, idsCount: ids.length, errorsCount: errs.length };
    }
  } catch (e) {
    try { fs.writeFileSync(path.join(out.reports, 'user-log-signatures.json'), safeJSON({ error: e.message })); } catch {}
  }
  return { saved: false };
}

function parseArgs(argv) {
  const out = {
    error: '',
    scope: '',
    paths: [],
    since: '',
    repro: '',
    runs: 1,
    profile: [],
    nettrace: false,
    dbcheck: false,
    audit: false,
    bisect: false,
    timeout: 0,
    ci: false,
    output: '',
  };
  const toks = argv.slice(2);
  const next = () => toks.shift();
  while (toks.length) {
    const t = next();
    if (!t) break;
    switch (t) {
      case '--error': case '--desc': case '--description': out.error = next() || out.error; break;
      case '--scope': out.scope = next() || ''; break;
      case '--where': out.where = next() || ''; break;
      case '--when': out.when = next() || ''; break;
      case '--tz': out.tz = next() || ''; break;
      case '--id': case '--trace-id': case '--error-id': out.errorId = next() || ''; break;
      case '--paths': { while (toks[0] && !toks[0].startsWith('--')) out.paths.push(next()); break; }
      case '--since': out.since = next() || ''; break;
      case '--repro': out.repro = next() || ''; break;
      case '--runs': out.runs = Math.max(1, parseInt(next() || '1', 10) || 1); break;
      case '--profile': out.profile = (next() || '').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--nettrace': out.nettrace = true; break;
      case '--dbcheck': out.dbcheck = true; break;
      case '--audit': out.audit = true; break;
      case '--bisect': out.bisect = true; break;
      case '--log-file': out.logFile = next() || ''; break;
      case '--stdin-log': out.stdinLog = true; break;
      case '--guided': out.guided = true; break;
      case '--timeout': out.timeout = Math.max(0, parseInt(next() || '0', 10) || 0); break;
      case '--ci': out.ci = true; break;
      case '--output': out.output = next() || ''; break;
      default:
        if (!t.startsWith('--') && !out.error) out.error = t; // positional error description
        break;
    }
  }
  return out;
}

function loadCoreConfig() {
  const candidates = [
    path.join(process.cwd(), 'semad-core', 'core-config.yaml'),
    path.join(process.cwd(), '.semad-core', 'core-config.yaml'),
    path.join(process.cwd(), 'bmad-core', 'core-config.yaml'),
    path.join(process.cwd(), '.semad-core', 'core-config.yaml'),
    path.join(process.cwd(), 'core-config.yaml')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return { path: p, config: yaml.load(fs.readFileSync(p, 'utf8')) || {} }; }
      catch (e) { return { path: p, config: {}, error: e.message }; }
    }
  }
  return { path: null, config: {} };
}

function safeJSON(data) {
  return JSON.stringify(data, null, 2);
}

function redactEnv(env) {
  const allow = ['NODE_ENV','BMAD_ENV','APP_ENV','CI','TZ'];
  const out = {};
  for (const k of allow) if (env[k] != null) out[k] = env[k];
  out['__env_keys__'] = Object.keys(env).length; // count only
  return out;
}

function run(cmd, opts = {}) {
  const [bin, ...args] = Array.isArray(cmd) ? cmd : cmd.split(' ');
  const res = spawnSync(bin, args, { encoding: 'utf8', ...opts });
  return { code: res.status ?? res.signal ?? 0, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function gitInfo() {
  const info = {};
  info.root = run('git rev-parse --show-toplevel').stdout.trim();
  info.branch = run('git rev-parse --abbrev-ref HEAD').stdout.trim();
  info.head = run('git rev-parse HEAD').stdout.trim();
  info.dirty = run('git status --porcelain').stdout.trim().length > 0;
  info.remotes = run('git remote -v').stdout.trim().split('\n').filter(Boolean).slice(0,6);
  return info;
}

function gitDiffSince(ref) {
  const out = run(`git diff --name-status ${ref}...HEAD`);
  return out.stdout.trim().split('\n').filter(Boolean).slice(0,500);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.error && !args.guided) {
    console.log('Usage: adhoc-debug-runner.js --error "<error description>" [--where <screen/url>] [--when <timestamp>] [--id <traceId>] [--paths <p1> ...] [--repro "<cmd>"] [--runs 10] [--since <ref>] [--profile cpu,heap] [--nettrace] [--dbcheck] [--audit] [--ci] [--log-file <path>|--stdin-log] [--output <dir>] [--guided]');
    process.exit(1);
  }

  if (args.guided) {
    await promptGuided(args);
  }

  const startedAt = new Date();
  const ts = startedAt.toISOString().replace(/[:.]/g, '-');
  const baseOut = args.output || path.join('.ai','adhoc','debug', ts);
  const out = {
    root: baseOut,
    logs: path.join(baseOut, 'logs'),
    traces: path.join(baseOut, 'traces'),
    profiles: path.join(baseOut, 'profiles'),
    reports: path.join(baseOut, 'reports'),
  };
  ensureDir(out.root); ensureDir(out.logs); ensureDir(out.traces); ensureDir(out.profiles); ensureDir(out.reports);

  log('observation', `adhoc-debug started: ${args.error}`);

  // Baseline snapshot
  const core = loadCoreConfig();
  const baseline = {
    startedAt: startedAt.toISOString(),
    error: args.error,
    scope: args.scope,
    where: args.where || '',
    when: args.when || '',
    tz: args.tz || process.env.TZ || '',
    errorId: args.errorId || '',
    paths: args.paths,
    since: args.since,
    repro: args.repro,
    runs: args.runs,
    platform: { os: os.platform(), release: os.release(), cpus: os.cpus().length, memGB: Math.round(os.totalmem()/1e9), locale: Intl.DateTimeFormat().resolvedOptions().locale },
    node: process.version,
    nodeVersions: process.versions,
    npm: run('npm -v').stdout.trim(),
    git: gitInfo(),
    env: redactEnv(process.env),
    coreConfigPath: core.path,
  };
  fs.writeFileSync(path.join(out.root, 'baseline.json'), safeJSON(baseline));

  if (args.since) {
    const diff = gitDiffSince(args.since);
    fs.writeFileSync(path.join(out.reports, 'git-diff-since.txt'), diff.join('\n'));
  }

  // Impact analysis (paths)
  let impactSummary = 'skipped';
  if (args.paths && args.paths.length) {
    try {
      const risk = await quickRiskAssessment(args.paths);
      const impact = await analyzeBatchImpact(args.paths);
      const md = generateImpactReport(impact, { includeDetails: true, maxDetailsPerFile: 10, format: 'markdown' });
      fs.writeFileSync(path.join(out.reports, 'impact.md'), md);
      impactSummary = `high=${risk.high.length}, medium=${risk.medium.length}, low=${risk.low.length}`;
    } catch (e) {
      impactSummary = `failed: ${e.message}`;
    }
  }

  // Reproduction runs
  let reproStats = null;
  if (args.repro) {
    const results = [];
    for (let i = 0; i < args.runs; i++) {
      const logFile = path.join(out.logs, `repro-${i+1}.log`);
      const env = { ...process.env };
      if (args.profile.includes('cpu') || args.profile.includes('heap')) {
        const profFlags = [];
        if (args.profile.includes('cpu')) profFlags.push('--cpu-prof');
        if (args.profile.includes('heap')) profFlags.push('--heap-prof');
        env.NODE_OPTIONS = [env.NODE_OPTIONS, ...profFlags].filter(Boolean).join(' ').trim();
      }
      if (args.nettrace) {
        env.NODE_DEBUG = [env.NODE_DEBUG, 'http,net'].filter(Boolean).join(',');
      }
      const res = run(args.repro, { env, timeout: args.timeout > 0 ? args.timeout : undefined });
      fs.writeFileSync(logFile, `# Run ${i+1}\n# code=${res.code}\n\n# stderr\n${res.stderr}\n\n# stdout\n${res.stdout}`);
      results.push({ i: i+1, code: res.code, stderr: res.stderr.slice(0,2000), stdout: res.stdout.slice(0,2000) });
    }
    const failures = results.filter(r => r.code !== 0).length;
    const flakiness = failures > 0 && failures < results.length;
    reproStats = { total: results.length, failures, flakiness, passRate: (results.length - failures)/results.length };
    fs.writeFileSync(path.join(out.reports, 'repro-summary.json'), safeJSON({ args: { runs: args.runs, profile: args.profile, nettrace: args.nettrace }, stats: reproStats }));
  }

  // Optional audits (best-effort, do not fail command)
  let auditSummary = 'skipped';
  if (args.audit) {
    try {
      const audit = run('npm audit --json', { timeout: 60_000 });
      fs.writeFileSync(path.join(out.reports, 'npm-audit.json'), audit.stdout || audit.stderr || '');
      auditSummary = audit.code === 0 ? 'no vulnerabilities (or audit disabled)' : 'vulnerabilities found/scan complete';
    } catch (e) { auditSummary = `failed: ${e.message}`; }
  }

  // Basic DB drift scan (heuristic)
  let dbSummary = 'skipped';
  if (args.dbcheck) {
    try {
      const findings = [];
      const candidates = ['prisma/schema.prisma','migrations','db/migrations','database/migrations','src/migrations'];
      for (const c of candidates) {
        const p = path.join(process.cwd(), c);
        if (fs.existsSync(p)) findings.push({ path: c, type: fs.statSync(p).isDirectory() ? 'dir' : 'file' });
      }
      fs.writeFileSync(path.join(out.reports, 'db-check.json'), safeJSON({ findings }));
      dbSummary = findings.length ? `artifacts:${findings.length}` : 'none-detected';
    } catch (e) { dbSummary = `failed: ${e.message}`; }
  }

  const userLog = saveUserLog(args, out);

  // Findings and summary
  const summaryMd = [];
  summaryMd.push(`# Ad-hoc Debug Summary`);
  summaryMd.push(`- Started: ${startedAt.toISOString()}`);
  summaryMd.push(`- Error: ${args.error}`);
  if (args.scope) summaryMd.push(`- Scope: ${args.scope}`);
  if (args.paths?.length) summaryMd.push(`- Paths: ${args.paths.join(', ')}`);
  if (args.since) summaryMd.push(`- Git diff since: ${args.since} → reports/git-diff-since.txt`);
  summaryMd.push(`- Impact analysis: ${impactSummary} → reports/impact.md`);
  if (reproStats) summaryMd.push(`- Repro: runs=${reproStats.total}, failures=${reproStats.failures}, flakiness=${reproStats.flakiness} → reports/repro-summary.json, logs/`);
  if (args.profile.length) summaryMd.push(`- Profiling: ${args.profile.join(', ')} (NODE_OPTIONS applied)`);
  if (args.nettrace) summaryMd.push(`- Nettrace: NODE_DEBUG=http,net applied`);
  if (args.audit) summaryMd.push(`- Audit: ${auditSummary} → reports/npm-audit.json`);
  if (args.dbcheck) summaryMd.push(`- DB check: ${dbSummary} → reports/db-check.json`);
  if (userLog.saved) {
    summaryMd.push(`- User log: saved (${userLog.errorsCount} errors, ${userLog.idsCount} trace IDs) → logs/user-provided.log`);
  } else if (args.logFile || args.stdinLog) {
    summaryMd.push(`- User log: no content detected (check --log-file / --stdin-log input)`);
  }
  summaryMd.push(`- Baseline: baseline.json`);
  fs.writeFileSync(path.join(out.root, 'summary.md'), summaryMd.join('\n'));

  const findings = {
    error: args.error,
    scope: args.scope,
    impactSummary,
    repro: reproStats || null,
    audit: args.audit ? auditSummary : null,
    db: args.dbcheck ? dbSummary : null,
    artifacts: {
      summary: path.relative(process.cwd(), path.join(out.root, 'summary.md')),
      baseline: path.relative(process.cwd(), path.join(out.root, 'baseline.json')),
      reports: path.relative(process.cwd(), out.reports),
      logs: path.relative(process.cwd(), out.logs),
      profiles: path.relative(process.cwd(), out.profiles),
    }
  };
  fs.writeFileSync(path.join(out.root, 'findings.json'), safeJSON(findings));

  const duration = Math.round((Date.now() - startedAt.getTime())/1000);
  log('keyfact', `adhoc-debug complete: ${args.error} (${duration}s)`);
  log('observation', `adhoc-debug artifacts: ${path.relative(process.cwd(), out.root)}`);
  console.log('Ad-hoc debug completed');
  console.log('- Artifacts:', path.relative(process.cwd(), out.root));
  console.log('- Summary: ', path.relative(process.cwd(), path.join(out.root, 'summary.md')));
}

main().catch(err => {
  console.error('adhoc-debug error:', err);
  process.exit(1);
});
