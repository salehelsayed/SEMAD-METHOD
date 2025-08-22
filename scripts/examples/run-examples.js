#!/usr/bin/env node
/*
  Lightweight runner for example validations.
  - Validates example artifacts against available JSON Schemas (AH-001)
  - Performs minimal grounding checks for patch plans and bundles (AH-003)
  - Prints a concise PASS/FAIL/SKIP matrix

  It is resilient: if a schema/tool is not yet implemented, the test is SKIP.
*/

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const root = process.cwd();
const schemasDir = path.join(root, 'bmad-core', 'schemas');
const examplesSchemaDir = path.join(root, 'docs', 'examples', 'schema');
const examplesPreflightDir = path.join(root, 'docs', 'examples', 'preflight');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function loadJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { __error: e.message };
  }
}
function loadYAML(p) {
  try {
    return yaml.load(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { __error: e.message };
  }
}
function compileSchema(schemaPath) {
  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    return ajv.compile(schema);
  } catch (e) {
    return { __error: e.message };
  }
}

const results = [];
function record(status, name, msg = '') {
  results.push({ status, name, msg });
}

function validateWithSchema(name, schemaFile, dataObj, expectPass) {
  if (!exists(schemaFile)) {
    record('SKIP', name, `Schema not found: ${path.relative(root, schemaFile)}`);
    return;
  }
  const validator = compileSchema(schemaFile);
  if (validator.__error) {
    record('FAIL', name, `Schema compile error: ${validator.__error}`);
    return;
  }
  const ok = validator(dataObj);
  if (ok && expectPass) record('PASS', name);
  else if (!ok && !expectPass) record('PASS', name, 'Failed as expected');
  else if (!ok && expectPass) record('FAIL', name, ajv.errorsText(validator.errors, { separator: '\n' }));
  else record('FAIL', name, 'Unexpected PASS (expected FAIL)');
}

function checkFileExists(name, filePath, expectExists) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const does = exists(abs);
  if (does && expectExists) record('PASS', name);
  else if (!does && !expectExists) record('PASS', name, 'Missing as expected');
  else if (!does && expectExists) record('FAIL', name, `Missing file: ${path.relative(root, abs)}`);
  else record('FAIL', name, `Unexpectedly exists: ${path.relative(root, abs)}`);
}

async function main() {
  // Schema validations (AH-001)
  const schemaMap = [
    { key: 'Brief', schema: 'brief-schema.json', valid: 'brief.valid.json', invalid: 'brief.invalid.json' },
    { key: 'PRD', schema: 'prd-schema.json', valid: 'prd.valid.json', invalid: 'prd.invalid.json' },
    { key: 'Architecture', schema: 'architecture-schema.json', valid: 'architecture.valid.json', invalid: 'architecture.invalid.json' },
    { key: 'SprintPlan', schema: 'sprint-plan-schema.json', valid: 'sprint-plan.valid.json', invalid: 'sprint-plan.invalid.json' },
    { key: 'TaskBundle', schema: 'task-bundle-schema.json', valid: 'task-bundle.valid.json', invalid: 'task-bundle.invalid.json' }
  ];

  for (const item of schemaMap) {
    const schemaPath = path.join(schemasDir, item.schema);
    const validPath = path.join(examplesSchemaDir, item.valid);
    const invalidPath = path.join(examplesSchemaDir, item.invalid);
    if (!exists(validPath) || !exists(invalidPath)) {
      record('SKIP', `Schema:${item.key}:Valid`, `Example missing`);
      record('SKIP', `Schema:${item.key}:Invalid`, `Example missing`);
      continue;
    }
    const validData = loadJSON(validPath);
    const invalidData = loadJSON(invalidPath);
    validateWithSchema(`Schema:${item.key}:Valid`, schemaPath, validData, true);
    validateWithSchema(`Schema:${item.key}:Invalid`, schemaPath, invalidData, false);
  }

  // StoryContract (YAML frontmatter -> validate only inner object)
  const scSchemaPath = path.join(schemasDir, 'story-contract-schema.json');
  const scValidPath = path.join(examplesSchemaDir, 'story-contract.valid.yaml');
  const scInvalidPath = path.join(examplesSchemaDir, 'story-contract.invalid.yaml');
  if (exists(scValidPath)) {
    const y = loadYAML(scValidPath);
    const obj = y && y.StoryContract ? y.StoryContract : y;
    validateWithSchema('Schema:StoryContract:Valid', scSchemaPath, obj, true);
  } else record('SKIP', 'Schema:StoryContract:Valid', 'Example missing');
  if (exists(scInvalidPath)) {
    const y = loadYAML(scInvalidPath);
    const obj = y && y.StoryContract ? y.StoryContract : y;
    // Expect FAIL (will pass today until schema is hardened)
    validateWithSchema('Schema:StoryContract:Invalid', scSchemaPath, obj, false);
  } else record('SKIP', 'Schema:StoryContract:Invalid', 'Example missing');

  // Preflight-lite checks (AH-003): minimal grounding checks without full tooling
  const bundleValid = path.join(examplesPreflightDir, 'bundle.sample.valid.json');
  const bundleInvalid = path.join(examplesPreflightDir, 'bundle.sample.invalid.json');
  const planValid = path.join(examplesPreflightDir, 'patch-plan.sample.valid.json');
  const planInvalid = path.join(examplesPreflightDir, 'patch-plan.sample.invalid.json');

  // Basic bundle structure check
  if (exists(bundleValid)) {
    const b = loadJSON(bundleValid);
    const ok = b && b.schemaVersion && b.id && b.storyId && Array.isArray(b.files) && Array.isArray(b.artifactRefs);
    record(ok ? 'PASS' : 'FAIL', 'Preflight:Bundle:Valid', ok ? '' : 'Missing required fields');
  } else record('SKIP', 'Preflight:Bundle:Valid', 'Example missing');
  if (exists(bundleInvalid)) {
    const b = loadJSON(bundleInvalid);
    const ok = b && b.schemaVersion && b.id && b.storyId && Array.isArray(b.files) && Array.isArray(b.artifactRefs);
    record(!ok ? 'PASS' : 'FAIL', 'Preflight:Bundle:Invalid', !ok ? 'Failed as expected' : 'Unexpectedly valid');
  } else record('SKIP', 'Preflight:Bundle:Invalid', 'Example missing');

  // Grounding: ensure referenced files in patch plan exist (valid) / do not exist (invalid)
  if (exists(planValid)) {
    const p = loadJSON(planValid);
    const files = (p.changes || []).map(c => c.path);
    const allExist = files.every(fp => exists(path.join(root, fp)));
    record(allExist ? 'PASS' : 'FAIL', 'Preflight:Grounding:Valid', allExist ? '' : 'One or more files missing');
  } else record('SKIP', 'Preflight:Grounding:Valid', 'Example missing');
  if (exists(planInvalid)) {
    const p = loadJSON(planInvalid);
    const files = (p.changes || []).map(c => c.path);
    const anyExists = files.some(fp => exists(path.join(root, fp)));
    record(!anyExists ? 'PASS' : 'FAIL', 'Preflight:Grounding:Invalid', !anyExists ? 'Failed as expected' : 'Unexpectedly found files');
  } else record('SKIP', 'Preflight:Grounding:Invalid', 'Example missing');

  // Output matrix
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  const statusOrder = { FAIL: 0, PASS: 1, SKIP: 2 };
  results.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name));
  const lines = results.map(r => {
    const tag = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : '[SKIP]';
    return `${pad(tag, 7)} ${pad(r.name, 36)} ${r.msg || ''}`.trim();
  });
  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log('Example Validation Matrix');
  console.log('==========================');
  console.log(lines.join('\n'));
  console.log('--------------------------');
  console.log(`PASS: ${summary.PASS || 0}  FAIL: ${summary.FAIL || 0}  SKIP: ${summary.SKIP || 0}`);

  // Exit non-zero if any FAIL
  if (summary.FAIL > 0) process.exit(1);
}

main().catch(err => {
  console.error('Runner error:', err);
  process.exit(2);
});

