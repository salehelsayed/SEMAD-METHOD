#!/usr/bin/env node
/**
 * Migrate StoryContract in stories from YAML frontmatter to external XML files.
 * - Adds `StoryContractXml` pointer in frontmatter
 * - By default keeps YAML (dual-read mode). Use --xml-only to drop YAML.
 *
 * Options:
 *   --stories-dir <dir>   Directory containing stories (default: docs/stories)
 *   --pattern <pattern>   Override path pattern (tokens: {filebase}, {id})
 *   --xml-only            Remove YAML StoryContract from frontmatter after writing XML
 *   --dry-run             Do not modify files; print actions only
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const yaml = require('js-yaml');
const { toXml } = require('../semad-core/utils/xml-normalizer');

function argMap(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function loadCoreConfig() {
  const candidates = [path.join(process.cwd(), 'bmad-core', 'core-config.yaml'), path.join(process.cwd(), '.semad-core', 'core-config.yaml')];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return yaml.load(fs.readFileSync(p, 'utf8')) || {};
      } catch {}
    }
  }
  return {};
}

function computeContractPath(storyFile, contract, pattern) {
  const filebase = path.basename(storyFile, path.extname(storyFile));
  const id = (contract && (contract.story_id || contract?.story?.storyId)) || filebase;
  let p = pattern.replaceAll('{filebase}', filebase).replaceAll('{id}', String(id));
  // Normalize
  p = p.replace(/\\+/g, '/');
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { front: {}, body: raw, start: 0, end: 0 };
  let front = {};
  try { front = yaml.load(m[1]) || {}; } catch { front = {}; }
  const start = m.index;
  const end = m.index + m[0].length;
  const body = raw.slice(end);
  return { front, body, start, end };
}

async function migrateOne(file, opts) {
  const raw = await fsp.readFile(file, 'utf8');
  const { front, body } = parseFrontmatter(raw);

  // If already has StoryContractXml pointer and file exists, skip
  const xmlKey = Object.keys(front).find(k => /^StoryContractXml$/i.test(k));
  if (xmlKey && typeof front[xmlKey] === 'string') {
    const xmlPath = path.isAbsolute(front[xmlKey]) ? front[xmlKey] : path.join(process.cwd(), front[xmlKey]);
    if (fs.existsSync(xmlPath)) {
      return { status: 'skipped', reason: 'xml_present', file };
    }
  }

  if (!front.StoryContract || typeof front.StoryContract !== 'object') {
    return { status: 'skipped', reason: 'no_yaml_contract', file };
  }

  const contract = front.StoryContract;
  const xmlAbs = computeContractPath(file, contract, opts.pattern);
  const xmlRel = path.relative(process.cwd(), xmlAbs);

  const xmlString = toXml(contract);

  if (!opts.dryRun) {
    await fsp.mkdir(path.dirname(xmlAbs), { recursive: true });
    await fsp.writeFile(xmlAbs, xmlString, 'utf8');
  }

  // Update frontmatter
  front.StoryContractXml = xmlRel;
  if (opts.xmlOnly) delete front.StoryContract;

  const newFront = '---\n' + yaml.dump(front, { noRefs: true }).trimEnd() + '\n---\n\n';
  const newContent = newFront + body;
  if (!opts.dryRun) {
    await fsp.writeFile(file, newContent, 'utf8');
  }

  return { status: 'migrated', file, xml: xmlRel, removedYaml: !!opts.xmlOnly };
}

async function main() {
  const args = argMap(process.argv);
  const dryRun = !!args['dry-run'];
  const xmlOnly = !!args['xml-only'];
  const storiesDir = args['stories-dir'] || path.join(process.cwd(), 'docs', 'stories');
  const cfg = loadCoreConfig();
  const defaultPattern = cfg?.storyContract?.pathPattern || 'docs/stories/contracts/{filebase}.xml';
  const pattern = args['pattern'] || defaultPattern;

  // Collect story files
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && p.endsWith('.md')) files.push(p);
    }
  }
  walk(storiesDir);

  if (!files.length) {
    console.error(`No story files found in ${storiesDir}`);
    process.exit(1);
  }

  console.log(`Migrating ${files.length} stories to XML (${dryRun ? 'dry-run' : 'write'})...`);
  const results = { migrated: 0, skipped: 0, removedYaml: 0, errors: 0 };
  for (const f of files) {
    try {
      const r = await migrateOne(f, { dryRun, xmlOnly, pattern });
      if (r.status === 'migrated') {
        results.migrated++;
        if (r.removedYaml) results.removedYaml++;
        console.log(`✓ ${path.relative(process.cwd(), f)} → ${r.xml}${r.removedYaml ? ' (xml-only)' : ''}`);
      } else {
        results.skipped++;
        console.log(`· skip ${path.relative(process.cwd(), f)} (${r.reason})`);
      }
    } catch (e) {
      results.errors++;
      console.error(`✗ ${path.relative(process.cwd(), f)}: ${e.message}`);
    }
  }

  console.log('---');
  console.log(`Migrated: ${results.migrated}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Removed YAML: ${results.removedYaml}`);
  console.log(`Errors: ${results.errors}`);

  // Exit non-zero if errors occurred
  process.exit(results.errors ? 2 : 0);
}

if (require.main === module) {
  main();
}

