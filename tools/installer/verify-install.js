#!/usr/bin/env node
/**
 * Verify BMad installation completeness within the current project.
 * Checks presence of core agent files, utils, and docs used by CLI shims.
 */
const fs = require('fs');
const path = require('path');

const requiredPaths = [
  'AGENTS.md',
  ['semad-core/agents/dev.md','semad-core/agents/dev.md'],
  ['semad-core/agents/pm.md','semad-core/agents/pm.md'],
  ['semad-core/agents/qa.md','semad-core/agents/qa.md'],
  ['semad-core/agents/architect.md','semad-core/agents/architect.md'],
  ['semad-core/agents/analyst.md','semad-core/agents/analyst.md'],
  ['semad-core/agents/sm.md','semad-core/agents/sm.md'],
  ['semad-core/agents/commands-manifest.json','semad-core/agents/commands-manifest.json'],
  ['semad-core/agents/intent-manifest.json','semad-core/agents/intent-manifest.json'],
  ['semad-core/utils/adhoc-runner.js','semad-core/utils/adhoc-runner.js'],
  ['semad-core/utils/adhoc-debug-runner.js','semad-core/utils/adhoc-debug-runner.js'],
  'tools/agent.js',
  'tools/agent-help.js'
];

function existsOne(entry) {
  if (Array.isArray(entry)) return entry.some(p => fs.existsSync(path.join(process.cwd(), p)));
  return fs.existsSync(path.join(process.cwd(), entry));
}

function run() {
  const missing = requiredPaths.filter(p => !existsOne(p)).map(p => Array.isArray(p) ? p.join(' | ') : p);
  if (missing.length) {
    console.error('❌ BMad installation verification failed. Missing:');
    missing.forEach(p => console.error('- ' + p));
    process.exit(1);
  }
  console.log('✅ BMad installation verified. All required files present.');
}

if (require.main === module) run();
