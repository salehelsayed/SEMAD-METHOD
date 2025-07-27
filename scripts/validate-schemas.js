#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Use ModuleResolver for schema resolution
let ModuleResolver;
try {
  ModuleResolver = require('../bmad-core/utils/module-resolver');
} catch (e) {
  // Fallback if bmad-core is in different location
  ModuleResolver = require('../.bmad-core/utils/module-resolver');
}

// Initialize AJV validator
const ajv = new Ajv({ allErrors: true });
// Add format support including uri-reference
addFormats(ajv);

// Load schemas using ModuleResolver
const baseDir = path.join(__dirname, '..');
const taskSchemaPath = ModuleResolver.resolveSchemaPath('taskSchema', baseDir) || 
  path.join(__dirname, '..', 'bmad-core', 'schemas', 'task-schema.json');
const checklistSchemaPath = ModuleResolver.resolveSchemaPath('checklistSchema', baseDir) || 
  path.join(__dirname, '..', 'bmad-core', 'schemas', 'checklist-schema.json');

const taskSchema = JSON.parse(fs.readFileSync(taskSchemaPath, 'utf8'));
const checklistSchema = JSON.parse(fs.readFileSync(checklistSchemaPath, 'utf8'));

// Compile validators
const validateTask = ajv.compile(taskSchema);
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
      errors.push({
        file: filePath,
        errors: [{ message: `YAML parse error: ${e.message}` }]
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
      path: path.join(__dirname, '..', 'bmad-core', 'structured-tasks'),
      type: 'task',
      validator: validateTask
    },
    {
      path: path.join(__dirname, '..', 'bmad-core', 'structured-checklists'),
      type: 'checklist',
      validator: validateChecklist
    },
    {
      path: path.join(__dirname, '..', 'common', 'structured-tasks'),
      type: 'task',
      validator: validateTask
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
    console.log('All structured files are valid!');
    process.exit(0);
  } else {
    console.log('Validation failed. Please fix the errors above.');
    process.exit(1);
  }
}

// Run validation if called directly
if (require.main === module) {
  validateAll();
}

module.exports = { validateTask, validateChecklist, validateAll };