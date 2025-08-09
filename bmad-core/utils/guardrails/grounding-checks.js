const fs = require('fs');
const path = require('path');

function assertPathsExist(paths) {
  const missing = [];
  for (const p of paths || []) {
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    if (!fs.existsSync(abs)) missing.push(p);
  }
  if (missing.length) {
    const err = new Error(`Missing required paths: ${missing.join(', ')}`);
    err.code = 'MISSING_PATHS';
    err.missing = missing;
    throw err;
  }
  return true;
}

function assertModulesResolvable(mods) {
  const unresolved = [];
  for (const m of mods || []) {
    try {
      require.resolve(m);
    } catch (_) {
      unresolved.push(m);
    }
  }
  if (unresolved.length) {
    const err = new Error(`Unresolvable modules: ${unresolved.join(', ')}`);
    err.code = 'UNRESOLVABLE_MODULES';
    err.unresolved = unresolved;
    throw err;
  }
  return true;
}

function assertNoDangerousOps(commands) {
  const bannedPatterns = [
    /\brm\b.*-rf/i,
    /:\/\/.*@/,           // credentials in URLs
    /\bsudo\b/i,
    /\bdd\b\s+of=\//i,   // dd to root
    /\bmkfs\b/i,
    /\bshutdown\b|\breboot\b/i
  ];
  const flagged = [];
  for (const cmd of commands || []) {
    const s = Array.isArray(cmd) ? cmd.join(' ') : String(cmd);
    if (bannedPatterns.some(rx => rx.test(s))) flagged.push(s);
  }
  if (flagged.length) {
    const err = new Error(`Dangerous operations detected: ${flagged.join(' | ')}`);
    err.code = 'DANGEROUS_OPS';
    err.flagged = flagged;
    throw err;
  }
  return true;
}

module.exports = { assertPathsExist, assertModulesResolvable, assertNoDangerousOps };

