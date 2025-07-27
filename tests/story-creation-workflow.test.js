const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { resolveBmadModule } = require('./helpers/module-path-helper');

const StoryContractValidator = require(resolveBmadModule('utils/story-contract-validator', __dirname));

describe('Story Creation Workflow with Validation', () => {
  const tempDir = path.join(__dirname, 'temp-workflow-test');
  
  beforeAll(() => {
    // Create temp directory for test files
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Story creation with StoryContract validation', () => {
    it('should create a valid story file that passes validation', () => {
      // Step 1: Simulate story creation with StoryContract
      const storyContract = {
        version: '1.0',
        story_id: '1.1',
        epic_id: 'epic-1',
        apiEndpoints: [
          {
            method: 'GET',
            path: '/api/health',
            description: 'Health check endpoint',
            requestBody: {},
            successResponse: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                timestamp: { type: 'string' }
              }
            }
          }
        ],
        filesToModify: [
          {
            path: 'src/routes/health.js',
            reason: 'Create health check route'
          }
        ],
        acceptanceCriteriaLinks: ['AC-1']
      };

      // Step 2: Create story file with embedded contract
      const yamlFrontMatter = {
        StoryContract: storyContract
      };
      const storyContent = `---
${yaml.dump(yamlFrontMatter).trim()}
---

# Epic 1 - Story 1: Health Check Endpoint

## Status
Draft

## Story
As a system administrator, I want a health check endpoint so that I can monitor the application status.

## Acceptance Criteria
1. GET /api/health returns 200 OK with status and timestamp

## Dev Notes
[Source: architecture/rest-api-spec.md#health-endpoints]
- Health check endpoint should return JSON response
- No authentication required
- Should be available at /api/health

## Tasks
1. Create health route handler
2. Add route to Express app
3. Write unit tests
`;

      const storyFilePath = path.join(tempDir, '1.1.story.md');
      fs.writeFileSync(storyFilePath, storyContent);

      // Step 3: Validate the created story file
      const validator = new StoryContractValidator();
      const validationResult = validator.validateStoryFile(storyFilePath);

      // Assertions
      expect(validationResult.valid).toBe(true);
      expect(validationResult.contract).toBeDefined();
      expect(validationResult.contract.story_id).toBe('1.1');
      expect(validationResult.contract.epic_id).toBe('epic-1');
      expect(validationResult.errors).toEqual([]);
    });

    it('should halt workflow when StoryContract is invalid', () => {
      // Create story with invalid contract
      const invalidStoryContent = `---
StoryContract:
  version: "1.0"
  story_id: "1.2"
  # Missing required fields
---

# Epic 1 - Story 2: Invalid Story

## Status
Draft
`;

      const storyFilePath = path.join(tempDir, '1.2.story.md');
      fs.writeFileSync(storyFilePath, invalidStoryContent);

      const validator = new StoryContractValidator();
      const validationResult = validator.validateStoryFile(storyFilePath);

      // Assertions
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
      
      // In real workflow, this would halt execution
      const formattedErrors = validator.formatErrors(validationResult.errors);
      expect(formattedErrors).toContain('Missing required field');
    });

    it('should validate complex API endpoint schemas', () => {
      const complexContract = {
        version: '1.0',
        story_id: '2.1',
        epic_id: 'epic-2',
        apiEndpoints: [
          {
            method: 'POST',
            path: '/api/users/login',
            description: 'User login endpoint',
            requestBody: {
              type: 'object',
              properties: {
                email: { 
                  type: 'string',
                  format: 'email'
                },
                password: { 
                  type: 'string',
                  minLength: 8
                }
              },
              required: ['email', 'password']
            },
            successResponse: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    role: { 
                      type: 'string',
                      enum: ['user', 'admin']
                    }
                  }
                }
              }
            }
          }
        ],
        filesToModify: [
          {
            path: 'src/controllers/authController.js',
            reason: 'Add login endpoint'
          },
          {
            path: 'src/middleware/auth.js',
            reason: 'Add JWT token generation'
          }
        ],
        acceptanceCriteriaLinks: ['AC-1', 'AC-2', 'AC-3']
      };

      const validator = new StoryContractValidator();
      const result = validator.validateContract(complexContract);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Workflow integration scenarios', () => {
    it('should simulate SM agent creating a story with validation', () => {
      // This simulates what the SM agent does when creating a story
      function createStoryWithValidation(epicNum, storyNum, storyData) {
        const validator = new StoryContractValidator();
        
        // Step 1: Build StoryContract from parsed data
        const storyContract = {
          version: '1.0',
          story_id: `${epicNum}.${storyNum}`,
          epic_id: `epic-${epicNum}`,
          apiEndpoints: storyData.apiEndpoints || [],
          filesToModify: storyData.filesToModify || [],
          acceptanceCriteriaLinks: storyData.acceptanceCriteriaLinks || []
        };

        // Step 2: Validate before writing
        const validation = validator.validateContract(storyContract);
        
        if (!validation.valid) {
          throw new Error(`StoryContract validation failed:\n${validator.formatErrors(validation.errors)}`);
        }

        // Step 3: Create story file
        const yamlFrontMatter = {
          StoryContract: storyContract
        };
        const storyContent = `---
${yaml.dump(yamlFrontMatter).trim()}
---

# ${storyData.title}

## Status
Draft

## Story
${storyData.storyStatement}

## Acceptance Criteria
${storyData.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}
`;

        const storyPath = path.join(tempDir, `${epicNum}.${storyNum}.story.md`);
        fs.writeFileSync(storyPath, storyContent);
        
        return {
          success: true,
          path: storyPath,
          contract: storyContract
        };
      }

      // Test successful story creation
      const validStoryData = {
        title: 'User Profile API',
        storyStatement: 'As a user, I want to view and update my profile',
        acceptanceCriteria: [
          'User can retrieve their profile via GET /api/users/profile',
          'User can update their profile via PUT /api/users/profile'
        ],
        apiEndpoints: [
          {
            method: 'GET',
            path: '/api/users/profile',
            description: 'Get user profile',
            requestBody: {},
            successResponse: { type: 'object' }
          },
          {
            method: 'PUT',
            path: '/api/users/profile',
            description: 'Update user profile',
            requestBody: { type: 'object' },
            successResponse: { type: 'object' }
          }
        ],
        filesToModify: [
          {
            path: 'src/controllers/userController.js',
            reason: 'Add profile endpoints'
          }
        ],
        acceptanceCriteriaLinks: ['AC-1', 'AC-2']
      };

      const result = createStoryWithValidation(3, 1, validStoryData);
      expect(result.success).toBe(true);
      expect(fs.existsSync(result.path)).toBe(true);

      // Test failed story creation
      const invalidStoryData = {
        title: 'Invalid Story',
        storyStatement: 'This story has invalid data',
        acceptanceCriteria: ['Some criteria'],
        apiEndpoints: [
          {
            // Invalid endpoint - missing required fields
            method: 'INVALID_METHOD', // Invalid HTTP method
            path: '/api/test'
            // Missing: description, requestBody, successResponse
          }
        ]
      };

      expect(() => createStoryWithValidation(3, 2, invalidStoryData))
        .toThrow('StoryContract validation failed');
    });
  });
});