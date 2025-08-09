/**
 * File safety utilities: cross-process lockfile + atomic writes
 * - Lockfile: `${target}.lock` with owner info, timeout, backoff, jitter
 * - Atomic write: write to temp file then rename
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function nowMs() { return Date.now(); }

function defaultBackoff(attempt) {
  // Exponential backoff: base 20ms, cap 300ms, with jitter up to 40ms
  const base = Math.min(20 * Math.pow(2, attempt), 300);
  const jitter = Math.floor(Math.random() * 40);
  return base + jitter;
}

function lockPathFor(targetPath) {
  return `${targetPath}.lock`;
}

async function readLockInfo(lockPath) {
  try {
    const raw = await fsp.readFile(lockPath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function acquireLock(targetPath, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10000; // 10s
  const backoffFn = opts.backoffFn ?? defaultBackoff;
  const lockPath = lockPathFor(targetPath);
  const token = crypto.randomBytes(8).toString('hex');
  const owner = {
    token,
    pid: process.pid,
    ppid: process.ppid,
    hostname: os.hostname(),
    cwd: process.cwd(),
    createdAt: new Date().toISOString(),
    target: path.relative(process.cwd(), targetPath)
  };

  const start = nowMs();
  let attempt = 0;
  // Ensure parent directory exists for the lock path
  await fsp.mkdir(path.dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const handle = await fsp.open(lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify(owner));
      } finally {
        await handle.close();
      }
      return token; // lock acquired
    } catch (err) {
      if (err && err.code === 'EEXIST') {
        // Check staleness
        try {
          const stat = await fsp.stat(lockPath);
          const age = nowMs() - stat.mtimeMs;
          if (age > timeoutMs) {
            // Stale lock: try to remove
            try { await fsp.unlink(lockPath); } catch (_) {}
          }
        } catch (_) {
          // If stat fails, retry
        }
      } else {
        // Other error when creating the lock; retry
      }

      if (nowMs() - start >= timeoutMs) {
        const current = await readLockInfo(lockPath);
        const ownerStr = current ? `${current.hostname}:${current.pid} token=${current.token}` : 'unknown';
        throw new Error(`Timeout acquiring lock for ${targetPath}. Owner ${ownerStr}`);
      }
      await new Promise(res => setTimeout(res, backoffFn(attempt++)));
    }
  }
}

async function releaseLock(targetPath, token) {
  const lockPath = lockPathFor(targetPath);
  try {
    const info = await readLockInfo(lockPath);
    if (info && info.token === token) {
      await fsp.unlink(lockPath);
      return true;
    }
    // If not ours, do nothing to avoid stealing
    return false;
  } catch (_) {
    return false;
  }
}

function makeTempPath(targetPath) {
  const rand = crypto.randomBytes(6).toString('hex');
  return `${targetPath}.tmp.${process.pid}.${Date.now()}.${rand}`;
}

async function writeFileAtomic(targetPath, data, options = {}) {
  const enc = options.encoding ?? 'utf8';
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  const tmp = makeTempPath(targetPath);
  await fsp.writeFile(tmp, data, { encoding: enc });
  await fsp.rename(tmp, targetPath);
}

async function writeJsonAtomic(targetPath, obj, options = {}) {
  const spaces = options.spaces ?? 2;
  const content = JSON.stringify(obj, null, spaces);
  await writeFileAtomic(targetPath, content, { encoding: 'utf8' });
}

async function appendJsonlAtomic(targetPath, lineObj) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  const existing = await fsp.readFile(targetPath, 'utf8').catch(err => (err && err.code === 'ENOENT' ? '' : Promise.reject(err)));
  const next = existing + JSON.stringify(lineObj) + '\n';
  await writeFileAtomic(targetPath, next, { encoding: 'utf8' });
}

module.exports = {
  acquireLock,
  releaseLock,
  writeFileAtomic,
  writeJsonAtomic,
  appendJsonlAtomic,
  lockPathFor
};

