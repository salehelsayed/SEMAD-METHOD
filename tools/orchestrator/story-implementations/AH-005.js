#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// AH-005: Grounded Editing Protocol (GEP)
async function execute() {
  console.log('[AH-005] Implementing Grounded Editing Protocol (GEP)...');
  
  // Create patch-plan schema
  const schemasDir = path.join(__dirname, '..', '..', '..', 'bmad-core', 'schemas');
  await fs.mkdir(schemasDir, { recursive: true });
  
  const patchPlanSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Patch Plan Schema",
    "type": "object",
    "required": ["storyId", "changes", "tests", "riskLevel"],
    "properties": {
      "storyId": {
        "type": "string",
        "description": "Story ID this patch addresses"
      },
      "changes": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["path", "operations", "rationale", "mappedACs"],
          "properties": {
            "path": { "type": "string" },
            "operations": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": { "enum": ["add", "modify", "delete"] },
                  "description": { "type": "string" }
                }
              }
            },
            "symbols": {
              "type": "array",
              "items": { "type": "string" }
            },
            "rationale": { "type": "string" },
            "mappedACs": {
              "type": "array",
              "items": { "type": "string" }
            }
          }
        }
      },
      "tests": {
        "type": "array",
        "items": { "type": "string" }
      },
      "riskLevel": {
        "enum": ["low", "medium", "high"]
      },
      "signature": {
        "type": "string",
        "description": "Digital signature for verification"
      },
      "timestamp": {
        "type": "string",
        "format": "date-time"
      }
    }
  };
  
  await fs.writeFile(
    path.join(schemasDir, 'patch-plan-schema.json'),
    JSON.stringify(patchPlanSchema, null, 2)
  );
  
  // Create validate-patch-plan.js
  const patchPlanDir = path.join(__dirname, '..', '..', '..', 'tools', 'patch-plan');
  await fs.mkdir(patchPlanDir, { recursive: true });
  
  const validateScript = `#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');

async function validatePatchPlan(patchPlanPath) {
  console.log(\`Validating patch plan: \${patchPlanPath}\`);
  
  try {
    // Load schema
    const schemaPath = path.join(__dirname, '..', '..', 'bmad-core', 'schemas', 'patch-plan-schema.json');
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
    
    // Load patch plan
    const patchPlan = JSON.parse(await fs.readFile(patchPlanPath, 'utf-8'));
    
    // Validate against schema
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(patchPlan);
    
    if (!valid) {
      console.error('❌ Schema validation failed:');
      console.error(JSON.stringify(validate.errors, null, 2));
      return { success: false, errors: validate.errors };
    }
    
    // Load bundle for cross-reference
    const bundlePath = path.join(__dirname, '..', '..', '.ai', 'bundles', \`\${patchPlan.storyId}.bundle.json\`);
    
    if (await fs.stat(bundlePath).catch(() => false)) {
      const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf-8'));
      
      // Validate file references against bundle
      for (const change of patchPlan.changes) {
        const inBundle = bundle.files.some(f => f.path === change.path);
        const fileExists = await fs.stat(
          path.join(__dirname, '..', '..', change.path)
        ).catch(() => false);
        
        if (!inBundle && !fileExists) {
          console.warn(\`⚠️  File not in bundle or filesystem: \${change.path}\`);
        }
      }
      
      // Validate AC mappings
      const storyContractPath = path.join(__dirname, '..', '..', 'docs', 'stories', \`\${patchPlan.storyId}.md\`);
      if (await fs.stat(storyContractPath).catch(() => false)) {
        const contractContent = await fs.readFile(storyContractPath, 'utf-8');
        
        for (const change of patchPlan.changes) {
          for (const ac of change.mappedACs) {
            if (!contractContent.includes(ac)) {
              console.warn(\`⚠️  AC not found in story contract: \${ac}\`);
            }
          }
        }
      }
    }
    
    console.log('✅ Patch plan validation passed');
    return { success: true, patchPlan };
    
  } catch (error) {
    console.error(\`❌ Validation failed: \${error.message}\`);
    return { success: false, error: error.message };
  }
}

// CLI interface
if (require.main === module) {
  const patchPlanPath = process.argv[2];
  
  if (!patchPlanPath) {
    console.error('Usage: npm run patch-plan:validate -- <patch-plan.json>');
    process.exit(1);
  }
  
  validatePatchPlan(patchPlanPath).then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { validatePatchPlan };
`;
  
  await fs.writeFile(
    path.join(patchPlanDir, 'validate-patch-plan.js'),
    validateScript
  );
  
  // Create example patch plan
  const examplesDir = path.join(__dirname, '..', '..', '..', 'docs', 'examples');
  await fs.mkdir(examplesDir, { recursive: true });
  
  const examplePatchPlan = `# Patch Plan Example

## JSON Format

\`\`\`json
{
  "storyId": "AH-005",
  "changes": [
    {
      "path": "src/validators/schema-validator.js",
      "operations": [
        {
          "type": "add",
          "description": "Add schema validation function"
        }
      ],
      "symbols": ["validateSchema", "SchemaError"],
      "rationale": "Implement schema validation to ensure data integrity",
      "mappedACs": ["AC1", "AC2"]
    },
    {
      "path": "tests/validators/schema-validator.test.js",
      "operations": [
        {
          "type": "add",
          "description": "Add unit tests for schema validator"
        }
      ],
      "symbols": ["describe", "it", "expect"],
      "rationale": "Ensure validator works correctly with test coverage",
      "mappedACs": ["AC3"]
    }
  ],
  "tests": [
    "tests/validators/schema-validator.test.js",
    "tests/integration/validation.test.js"
  ],
  "riskLevel": "low",
  "signature": "dev-agent-signature-12345",
  "timestamp": "2024-01-15T10:30:00Z"
}
\`\`\`

## Usage

1. Create a patch plan JSON file following the schema
2. Validate it: \`npm run patch-plan:validate -- my-patch.json\`
3. Submit for review at Dev→QA gate
4. Apply patch after validation passes

## Key Requirements

- **storyId**: Must match an existing story
- **changes**: Each change must map to story acceptance criteria
- **rationale**: Clear explanation for each change
- **mappedACs**: Link changes to specific acceptance criteria
- **tests**: List all related test files
- **riskLevel**: Assess impact (low/medium/high)
- **signature**: Digital signature for authenticity
- **timestamp**: When patch plan was created
`;
  
  await fs.writeFile(
    path.join(examplesDir, 'patch-plan-example.md'),
    examplePatchPlan
  );
  
  console.log('[AH-005] ✓ Grounded Editing Protocol (GEP) implementation complete');
}

module.exports = { execute };