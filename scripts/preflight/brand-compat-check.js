#!/usr/bin/env node
/**
 * SEMAD brand compatibility preflight
 * - Warns when only legacy BMAD paths/configs exist.
 * - Never fails the build; prints actionable guidance.
 */
const fs = require('fs');
const path = require('path');

function exists(p) {
  try { return fs.existsSync(path.join(process.cwd(), p)); } catch { return false; }
}

const hasSemadCore = exists('semad-core') || exists('.semad-core');
const hasBmadCore = exists('bmad-core') || exists('.bmad-core');
const hasSemadWorkflow = exists('.semad-workflow.yaml') || exists('.semad-workflow.json');
const hasBmadWorkflow = exists('.bmad-workflow.yaml') || exists('.bmad-workflow.json');

const warnings = [];

if (!hasSemadCore && hasBmadCore) {
  warnings.push(
    'SEMAD: semad-core not found but bmad-core is present. Create mirror links for compatibility:',
    '  ln -s bmad-core semad-core && ln -s .bmad-core .semad-core',
    'Deprecation: .bmad-core will be removed in a future major. Prefer semad-core paths.'
  );
}

if (!hasSemadWorkflow && hasBmadWorkflow) {
  warnings.push(
    'SEMAD: .semad-workflow.* not found; using legacy .bmad-workflow.*. Consider migrating:',
    '  cp .bmad-workflow.yaml .semad-workflow.yaml  # or .json as appropriate',
    'Deprecation: .bmad-workflow.* support may be removed in a future major.'
  );
}

if (warnings.length) {
  console.warn('\n=== SEMAD Brand Compatibility Warnings ===');
  for (const w of warnings) console.warn(w);
  console.warn('========================================\n');
} else {
  console.log('SEMAD brand compatibility check: OK');
}

process.exit(0);
