const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function resolveSchemaPath(schemaId) {
  // Accept forms like:
  //  - 'agents/dev.implement_story.output'
  //  - 'agents/dev.implement_story.output.json'
  //  - 'dev.implement_story.output' (assume agents prefix)
  //  - relative path under bmad-core/schemas
  let rel = schemaId.trim();
  if (!rel.endsWith('.json')) rel += '.json';
  if (!rel.startsWith('agents/')) rel = path.join('agents', rel);
  return path.join(process.cwd(), 'bmad-core', 'schemas', rel);
}

function formatAjvErrors(errors) {
  if (!errors || !errors.length) return [];
  return errors.map(e => `${e.instancePath || '/'} ${e.message}${e.params && e.params.allowedValues ? ` (${e.params.allowedValues.join(',')})` : ''}`);
}

function loadSchema(schemaId) {
  const file = resolveSchemaPath(schemaId);
  const raw = fs.readFileSync(file, 'utf8');
  const schema = JSON.parse(raw);
  ajv.removeSchema(schema.$id || schemaId);
  ajv.addSchema(schema, schema.$id || schemaId);
  return schema.$id || schemaId;
}

function validate(schemaId, data) {
  try {
    const id = loadSchema(schemaId);
    const validateFn = ajv.getSchema(id);
    const valid = validateFn(data);
    return { valid, errors: valid ? [] : formatAjvErrors(validateFn.errors) };
  } catch (error) {
    return { valid: false, errors: [error.message] };
  }
}

module.exports = { validate };

