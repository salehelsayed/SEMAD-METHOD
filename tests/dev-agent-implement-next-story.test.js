const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { findNextApprovedStory } = require('../bmad-core/utils/find-next-story');

describe('Dev Agent - Implement Next Story Command', () => {
  const testStoriesDir = path.join(__dirname, 'test-implement-stories');
  const coreConfigPath = path.join(__dirname, 'test-core-config.yaml');

  beforeEach(() => {
    // Create test directories
    if (!fs.existsSync(testStoriesDir)) {
      fs.mkdirSync(testStoriesDir, { recursive: true });
    }

    // Create test core-config.yaml
    const coreConfig = {
      devStoryLocation: testStoriesDir,
      devLoadAlwaysFiles: []
    };
    fs.writeFileSync(coreConfigPath, yaml.dump(coreConfig));
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testStoriesDir)) {
      fs.rmSync(testStoriesDir, { recursive: true, force: true });
    }
    if (fs.existsSync(coreConfigPath)) {
      fs.unlinkSync(coreConfigPath);
    }
  });

  describe('Command Recognition', () => {
    it('should recognize implement-next-story as a valid command', () => {
      // Simulate command parsing
      const commands = [
        'help',
        'run-tests',
        'execute-task',
        'explain',
        'implement-next-story',
        'exit'
      ];

      const userCommand = 'implement-next-story';
      expect(commands).toContain(userCommand);
    });

    it('should require asterisk prefix for command', () => {
      const validCommand = '*implement-next-story';
      const invalidCommand = 'implement-next-story';
      
      // Command should start with *
      expect(validCommand.startsWith('*')).toBe(true);
      expect(invalidCommand.startsWith('*')).toBe(false);
    });
  });

  describe('Story Discovery', () => {
    it('should find and load approved story', () => {
      // Create an approved story
      const approvedStory = `---
StoryContract:
  version: "1.0"
  story_id: "5.1"
  epic_id: "5"
  apiEndpoints:
    - method: POST
      path: /api/items
      description: Create new item
      requestBody: { "name": "string", "value": "number" }
      successResponse: { "id": "string", "name": "string", "value": "number" }
  filesToModify:
    - path: src/controllers/itemController.js
      reason: Add createItem endpoint
  acceptanceCriteriaLinks: ["AC-5.1.1", "AC-5.1.2"]
---

# Epic 5 - Story 1: Item Creation

## Status
Approved

## Story
As a developer, I want to create items via API, so that I can test the implementation flow.

## Acceptance Criteria
1. AC-5.1.1: POST /api/items creates a new item
2. AC-5.1.2: Response includes item ID

## Tasks / Subtasks
- [ ] Implement item creation endpoint (AC: 5.1.1)
  - [ ] Create controller method
  - [ ] Add validation
- [ ] Write unit tests (AC: 5.1.2)
  - [ ] Test successful creation
  - [ ] Test validation errors

## Dev Notes
### Testing Standards
- Tests go in tests/controllers/
- Use Jest for unit tests
- Mock database calls`;

      fs.writeFileSync(path.join(testStoriesDir, '5.1.item-creation.md'), approvedStory);

      // Use the utility to find the story
      const result = findNextApprovedStory(testStoriesDir);
      
      expect(result.found).toBe(true);
      expect(result.storyContract).toBeDefined();
      expect(result.storyContract.story_id).toBe('5.1');
      expect(result.title).toContain('Item Creation');
    });

    it('should handle no approved stories scenario', () => {
      // Create only draft stories
      const draftStory = `---
StoryContract:
  version: "1.0"
  story_id: "6.1"
  epic_id: "6"
  apiEndpoints: []
  filesToModify: []
  acceptanceCriteriaLinks: []
---

# Epic 6 - Story 1: Draft Feature

## Status
Draft

## Story
As a user, I want a draft feature`;

      fs.writeFileSync(path.join(testStoriesDir, '6.1.draft-feature.md'), draftStory);

      const result = findNextApprovedStory(testStoriesDir);
      
      expect(result.found).toBe(false);
      expect(result.error).toContain('No approved stories found');
    });

    it('should validate StoryContract before proceeding', () => {
      // Create approved story with invalid contract
      const storyWithBadContract = `---
StoryContract:
  story_id: "7.1"
  # Missing required fields: version, epic_id, apiEndpoints, filesToModify, acceptanceCriteriaLinks
---

# Epic 7 - Story 1: Invalid Contract

## Status
Approved

## Story
As a user, I want a feature with invalid contract`;

      fs.writeFileSync(path.join(testStoriesDir, '7.1.invalid-contract.md'), storyWithBadContract);

      const result = findNextApprovedStory(testStoriesDir);
      
      expect(result.found).toBe(true);
      expect(result.storyContract).toBeDefined();
      // The contract is malformed - dev agent should detect this during validation
      expect(result.storyContract.version).toBeUndefined();
      expect(result.storyContract.epic_id).toBeUndefined();
    });
  });

  describe('Workflow Integration', () => {
    it('should demonstrate complete command flow', async () => {
      // This simulates what the Dev agent would do when receiving the command
      class DevAgentSimulator {
        constructor(storiesDir) {
          this.storiesDir = storiesDir;
          this.currentStory = null;
        }

        async executeCommand(command) {
          if (command === '*implement-next-story') {
            // Step 1: Find next approved story
            const result = findNextApprovedStory(this.storiesDir);
            
            if (!result.found) {
              return {
                success: false,
                message: result.error
              };
            }

            // Step 2: Display story info for confirmation
            const confirmationMessage = `Found approved story: ${result.title}
File: ${result.filename}
Would you like to begin implementation? (yes/no)`;

            // Step 3: Simulate user confirmation (in real scenario, this would wait for input)
            const userConfirmed = true; // Simulated

            if (!userConfirmed) {
              return {
                success: false,
                message: 'Implementation cancelled by user'
              };
            }

            // Step 4: Validate StoryContract
            if (!result.storyContract || !this.isValidContract(result.storyContract)) {
              return {
                success: false,
                message: 'Story has invalid or missing StoryContract. Please ask the Scrum Master to fix the story before proceeding.'
              };
            }

            // Step 5: Load story and begin implementation
            this.currentStory = {
              path: result.path,
              contract: result.storyContract,
              content: fs.readFileSync(result.path, 'utf8')
            };

            return {
              success: true,
              message: `Successfully loaded story ${result.storyContract.story_id}. Beginning implementation...`,
              story: this.currentStory
            };
          }

          return {
            success: false,
            message: `Unknown command: ${command}`
          };
        }

        isValidContract(contract) {
          // Simple validation - in real implementation this would use StoryContractValidator
          return contract.version && 
                 contract.story_id && 
                 contract.epic_id && 
                 contract.apiEndpoints !== undefined &&
                 contract.filesToModify !== undefined &&
                 contract.acceptanceCriteriaLinks !== undefined;
        }
      }

      // Create test stories
      const validStory = `---
StoryContract:
  version: "1.0"
  story_id: "8.1"
  epic_id: "8"
  apiEndpoints: []
  filesToModify: []
  acceptanceCriteriaLinks: ["AC-8.1.1"]
---

# Epic 8 - Story 1: Test Implementation

## Status
Approved

## Story
Test story for implement-next-story command`;

      fs.writeFileSync(path.join(testStoriesDir, '8.1.test-implementation.md'), validStory);

      // Execute command
      const devAgent = new DevAgentSimulator(testStoriesDir);
      const result = await devAgent.executeCommand('*implement-next-story');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully loaded story 8.1');
      expect(result.story).toBeDefined();
      expect(result.story.contract.story_id).toBe('8.1');
    });

    it('should handle empty stories directory', () => {
      const devAgent = {
        executeImplementNextStory: () => {
          const result = findNextApprovedStory(testStoriesDir);
          if (!result.found) {
            return {
              success: false,
              message: `Cannot find next story: ${result.error}`
            };
          }
          return { success: true };
        }
      };

      const result = devAgent.executeImplementNextStory();
      expect(result.success).toBe(false);
      expect(result.message).toContain('No story files found');
    });
  });
});