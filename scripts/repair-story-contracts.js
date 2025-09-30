#!/usr/bin/env node
/**
 * Auto-repair common StoryContract schema gaps across all stories.
 * - Ensures required fields exist and are strings
 * - Fills missing linkedArtifacts.version as '1.0'
 * - Ensures filesToModify[].reason exists
 * - Writes back to XML contract file pointed by StoryContractXml
 *
 * Options:
 *   --dry-run   Do not write changes; print summary only
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const yaml = require('js-yaml');
const { loadStoryContract } = require('../semad-core/utils/story-contract');
const { toXml } = require('../semad-core/utils/xml-normalizer');
const StoryContractValidator = require('../bmad-core/utils/story-contract-validator');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

function readFrontmatter(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { front: {}, body: raw };
  let front = {};
  try { front = yaml.load(m[1]) || {}; } catch { front = {}; }
  return { front, body: raw.slice(m[0].length) };
}

function storyIdFromFilename(file) {
  const base = path.basename(file, path.extname(file));
  const m = base.match(/^story-(\d+)-(\d+)/i);
  if (m) return `${m[1]}-${m[2]}`;
  return base; // fallback
}

function ensureString(v, fallback = '') { return v == null ? fallback : String(v); }

function applyCommonRepairs(contract, storyFile) {
  const before = JSON.stringify(contract);

  // Required fields
  if (!contract.version) contract.version = '1.0';
  contract.version = ensureString(contract.version, '1.0');
  if (!contract.schemaVersion) contract.schemaVersion = '1.0';
  contract.schemaVersion = ensureString(contract.schemaVersion, '1.0');

  if (!contract.story_id) contract.story_id = storyIdFromFilename(storyFile);
  contract.story_id = ensureString(contract.story_id, storyIdFromFilename(storyFile));

  if (!contract.epic_id) {
    const m = String(contract.story_id).match(/^(\d+)-/);
    contract.epic_id = m ? m[1] : '0';
  }
  contract.epic_id = ensureString(contract.epic_id, '0');

  // linkedArtifacts: ensure version exists
  if (Array.isArray(contract.linkedArtifacts)) {
    contract.linkedArtifacts = contract.linkedArtifacts.map(a => ({
      type: ensureString(a?.type || 'artifact'),
      path: ensureString(a?.path || ''),
      version: ensureString(a?.version || '1.0')
    }));
  }

  // filesToModify: ensure reason
  if (Array.isArray(contract.filesToModify)) {
    contract.filesToModify = contract.filesToModify.map(f => ({
      path: ensureString(f?.path || ''),
      reason: ensureString(f?.reason || 'Modification required')
    }));
  }

  const after = JSON.stringify(contract);
  return before !== after;
}

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = !!args['dry-run'];
  const root = process.cwd();
  const storiesDir = path.join(root, 'docs', 'stories');
  if (!fs.existsSync(storiesDir)) {
    console.error('Stories directory not found:', storiesDir);
    process.exit(1);
  }
  const files = fs.readdirSync(storiesDir).filter(f => f.endsWith('.md')).map(f => path.join(storiesDir, f));
  const validator = new StoryContractValidator();
  const results = { fixed: 0, skipped: 0, errors: 0 };

  for (const storyFile of files) {
    try {
      const { front } = readFrontmatter(storyFile);
      const xmlKey = Object.keys(front || {}).find(k => /^StoryContractXml$/i.test(k));
      if (!xmlKey || !front[xmlKey]) { results.skipped++; continue; }
      const xmlRel = front[xmlKey];
      const xmlAbs = path.isAbsolute(xmlRel) ? xmlRel : path.join(root, xmlRel);
      if (!fs.existsSync(xmlAbs)) { results.errors++; console.error('Missing XML for', path.relative(root, storyFile)); continue; }

      // Load & repair
      const { contract } = loadStoryContract(storyFile);
      const changed = applyCommonRepairs(contract, storyFile);
      const { valid, errors } = validator.validateContract(contract);
      if (!valid) {
        console.error('Validation errors for', path.relative(root, storyFile));
        console.error(validator.formatErrors(errors));
        // Still write if changed to make progress
      }

      if (changed && !dryRun) {
        const xml = toXml(contract);
        await fsp.writeFile(xmlAbs, xml, 'utf8');
      }
      if (changed) results.fixed++; else results.skipped++;
    } catch (e) {
      results.errors++;
      console.error('Failed to repair', path.relative(root, storyFile), '-', e.message);
    }
  }

  console.log('Repair summary:', results);
  process.exit(results.errors ? 2 : 0);
}

if (require.main === module) {
  main();
}

