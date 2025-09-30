#!/usr/bin/env node
/**
 * Scrum Master: Scope Split Tool (top-level directory based)
 *
 * Usage:
 *   node tools/sm-scope-split.js <story-path> [--dry-run] [--force]
 *
 * Behavior:
 *  - Parses the base story frontmatter; preserves StoryContract verbatim
 *  - Extracts candidates from:
 *      - StoryContract.filesToModify[].path
 *      - Body section "### Files to Modify" bullet list
 *      - Body tasks under Implementation Checklist (simple checkbox parsing)
 *  - Determines scope by the top-level directory of file paths (first segment)
 *  - Assigns tasks to a scope if they reference a path; otherwise to a fallback scope "misc"
 *  - Writes per-scope story files following story naming conventions (append -<scope>)
 *  - Adds traceability note and schedule. Schedules are sequential if conflicts are detected; otherwise a single parallel group.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadStoryContract } = require('../semad-core/utils/story-contract');
const chalk = require('chalk');

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { front: null, rest: text };
  const frontRaw = m[1];
  let front;
  try { front = yaml.load(frontRaw) || {}; } catch (_) { front = {}; }
  const rest = text.slice(m[0].length);
  return { front, rest, raw: m[0] };
}

function extractTitle(text) {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function topLevelScope(p) {
  const posix = p.split(path.sep).join('/');
  const seg = posix.split('/')[0] || '';
  return seg || 'root';
}

function extractFilesToModifyFromBody(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^###\s+Files\s+to\s+Modify/i.test(line)) { inSection = true; continue; }
    if (inSection && (/^##\s+/.test(line) || (/^###\s+/.test(line) && !/^###\s+Files\s+to\s+Modify/i.test(line)))) { break; }
    if (inSection) {
      const m1 = line.match(/^\s*-\s+`?([^`:\n]+)`?\s*:/);
      const m2 = line.match(/^\s*-\s+`?([^`\n]+)`?\s*$/);
      if (m1) out.push({ path: m1[1].trim(), raw: line });
      else if (m2) out.push({ path: m2[1].trim(), raw: line });
    }
  }
  return out;
}

function extractTasksFromBody(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let inImpl = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+Implementation\s+Checklist/i.test(line)) { inImpl = true; continue; }
    if (inImpl && /^##\s+/.test(line) && !/^##\s+Implementation\s+Checklist/i.test(line)) { break; }
    if (!inImpl) continue;
    if (/^###\s+/.test(line)) { continue; }
    if (/^\s*-\s+/.test(line)) {
      let task = line.replace(/^\s*-\s+/, '').trim();
      task = task.replace(/^\[\s?\]\s*/,'');
      out.push(task);
    }
  }
  return out;
}

function extractPathTokens(text) {
  const tokens = new Set();
  const codeMatches = text.match(/`([^`]+\/[^`]+)`/g) || [];
  for (const m of codeMatches) {
    const v = m.slice(1, -1);
    tokens.add(v);
  }
  const plainMatches = text.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+/g) || [];
  for (const v of plainMatches) tokens.add(v);
  // Filter out obvious non-paths (N/A, URLs, single-letter segments)
  const filtered = [...tokens].filter(v => {
    if (!v) return false;
    const s = String(v);
    if (/^https?:\/\//i.test(s)) return false;
    if (/^[A-Za-z]:\//.test(s)) return false; // Windows drive
    if (/^N\/A$/i.test(s)) return false;
    const first = s.split('/')[0];
    if (!first || first.length <= 1) return false;
    return true;
  });
  return filtered;
}

function ensureStoriesDir(rootDir) {
  const dir = path.join(rootDir, 'docs', 'stories');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureAdhocDir(rootDir) {
  const dir = path.join(rootDir, '.ai', 'adhoc');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function computeOutFileName(baseFileName, scope) {
  const s = String(scope).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  let m = baseFileName.match(/^(\d+)\.(\d+)\.story\.md$/);
  if (m) {
    const [_, epic, story] = m;
    return `${epic}.${story}.${s}.story.md`;
  }
  m = baseFileName.match(/^story-(\d+)-(\d+)\.md$/);
  if (m) {
    const [_, epic, story] = m;
    return `story-${epic}-${story}-${s}.md`;
  }
  const noExt = baseFileName.replace(/\.md$/i, '');
  return `${noExt}-${s}.md`;
}

function buildSchedule(scopes, scopeFiles) {
  // Build conflict graph: scopes conflict if they share any directory (shouldn’t happen with top-level grouping),
  // but we keep this generic for safety.
  const scopeList = [...scopes];
  const graph = new Map(scopeList.map(s => [s, new Set()]));
  const dirOwners = new Map();
  for (const s of scopeList) {
    const files = scopeFiles.get(s) || new Set();
    for (const f of files) {
      const dir = path.posix.dirname(f.split(path.sep).join('/'));
      const owners = dirOwners.get(dir) || new Set();
      owners.add(s); dirOwners.set(dir, owners);
    }
  }
  for (const [, owners] of dirOwners) {
    const arr = [...owners];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        graph.get(arr[i]).add(arr[j]);
        graph.get(arr[j]).add(arr[i]);
      }
    }
  }
  const edgesCount = [...graph.values()].reduce((acc, s) => acc + s.size, 0) / 2;
  if (edgesCount > 0) {
    // Sequential order: sort by scope name for determinism
    const seq = scopeList.slice().sort();
    const rules = [];
    for (let i = 0; i < seq.length - 1; i++) rules.push({ before: seq[i], after: seq[i + 1], reason: 'sequential due to conflicts' });
    return { mode: 'sequential', groups: seq.map(s => [s]), rules };
  }
  return { mode: 'parallel', groups: [scopeList.slice().sort()], rules: [] };
}

function writeScheduleMarkdown(rootDir, baseName, schedule, scopeToOutRel) {
  const dir = ensureAdhocDir(rootDir);
  const out = path.join(dir, `scope-split-schedule-${baseName.replace(/\.md$/i, '')}.md`);
  const lines = [];
  lines.push(`# Scope Split Schedule: ${baseName}`);
  lines.push('');
  lines.push(`Schedule Mode: ${schedule.mode === 'sequential' ? 'sequential' : 'parallel'}`);
  lines.push('');
  // Human-friendly execution schedule (stable format for scripting)
  lines.push('## Execution Schedule');
  if (schedule.mode === 'sequential') {
    schedule.groups.forEach((g, i) => {
      const scope = g[0];
      const story = scopeToOutRel.get(scope);
      lines.push(`- Slot ${i + 1}: ${scope}`);
      if (story) lines.push(`  - Story: ${story}`);
    });
  } else {
    schedule.groups.forEach((g, i) => {
      lines.push(`- Group ${i + 1}:`);
      g.forEach(scope => {
        const story = scopeToOutRel.get(scope);
        if (story) lines.push(`  - Story: ${story} (scope: ${scope})`);
      });
    });
  }

  // Machine-readable manifest for scripting
  const manifest = {
    mode: schedule.mode,
    groups: schedule.groups.map(g => g.map(scope => ({ scope, story: scopeToOutRel.get(scope) })).filter(x => x.story))
  };
  lines.push('');
  lines.push('## Schedule Manifest');
  lines.push('```json');
  lines.push(JSON.stringify(manifest, null, 2));
  lines.push('```');
  fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
  return out;
}

function filterBodyForScope(body, scope, scopeFilesSet, scopeTasksSet) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let inFiles = false;
  let inImpl = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^###\s+Files\s+to\s+Modify/i.test(line)) { inFiles = true; out.push(line); continue; }
    if (/^##\s+Implementation\s+Plan/i.test(line)) { inImpl = true; out.push(line); continue; }
    if (/^##\s+/.test(line)) { inFiles = false; if (!/^##\s+Implementation\s+Plan/i.test(line)) inImpl = false; out.push(line); continue; }
    if (inFiles) {
      const m1 = line.match(/^\s*-\s+`?([^`:\n]+)`?\s*:/);
      const m2 = line.match(/^\s*-\s+`?([^`\n]+)`?\s*$/);
      const p = m1 ? m1[1].trim() : (m2 ? m2[1].trim() : null);
      if (!p) continue;
      const sc = topLevelScope(p);
      if (sc === scope && scopeFilesSet.has(p)) out.push(line);
      continue;
    }
    if (inImpl) {
      if (/^\s*-\s+/.test(line)) {
        const txt = line.replace(/^\s*-\s+/, '').trim();
        if (scopeTasksSet.has(txt.toLowerCase())) out.push(line);
        continue;
      }
      out.push(line);
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function buildScopeStory(baseFrontRaw, body, scope, basePath, schedule, scopeFiles, scopeTasks, storyRelPath) {
  const lines = [];
  lines.push(baseFrontRaw.trimEnd());
  lines.push('');
  lines.push(`<!-- Generated: scope-split; Derived-from: ${basePath}; Scope: ${scope}; Source-of-Truth: base story frontmatter -->`);
  lines.push('');
  // Prepend scope summary and schedule
  const filesList = [...(scopeFiles.get(scope) || new Set())].sort();
  const groupIndex = schedule.groups.findIndex(g => g.includes(scope));
  const scheduleLines = [];
  scheduleLines.push('## Scope Summary');
  scheduleLines.push(filesList.length ? filesList.map(f => `- ${f}`).join('\n') : '- (No direct file ownership)');
  scheduleLines.push('');
  scheduleLines.push('## Scope Schedule');
  if (storyRelPath) scheduleLines.push(`- Story File: ${storyRelPath}`);
  if (schedule.mode === 'sequential') scheduleLines.push(`- Sequence Position: ${groupIndex + 1} of ${schedule.groups.length}`);
  else scheduleLines.push(`- Parallel Group: ${groupIndex + 1}`);

  const filteredBody = filterBodyForScope(body, scope, scopeFiles.get(scope) || new Set(), new Set((scopeTasks.get(scope) || []).map(t => t.toLowerCase())));
  lines.push(scheduleLines.join('\n'));
  lines.push('');
  lines.push(filteredBody.trimStart());
  return lines.join('\n');
}

function main() {
  const rootDir = process.cwd();
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    console.error('Usage: node tools/sm-scope-split.js <story-path> [--dry-run] [--force]');
    process.exit(1);
  }
  const storyRel = argv[0];
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--force');

  const storyPath = path.isAbsolute(storyRel) ? storyRel : path.join(rootDir, storyRel);
  if (!fs.existsSync(storyPath)) {
    console.error('Story file not found:', storyPath);
    process.exit(1);
  }

  const baseContent = fs.readFileSync(storyPath, 'utf8');
  const { front, rest, raw } = parseFrontmatter(baseContent);
  let sc;
  try {
    sc = loadStoryContract(storyPath).contract;
  } catch (e) {
    console.error('Story missing StoryContract (XML pointer or YAML). Aborting.');
    console.error('Reason:', e.message);
    process.exit(1);
  }
  const baseFile = path.basename(storyPath);

  // Gather files and tasks
  const filesFromSC = Array.isArray(sc?.filesToModify) ? sc.filesToModify.map(f => ({ path: f.path, reason: f.reason || '' })).filter(x => x.path) : [];
  const filesFromBody = extractFilesToModifyFromBody(rest);
  const tasks = extractTasksFromBody(rest);

  // Determine scopes and assign
  const scopeFiles = new Map(); // scope -> Set(paths)
  const scopeTasks = new Map(); // scope -> [task strings]
  const scopes = new Set();

  for (const item of [...filesFromSC, ...filesFromBody]) {
    const s = topLevelScope(item.path);
    scopes.add(s);
    const set = scopeFiles.get(s) || new Set();
    set.add(item.path);
    scopeFiles.set(s, set);
  }

  for (const t of tasks) {
    const refs = extractPathTokens(t);
    if (refs.length) {
      // assign to first referenced scope
      const s = topLevelScope(refs[0]);
      scopes.add(s);
      const arr = scopeTasks.get(s) || [];
      arr.push(t);
      scopeTasks.set(s, arr);
    } else {
      // fallback to scope with most files, else 'misc'
      let bestScope = null, bestCount = -1;
      for (const s of scopes) {
        const c = (scopeFiles.get(s) || new Set()).size;
        if (c > bestCount) { bestScope = s; bestCount = c; }
      }
      const target = bestScope || 'misc';
      if (!scopes.has(target)) scopes.add(target);
      const arr = scopeTasks.get(target) || [];
      arr.push(t);
      scopeTasks.set(target, arr);
    }
  }

  // Pre-compute output paths for each scope (even for dry-run)
  const storiesDir = ensureStoriesDir(rootDir);
  const scopeToOutAbs = new Map();
  const scopeToOutRel = new Map();
  for (const s of [...scopes].sort()) {
    const outName = computeOutFileName(baseFile, s);
    const outFile = path.join(storiesDir, outName);
    scopeToOutAbs.set(s, outFile);
    scopeToOutRel.set(s, path.relative(rootDir, outFile));
  }

  // Build schedule
  const schedule = buildSchedule(scopes, scopeFiles);

  // Outputs
  const results = [];
  for (const s of [...scopes].sort()) {
    const outFile = scopeToOutAbs.get(s);
    if (dryRun) {
      results.push({ scope: s, outFile: scopeToOutRel.get(s), files: [...(scopeFiles.get(s) || new Set())].sort(), tasks: (scopeTasks.get(s) || []).slice(0, 10) });
      continue;
    }
    if (fs.existsSync(outFile)) {
      const prev = fs.readFileSync(outFile, 'utf8');
      if (!/Derived-from:\s/.test(prev) && !force) {
        console.error(`Refusing to overwrite existing file without marker: ${path.relative(rootDir, outFile)} (use --force)`);
        process.exit(2);
      }
    }
    const storyDoc = buildScopeStory(raw, rest, s, path.relative(rootDir, storyPath), schedule, scopeFiles, scopeTasks, scopeToOutRel.get(s));
    fs.writeFileSync(outFile, storyDoc, 'utf8');
    results.push({ scope: s, outFile: scopeToOutRel.get(s), files: [...(scopeFiles.get(s) || new Set())].sort(), tasks: (scopeTasks.get(s) || []).slice(0, 10) });
  }

  const schedPath = writeScheduleMarkdown(rootDir, baseFile, schedule, scopeToOutRel);

  console.log(chalk.bold(`Scope split for: ${path.relative(rootDir, storyPath)}`));
  for (const r of results) {
    console.log(`- ${r.scope}: ${r.outFile} (files: ${r.files.length}, tasks: ${r.tasks.length})`);
  }
  console.log(`Schedule: ${path.relative(rootDir, schedPath)}`);
}

main();
