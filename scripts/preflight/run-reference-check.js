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
  const args = [ path.join('tools', 'reference-checker', 'check-references.js'), patchPlan ];
  await run('node', args);
}

main().catch(err => {
  console.error('Reference check runner failed:', err.message);
  process.exit(1);
});

