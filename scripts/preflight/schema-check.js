#!/usr/bin/env node

const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const yaml = require('js-yaml');

async function loadSchema(ajv, schemaPath) {
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
  return ajv.compile(schema);
}

async function parseFrontmatterOrJSON(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    return yaml.load(fm[1]);
  }
  const jsonBlock = content.match(/```json\n([\s\S]*?)\n```/);
  if (jsonBlock) {
    return JSON.parse(jsonBlock[1]);
  }
  // Fallback minimal parse for md: return empty object
  return {};
}

async function runSchemaCheckValidOnly() {
  console.log('Running schema validation (valid-only mode)...');

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const root = path.join(__dirname, '..', '..');
  const schemasDir = path.join(root, 'bmad-core', 'schemas');

  const validators = {
    brief: await loadSchema(ajv, path.join(schemasDir, 'brief-schema.json')),
    prd: await loadSchema(ajv, path.join(schemasDir, 'prd-schema.json')),
    architecture: await loadSchema(ajv, path.join(schemasDir, 'architecture-schema.json'))
  };

  const targets = [
    { type: 'brief', file: path.join(root, 'docs', 'brief.md') },
    { type: 'prd', file: path.join(root, 'docs', 'prd', 'PRD.md') }
  ];

  // Validate a canonical architecture file
  const archFile = path.join(root, 'docs', 'architecture', 'architecture.md');
  targets.push({ type: 'architecture', file: archFile });

  const results = [];
  for (const t of targets) {
    if (!fssync.existsSync(t.file)) {
      results.push({ file: t.file, type: t.type, status: 'SKIP', reason: 'not_found' });
      continue;
    }
    try {
      const data = await parseFrontmatterOrJSON(t.file);
      const valid = validators[t.type](data);
      results.push({ file: t.file, type: t.type, status: valid ? 'PASS' : 'FAIL', errors: validators[t.type].errors || [] });
    } catch (e) {
      results.push({ file: t.file, type: t.type, status: 'FAIL', errors: [{ message: e.message }] });
    }
  }

  // Save results
  const logDir = path.join(root, '.ai', 'test-logs');
  await fs.mkdir(logDir, { recursive: true });
  const out = { timestamp: new Date().toISOString(), mode: 'valid-only', results };
  await fs.writeFile(path.join(logDir, 'schema-check.json'), JSON.stringify(out, null, 2));

  // Exit non-zero on any FAIL
  const failed = results.some(r => r.status === 'FAIL');
  if (failed) {
    console.error('Schema validation (valid-only) failed');
    return { success: false };
  }
  console.log('Schema validation (valid-only) passed');
  return { success: true };
}

if (require.main === module) {
  runSchemaCheckValidOnly().then(r => process.exit(r.success ? 0 : 1));
}

module.exports = { runSchemaCheckValidOnly };
