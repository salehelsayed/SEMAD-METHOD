#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

function resolveModule(moduleName) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const cands = [
    path.join(projectRoot, 'semad-core', moduleName),
    path.join(projectRoot, '.semad-core', moduleName),
    path.join(projectRoot, moduleName)
  ];
  for (const p of cands) {
    try { return require(p); } catch (_) {}
  }
  // Try package fallback
  return require(path.join(projectRoot, 'semad-core', moduleName));
}

const { applyGate, findMostRecentStory } = resolveModule('utils/dor-linter.js');

function main() {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const args = process.argv.slice(2);
  let storyArg = args[0];
  let storyPath;

  if (storyArg) {
    storyPath = path.isAbsolute(storyArg) ? storyArg : path.join(projectRoot, storyArg);
  } else {
    const fallback = findMostRecentStory(path.join(projectRoot, 'docs', 'stories'));
    if (!fallback) {
      console.error('No story path provided and no stories found in docs/stories');
      process.exit(2);
    }
    storyPath = fallback;
  }

  if (!fs.existsSync(storyPath)) {
    console.error('Story file not found:', storyPath);
    process.exit(2);
  }

  try {
    const res = applyGate(storyPath, { root: projectRoot });
    const out = {
      story: path.relative(projectRoot, storyPath),
      status: res.report.status,
      score: res.report.score,
      missing: res.report.missing,
      categories: res.report.categories,
      spike: res.spike || null
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(res.exitCode);
  } catch (e) {
    console.error('DoR gate error:', e.message);
    process.exit(3);
  }
}

main();

