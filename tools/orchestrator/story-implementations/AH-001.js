#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// AH-001: Typed Artifacts via JSON Schemas
async function execute() {
  console.log('[AH-001] Creating JSON schemas for typed artifacts...');
  
  const schemasDir = path.join(__dirname, '..', '..', '..', 'bmad-core', 'schemas');
  
  // Ensure schemas directory exists
  await fs.mkdir(schemasDir, { recursive: true });
  
  // Create brief-schema.json
  const briefSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Project Brief Schema",
    "type": "object",
    "required": ["id", "version", "stakeholders", "successCriteria", "scope", "nonFunctional"],
    "properties": {
      "id": {
        "type": "string",
        "description": "Unique identifier for the brief"
      },
      "version": {
        "type": "string",
        "pattern": "^\\d+\\.\\d+\\.\\d+$",
        "description": "Semantic version of the brief"
      },
      "stakeholders": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name", "role", "concerns"],
          "properties": {
            "name": { "type": "string" },
            "role": { "type": "string" },
            "concerns": { "type": "array", "items": { "type": "string" } }
          }
        }
      },
      "successCriteria": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 1
      },
      "scope": {
        "type": "object",
        "required": ["included", "excluded"],
        "properties": {
          "included": { "type": "array", "items": { "type": "string" } },
          "excluded": { "type": "array", "items": { "type": "string" } }
        }
      },
      "nonFunctional": {
        "type": "object",
        "properties": {
          "performance": { "type": "array", "items": { "type": "string" } },
          "security": { "type": "array", "items": { "type": "string" } },
          "scalability": { "type": "array", "items": { "type": "string" } },
          "maintainability": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  };
  
  await fs.writeFile(
    path.join(schemasDir, 'brief-schema.json'),
    JSON.stringify(briefSchema, null, 2)
  );
  
  // Create prd-schema.json
  const prdSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Product Requirements Document Schema",
    "type": "object",
    "required": ["id", "version", "features", "userStories", "acceptanceCriteria"],
    "properties": {
      "id": {
        "type": "string",
        "description": "Unique identifier for the PRD"
      },
      "version": {
        "type": "string",
        "pattern": "^\\d+\\.\\d+\\.\\d+$"
      },
      "features": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "name", "description", "priority"],
          "properties": {
            "id": { "type": "string" },
            "name": { "type": "string" },
            "description": { "type": "string" },
            "priority": { "enum": ["critical", "high", "medium", "low"] }
          }
        }
      },
      "userStories": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "as", "want", "so"],
          "properties": {
            "id": { "type": "string" },
            "as": { "type": "string" },
            "want": { "type": "string" },
            "so": { "type": "string" }
          }
        }
      },
      "acceptanceCriteria": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "criteria", "testable"],
          "properties": {
            "id": { "type": "string" },
            "criteria": { "type": "string" },
            "testable": { "type": "boolean" }
          }
        }
      }
    }
  };
  
  await fs.writeFile(
    path.join(schemasDir, 'prd-schema.json'),
    JSON.stringify(prdSchema, null, 2)
  );
  
  // Create architecture-schema.json
  const architectureSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Architecture Document Schema",
    "type": "object",
    "required": ["id", "version", "components", "apis", "dataModels", "decisions"],
    "properties": {
      "id": { "type": "string" },
      "version": {
        "type": "string",
        "pattern": "^\\d+\\.\\d+\\.\\d+$"
      },
      "components": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name", "type", "responsibilities", "dependencies"],
          "properties": {
            "name": { "type": "string" },
            "type": { "type": "string" },
            "responsibilities": { "type": "array", "items": { "type": "string" } },
            "dependencies": { "type": "array", "items": { "type": "string" } }
          }
        }
      },
      "apis": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name", "protocol", "endpoints"],
          "properties": {
            "name": { "type": "string" },
            "protocol": { "type": "string" },
            "endpoints": { "type": "array", "items": { "type": "string" } }
          }
        }
      },
      "dataModels": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name", "fields"],
          "properties": {
            "name": { "type": "string" },
            "fields": { "type": "object" }
          }
        }
      },
      "decisions": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "decision", "rationale", "alternatives"],
          "properties": {
            "id": { "type": "string" },
            "decision": { "type": "string" },
            "rationale": { "type": "string" },
            "alternatives": { "type": "array", "items": { "type": "string" } }
          }
        }
      }
    }
  };
  
  await fs.writeFile(
    path.join(schemasDir, 'architecture-schema.json'),
    JSON.stringify(architectureSchema, null, 2)
  );
  
  // Create sprint-plan-schema.json
  const sprintPlanSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Sprint Plan Schema",
    "type": "object",
    "required": ["id", "version", "stories", "capacity", "risks"],
    "properties": {
      "id": { "type": "string" },
      "version": {
        "type": "string",
        "pattern": "^\\d+\\.\\d+\\.\\d+$"
      },
      "stories": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "title", "points", "assignee"],
          "properties": {
            "id": { "type": "string" },
            "title": { "type": "string" },
            "points": { "type": "number" },
            "assignee": { "type": "string" }
          }
        }
      },
      "capacity": {
        "type": "object",
        "required": ["total", "allocated"],
        "properties": {
          "total": { "type": "number" },
          "allocated": { "type": "number" }
        }
      },
      "risks": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["description", "probability", "impact", "mitigation"],
          "properties": {
            "description": { "type": "string" },
            "probability": { "enum": ["low", "medium", "high"] },
            "impact": { "enum": ["low", "medium", "high"] },
            "mitigation": { "type": "string" }
          }
        }
      }
    }
  };
  
  await fs.writeFile(
    path.join(schemasDir, 'sprint-plan-schema.json'),
    JSON.stringify(sprintPlanSchema, null, 2)
  );
  
  // Create task-bundle-schema.json
  const taskBundleSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Task Bundle Schema",
    "type": "object",
    "required": ["id", "version", "artifacts", "files", "tests", "checksum"],
    "properties": {
      "id": { "type": "string" },
      "version": {
        "type": "string",
        "pattern": "^\\d+\\.\\d+\\.\\d+$"
      },
      "artifacts": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["type", "path", "version"],
          "properties": {
            "type": { "type": "string" },
            "path": { "type": "string" },
            "version": { "type": "string" }
          }
        }
      },
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["path", "checksum"],
          "properties": {
            "path": { "type": "string" },
            "checksum": { "type": "string" }
          }
        }
      },
      "tests": {
        "type": "array",
        "items": { "type": "string" }
      },
      "checksum": {
        "type": "string",
        "description": "Overall bundle checksum"
      }
    }
  };
  
  await fs.writeFile(
    path.join(schemasDir, 'task-bundle-schema.json'),
    JSON.stringify(taskBundleSchema, null, 2)
  );
  
  // Extend story-contract-schema.json
  const storyContractSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Story Contract Schema",
    "type": "object",
    "required": ["version", "story_id", "epic_id", "schemaVersion"],
    "properties": {
      "version": { "type": "string" },
      "story_id": { "type": "string" },
      "epic_id": { "type": "string" },
      "schemaVersion": {
        "type": "string",
        "description": "Version of this schema"
      },
      "preConditions": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Conditions that must be met before story execution"
      },
      "postConditions": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Conditions that must be met after story completion"
      },
      "linkedArtifacts": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["type", "path", "version"],
          "properties": {
            "type": { "type": "string" },
            "path": { "type": "string" },
            "version": { "type": "string" }
          }
        },
        "description": "Artifacts linked to this story"
      },
      "apiEndpoints": {
        "type": "array",
        "items": { "type": "string" }
      },
      "filesToModify": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["path", "reason"],
          "properties": {
            "path": { "type": "string" },
            "reason": { "type": "string" }
          }
        }
      },
      "acceptanceCriteriaLinks": {
        "type": "array",
        "items": { "type": "string" }
      }
    }
  };
  
  await fs.writeFile(
    path.join(schemasDir, 'story-contract-schema.json'),
    JSON.stringify(storyContractSchema, null, 2)
  );
  
  // Create schema-check.js script
  const schemaCheckScript = `#!/usr/bin/env node

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
    console.log(\`✓ Loaded schema for \${type}\`);
  } catch (error) {
    console.error(\`✗ Failed to load schema for \${type}: \${error.message}\`);
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
        
        console.log(\`\${valid ? '✓' : '✗'} \${file}: \${status}\`);
        if (!valid) {
          console.log(\`  Errors: \${JSON.stringify(validator.errors, null, 2)}\`);
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
  
  console.log(\`\\nResults saved to \${logFile}\`);
  
  // Exit with error if any validation failed
  const hasFailures = results.some(r => r.status === 'FAIL');
  process.exit(hasFailures ? 1 : 0);
}

// Run validation
validateExamples();
`;
  
  const scriptsDir = path.join(__dirname, '..', '..', '..', 'scripts');
  await fs.mkdir(scriptsDir, { recursive: true });
  
  await fs.writeFile(
    path.join(scriptsDir, 'schema-check.js'),
    schemaCheckScript
  );
  
  // Update package.json with npm script
  const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
  
  packageJson.scripts = packageJson.scripts || {};
  packageJson.scripts['schema:check'] = 'node scripts/schema-check.js';
  
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
  
  // Update documentation
  const sourceTreePath = path.join(__dirname, '..', '..', '..', 'docs', 'architecture', 'source-tree.md');
  const currentSourceTree = await fs.readFile(sourceTreePath, 'utf-8');
  
  const schemaSection = `

## Artifact Schemas

The following JSON schemas define the structure of planning and execution artifacts:

### Schema Files
- \`bmad-core/schemas/brief-schema.json\` - Project brief structure
- \`bmad-core/schemas/prd-schema.json\` - Product requirements document
- \`bmad-core/schemas/architecture-schema.json\` - Architecture documentation
- \`bmad-core/schemas/sprint-plan-schema.json\` - Sprint planning artifacts
- \`bmad-core/schemas/task-bundle-schema.json\` - Task bundle manifests
- \`bmad-core/schemas/story-contract-schema.json\` - Story contracts with traceability

### Schema Validation
Run \`npm run schema:check\` to validate all artifacts against their schemas.

### Gate Enforcement
Schemas are enforced at the following orchestrator gates:
- **Planning → Development**: Brief, PRD, and Architecture schemas must validate
- **Dev → QA**: Task bundles and story contracts must validate
- **QA → Done**: Post-conditions defined in contracts must be verified
`;
  
  if (!currentSourceTree.includes('## Artifact Schemas')) {
    await fs.writeFile(sourceTreePath, currentSourceTree + schemaSection);
  }
  
  console.log('[AH-001] ✓ Created all JSON schemas and validation script');
}

module.exports = { execute };