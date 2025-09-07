#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else { out[key] = true; }
    } else { out._.push(a); }
  }
  return out;
}

function readFrontmatter(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  return yaml.load(m[1]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const story = args.story || args._[0];
  if (!story) {
    console.error('Usage: run-story-tests --story <path-to-story.md>');
    process.exit(2);
  }
  const projectRoot = process.cwd();
  const storyPath = path.isAbsolute(story) ? story : path.join(projectRoot, story);
  if (!fs.existsSync(storyPath)) {
    console.error('Story not found:', storyPath);
    process.exit(2);
  }

  const fm = readFrontmatter(storyPath);
  if (!fm || !fm.StoryContract) {
    console.error('No StoryContract found in frontmatter');
    process.exit(3);
  }
  const sc = fm.StoryContract;
  const matrix = sc.acceptanceTestMatrix || {};
  let items = Array.isArray(matrix.items) ? matrix.items : [];
  let testFiles = [];
  for (const item of items) {
    const tfs = Array.isArray(item.test_files) ? item.test_files : [];
    for (const tf of tfs) {
      if (tf && tf.path) testFiles.push(tf.path);
    }
  }
  // Fallback to acceptanceCriteriaLinks / markdown-derived ACs
  if (testFiles.length === 0) {
    const storyId = sc.story_id || path.basename(storyPath).replace(/\.md$/, '');
    const links = Array.isArray(sc.acceptanceCriteriaLinks) ? sc.acceptanceCriteriaLinks : [];
    if (links.length > 0) {
      for (let i = 0; i < links.length; i++) {
        const m = String(links[i]).match(/^([^:]+):/);
        const acId = (m ? m[1].trim() : `AC-${i + 1}`);
        testFiles.push(`tests/acceptance/${storyId}/${acId}.test.js`);
      }
    } else {
      // Parse markdown AC section
      try {
        const raw = fs.readFileSync(storyPath, 'utf8');
        const idx = raw.indexOf('\n## Acceptance Criteria');
        if (idx !== -1) {
          const cut = raw.slice(idx + 1);
          const nextHeader = cut.search(/\n##\s+/);
          const section = nextHeader !== -1 ? cut.slice(0, nextHeader) : cut;
          const lines = section.split('\n').map(s => s.trim()).filter(Boolean);
          const bullets = lines.filter(l => /^(-|\d+\.|\*)\s+/.test(l));
          bullets.forEach((_, i) => testFiles.push(`tests/acceptance/${storyId}/AC-${i + 1}.test.js`));
        }
      } catch (_) {}
    }
  }
  const uniqueFiles = [...new Set(testFiles)].map(p => path.isAbsolute(p) ? p : path.join(projectRoot, p));

  if (uniqueFiles.length === 0) {
    console.log('No test files defined for this story. Nothing to run.');
    process.exit(0);
  }

  // Run only specified tests via npm test -- <files>
  const argsList = ['test', '--silent', '--', ...uniqueFiles];
  const res = spawnSync('npm', argsList, { stdio: 'inherit', cwd: projectRoot });
  const code = res.status ?? res.code ?? 1;
  process.exit(code);
}

main();
