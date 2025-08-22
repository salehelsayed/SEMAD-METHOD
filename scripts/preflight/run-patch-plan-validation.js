#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('close', code => {
      if (code === 0) resolve(); else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  const storyId = process.env.STORY_ID || process.argv[2] || 'AH-005';
  const root = process.cwd();
  const patchPlan = path.join(root, '.ai', 'patches', `${storyId}.patch.json`);
  const bundle = path.join(root, '.ai', 'bundles', `${storyId}.bundle.json`);
  const ahDir = path.join(root, 'docs', 'stories', 'agentic-hardening');
  // Find a matching story file for the contract (first match)
  let contractPath = path.join(ahDir, `${storyId}-*.md`);
  // Resolve glob manually (simple scan)
  try {
    const fs = require('fs');
    const files = fs.readdirSync(ahDir).filter(f => f.includes(storyId) && f.endsWith('.md'));
    if (files.length > 0) {
      contractPath = path.join(ahDir, files[0]);
    }
  } catch (e) {
    // leave as default pattern; validator will ignore missing contract
  }

  const args = [
    path.join('tools', 'patch-plan', 'validate-patch-plan.js'),
    patchPlan
  ];

  await run('node', args);
}

main().catch(err => {
  console.error('Patch plan validation runner failed:', err.message);
  process.exit(1);
});
