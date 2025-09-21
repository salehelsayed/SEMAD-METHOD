#!/usr/bin/env node
/**
 * PO: Create EpicContracts from PRD
 *
 * Reads docs/prd/PRD.md (greenfield PRD) and generates per‑epic EpicContract files
 * under docs/epics/ using docs/templates/epic-contract-template.md. Basic placeholders
 * (title, goal, epicId) are filled; the rest remains as scaffold for PO/PM to refine.
 */

const fs = require('fs');
const path = require('path');

function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function parseEpicList(prdMd) {
  // Find section "## Epic List" and collect bullet lines or lines starting with "Epic"
  const lines = prdMd.split('\n');
  const result = [];
  let inEpicList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+epic\s+list/i.test(line)) { inEpicList = true; continue; }
    if (inEpicList && /^##\s+/.test(line)) { break; }
    if (!inEpicList) continue;
    const l = line.trim();
    if (!l) continue;
    if (/^-\s+/.test(l) || /^epic\s*\d+\s*:/i.test(l)) {
      // Typical format: "- Epic 1: Title: Goal"
      const m = l.replace(/^-\s*/, '').match(/epic\s*\d+\s*:\s*([^:]+?)(?::\s*(.*))?$/i);
      if (m) {
        const title = m[1].trim();
        const goal = (m[2] || '').trim();
        result.push({ title, goal });
        continue;
      }
      // Fallback: try bullet-only title
      const t = l.replace(/^-\s*/, '').trim();
      if (t) result.push({ title: t, goal: '' });
    }
  }
  return result;
}

function parseEpicDetails(prdMd) {
  // Parse H2 sections like "## Epic N Title" to capture better titles/goals if present
  const re = /^##\s+epic\s+(\d+)\s+(.+)$/i;
  const result = [];
  let current = null;
  for (const line of prdMd.split('\n')) {
    const m = line.match(re);
    if (m) {
      if (current) result.push(current);
      current = { number: parseInt(m[1], 10), title: m[2].trim(), goal: '' };
      continue;
    }
    if (current) {
      // Heuristic: first non-empty paragraph becomes goal (max ~200 chars)
      if (!current.goal && line.trim() && !/^\s*[-#]/.test(line)) {
        current.goal = line.trim().slice(0, 200);
      }
    }
  }
  if (current) result.push(current);
  // Normalize to array of {title, goal}
  return result.map(({ title, goal }) => ({ title, goal }));
}

function generateEpicFile(template, epic, opts) {
  const title = epic.title || 'Untitled Epic';
  const goal = epic.goal || 'TBD';
  const epSlug = slug(title) || 'epic';
  // Simple replacements for common placeholders and YAML values
  let out = template;
  out = out.replace(/(epicId:\s*)EP-XXX/, `$1EP-${epSlug.toUpperCase()}`);
  out = out.replace(/title:\s*"Concise epic title"/, `title: "${title.replace(/"/g, '\\"')}"`);
  out = out.replace(/goal:\s*"Outcome the epic delivers"/, `goal: "${goal.replace(/"/g, '\\"')}"`);
  out = out.replace(/# Epic: \{\{title\}\}/, `# Epic: ${title}`);
  out = out.replace(/\{\{goal\}\}/g, goal);
  // Links can include anchors derived from slug
  out = out.replace(/links:\s*[\s\S]*?storiesDir:[\s\S]*?\n/, (m) => m
    .replace(/prd:\s*"[^"]*"/, `prd: "docs/prd/PRD.md#epic-${epSlug}"`)
    .replace(/architecture:\s*"[^"]*"/, `architecture: "docs/architecture/architecture.md#epic-${epSlug}"`)
    .replace(/storiesDir:\s*"[^"]*"/, `storiesDir: "docs/stories/${epSlug}/"`)
  );
  return { filename: `epic-${epSlug}.md`, content: out };
}

function main() {
  const root = process.cwd();
  const prdPath = path.join(root, 'docs', 'prd', 'PRD.md');
  if (!fs.existsSync(prdPath)) {
    console.error('PRD not found at docs/prd/PRD.md');
    process.exit(1);
  }
  const tmplPath = path.join(root, 'docs', 'templates', 'epic-contract-template.md');
  if (!fs.existsSync(tmplPath)) {
    console.error('EpicContract template not found at docs/templates/epic-contract-template.md');
    process.exit(1);
  }

  const prdMd = read(prdPath);
  let epics = parseEpicList(prdMd);
  if (epics.length === 0) {
    const details = parseEpicDetails(prdMd);
    if (details.length) epics = details;
  }
  if (epics.length === 0) {
    console.error('No epics detected in PRD (expected "## Epic List" bullets or "## Epic N Title" sections).');
    process.exit(2);
  }

  const destDir = path.join(root, 'docs', 'epics');
  ensureDir(destDir);
  const template = read(tmplPath);
  const created = [];
  for (const epic of epics) {
    const { filename, content } = generateEpicFile(template, epic, {});
    const outPath = path.join(destDir, filename);
    if (!fs.existsSync(outPath)) {
      fs.writeFileSync(outPath, content, 'utf8');
      created.push(path.relative(root, outPath));
    }
  }

  if (created.length === 0) {
    console.log('No new epic files created (existing files preserved).');
  } else {
    console.log(`Created ${created.length} EpicContract file(s):`);
    for (const f of created) console.log(`- ${f}`);
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('create-epics-from-prd failed:', e.message); process.exit(1); }
}

module.exports = {};

