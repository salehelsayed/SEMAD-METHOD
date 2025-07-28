#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Use ModuleResolver for schema resolution
const ModuleResolver = require('../bmad-core/utils/module-resolver');

// Initialize AJV validator
const ajv = new Ajv({ allErrors: true });
// Add format support including uri-reference
addFormats(ajv);

// Load schemas using ModuleResolver
const baseDir = path.join(__dirname, '..');

// Schema loading function with fallback
function loadSchema(schemaName, fallbackPath) {
  let schemaPath = ModuleResolver.resolveSchemaPath(schemaName, baseDir);
  
  if (!schemaPath && fallbackPath) {
    schemaPath = path.join(__dirname, '..', fallbackPath);
  }
  
  if (!schemaPath || !fs.existsSync(schemaPath)) {
    console.error(`\u274c Schema not found: ${schemaName}`);
    console.error('  Searched locations:');
    console.error(`    - Via ModuleResolver: ${schemaPath || 'not found'}`);
    if (fallbackPath) {
      console.error(`    - Fallback path: ${path.join(__dirname, '..', fallbackPath)}`);
    }
    throw new Error(`Schema not found: ${schemaName}`);
  }
  
  try {
    return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (error) {
    console.error(`\u274c Failed to parse schema ${schemaName}: ${error.message}`);
    throw error;
  }
}

// Load schemas
let taskSchema, structuredTaskSchema, checklistSchema;

try {
  taskSchema = loadSchema('taskSchema', 'bmad-core/schemas/task-schema.json');
  structuredTaskSchema = loadSchema('structuredTaskSchema', 'bmad-core/schemas/structured-task-schema.json');
  checklistSchema = loadSchema('checklistSchema', 'bmad-core/schemas/checklist-schema.json');
} catch (error) {
  console.error('\n\u26a0️  Failed to load validation schemas');
  console.error('  Ensure all schema files exist and contain valid JSON');
  process.exit(1);
}

// Compile validators
const validateTask = ajv.compile(taskSchema);
const validateStructuredTask = ajv.compile(structuredTaskSchema);
const validateChecklist = ajv.compile(checklistSchema);

function validateDirectory(dir, type, validator) {
  if (!fs.existsSync(dir)) {
    return { valid: true, errors: [] };
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
  const errors = [];
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    try {
      const data = yaml.load(content);
      const valid = validator(data);
      
      if (!valid) {
        errors.push({
          file: filePath,
          errors: validator.errors
        });
      }
    } catch (e) {
      let errorMessage = `YAML parse error: ${e.message}`;
      
      // Provide more helpful error messages for common YAML issues
      if (e.message.includes('duplicate key')) {
        errorMessage += '\n    Hint: Check for duplicate property names in the YAML file';
      } else if (e.message.includes('unexpected')) {
        errorMessage += '\n    Hint: Check indentation and ensure proper YAML syntax';
      } else if (e.message.includes('mapping values')) {
        errorMessage += '\n    Hint: Ensure proper indentation for nested structures';
      }
      
      errors.push({
        file: filePath,
        errors: [{ message: errorMessage }]
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function validateAll() {
  console.log('Validating structured task and checklist files...\n');
  
  const dirs = [
    {
      path: path.join(__dirname, '..', 'bmad-core', 'tasks'),
      type: 'regular task',
      validator: validateTask
    },
    {
      path: path.join(__dirname, '..', 'bmad-core', 'structured-tasks'),
      type: 'structured task',
      validator: validateStructuredTask
    },
    {
      path: path.join(__dirname, '..', 'bmad-core', 'structured-checklists'),
      type: 'checklist',
      validator: validateChecklist
    },
    {
      path: path.join(__dirname, '..', 'common', 'tasks'),
      type: 'regular task',
      validator: validateTask
    },
    {
      path: path.join(__dirname, '..', 'common', 'structured-tasks'),
      type: 'structured task',
      validator: validateStructuredTask
    },
    {
      path: path.join(__dirname, '..', 'common', 'structured-checklists'),
      type: 'checklist',
      validator: validateChecklist
    }
  ];
  
  let allValid = true;
  
  for (const dir of dirs) {
    console.log(`Validating ${dir.type}s in ${path.relative(process.cwd(), dir.path)}...`);
    const result = validateDirectory(dir.path, dir.type, dir.validator);
    
    if (result.valid) {
      console.log('  ✓ All files valid\n');
    } else {
      allValid = false;
      console.log(`  ✗ ${result.errors.length} file(s) with errors:\n`);
      
      for (const fileError of result.errors) {
        console.log(`    File: ${path.relative(process.cwd(), fileError.file)}`);
        for (const error of fileError.errors) {
          if (error.instancePath) {
            console.log(`      - ${error.instancePath}: ${error.message}`);
          } else {
            console.log(`      - ${error.message}`);
          }
        }
        console.log();
      }
    }
  }
  
  if (allValid) {
    console.log('\n\u2713 All structured files are valid!');
    process.exit(0);
  } else {
    console.log('\n\u274c Validation failed. Please fix the errors above.');
    console.log('\nCommon issues:');
    console.log('  - Missing required fields in YAML files');
    console.log('  - Incorrect data types (e.g., string instead of array)');
    console.log('  - Invalid YAML syntax (check indentation)');
    process.exit(1);
  }
}

// Run validation if called directly
if (require.main === module) {
  validateAll();
}

module.exports = { validateTask, validateStructuredTask, validateChecklist, validateAll };