const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { resolveBmadModule } = require('./helpers/module-path-helper');

const StoryContractValidator = require(resolveBmadModule('utils/story-contract-validator', __dirname));

describe('Dev Agent Contract Validation on Activation', () => {
  const tempDir = path.join(__dirname, 'temp-dev-agent-test');
  let validator;

  beforeEach(() => {
    // Create temp directory for test files
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    validator = new StoryContractValidator();
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Dev agent activation with story assignment', () => {
    it('should proceed with valid StoryContract', () => {
      // Create a story with valid contract
      const validStoryContent = `---
StoryContract:
  version: "1.0"
  story_id: "4.1"
  epic_id: "4"
  apiEndpoints:
    - method: POST
      path: /api/users
      description: Create a new user
      requestBody: { "name": "string", "email": "string" }
      successResponse: { "id": "string", "name": "string", "email": "string" }
  filesToModify:
    - path: src/controllers/userController.js
      reason: Add createUser endpoint
  acceptanceCriteriaLinks: ["AC-4.1.1", "AC-4.1.2"]
---

# Epic 4 - Story 1: User Creation

## Status
Ready for Development

## Story
As an admin, I want to create new users via API.

## Tasks
1. [ ] Implement user creation endpoint
2. [ ] Add validation middleware
3. [ ] Write unit tests
`;

      const storyPath = path.join(tempDir, '4.1.story.md');
      fs.writeFileSync(storyPath, validStoryContent);

      // Simulate dev agent loading the story
      function devAgentActivation(storyFile) {
        // Step 1: Extract contract from story
        const contract = validator.extractContractFromStory(storyFile);
        
        if (!contract) {
          throw new Error('No StoryContract found in story file. Cannot proceed with development.');
        }

        // Step 2: Validate contract
        const validation = validator.validateContract(contract);
        
        if (!validation.valid) {
          const formattedErrors = validator.formatErrors(validation.errors);
          throw new Error(`StoryContract validation failed. Please ask the Scrum Master to fix the story before proceeding:\n${formattedErrors}`);
        }

        // Step 3: Return success if validation passes
        return {
          success: true,
          contract: contract,
          message: `Successfully loaded story ${contract.story_id} with valid contract`
        };
      }

      const result = devAgentActivation(storyPath);
      expect(result.success).toBe(true);
      expect(result.contract.story_id).toBe('4.1');
      expect(result.message).toContain('Successfully loaded story 4.1');
    });

    it('should halt with missing StoryContract', () => {
      // Create a story without StoryContract
      const storyWithoutContract = `---
metadata: some data
---

# Epic 4 - Story 2: User Update

## Status
Ready for Development

## Story
As an admin, I want to update user information.

## Tasks
1. [ ] Implement user update endpoint
`;

      const storyPath = path.join(tempDir, '4.2.story.md');
      fs.writeFileSync(storyPath, storyWithoutContract);

      function devAgentActivation(storyFile) {
        const contract = validator.extractContractFromStory(storyFile);
        
        if (!contract) {
          throw new Error('No StoryContract found in story file. Cannot proceed with development.');
        }

        const validation = validator.validateContract(contract);
        
        if (!validation.valid) {
          const formattedErrors = validator.formatErrors(validation.errors);
          throw new Error(`StoryContract validation failed. Please ask the Scrum Master to fix the story before proceeding:\n${formattedErrors}`);
        }

        return { success: true, contract: contract };
      }

      expect(() => devAgentActivation(storyPath))
        .toThrow('No StoryContract found in story file. Cannot proceed with development.');
    });

    it('should halt with malformed StoryContract - missing required fields', () => {
      // Create a story with incomplete contract
      const malformedStoryContent = `---
StoryContract:
  version: "1.0"
  story_id: "4.3"
  # Missing: epic_id, apiEndpoints, filesToModify, acceptanceCriteriaLinks
---

# Epic 4 - Story 3: User Deletion

## Status
Ready for Development

## Story
As an admin, I want to delete users.
`;

      const storyPath = path.join(tempDir, '4.3.story.md');
      fs.writeFileSync(storyPath, malformedStoryContent);

      function devAgentActivation(storyFile) {
        const contract = validator.extractContractFromStory(storyFile);
        
        if (!contract) {
          throw new Error('No StoryContract found in story file. Cannot proceed with development.');
        }

        const validation = validator.validateContract(contract);
        
        if (!validation.valid) {
          const formattedErrors = validator.formatErrors(validation.errors);
          throw new Error(`StoryContract validation failed. Please ask the Scrum Master to fix the story before proceeding:\n${formattedErrors}`);
        }

        return { success: true, contract: contract };
      }

      expect(() => devAgentActivation(storyPath))
        .toThrow(/StoryContract validation failed/);
      
      // Verify the error message contains helpful information
      try {
        devAgentActivation(storyPath);
      } catch (error) {
        // AJV reports missing fields one at a time, so we just check that it mentions missing fields
        expect(error.message).toContain('Missing required field:');
      }
    });

    it('should halt with invalid API endpoint method', () => {
      const invalidMethodContent = `---
StoryContract:
  version: "1.0"
  story_id: "4.4"
  epic_id: "4"
  apiEndpoints:
    - method: INVALID_METHOD
      path: /api/users
      description: Invalid method test
      requestBody: {}
      successResponse: {}
  filesToModify:
    - path: src/test.js
      reason: Test file
  acceptanceCriteriaLinks: ["AC-1"]
---

# Story with invalid HTTP method
`;

      const storyPath = path.join(tempDir, '4.4.story.md');
      fs.writeFileSync(storyPath, invalidMethodContent);

      function devAgentActivation(storyFile) {
        const contract = validator.extractContractFromStory(storyFile);
        
        if (!contract) {
          throw new Error('No StoryContract found in story file. Cannot proceed with development.');
        }

        const validation = validator.validateContract(contract);
        
        if (!validation.valid) {
          const formattedErrors = validator.formatErrors(validation.errors);
          throw new Error(`StoryContract validation failed. Please ask the Scrum Master to fix the story before proceeding:\n${formattedErrors}`);
        }

        return { success: true, contract: contract };
      }

      expect(() => devAgentActivation(storyPath))
        .toThrow(/StoryContract validation failed/);
      
      try {
        devAgentActivation(storyPath);
      } catch (error) {
        expect(error.message).toContain('Invalid value at /apiEndpoints/0/method');
        expect(error.message).toContain('Allowed values: GET, POST, PUT, DELETE, PATCH');
      }
    });

    it('should halt with missing endpoint required properties', () => {
      const missingPropsContent = `---
StoryContract:
  version: "1.0"
  story_id: "4.5"
  epic_id: "4"
  apiEndpoints:
    - method: POST
      path: /api/users
      # Missing: description, requestBody, successResponse
  filesToModify:
    - path: src/test.js
      reason: Test file
  acceptanceCriteriaLinks: ["AC-1"]
---

# Story with incomplete endpoint
`;

      const storyPath = path.join(tempDir, '4.5.story.md');
      fs.writeFileSync(storyPath, missingPropsContent);

      function devAgentActivation(storyFile) {
        const contract = validator.extractContractFromStory(storyFile);
        
        if (!contract) {
          throw new Error('No StoryContract found in story file. Cannot proceed with development.');
        }

        const validation = validator.validateContract(contract);
        
        if (!validation.valid) {
          const formattedErrors = validator.formatErrors(validation.errors);
          throw new Error(`StoryContract validation failed. Please ask the Scrum Master to fix the story before proceeding:\n${formattedErrors}`);
        }

        return { success: true, contract: contract };
      }

      expect(() => devAgentActivation(storyPath))
        .toThrow(/StoryContract validation failed/);
      
      try {
        devAgentActivation(storyPath);
      } catch (error) {
        // AJV reports missing fields one at a time
        expect(error.message).toContain('Missing required field:');
        expect(error.message).toContain('at /apiEndpoints/0');
      }
    });

    it('should provide clear guidance for fixing validation errors', () => {
      const complexErrorContent = `---
StoryContract:
  version: 1.0  # Wrong type - should be string
  story_id: "4.6"
  epic_id: ""  # Empty string
  apiEndpoints: []  # Empty array when endpoints expected
  filesToModify:
    - path: ""  # Empty path
      # Missing reason
  acceptanceCriteriaLinks: null  # Wrong type - should be array
---

# Story with multiple validation errors
`;

      const storyPath = path.join(tempDir, '4.6.story.md');
      fs.writeFileSync(storyPath, complexErrorContent);

      function devAgentActivation(storyFile) {
        const contract = validator.extractContractFromStory(storyFile);
        
        if (!contract) {
          throw new Error('No StoryContract found in story file. Cannot proceed with development.');
        }

        const validation = validator.validateContract(contract);
        
        if (!validation.valid) {
          const formattedErrors = validator.formatErrors(validation.errors);
          throw new Error(`StoryContract validation failed. Please ask the Scrum Master to fix the story before proceeding:\n${formattedErrors}`);
        }

        return { success: true, contract: contract };
      }

      try {
        devAgentActivation(storyPath);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('StoryContract validation failed');
        expect(error.message).toContain('Please ask the Scrum Master to fix the story');
        // The error should provide actionable feedback
        expect(error.message.split('\n').length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Integration with dev workflow', () => {
    it('should demonstrate complete dev agent validation flow', () => {
      // This test simulates the complete flow a dev agent would follow
      const storyPath = path.join(tempDir, 'integration-test.story.md');
      
      // 1. First attempt - malformed contract
      const malformedContent = `---
StoryContract:
  story_id: "5.1"
  # Intentionally incomplete
---

# Story 5.1: Integration Test
`;
      
      fs.writeFileSync(storyPath, malformedContent);
      
      // Dev agent simulation
      class DevAgentSimulator {
        constructor() {
          this.validator = new StoryContractValidator();
          this.workflowBlocked = false;
          this.blockReason = null;
        }

        loadStory(storyFile) {
          try {
            // Extract contract
            const contract = this.validator.extractContractFromStory(storyFile);
            
            if (!contract) {
              this.workflowBlocked = true;
              this.blockReason = 'No StoryContract found in story file';
              return false;
            }

            // Validate contract
            const validation = this.validator.validateContract(contract);
            
            if (!validation.valid) {
              this.workflowBlocked = true;
              this.blockReason = this.validator.formatErrors(validation.errors);
              return false;
            }

            // Success
            this.workflowBlocked = false;
            this.blockReason = null;
            return true;
          } catch (error) {
            this.workflowBlocked = true;
            this.blockReason = error.message;
            return false;
          }
        }

        canProceedWithDevelopment() {
          return !this.workflowBlocked;
        }

        getBlockageMessage() {
          if (!this.workflowBlocked) return null;
          
          return `DEVELOPMENT BLOCKED:
${this.blockReason}

Please contact the Scrum Master to fix the story before proceeding.`;
        }
      }

      const devAgent = new DevAgentSimulator();
      
      // First attempt - should fail
      const loaded = devAgent.loadStory(storyPath);
      expect(loaded).toBe(false);
      expect(devAgent.canProceedWithDevelopment()).toBe(false);
      expect(devAgent.getBlockageMessage()).toContain('DEVELOPMENT BLOCKED');
      expect(devAgent.getBlockageMessage()).toContain('Missing required field');
      
      // 2. Scrum Master fixes the story
      const fixedContent = `---
StoryContract:
  version: "1.0"
  story_id: "5.1"
  epic_id: "5"
  apiEndpoints:
    - method: GET
      path: /api/status
      description: Get system status
      requestBody: {}
      successResponse: { "status": "string", "timestamp": "string" }
  filesToModify:
    - path: src/controllers/statusController.js
      reason: Add status endpoint
  acceptanceCriteriaLinks: ["AC-5.1.1"]
---

# Story 5.1: Integration Test

## Status
Ready for Development
`;
      
      fs.writeFileSync(storyPath, fixedContent);
      
      // Second attempt - should succeed
      const reloaded = devAgent.loadStory(storyPath);
      expect(reloaded).toBe(true);
      expect(devAgent.canProceedWithDevelopment()).toBe(true);
      expect(devAgent.getBlockageMessage()).toBeNull();
    });
  });
});