#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true });

// Schema mappings
const schemaMap = {
  'brief': path.join(__dirname, '..', 'bmad-core', 'schemas', 'brief-schema.json'),
  'prd': path.join(__dirname, '..', 'bmad-core', 'schemas', 'prd-schema.json'),
  'architecture': path.join(__dirname, '..', 'bmad-core', 'schemas', 'architecture-schema.json'),
  'sprint-plan': path.join(__dirname, '..', 'bmad-core', 'schemas', 'sprint-plan-schema.json'),
  'task-bundle': path.join(__dirname, '..', 'bmad-core', 'schemas', 'task-bundle-schema.json'),
  'story-contract': path.join(__dirname, '..', 'bmad-core', 'schemas', 'story-contract-schema.json')
};

// Load and compile schemas
const validators = {};
for (const [type, schemaPath] of Object.entries(schemaMap)) {
  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    validators[type] = ajv.compile(schema);
    console.log(`✓ Loaded schema for ${type}`);
  } catch (error) {
    console.error(`✗ Failed to load schema for ${type}: ${error.message}`);
  }
}

// Validate example files
function validateExamples() {
  const examplesDir = path.join(__dirname, '..', 'docs', 'examples', 'schema');
  const results = [];
  
  if (!fs.existsSync(examplesDir)) {
    console.log('No examples directory found, creating sample files...');
    fs.mkdirSync(examplesDir, { recursive: true });
    
    // Create valid examples
    const validBrief = {
      id: "brief-001",
      version: "1.0.0",
      stakeholders: [
        { name: "Product Owner", role: "Decision Maker", concerns: ["ROI", "Timeline"] }
      ],
      successCriteria: ["All tests pass", "Performance targets met"],
      scope: {
        included: ["Feature A", "Feature B"],
        excluded: ["Feature C"]
      },
      nonFunctional: {
        performance: ["Response time < 200ms"],
        security: ["OAuth2 authentication"]
      }
    };
    
    fs.writeFileSync(
      path.join(examplesDir, 'brief.valid.json'),
      JSON.stringify(validBrief, null, 2)
    );
    
    // Create invalid example
    const invalidBrief = {
      id: "brief-002",
      // Missing required fields
      stakeholders: []
    };
    
    fs.writeFileSync(
      path.join(examplesDir, 'brief.invalid.json'),
      JSON.stringify(invalidBrief, null, 2)
    );
  }
  
  // Validate all example files
  const files = fs.readdirSync(examplesDir);
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(examplesDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      // Determine schema type from filename
      const type = file.split('.')[0].replace('-', '');
      const validator = validators[type];
      
      if (validator) {
        const valid = validator(content);
        const status = valid ? 'PASS' : 'FAIL';
        
        results.push({
          file,
          status,
          errors: valid ? null : validator.errors
        });
        
        console.log(`${valid ? '✓' : '✗'} ${file}: ${status}`);
        if (!valid) {
          console.log(`  Errors: ${JSON.stringify(validator.errors, null, 2)}`);
        }
      }
    }
  }
  
  // Save results to log file
  const logDir = path.join(__dirname, '..', '.ai', 'test-logs');
  fs.mkdirSync(logDir, { recursive: true });
  
  const logFile = path.join(logDir, 'schema-check.json');
  fs.writeFileSync(logFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    results
  }, null, 2));
  
  console.log(`\nResults saved to ${logFile}`);
  
  // Exit with error if any validation failed
  const hasFailures = results.some(r => r.status === 'FAIL');
  process.exit(hasFailures ? 1 : 0);
}

// Run validation
validateExamples();
