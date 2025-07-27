const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { resolveBmadModule } = require('./helpers/module-path-helper');

const StoryContractValidator = require(resolveBmadModule('utils/story-contract-validator', __dirname));

describe('StoryContractValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new StoryContractValidator();
  });

  describe('constructor and schema loading', () => {
    it('should create an instance and load schema', () => {
      expect(validator).toBeDefined();
      expect(validator.ajv).toBeDefined();
      expect(validator.validate).toBeDefined();
    });

    it('should throw error if schema file is missing', () => {
      // Mock fs.readFileSync to simulate missing file
      const originalReadFileSync = fs.readFileSync;
      fs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      expect(() => new StoryContractValidator()).toThrow('Failed to load story contract schema');

      fs.readFileSync = originalReadFileSync;
    });
  });

  describe('validateContract', () => {
    it('should validate a valid contract', () => {
      const validContract = {
        version: '1.0',
        story_id: '4.1',
        epic_id: 'epic-4',
        apiEndpoints: [
          {
            method: 'POST',
            path: '/api/users',
            description: 'Create a new user',
            requestBody: { type: 'object' },
            successResponse: { type: 'object' }
          }
        ],
        filesToModify: [
          {
            path: 'src/controllers/userController.js',
            reason: 'Add user creation endpoint'
          }
        ],
        acceptanceCriteriaLinks: ['AC-1', 'AC-2']
      };

      const result = validator.validateContract(validContract);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation for missing required fields', () => {
      const invalidContract = {
        version: '1.0',
        story_id: '4.1',
        // Missing epic_id, apiEndpoints, filesToModify, acceptanceCriteriaLinks
      };

      const result = validator.validateContract(invalidContract);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail validation for invalid API endpoint method', () => {
      const invalidContract = {
        version: '1.0',
        story_id: '4.1',
        epic_id: 'epic-4',
        apiEndpoints: [
          {
            method: 'INVALID', // Invalid HTTP method
            path: '/api/users',
            description: 'Create a new user',
            requestBody: { type: 'object' },
            successResponse: { type: 'object' }
          }
        ],
        filesToModify: [],
        acceptanceCriteriaLinks: []
      };

      const result = validator.validateContract(invalidContract);
      expect(result.valid).toBe(false);
      expect(result.errors[0].keyword).toBe('enum');
    });

    it('should fail validation for missing endpoint properties', () => {
      const invalidContract = {
        version: '1.0',
        story_id: '4.1',
        epic_id: 'epic-4',
        apiEndpoints: [
          {
            method: 'POST',
            path: '/api/users',
            // Missing description, requestBody, successResponse
          }
        ],
        filesToModify: [],
        acceptanceCriteriaLinks: []
      };

      const result = validator.validateContract(invalidContract);
      expect(result.valid).toBe(false);
    });

    it('should throw error if schema not loaded', () => {
      validator.validate = null;
      const contract = { version: '1.0' };

      expect(() => validator.validateContract(contract)).toThrow('Schema not loaded');
    });
  });

  describe('extractContractFromStory', () => {
    it('should extract contract from YAML front matter', () => {
      const storyContent = `---
StoryContract:
  version: "1.0"
  story_id: "4.1"
  epic_id: "epic-4"
  apiEndpoints: []
  filesToModify: []
  acceptanceCriteriaLinks: []
---

# Story 4.1: User Registration

Story content here...`;

      // Create temp file
      const tempFile = path.join(__dirname, 'temp-story.md');
      fs.writeFileSync(tempFile, storyContent);

      try {
        const contract = validator.extractContractFromStory(tempFile);
        expect(contract).toBeDefined();
        expect(contract.version).toBe('1.0');
        expect(contract.story_id).toBe('4.1');
        expect(contract.epic_id).toBe('epic-4');
      } finally {
        // Cleanup
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should return null if no StoryContract found', () => {
      const storyContent = `---
someOtherData: value
---

# Story without contract`;

      const tempFile = path.join(__dirname, 'temp-story-no-contract.md');
      fs.writeFileSync(tempFile, storyContent);

      try {
        const contract = validator.extractContractFromStory(tempFile);
        expect(contract).toBeNull();
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should return null if no YAML front matter', () => {
      const storyContent = `# Story without front matter

Just regular markdown content.`;

      const tempFile = path.join(__dirname, 'temp-story-no-yaml.md');
      fs.writeFileSync(tempFile, storyContent);

      try {
        const contract = validator.extractContractFromStory(tempFile);
        expect(contract).toBeNull();
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should throw error if file cannot be read', () => {
      const nonExistentFile = path.join(__dirname, 'non-existent-file.md');
      
      expect(() => validator.extractContractFromStory(nonExistentFile))
        .toThrow('Failed to extract contract from story');
    });
  });

  describe('validateStoryFile', () => {
    it('should validate a story file with valid contract', () => {
      const storyContent = `---
StoryContract:
  version: "1.0"
  story_id: "4.1"
  epic_id: "epic-4"
  apiEndpoints:
    - method: POST
      path: /api/users
      description: Create user
      requestBody: { type: object }
      successResponse: { type: object }
  filesToModify:
    - path: src/controllers/userController.js
      reason: Add endpoint
  acceptanceCriteriaLinks: ["AC-1"]
---

# Story content`;

      const tempFile = path.join(__dirname, 'temp-valid-story.md');
      fs.writeFileSync(tempFile, storyContent);

      try {
        const result = validator.validateStoryFile(tempFile);
        expect(result.valid).toBe(true);
        expect(result.contract).toBeDefined();
        expect(result.errors).toEqual([]);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should return error if no contract found', () => {
      const storyContent = `# Story without contract`;

      const tempFile = path.join(__dirname, 'temp-no-contract.md');
      fs.writeFileSync(tempFile, storyContent);

      try {
        const result = validator.validateStoryFile(tempFile);
        expect(result.valid).toBe(false);
        expect(result.contract).toBeNull();
        expect(result.errors[0].message).toBe('No StoryContract found in story file');
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should return validation errors for invalid contract', () => {
      const storyContent = `---
StoryContract:
  version: "1.0"
  story_id: "4.1"
  # Missing required fields
---

# Story content`;

      const tempFile = path.join(__dirname, 'temp-invalid-story.md');
      fs.writeFileSync(tempFile, storyContent);

      try {
        const result = validator.validateStoryFile(tempFile);
        expect(result.valid).toBe(false);
        expect(result.contract).toBeDefined();
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should handle file read errors', () => {
      const nonExistentFile = path.join(__dirname, 'non-existent.md');
      
      const result = validator.validateStoryFile(nonExistentFile);
      expect(result.valid).toBe(false);
      expect(result.contract).toBeNull();
      expect(result.errors[0].message).toContain('Failed to extract contract from story');
    });
  });

  describe('formatErrors', () => {
    it('should format required field errors', () => {
      const errors = [
        {
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'epic_id' }
        }
      ];

      const formatted = validator.formatErrors(errors);
      expect(formatted).toContain('Missing required field: epic_id');
    });

    it('should format enum errors', () => {
      const errors = [
        {
          keyword: 'enum',
          instancePath: '/apiEndpoints/0/method',
          message: 'must be equal to one of the allowed values',
          params: { allowedValues: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }  // Changed from allowableValues to allowedValues
        }
      ];

      const formatted = validator.formatErrors(errors);
      expect(formatted).toContain('Invalid value at /apiEndpoints/0/method');
      expect(formatted).toContain('Allowed values: GET, POST, PUT, DELETE, PATCH');
    });

    it('should format type errors', () => {
      const errors = [
        {
          keyword: 'type',
          instancePath: '/story_id',
          message: 'must be string',
          params: { type: 'string' },
          data: 123
        }
      ];

      const formatted = validator.formatErrors(errors);
      expect(formatted).toContain('Invalid type at /story_id');
      expect(formatted).toContain('expected string, got number');
    });

    it('should format generic errors', () => {
      const errors = [
        {
          keyword: 'additionalProperties',
          instancePath: '/apiEndpoints/0',
          message: 'must NOT have additional properties'
        }
      ];

      const formatted = validator.formatErrors(errors);
      expect(formatted).toContain('Validation error at /apiEndpoints/0');
      expect(formatted).toContain('must NOT have additional properties');
    });

    it('should return "No errors" for empty array', () => {
      const formatted = validator.formatErrors([]);
      expect(formatted).toBe('No errors');
    });

    it('should return "No errors" for null/undefined', () => {
      expect(validator.formatErrors(null)).toBe('No errors');
      expect(validator.formatErrors(undefined)).toBe('No errors');
    });

    it('should format multiple errors', () => {
      const errors = [
        {
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'epic_id' }
        },
        {
          keyword: 'type',
          instancePath: '/version',
          params: { type: 'string' },
          data: 123
        }
      ];

      const formatted = validator.formatErrors(errors);
      const lines = formatted.split('\n');
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('Missing required field: epic_id');
      expect(lines[1]).toContain('Invalid type at /version');
    });
  });
});