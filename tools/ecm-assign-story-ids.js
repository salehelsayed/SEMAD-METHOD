#!/usr/bin/env node
/**
 * Auto-assign Story IDs to ECM rows inside an EpicContract markdown file.
 *
 * Usage:
 *   node tools/ecm-assign-story-ids.js <epic.md> [--storiesDir docs/stories]
 *
 * Behavior:
 *   - Parses EpicContract frontmatter to read epic.epicId
 *   - Finds the ECM table under the "## Epic Coverage Matrix (ECM)" section
 *   - Assigns Story IDs to rows with empty/TBA Story ID using pattern ST-<epic-slug>-NNN
 *   - Increments NNN based on existing IDs in the ECM table and in storiesDir (if present)
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function parseFrontMatter(md) {
  const fmStart = md.indexOf('---');
  if (fmStart !== 0) return { data: null, body: md };
  const fmEnd = md.indexOf('\n---', 3);
  if (fmEnd === -1) return { data: null, body: md };
  const yamlText = md.slice(3, fmEnd + 1);
  const body = md.slice(fmEnd + 4);
  let data = null;
  try { data = yaml.load(yamlText); } catch (_) { data = null; }
  return { data, body, fmStart, fmEnd: fmEnd + 4 };
}

function slugifyEpic(epicId) {
  if (!epicId) return 'epic';
  return String(epicId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function pad(n) { return String(n).padStart(3, '0'); }

function findECMTable(body) {
  const lines = body.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Epic Coverage Matrix \(ECM\)/i.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  // Find first table row after the header
  let tableStart = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\|/.test(lines[i])) { tableStart = i; break; }
    if (lines[i].trim() === '') continue;
  }
  if (tableStart === -1) return null;
  // Collect table until a non-table line
  let tableEnd = tableStart;
  for (let i = tableStart; i < lines.length; i++) {
    if (!/^\|/.test(lines[i])) { break; }
    tableEnd = i;
  }
  const header = lines[tableStart];
  const divider = (tableStart + 1 <= tableEnd) ? lines[tableStart + 1] : '';
  const rows = lines.slice(tableStart + 2, tableEnd + 1);
  return { lines, startLine: tableStart, endLine: tableEnd, header, divider, rows };
}

function splitRow(row) {
  // Split by '|' and trim, ignore first and last empty due to leading/trailing |
  return row.split('|').slice(1, -1).map(c => c.trim());
}

function buildRow(cells) {
  return '| ' + cells.map(c => c.trim()).join(' | ') + ' |';
}

function collectExistingIds(epicSlug, rows, storiesDirAbs) {
  const ids = new Set();
  const re = new RegExp(`^ST-${epicSlug}-([0-9]{1,3})$`, 'i');
  for (const r of rows) {
    const c = splitRow(r);
    for (const cell of c) {
      const m = cell.match(re);
      if (m) ids.add(parseInt(m[1], 10));
    }
  }
  if (storiesDirAbs && fs.existsSync(storiesDirAbs)) {
    const files = fs.readdirSync(storiesDirAbs).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(storiesDirAbs, f), 'utf8');
      const m = content.match(new RegExp(`ST-${epicSlug}-([0-9]{1,3})`, 'i'));
      if (m) ids.add(parseInt(m[1], 10));
    }
  }
  return ids;
}

function nextId(existing) {
  let n = 1;
  while (existing.has(n)) n++;
  return n;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node tools/ecm-assign-story-ids.js <epic.md> [--storiesDir docs/stories]');
    process.exit(2);
  }
  const epicPath = path.resolve(process.cwd(), args[0]);
  const storiesDirArgIdx = args.indexOf('--storiesDir');
  const storiesDir = storiesDirArgIdx !== -1 ? args[storiesDirArgIdx + 1] : 'docs/stories';
  const statusSync = args.includes('--status-sync');
  const storiesDirAbs = path.resolve(process.cwd(), storiesDir);
  if (!fs.existsSync(epicPath)) {
    console.error(`Epic file not found: ${epicPath}`);
    process.exit(2);
  }
  const raw = fs.readFileSync(epicPath, 'utf8');
  const { data, body, fmEnd } = parseFrontMatter(raw);
  if (!data || !data.epic || !data.epic.epicId) {
    console.error('Epic frontmatter missing epic.epicId');
    process.exit(2);
  }
  const epicSlug = slugifyEpic(data.epic.epicId);
  const table = findECMTable(body);
  if (!table) {
    console.error('ECM table not found in epic body (look for "## Epic Coverage Matrix (ECM)")');
    process.exit(2);
  }
  const headerCells = splitRow(table.header).map(h => h.toLowerCase());
  const storyColIdx = headerCells.findIndex(h => h.replace(/\s+/g, ' ') === 'story id');
  if (storyColIdx === -1) {
    console.error('ECM table missing "Story ID" column');
    process.exit(2);
  }
  const statusColIdx = headerCells.findIndex(h => h.replace(/\s+/g, ' ') === 'status');
  const existing = collectExistingIds(epicSlug, table.rows, storiesDirAbs);
  let assigned = 0;
  const newRows = table.rows.map(r => {
    const cells = splitRow(r);
    const cur = (cells[storyColIdx] || '').trim();
    const needs = !cur || cur.toLowerCase() === 'tba' || cur === '-' || cur.toLowerCase() === 'n/a';
    if (needs) {
      const nid = nextId(existing);
      const sid = `ST-${epicSlug}-${pad(nid)}`;
      existing.add(nid);
      cells[storyColIdx] = sid;
      assigned++;
    }
    if (statusSync && statusColIdx !== -1) {
      try {
        const sid = (cells[storyColIdx] || '').trim();
        if (sid) {
          let storyFile = null;
          if (fs.existsSync(storiesDirAbs)) {
            for (const f of fs.readdirSync(storiesDirAbs)) {
              if (!f.endsWith('.md')) continue;
              const text = fs.readFileSync(path.join(storiesDirAbs, f), 'utf8');
              if (text.includes(sid)) { storyFile = f; break; }
            }
          }
          if (storyFile) {
            const text = fs.readFileSync(path.join(storiesDirAbs, storyFile), 'utf8');
            const done = /status:\s*done/i.test(text);
            const inprog = /status:\s*(in_progress|implemented|verified)/i.test(text);
            if (done) cells[statusColIdx] = 'done';
            else if (inprog && (!cells[statusColIdx] || cells[statusColIdx].toLowerCase() === 'planned')) cells[statusColIdx] = 'in_progress';
          }
        }
      } catch (_) {}
    }
    return buildRow(cells);
  });
  const lines = table.lines.slice();
  // Replace table rows in the body
  for (let i = 0; i < newRows.length; i++) {
    lines[table.startLine + 2 + i] = newRows[i];
  }
  const newBody = lines.join('\n');
  const newContent = raw.slice(0, fmEnd) + newBody;
  fs.writeFileSync(epicPath, newContent, 'utf8');
  console.log(`Assigned ${assigned} Story ID(s) using base ST-${epicSlug}-NNN in ${epicPath}`);
  if (statusSync) console.log('Status synchronized where possible (planned → in_progress/done).');
}

main();
