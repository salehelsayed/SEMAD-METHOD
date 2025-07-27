const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

// Use ModuleResolver for schema resolution
let ModuleResolver;
try {
  ModuleResolver = require('../bmad-core/utils/module-resolver');
} catch (e) {
  // Fallback if bmad-core is in different location
  ModuleResolver = require('../.bmad-core/utils/module-resolver');
}

describe('StoryContract Schema Validation', () => {
  let ajv;
  let validate;

  beforeAll(() => {
    // Load the schema using ModuleResolver
    const baseDir = path.join(__dirname, '..');
    const schemaPath = ModuleResolver.resolveSchemaPath('storyContractSchema', baseDir) || 
      path.join(__dirname, '../bmad-core/schemas/story-contract-schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    
    ajv = new Ajv();
    // Add format support including uri-reference
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  test('Valid StoryContract should pass validation', () => {
    const validContract = {
      version: "1.0",
      story_id: "4.1",
      epic_id: "4",
      apiEndpoints: [
        {
          method: "POST",
          path: "/api/stories",
          description: "Create a new story",
          requestBody: { type: "object" },
          successResponse: { type: "object" }
        }
      ],
      filesToModify: [
        {
          path: "bmad-core/schemas/story-contract-schema.json",
          reason: "Create the schema file"
        }
      ],
      acceptanceCriteriaLinks: ["AC1", "AC2"]
    };

    const valid = validate(validContract);
    expect(valid).toBe(true);
  });

  test('StoryContract missing required fields should fail validation', () => {
    const invalidContract = {
      version: "1.0",
      story_id: "4.1"
      // Missing epic_id, apiEndpoints, filesToModify, acceptanceCriteriaLinks
    };

    const valid = validate(invalidContract);
    expect(valid).toBe(false);
    expect(validate.errors).toBeDefined();
    expect(validate.errors.length).toBeGreaterThan(0);
  });

  test('StoryContract with invalid apiEndpoint should fail validation', () => {
    const invalidContract = {
      version: "1.0",
      story_id: "4.1",
      epic_id: "4",
      apiEndpoints: [
        {
          method: "INVALID_METHOD", // Invalid HTTP method
          path: "/api/stories",
          description: "Create a new story",
          requestBody: {},
          successResponse: {}
        }
      ],
      filesToModify: [],
      acceptanceCriteriaLinks: []
    };

    const valid = validate(invalidContract);
    expect(valid).toBe(false);
  });

  test('StoryContract with missing file path should fail validation', () => {
    const invalidContract = {
      version: "1.0",
      story_id: "4.1",
      epic_id: "4",
      apiEndpoints: [],
      filesToModify: [
        {
          // Missing 'path' field
          reason: "Some reason"
        }
      ],
      acceptanceCriteriaLinks: []
    };

    const valid = validate(invalidContract);
    expect(valid).toBe(false);
  });
});