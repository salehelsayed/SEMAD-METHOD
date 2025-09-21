#!/usr/bin/env node
/**
 * Scrum Master: Team Split Tool
 *
 * Usage:
 *   node tools/sm-team-split.js <story-path> [--dry-run] [--force]
 *
 * Behavior:
 *  - Reads teams config from .semad-core/teams.yaml (fallback to bmad-core/teams.yaml)
 *  - Parses the base story frontmatter; preserves StoryContract verbatim
 *  - Extracts candidates for assignment from:
 *      - StoryContract.filesToModify[].path
 *      - Body section "### Files to Modify" bullet list
 *      - Body tasks under Implementation Checklist (simple checkbox parsing)
 *  - Assigns items to teams by patterns (first) then keyword scores; ambiguous → default team
 *  - Writes per-team story files following story naming conventions:
 *      - If base is X.Y.story.md → X.Y.<team>.story.md
 *      - If base is story-X-Y.md → story-X-Y-<team>.md
 *      - Else → <base>-<team>.md
 *  - Adds traceability note: Derived from <base>, Team <team>
 *  - Idempotent; deterministic content; --dry-run prints a summary only
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const chalk = require('chalk');

function loadTeamsConfig(rootDir) {
  const candidates = [
    path.join(rootDir, '.semad-core', 'teams.yaml'),
    path.join(rootDir, 'semad-core', 'teams.yaml'),
    path.join(rootDir, 'bmad-core', 'teams.yaml'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const text = fs.readFileSync(p, 'utf8');
      const obj = yaml.load(text) || {};
      const teams = Array.isArray(obj.teams) ? obj.teams : [];
      const responsibilities = obj.team_responsibilities || {};
      const defaultStrategy = obj.default_assignment_strategy || (teams[0] || 'backend');
      // Scheduling preferences (optional)
      const scheduleCfg = obj.schedule || {};
      const sequentialIfConflict = typeof scheduleCfg.sequential_if_conflict === 'boolean' ? scheduleCfg.sequential_if_conflict : true;
      const singleSlotPerTeam = typeof scheduleCfg.single_slot_per_team === 'boolean' ? scheduleCfg.single_slot_per_team : true;
      const precedence = Array.isArray(scheduleCfg.precedence) ? scheduleCfg.precedence : (Array.isArray(obj.precedence) ? obj.precedence : undefined);
      return { teams, responsibilities, defaultStrategy, sequentialIfConflict, singleSlotPerTeam, precedence, source: p };
    }
  }
  return null;
}

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

function sanitizeTeamName(team) {
  return String(team).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function toRegexFromGlob(glob) {
  // Very small glob-to-regex for ** and * patterns
  let g = String(glob).replace(/[.+^${}()|\[\]\\]/g, '\\$&');
  g = g.replace(/\*\*/g, '§§DOUBLESTAR§§');
  g = g.replace(/\*/g, '[^/]*');
  g = g.replace(/§§DOUBLESTAR§§/g, '.*');
  return new RegExp('^' + g + '$');
}

function matchPatterns(filePath, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  const posix = filePath.split(path.sep).join('/');
  return patterns.some((p) => toRegexFromGlob(p).test(posix));
}

function keywordScore(text, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return 0;
  const lower = String(text || '').toLowerCase();
  let score = 0;
  for (const k of keywords) {
    const kw = String(k).toLowerCase();
    if (kw && lower.includes(kw)) score += 1;
  }
  return score;
}

function extractFilesToModifyFromBody(body) {
  // Look for section header '### Files to Modify' and collect "- <path>" or "- `<path>`" items
  const lines = body.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^###\s+Files\s+to\s+Modify/i.test(line)) { inSection = true; continue; }
    if (inSection && (/^##\s+/.test(line) || (/^###\s+/.test(line) && !/^###\s+Files\s+to\s+Modify/i.test(line)))) { break; }
    if (inSection) {
      const m1 = line.match(/^\s*-\s+`?([^`:\n]+)`?\s*:/); // - `path`: desc
      const m2 = line.match(/^\s*-\s+`?([^`\n]+)`?\s*$/);  // - `path`
      if (m1) out.push({ path: m1[1].trim(), raw: line });
      else if (m2) out.push({ path: m2[1].trim(), raw: line });
    }
  }
  return out;
}

function extractTasksFromBody(body) {
  // Heuristic: tasks are bullet points under Implementation Plan or similar sections
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

function buildAssignments(sc, body, teamsCfg) {
  const { teams, responsibilities, defaultStrategy } = teamsCfg;
  const teamSet = teams.map(sanitizeTeamName);
  const byTeam = new Map(teamSet.map(t => [t, { files: new Set(), tasks: [] }]));

  const filesFromSC = Array.isArray(sc?.filesToModify) ? sc.filesToModify.map(f => ({ path: f.path, reason: f.reason || '' })).filter(x => x.path) : [];
  const filesFromBody = extractFilesToModifyFromBody(body);
  const tasks = extractTasksFromBody(body);

  const chooseTeamForFile = (fp, reason) => {
    let best = null; let bestScore = -1;
    for (const team of teamSet) {
      const resp = responsibilities[team] || responsibilities[team.replace(/-/g, '_')] || {};
      const pats = Array.isArray(resp.patterns) ? resp.patterns : [];
      const kws = Array.isArray(resp.keywords) ? resp.keywords : [];
      const pHit = matchPatterns(fp, pats) ? 5 : 0;
      const kScore = keywordScore(`${fp} ${reason || ''}`, kws);
      const score = pHit + kScore;
      if (score > bestScore) { best = team; bestScore = score; }
    }
    return bestScore > 0 ? best : sanitizeTeamName(defaultStrategy);
  };

  const chooseTeamForTask = (txt) => {
    let best = null; let bestScore = -1;
    for (const team of teamSet) {
      const resp = responsibilities[team] || responsibilities[team.replace(/-/g, '_')] || {};
      const kws = Array.isArray(resp.keywords) ? resp.keywords : [];
      const score = keywordScore(txt, kws);
      if (score > bestScore) { best = team; bestScore = score; }
    }
    return bestScore > 0 ? best : sanitizeTeamName(defaultStrategy);
  };

  // Assign files
  for (const item of filesFromSC) {
    const team = chooseTeamForFile(item.path, item.reason);
    byTeam.get(team).files.add(item.path);
  }
  for (const item of filesFromBody) {
    const team = chooseTeamForFile(item.path, '');
    byTeam.get(team).files.add(item.path);
  }

  // Assign tasks
  for (const t of tasks) {
    const team = chooseTeamForTask(t);
    byTeam.get(team).tasks.push(t);
  }

  // Cross-team dependencies (shared directories heuristic)
  const dirMap = new Map();
  for (const [team, bag] of byTeam.entries()) {
    for (const f of bag.files) {
      const dir = path.posix.dirname(f.split(path.sep).join('/'));
      const set = dirMap.get(dir) || new Set();
      set.add(team); dirMap.set(dir, set);
    }
  }
  const crossDirs = [...dirMap.entries()].filter(([, s]) => s.size > 1).map(([d, s]) => ({ dir: d, teams: [...s].sort() }));

  return { byTeam, crossDirs };
}

function ensureStoriesDir(rootDir) {
  const dir = path.join(rootDir, 'docs', 'stories');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeHistory(rootDir, entry) {
  try {
    const histDir = path.join(rootDir, '.ai', 'history');
    fs.mkdirSync(histDir, { recursive: true });
    const p = path.join(histDir, 'team_split_log.jsonl');
    fs.appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch (_) {}
}

function buildTeamStory(baseContent, baseFrontRaw, front, body, team, basePath, crossDirs) {
  const header = baseFrontRaw; // already contains trailing --- and newline
  const lines = [];
  lines.push(header.trimEnd());
  lines.push('');
  // Traceability note (outside frontmatter)
  lines.push(`<!-- Generated: team-split; Derived-from: ${basePath}; Team: ${team}; Source-of-Truth: base story frontmatter -->`);
  lines.push('');
  lines.push(body.trimStart());
  // Inject Cross-team dependencies note at end if any
  if (Array.isArray(crossDirs) && crossDirs.length) {
    lines.push('\n## Cross-team Dependencies');
    for (const cd of crossDirs) {
      lines.push(`- ${cd.dir} (teams: ${cd.teams.join(', ')})`);
    }
  }
  return lines.join('\n');
}

function filterBodyForTeam(body, teamAssignments, team) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let inFiles = false;
  let inImpl = false;

  const filesAllowed = new Set(teamAssignments.get(team).files);
  const tasksAllowed = new Set(teamAssignments.get(team).tasks.map(t => t.toLowerCase().trim()));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^###\s+Files\s+to\s+Modify/i.test(line)) { inFiles = true; out.push(line); continue; }
    if (/^##\s+Implementation\s+Plan/i.test(line)) { inImpl = true; out.push(line); continue; }
    if (/^##\s+/.test(line)) { inFiles = false; if (!/^##\s+Implementation\s+Plan/i.test(line)) inImpl = false; out.push(line); continue; }

    if (inFiles) {
      // Keep only bullet lines that reference allowed files
      const m1 = line.match(/^\s*-\s+`?([^`:\n]+)`?\s*:/);
      const m2 = line.match(/^\s*-\s+`?([^`\n]+)`?\s*$/);
      const p = m1 ? m1[1].trim() : (m2 ? m2[1].trim() : null);
      if (!p) continue;
      if (filesAllowed.has(p)) out.push(line);
      continue;
    }

    if (inImpl) {
      // Keep only bullet points assigned to this team
      if (/^\s*-\s+/.test(line)) {
        const taskText = line.replace(/^\s*-\s+/, '').trim();
        if (tasksAllowed.has(taskText.toLowerCase())) {
          out.push(line);
        }
        continue;
      }
      out.push(line);
      continue;
    }

    out.push(line);
  }
  return out.join('\n');
}

function computeOutFileName(baseFileName, team) {
  const t = sanitizeTeamName(team);
  // Pattern 1: X.Y.story.md → X.Y.<team>.story.md
  let m = baseFileName.match(/^(\d+)\.(\d+)\.story\.md$/);
  if (m) {
    const [_, epic, story] = m;
    return `${epic}.${story}.${t}.story.md`;
  }
  // Pattern 2: story-X-Y.md → story-X-Y-<team>-md (keep legacy style)
  m = baseFileName.match(/^story-(\d+)-(\d+)\.md$/);
  if (m) {
    const [_, epic, story] = m;
    return `story-${epic}-${story}-${t}.md`;
  }
  // Default: <base>-<team>.md
  const noExt = baseFileName.replace(/\.md$/i, '');
  return `${noExt}-${t}.md`;
}

function ensureAdhocDir(rootDir) {
  const dir = path.join(rootDir, '.ai', 'adhoc');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildSchedule(byTeam, crossDirs, teamsCfg) {
  const teams = [...byTeam.keys()];
  // Conflict graph: edge if teams share a dir
  const graph = new Map(teams.map(t => [t, new Set()]));
  for (const cd of crossDirs) {
    const ts = cd.teams;
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        graph.get(ts[i]).add(ts[j]);
        graph.get(ts[j]).add(ts[i]);
      }
    }
  }
  // Precedence order (optional): database → backend → api → frontend → testing → infrastructure
  const precedence = (teamsCfg && teamsCfg.precedence) || ['database', 'backend', 'api', 'frontend', 'testing', 'infrastructure'];
  const orderScore = (t) => {
    const idx = precedence.indexOf(t);
    return idx === -1 ? 1000 : idx;
  };
  const edgesCount = [...graph.values()].reduce((acc, s) => acc + s.size, 0) / 2;

  // Policy: if any conflicts and sequentialIfConflict is true → sequential schedule (single slot per team)
  if (edgesCount > 0 && teamsCfg.sequentialIfConflict !== false) {
    const seq = teams.slice().sort((a, b) => {
      const os = orderScore(a) - orderScore(b);
      if (os !== 0) return os;
      const degA = graph.get(a).size, degB = graph.get(b).size;
      if (degA !== degB) return degB - degA; // higher degree first after precedence
      return a.localeCompare(b);
    });
    // Build rules to show explicit ordering
    const rules = [];
    for (let i = 0; i < seq.length - 1; i++) {
      rules.push({ before: seq[i], after: seq[i + 1], reason: 'sequential due to conflicts' });
    }
    return { mode: 'sequential', groups: seq.map(t => [t]), rules };
  }

  // Otherwise: parallel mode — greedy coloring with precedence to form parallel groups
  const sortedTeams = teams.slice().sort((a, b) => {
    const degA = graph.get(a).size, degB = graph.get(b).size;
    if (degA !== degB) return degB - degA; // higher degree first
    const os = orderScore(a) - orderScore(b);
    if (os !== 0) return os;
    return a.localeCompare(b);
  });
  const colors = []; // array of sets
  for (const t of sortedTeams) {
    let c = 0;
    for (; c < colors.length; c++) {
      const group = colors[c];
      // conflict if any neighbor in same group
      const hasConflict = [...graph.get(t)].some(n => group.has(n));
      if (!hasConflict) break;
    }
    if (!colors[c]) colors[c] = new Set();
    colors[c].add(t);
  }
  // Sequential hints for parallel mode
  const sequentialRules = [];
  for (const [t, neighbors] of graph.entries()) {
    for (const n of neighbors) {
      if (t < n) {
        const a = orderScore(t), b = orderScore(n);
        const first = a <= b ? t : n;
        const second = a <= b ? n : t;
        sequentialRules.push({ before: first, after: second, reason: 'shared directories' });
      }
    }
  }
  const key = (r) => `${r.before}->${r.after}`;
  const uniqMap = new Map();
  for (const r of sequentialRules) uniqMap.set(key(r), r);
  const uniqRules = [...uniqMap.values()];
  return { mode: 'parallel', groups: colors.map(s => [...s].sort()), rules: uniqRules };
}

function writeScheduleMarkdown(rootDir, baseName, schedule, crossDirs) {
  const dir = ensureAdhocDir(rootDir);
  const out = path.join(dir, `team-split-schedule-${baseName.replace(/\.md$/i, '')}.md`);
  const lines = [];
  lines.push(`# Team Split Schedule: ${baseName}`);
  lines.push('');
  lines.push(`Schedule Mode: ${schedule.mode === 'sequential' ? 'sequential' : 'parallel'}`);
  lines.push('');
  if (schedule.mode === 'sequential') {
    lines.push('## Sequential Order');
    schedule.groups.forEach((g, i) => {
      lines.push(`- Step ${i + 1}: ${g.join(', ')}`);
    });
  } else {
    lines.push('## Parallel Groups');
    schedule.groups.forEach((g, i) => {
      lines.push(`- Group ${i + 1}: ${g.join(', ')}`);
    });
  }
  if (schedule.rules.length) {
    lines.push('');
    lines.push(schedule.mode === 'sequential' ? '## Ordering' : '## Sequential Hints');
    for (const r of schedule.rules) {
      lines.push(`- ${r.before} → ${r.after} (${r.reason})`);
    }
  }
  if (Array.isArray(crossDirs) && crossDirs.length) {
    lines.push('');
    lines.push('## Cross-team Directories');
    for (const cd of crossDirs) {
      lines.push(`- ${cd.dir}: ${cd.teams.join(', ')}`);
    }
  }
  fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
  return out;
}

function main() {
  const rootDir = process.cwd();
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    console.error('Usage: node tools/sm-team-split.js <story-path> [--dry-run] [--force]');
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

  const teamsCfg = loadTeamsConfig(rootDir);
  if (!teamsCfg || !Array.isArray(teamsCfg.teams) || teamsCfg.teams.length === 0) {
    console.error('No teams configured. Create .semad-core/teams.yaml with a teams: [..] list.');
    if (teamsCfg?.source) console.error('Tried:', teamsCfg.source);
    process.exit(1);
  }

  const baseContent = fs.readFileSync(storyPath, 'utf8');
  const { front, rest, raw } = parseFrontmatter(baseContent);
  if (!front || !front.StoryContract) {
    console.error('Story missing YAML frontmatter with StoryContract. Aborting.');
    process.exit(1);
  }
  const sc = front.StoryContract;
  const baseTitle = extractTitle(rest) || path.basename(storyPath);

  // Build assignments
  const { byTeam, crossDirs } = buildAssignments(sc, rest, teamsCfg);
  // Build schedule
  const schedule = buildSchedule(byTeam, crossDirs, teamsCfg);

  // Prepare outputs
  const storiesDir = ensureStoriesDir(rootDir);
  const baseFile = path.basename(storyPath);
  const baseNameNoExt = baseFile.replace(/\.md$/i, '');

  const results = [];
  for (const [team, bag] of byTeam.entries()) {
    const teamName = sanitizeTeamName(team);
    const outName = computeOutFileName(baseFile, teamName);
    const outFile = path.join(storiesDir, outName);

    // Build body filtered for team
    const filteredBody = filterBodyForTeam(rest, byTeam, teamName);
    // Prepend Team Scope and Team Schedule sections to filtered body
    const scopeLines = [];
    scopeLines.push('## Team Scope Summary');
    const filesList = [...bag.files].sort();
    scopeLines.push(filesList.length ? filesList.map(f => `- ${f}`).join('\n') : '- (No direct file ownership)');
    scopeLines.push('');
    scopeLines.push('## Team Schedule');
    const groupIndex = schedule.groups.findIndex(g => g.includes(teamName));
    if (schedule.mode === 'sequential') {
      scopeLines.push(`- Sequence Position: ${groupIndex + 1} of ${schedule.groups.length}`);
    } else {
      scopeLines.push(`- Parallel Group: ${groupIndex + 1}`);
    }
    const afters = schedule.rules.filter(r => r.after === teamName).map(r => r.before);
    const befores = schedule.rules.filter(r => r.before === teamName).map(r => r.after);
    if (afters.length) scopeLines.push(`- Starts after: ${[...new Set(afters)].join(', ')}`);
    if (befores.length) scopeLines.push(`- Unblocks: ${[...new Set(befores)].join(', ')}`);
    scopeLines.push('');
    const composedBody = scopeLines.join('\n') + '\n' + filteredBody;
    const teamDoc = buildTeamStory(baseContent, raw, front, composedBody, teamName, path.relative(rootDir, storyPath), crossDirs);

    if (dryRun) {
      results.push({ team: teamName, outFile: path.relative(rootDir, outFile), files: [...bag.files].sort(), tasks: bag.tasks.slice(0, 10) });
    } else {
      // Overwrite protection: if file exists and no generator marker, require --force
      if (fs.existsSync(outFile)) {
        const prev = fs.readFileSync(outFile, 'utf8');
        if (!/Derived-from:\s/.test(prev) && !force) {
          console.error(`Refusing to overwrite existing file without marker: ${path.relative(rootDir, outFile)} (use --force)`);
          process.exit(2);
        }
      }
      fs.writeFileSync(outFile, teamDoc, 'utf8');
      writeHistory(rootDir, { action: 'write', outFile: path.relative(rootDir, outFile), team: teamName, base: path.relative(rootDir, storyPath) });
      results.push({ team: teamName, outFile: path.relative(rootDir, outFile), files: [...bag.files].sort(), tasks: bag.tasks.slice(0, 10) });
    }
  }

  // Write schedule report
  const schedulePath = writeScheduleMarkdown(rootDir, baseFile, schedule, crossDirs);

  // Emit summary
  console.log(chalk.bold(`Team split for: ${path.relative(rootDir, storyPath)}`));
  console.log(`Teams file: ${path.relative(rootDir, teamsCfg.source)}`);
  for (const r of results) {
    console.log(`- ${r.team}: ${r.outFile} (files: ${r.files.length}, tasks: ${r.tasks.length})`);
  }
  console.log(`Schedule: ${path.relative(rootDir, schedulePath)}`);
}

main();
