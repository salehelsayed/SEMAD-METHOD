#!/usr/bin/env node
/**
 * Validate that team-split stories:
 *  - Preserve StoryContract exactly as base story
 *  - Only include Files to Modify entries relevant to their team patterns
 *
 * Usage: node tools/validate-team-stories.js <base-story> [--strict]
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadTeams(root) {
  const cand = [path.join(root, '.semad-core', 'teams.yaml'), path.join(root, 'bmad-core', 'teams.yaml')];
  for (const p of cand) if (fs.existsSync(p)) return yaml.load(fs.readFileSync(p, 'utf8')) || {};
  return {};
}

function parseFrontmatter(txt) {
  const m = txt.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  try { return yaml.load(m[1]); } catch (_) { return null; }
}

function extractFilesToModifyFromBody(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (/^###\s+Files\s+to\s+Modify/i.test(line)) { inSection = true; continue; }
    if (inSection && (/^##\s+/.test(line) || (/^###\s+/.test(line) && !/^###\s+Files\s+to\s+Modify/i.test(line)))) { break; }
    if (inSection) {
      const m1 = line.match(/^\s*-\s+`?([^`:\n]+)`?\s*:/);
      const m2 = line.match(/^\s*-\s+`?([^`\n]+)`?\s*$/);
      const p = m1 ? m1[1].trim() : (m2 ? m2[1].trim() : null);
      if (p) out.push(p);
    }
  }
  return out;
}

function toRegexFromGlob(glob) {
  let g = String(glob).replace(/[.+^${}()|\[\]\\]/g, '\\$&');
  g = g.replace(/\*\*/g, '§§DOUBLESTAR§§');
  g = g.replace(/\*/g, '[^/]*');
  g = g.replace(/§§DOUBLESTAR§§/g, '.*');
  return new RegExp('^' + g + '$');
}

function matchPatterns(filePath, patterns) {
  const posix = filePath.split(path.sep).join('/');
  return (patterns || []).some((p) => toRegexFromGlob(p).test(posix));
}

function main() {
  const root = process.cwd();
  const baseRel = process.argv[2];
  if (!baseRel) {
    console.error('Usage: node tools/validate-team-stories.js <base-story> [--strict]');
    process.exit(1);
  }
  const basePath = path.isAbsolute(baseRel) ? baseRel : path.join(root, baseRel);
  if (!fs.existsSync(basePath)) { console.error('Base story not found:', basePath); process.exit(1); }
  const baseTxt = fs.readFileSync(basePath, 'utf8');
  const fm = parseFrontmatter(baseTxt);
  const scBase = fm?.StoryContract;
  if (!scBase) { console.error('Base story missing StoryContract.'); process.exit(1); }

  const teamsCfg = loadTeams(root);
  const teams = (teamsCfg.teams || []).map(t => String(t).toLowerCase());
  const responsibilities = teamsCfg.team_responsibilities || {};
  const dir = path.dirname(basePath);
  const baseName = path.basename(basePath, '.md');

  let ok = true;
  for (const t of teams) {
    const teamFile = path.join(dir, `${baseName}-${t}.md`);
    if (!fs.existsSync(teamFile)) { console.warn(`Missing team story: ${path.relative(root, teamFile)}`); ok = false; continue; }
    const txt = fs.readFileSync(teamFile, 'utf8');
    const m = txt.match(/^---\n([\s\S]*?)\n---\n?/);
    const y = m ? yaml.load(m[1]) : null;
    if (!y || !y.StoryContract) { console.error('No StoryContract in team file:', teamFile); ok = false; continue; }
    const scTeam = y.StoryContract;
    if (JSON.stringify(scBase) !== JSON.stringify(scTeam)) { console.error('StoryContract drift in:', teamFile); ok = false; }

    // Validate Files to Modify belong to team patterns when present
    const body = txt.slice((m ? m[0].length : 0));
    const files = extractFilesToModifyFromBody(body);
    const pats = (responsibilities[t]?.patterns) || [];
    for (const f of files) {
      if (!matchPatterns(f, pats)) {
        console.warn(`Warning: File not matching team patterns for ${t}: ${f}`);
      }
    }
  }

  if (!ok) process.exit(2);
  console.log('Team stories validation completed.');
}

main();
