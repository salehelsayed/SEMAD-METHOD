#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const chalk = require('chalk');

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
    throw new Error(`Schema not found: ${schemaName}`);
  }
  
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

// Load all schemas
const schemas = {
  task: loadSchema('taskSchema', 'bmad-core/schemas/task-schema.json'),
  structuredTask: loadSchema('structuredTaskSchema', 'bmad-core/schemas/structured-task-schema.json'),
  checklist: loadSchema('checklistSchema', 'bmad-core/schemas/checklist-schema.json')
};

// Compile validators
const validators = {
  task: ajv.compile(schemas.task),
  structuredTask: ajv.compile(schemas.structuredTask),
  checklist: ajv.compile(schemas.checklist)
};

// Validation statistics
const stats = {
  totalFiles: 0,
  validFiles: 0,
  invalidFiles: 0,
  errors: []
};

function validateFile(filePath, validator, type) {
  stats.totalFiles++;
  const relativePath = path.relative(process.cwd(), filePath);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = yaml.load(content);
    
    if (!data) {
      stats.invalidFiles++;
      stats.errors.push({
        file: relativePath,
        type,
        errors: [{ message: 'Empty or invalid YAML file' }]
      });
      return false;
    }
    
    const valid = validator(data);
    
    if (valid) {
      stats.validFiles++;
      console.log(chalk.green('  ✓'), relativePath);
      return true;
    } else {
      stats.invalidFiles++;
      stats.errors.push({
        file: relativePath,
        type,
        errors: validator.errors
      });
      console.log(chalk.red('  ✗'), relativePath);
      return false;
    }
  } catch (e) {
    stats.invalidFiles++;
    stats.errors.push({
      file: relativePath,
      type,
      errors: [{ message: `YAML parse error: ${e.message}` }]
    });
    console.log(chalk.red('  ✗'), relativePath, chalk.gray(`(${e.message})`));
    return false;
  }
}

function validateDirectory(dir, validator, type, pattern = '*.yaml') {
  if (!fs.existsSync(dir)) {
    console.log(chalk.yellow(`  Directory not found: ${dir}`));
    return;
  }
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
  
  if (files.length === 0) {
    console.log(chalk.gray(`  No YAML files found in ${path.relative(process.cwd(), dir)}`));
    return;
  }
  
  files.forEach(file => {
    validateFile(path.join(dir, file), validator, type);
  });
}

function printDetailedErrors() {
  if (stats.errors.length === 0) return;
  
  console.log('\n' + chalk.red.bold('Validation Errors:'));
  console.log(chalk.red('='.repeat(50)));
  
  stats.errors.forEach(({ file, type, errors }) => {
    console.log(`\n${chalk.yellow('File:')} ${file}`);
    console.log(`${chalk.yellow('Type:')} ${type}`);
    console.log(chalk.yellow('Errors:'));
    
    errors.forEach(error => {
      if (error.instancePath) {
        console.log(`  ${chalk.red('•')} ${error.instancePath}: ${error.message}`);
        if (error.params) {
          console.log(`    ${chalk.gray(JSON.stringify(error.params))}`);
        }
      } else {
        console.log(`  ${chalk.red('•')} ${error.message}`);
      }
    });
  });
}

function printSummary() {
  console.log('\n' + chalk.bold('Validation Summary:'));
  console.log('='.repeat(50));
  console.log(`Total files:    ${stats.totalFiles}`);
  console.log(`Valid files:    ${chalk.green(stats.validFiles)}`);
  console.log(`Invalid files:  ${stats.invalidFiles > 0 ? chalk.red(stats.invalidFiles) : stats.invalidFiles}`);
  
  if (stats.validFiles === stats.totalFiles) {
    console.log('\n' + chalk.green.bold('✓ All files are valid!'));
  } else {
    console.log('\n' + chalk.red.bold(`✗ ${stats.invalidFiles} file(s) have validation errors`));
  }
}

function validateAll() {
  console.log(chalk.bold('BMad Method - Comprehensive Validation\n'));
  
  // Define validation targets (structured tasks only - legacy tasks deprecated)
  const validationTargets = [
    {
      name: 'Structured Tasks',
      dirs: [
        path.join(baseDir, 'bmad-core', 'structured-tasks'),
        path.join(baseDir, 'common', 'structured-tasks')
      ],
      validator: validators.structuredTask,
      type: 'structured-task'
    },
    {
      name: 'Checklists',
      dirs: [
        path.join(baseDir, 'bmad-core', 'structured-checklists'),
        path.join(baseDir, 'common', 'structured-checklists')
      ],
      validator: validators.checklist,
      type: 'checklist'
    }
  ];
  
  // Run validation for each target
  validationTargets.forEach(target => {
    console.log(chalk.blue.bold(`\nValidating ${target.name}:`));
    target.dirs.forEach(dir => {
      validateDirectory(dir, target.validator, target.type);
    });
  });
  
  // Print results
  printSummary();
  
  if (stats.invalidFiles > 0) {
    printDetailedErrors();
    process.exit(1);
  }
  
  process.exit(0);
}

// Export for testing
module.exports = {
  validateFile,
  validateDirectory,
  validators,
  schemas
};

// Run validation if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--tasks-only') || args.includes('--structured-tasks-only')) {
    console.log(chalk.bold('BMad Method - Structured Tasks Validation\n'));
    
    // Only validate structured tasks (legacy tasks deprecated)
    const taskDirs = [
      { path: path.join(baseDir, 'bmad-core', 'structured-tasks'), type: 'Structured Tasks' },
      { path: path.join(baseDir, 'common', 'structured-tasks'), type: 'Structured Tasks' }
    ];
    
    console.log(chalk.blue.bold('\nValidating Structured Tasks:'));
    taskDirs.forEach(({ path: dir, type }) => {
      validateDirectory(dir, validators.structuredTask, 'structured-task');
    });
    
    printSummary();
    if (stats.invalidFiles > 0) {
      printDetailedErrors();
      process.exit(1);
    }
    process.exit(0);
  } else if (args.includes('--checklists-only')) {
    console.log(chalk.bold('BMad Method - Checklists Validation\n'));
    
    console.log(chalk.blue.bold('Validating Checklists:'));
    validateDirectory(path.join(baseDir, 'bmad-core', 'structured-checklists'), validators.checklist, 'checklist');
    validateDirectory(path.join(baseDir, 'common', 'structured-checklists'), validators.checklist, 'checklist');
    
    printSummary();
    if (stats.invalidFiles > 0) {
      printDetailedErrors();
      process.exit(1);
    }
    process.exit(0);
  } else {
    validateAll();
  }
}