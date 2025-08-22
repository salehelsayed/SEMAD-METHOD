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
const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
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

// Load the optional WorkBreakdown schema
function loadWorkBreakdownSchema() {
  const candidates = [
    path.join(__dirname, '..', 'bmad-core', 'schemas', 'story-workbreakdown-schema.json'),
    path.join(process.cwd(), 'bmad-core', 'schemas', 'story-workbreakdown-schema.json'),
    path.join(process.cwd(), '.bmad-core', 'schemas', 'story-workbreakdown-schema.json')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {
        console.error(`  ✗ Failed to load WorkBreakdown schema at ${p}: ${e.message}`);
        return null;
      }
    }
  }
  return null;
}

// Extract AC IDs from contract
function extractAcIds(contract) {
  const set = new Set();
  // From acceptanceCriteriaLinks: strings like "AC-1: Description"
  if (Array.isArray(contract.acceptanceCriteriaLinks)) {
    for (const entry of contract.acceptanceCriteriaLinks) {
      if (typeof entry === 'string') {
        const m = entry.match(/AC-[\w-]+/g);
        if (m) m.forEach(id => set.add(id));
        // If no explicit AC- prefix, take token before ':' as ID
        if (!m) {
          const id = entry.split(':')[0].trim();
          if (id) set.add(id);
        }
      }
    }
  }
  // From acceptanceTestMatrix.items[].ac_id
  const atm = contract.acceptanceTestMatrix;
  if (atm && Array.isArray(atm.items)) {
    for (const item of atm.items) {
      if (item && typeof item.ac_id === 'string' && item.ac_id.trim()) {
        set.add(item.ac_id.trim());
      }
    }
  }
  return Array.from(set);
}

// Quick coverage checks between ACs, tasks, and tests
function runCoverageChecks(contract) {
  const issues = [];
  const wb = contract.workBreakdown;
  if (!wb || hasTemplatePlaceholders(wb)) return issues; // skip templates

  const acIds = extractAcIds(contract);
  const tasks = Array.isArray(wb.tasks) ? wb.tasks : [];
  const policy = wb.coveragePolicy || {};
  const minTestsPerAC = Number.isInteger(policy.minTestsPerAC) ? policy.minTestsPerAC : 1;

  // Build lookup
  const acCoveredByTask = new Map(acIds.map(id => [id, 0]));
  const acCoveredByTests = new Map(acIds.map(id => [id, 0]));

  // Orphan task refs check
  if (policy.forbidOrphanTasks) {
    for (const t of tasks) {
      if (!t || !Array.isArray(t.acRefs)) continue;
      for (const ref of t.acRefs) {
        if (!acCoveredByTask.has(ref)) {
          issues.push(`Orphan task AC ref: task ${t.id || '<no-id>'} references unknown AC '${ref}'`);
        }
      }
    }
  }

  // Count coverage
  for (const t of tasks) {
    if (!t) continue;
    const refs = Array.isArray(t.acRefs) ? t.acRefs : [];
    for (const r of refs) {
      if (acCoveredByTask.has(r)) acCoveredByTask.set(r, acCoveredByTask.get(r) + 1);
    }
    // tests.mustAdd[].covers
    const tests = t.tests && Array.isArray(t.tests.mustAdd) ? t.tests.mustAdd : [];
    for (const test of tests) {
      const covers = Array.isArray(test.covers) ? test.covers : [];
      for (const ac of covers) {
        if (acCoveredByTests.has(ac)) acCoveredByTests.set(ac, acCoveredByTests.get(ac) + 1);
      }
    }
  }

  // Enforce policy
  if (policy.requireTaskForEveryAC) {
    for (const [ac, count] of acCoveredByTask.entries()) {
      if (count === 0) issues.push(`AC not covered by any task: ${ac}`);
    }
  }
  if (policy.requireTestForEveryAC) {
    for (const [ac, count] of acCoveredByTests.entries()) {
      if (count < minTestsPerAC) issues.push(`AC does not meet min test count (${minTestsPerAC}): ${ac} (got ${count})`);
    }
  }

  return issues;
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
    const content = fs.readFileSync(filePath, 'utf8');
    const contract = extractStoryContract(filePath);
    
    // Check if contract has template placeholders
    if (hasTemplatePlaceholders(contract)) {
      console.log('  ⚠ Template (contains placeholders - skipping validation)');
      return true; // Don't fail the overall validation for templates
    }
    
    const result = validateContract(contract, schema);
    
    let ok = true;
    if (!result.valid) {
      console.log('  ✗ Invalid StoryContract');
      console.log('  Errors:');
      console.log(formatErrors(result.errors));
      ok = false;
    }

    // Required section headings (H2) for consistency with template
    const requiredH2 = [
      '## Status',
      '## Story',
      '## Acceptance Criteria',
      '## Technical Requirements',
      '## Implementation Plan',
      '## Test Requirements',
      '## Risk Assessment',
      '## Definition of Done',
      '## Traceability'
    ];
    const missing = requiredH2.filter(h => !content.includes(h));
    if (missing.length) {
      console.log('  ✗ Missing required sections:');
      missing.forEach(h => console.log(`    - ${h}`));
      ok = false;
    }

    // Validate optional WorkBreakdown if present
    const wbSchema = loadWorkBreakdownSchema();
    if (ok && wbSchema && contract.workBreakdown && !hasTemplatePlaceholders(contract.workBreakdown)) {
      const validateWB = ajv.compile(wbSchema);
      const validWB = validateWB(contract.workBreakdown);
      if (!validWB) {
        console.log('  ✗ Invalid StoryContract.workBreakdown');
        console.log('  Errors:');
        console.log(formatErrors(validateWB.errors || []));
        ok = false;
      } else {
        // Run fast coverage checks
        const coverageIssues = runCoverageChecks(contract);
        if (coverageIssues.length) {
          console.log('  ✗ Coverage/Lint issues:');
          coverageIssues.forEach(i => console.log(`    - ${i}`));
          ok = false;
        }
      }
    }

    if (ok) {
      console.log('  ✓ Valid');
      return true;
    }
    return false;
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
