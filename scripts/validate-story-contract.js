#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const glob = require('glob');

// Import ModuleResolver for schema resolution
const ModuleResolver = require('../bmad-core/utils/module-resolver');

// Initialize AJV with strict mode
const ajv = new Ajv({ strict: true, allErrors: true });
// Add format support including uri-reference
addFormats(ajv);

// Load the schema
function loadSchema() {
  try {
    let schemaPath;
    
    // Try to resolve using ModuleResolver
    schemaPath = ModuleResolver.resolveSchemaPath('storyContractSchema', process.cwd());
    
    if (!schemaPath) {
      schemaPath = ModuleResolver.resolveSchemaPath('storyContractSchema', __dirname);
    }
    
    // Fallback to direct paths only if ModuleResolver fails
    if (!schemaPath) {
      const fallbackPaths = [
        path.join(__dirname, '..', 'bmad-core', 'schemas', 'story-contract-schema.json'),
        path.join(process.cwd(), 'bmad-core', 'schemas', 'story-contract-schema.json'),
        path.join(process.cwd(), '.bmad-core', 'schemas', 'story-contract-schema.json')
      ];
      
      for (const candidatePath of fallbackPaths) {
        if (fs.existsSync(candidatePath)) {
          schemaPath = candidatePath;
          break;
        }
      }
    }
    
    if (!schemaPath) {
      throw new Error('Could not find story-contract-schema.json in any expected location');
    }
    
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    return JSON.parse(schemaContent);
  } catch (error) {
    console.error(`Error loading schema:`, error.message);
    process.exit(1);
  }
}

// Extract StoryContract from story file
function extractStoryContract(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Look for YAML front matter containing StoryContract (at beginning of file)
    let yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!yamlMatch) {
      // Also check for StoryContract section in the middle of the file
      yamlMatch = content.match(/## Story Contract\s*\n\s*---\n([\s\S]*?)\n---/);
      
      if (!yamlMatch) {
        throw new Error('No YAML front matter or Story Contract section found in story file');
      }
    }
    
    const yamlContent = yamlMatch[1];
    const parsed = yaml.load(yamlContent);
    
    if (!parsed || !parsed.StoryContract) {
      throw new Error('No StoryContract found in YAML');
    }
    
    return parsed.StoryContract;
  } catch (error) {
    throw new Error(`Failed to extract StoryContract from ${filePath}: ${error.message}`);
  }
}

// Validate a single story contract
function validateContract(contract, schema) {
  const validate = ajv.compile(schema);
  const valid = validate(contract);
  
  return {
    valid,
    errors: validate.errors || []
  };
}

// Format validation errors
function formatErrors(errors) {
  return errors.map(error => {
    const path = error.instancePath || '/';
    const message = error.message || 'Unknown error';
    const params = error.params ? ` (${JSON.stringify(error.params)})` : '';
    return `  - ${path}: ${message}${params}`;
  }).join('\n');
}

// Check if a value contains template placeholders
function hasTemplatePlaceholders(obj) {
  const checkValue = (val) => {
    if (typeof val === 'string') {
      return val.includes('{{') && val.includes('}}');
    }
    if (Array.isArray(val)) {
      return val.some(checkValue);
    }
    if (typeof val === 'object' && val !== null) {
      return Object.values(val).some(checkValue);
    }
    return false;
  };
  
  return checkValue(obj);
}

// Validate a single story file
function validateStoryFile(filePath, schema) {
  console.log(`\nValidating: ${filePath}`);
  
  try {
    const contract = extractStoryContract(filePath);
    
    // Check if contract has template placeholders
    if (hasTemplatePlaceholders(contract)) {
      console.log('  ⚠ Template (contains placeholders - skipping validation)');
      return true; // Don't fail the overall validation for templates
    }
    
    const result = validateContract(contract, schema);
    
    if (result.valid) {
      console.log('  ✓ Valid');
      return true;
    } else {
      console.log('  ✗ Invalid');
      console.log('  Errors:');
      console.log(formatErrors(result.errors));
      return false;
    }
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
    return false;
  }
}

// Find all story files
function findStoryFiles() {
  const patterns = [
    'docs/stories/**/*.story.md',
    'docs/stories/**/*.md',
    '**/*.story.md'
  ];
  
  const files = new Set();
  
  patterns.forEach(pattern => {
    glob.sync(pattern, { nodir: true }).forEach(file => {
      files.add(file);
    });
  });
  
  return Array.from(files);
}

// Main function
function main() {
  const args = process.argv.slice(2);
  const isAllMode = args.includes('--all');
  
  // Load schema
  const schema = loadSchema();
  console.log('Schema loaded successfully');
  
  let files = [];
  let allValid = true;
  
  if (isAllMode) {
    // Find and validate all story files
    files = findStoryFiles();
    
    if (files.length === 0) {
      console.log('\nNo story files found');
      process.exit(0);
    }
    
    console.log(`\nFound ${files.length} story file(s) to validate`);
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    // Validate specific file
    files = [args[0]];
  } else {
    console.error('Usage: node validate-story-contract.js [file-path] | --all');
    process.exit(1);
  }
  
  // Validate each file
  files.forEach(file => {
    const isValid = validateStoryFile(file, schema);
    if (!isValid) {
      allValid = false;
    }
  });
  
  // Summary
  console.log('\n' + '='.repeat(50));
  if (allValid) {
    console.log('✓ All StoryContracts are valid');
    process.exit(0);
  } else {
    console.log('✗ Some StoryContracts are invalid');
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  validateStoryContract: async (filePath) => {
    const schema = loadSchema();
    try {
      const contract = extractStoryContract(filePath);
      const result = validateContract(contract, schema);
      return {
        valid: result.valid,
        errors: result.errors.map(e => formatErrors([e]))
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }
};

// Run if called directly
if (require.main === module) {
  main();
}