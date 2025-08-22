#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function extractStoryIdFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Try StoryContract frontmatter first
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (fm) {
      const yaml = require('js-yaml');
      const doc = yaml.load(fm[1]);
      if (doc && doc.StoryContract && doc.StoryContract.story_id) {
        return String(doc.StoryContract.story_id).trim();
      }
    }
    // Fallback: look for "Story ID:" in body
    const m = content.match(/\bStory\s*ID\s*:\s*([^\n]+)/i);
    if (m) return m[1].trim();
  } catch (_) {}
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();

  let storyId = args['story-id'] || null;
  const story = args.story || args.file || null;

  if (!storyId && story) {
    const candidate = path.isAbsolute(story) ? story : path.join(projectRoot, story);
    if (fs.existsSync(candidate)) {
      storyId = extractStoryIdFromFile(candidate);
      if (!storyId) {
        console.error('Could not extract story_id from file:', candidate);
        process.exit(1);
      }
    } else {
      // If not a file, assume it is an ID
      storyId = story;
    }
  }

  const gateCmd = ['tools/qa/test-quality-gate.js'];
  if (storyId) gateCmd.push('--story-id', storyId);

  const res = spawnSync('node', gateCmd, { stdio: 'inherit' });
  process.exit(res.status ?? res.code ?? 1);
}

if (require.main === module) main();

