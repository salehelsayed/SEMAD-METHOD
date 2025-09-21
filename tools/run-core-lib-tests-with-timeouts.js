#!/usr/bin/env node
/**
 * tools/run-core-lib-tests-with-timeouts.js
 *
 * Prefer running `npm run -s test:core-lib` from repo root.
 * If missing, auto-detect the core-lib package (or use CORE_LIB_DIR) and run its tests.
 * Includes idle/hard timeout control like the Flutter runner.
 */

const { spawn } = require("child_process");
const { join, resolve } = require("path");
const { existsSync, readFileSync } = require("fs");

// --- Configurable timeouts (env override) ---
const IDLE_MS  = Number(process.env.IDLE_MS  || 30_000);   // 30s silence
const HARD_MS  = Number(process.env.HARD_MS  || 600_000);  // 10m hard cap
const GRACE_MS = Number(process.env.GRACE_MS || 5_000);    // grace after SIGTERM

// --- Where to start (repo root) ---
const rootDir = process.env.WORKDIR || process.cwd();

// --- Forward args after `--` ---
const ddx = process.argv.indexOf("--");
const extraArgs = ddx === -1 ? [] : process.argv.slice(ddx + 1);

// --- Utilities ---
function readJsonSafe(p) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}
function hasScript(pkgJson, name) {
  return !!(pkgJson && pkgJson.scripts && pkgJson.scripts[name]);
}

function selectCmdAndCwd() {
  const rootPkgPath = join(rootDir, "package.json");
  const rootPkg = existsSync(rootPkgPath) ? readJsonSafe(rootPkgPath) : null;

  // 1) If root has the exact script, run it at root.
  if (hasScript(rootPkg, "test:core-lib")) {
    return {
      cwd: rootDir,
      args: ["run", "-s", "test:core-lib"],
      reason: `Using root script "test:core-lib" in ${rootPkgPath}`,
    };
  }

  // 2) If user hints where core-lib lives
  const hinted = process.env.CORE_LIB_DIR
    ? resolve(rootDir, process.env.CORE_LIB_DIR)
    : null;

  // 3) Common locations to try
  const candidates = [
    hinted,
    "packages/core-lib",
    "packages/core",
    "libs/core-lib",
    "libs/core",
    "core-lib",
    "core",
  ].filter(Boolean).map(p => resolve(rootDir, p));

  for (const dir of candidates) {
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = readJsonSafe(pkgPath);
    if (!pkg) continue;

    // Prefer test:core-lib, else test
    if (hasScript(pkg, "test:core-lib")) {
      return {
        cwd: dir,
        args: ["run", "-s", "test:core-lib"],
        reason: `Falling back to "${dir}" script "test:core-lib" (${pkgPath})`,
      };
    }
    if (hasScript(pkg, "test")) {
      return {
        cwd: dir,
        args: ["run", "-s", "test"],
        reason: `Falling back to "${dir}" script "test" (${pkgPath})`,
      };
    }
  }

  // 4) Nothing found → fail fast with guidance
  console.error(`[Runner] Script "test:core-lib" not found in ${rootPkgPath}.`);
  console.error(`         Also couldn't find a candidate package with "test:core-lib" or "test".`);
  console.error(`         Fix one of the following:`);
  console.error(`           A) Add at root package.json -> "scripts": { "test:core-lib": "npm --workspace packages/core-lib run -s test" }`);
  console.error(`           B) Set env CORE_LIB_DIR to the package (e.g. CORE_LIB_DIR=packages/core-lib).`);
  console.error(`           C) Add "test:core-lib" or "test" in your core-lib package.json.`);
  process.exit(1);
}

const plan = selectCmdAndCwd();
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const env = { ...process.env, CI: "1", FORCE_COLOR: "1" };
const fullArgs = [...plan.args];
if (extraArgs.length) fullArgs.push("--", ...extraArgs);

console.error(`[Runner] ${plan.reason}`);
console.error(`[Runner] Using package.json: ${join(plan.cwd, "package.json")}`);
console.error(`[Runner] Running: ${npmCmd} ${fullArgs.join(" ")}`);

const child = spawn(npmCmd, fullArgs, {
  cwd: plan.cwd,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
  env,
});

let last = Date.now();
let ended = false, idleTriggered = false, hardTriggered = false;
const outChunks = [], errChunks = [];

function onData(stream, buf) {
  (stream === "stdout" ? process.stdout : process.stderr).write(buf);
  (stream === "stdout" ? outChunks : errChunks).push(buf);
  last = Date.now();
}
child.stdout.on("data", (d) => onData("stdout", d));
child.stderr.on("data", (d) => onData("stderr", d));

child.on("error", (e) => {
  console.error("[Runner] Failed to start:", e?.message || e);
});

function killGroup(sig) {
  try { process.kill(-child.pid, sig); } catch {}
  try { child.kill(sig); } catch {}
}

// Idle timeout monitor
const idleTick = setInterval(() => {
  if (!ended && Date.now() - last > IDLE_MS) {
    idleTriggered = true;
    console.error(`\n[IdleMonitor] No output for ${IDLE_MS} ms — SIGTERM to group...`);
    killGroup("SIGTERM");
    clearInterval(idleTick);
    setTimeout(() => {
      if (!ended) {
        console.error("[IdleMonitor] Still running — SIGKILL");
        killGroup("SIGKILL");
      }
    }, GRACE_MS);
  }
}, 1000);

// Hard timeout
const hardTimer = setTimeout(() => {
  if (!ended) {
    hardTriggered = true;
    console.error(`\n[IdleMonitor] Hard timeout (${HARD_MS} ms) — SIGKILL to group...`);
    killGroup("SIGKILL");
  }
}, HARD_MS);

// Handle exit
child.on("exit", (code, signal) => {
  ended = true;
  clearInterval(idleTick);
  clearTimeout(hardTimer);

  const outStr = Buffer.concat(outChunks).toString("utf8");
  const errStr = Buffer.concat(errChunks).toString("utf8");

  console.error(`\n[Runner] Exit code=${code} signal=${signal || ""}`);
  console.error(`[Runner] Sizes: stdout=${outStr.length}B, stderr=${errStr.length}B`);

  console.log("\n----- BEGIN STDOUT -----\n" + outStr + "\n----- END STDOUT -----");
  console.error("\n----- BEGIN STDERR -----\n" + errStr + "\n----- END STDERR -----");

  if (hardTriggered) process.exit(137);
  else if (idleTriggered && code == null) process.exit(124);
  else process.exit(code == null ? 1 : code);
});

