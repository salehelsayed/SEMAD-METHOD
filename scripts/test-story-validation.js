#!/usr/bin/env node

/**
 * Script to test StoryContract validation in the workflow
 * This demonstrates how the validation is integrated into the story creation process
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Try to use the module resolver if available
let StoryContractValidator;
try {
  const ModuleResolver = require('../bmad-core/utils/module-resolver');
  const validatorPath = ModuleResolver.resolveModule('utils/story-contract-validator', '../bmad-core/utils/story-contract-validator', __dirname);
  StoryContractValidator = require(validatorPath);
} catch (e) {
  // Fallback to direct resolution
  const possiblePaths = [
    path.join(__dirname, '..', 'bmad-core', 'utils', 'story-contract-validator'),
    path.join(__dirname, '..', '.bmad-core', 'utils', 'story-contract-validator'),
    path.join(__dirname, '..', 'story-contract-validator')
  ];
  
  let found = false;
  for (const validatorPath of possiblePaths) {
    try {
      StoryContractValidator = require(validatorPath);
      found = true;
      break;
    } catch (err) {
      // Continue to next path
    }
  }
  
  if (!found) {
    console.error('Could not find StoryContractValidator module');
    process.exit(1);
  }
}

// Test data
const validStoryContract = {
  version: '1.0',
  story_id: '4.1',
  epic_id: 'epic-4',
  apiEndpoints: [
    {
      method: 'POST',
      path: '/api/users',
      description: 'Create a new user',
      requestBody: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          password: { type: 'string' }
        },
        required: ['email', 'password']
      },
      successResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          createdAt: { type: 'string' }
        }
      }
    }
  ],
  filesToModify: [
    {
      path: 'src/controllers/userController.js',
      reason: 'Add user creation endpoint'
    },
    {
      path: 'src/models/User.js',
      reason: 'Define user model schema'
    }
  ],
  acceptanceCriteriaLinks: ['AC-1', 'AC-2', 'AC-3']
};

const invalidStoryContract = {
  version: '1.0',
  story_id: '4.2',
  // Missing required fields: epic_id, apiEndpoints, filesToModify, acceptanceCriteriaLinks
};

async function testValidation() {
  console.log('=== StoryContract Validation Test ===\n');

  const validator = new StoryContractValidator();

  // Test 1: Valid contract
  console.log('Test 1: Validating a correct StoryContract...');
  const validResult = validator.validateContract(validStoryContract);
  
  if (validResult.valid) {
    console.log('✅ PASSED: Valid contract validated successfully\n');
  } else {
    console.log('❌ FAILED: Valid contract failed validation');
    console.log('Errors:', validator.formatErrors(validResult.errors));
    console.log();
  }

  // Test 2: Invalid contract
  console.log('Test 2: Validating an invalid StoryContract...');
  const invalidResult = validator.validateContract(invalidStoryContract);
  
  if (!invalidResult.valid) {
    console.log('✅ PASSED: Invalid contract correctly rejected');
    console.log('Validation errors:');
    console.log(validator.formatErrors(invalidResult.errors));
    console.log();
  } else {
    console.log('❌ FAILED: Invalid contract passed validation\n');
  }

  // Test 3: Story file validation
  console.log('Test 3: Creating and validating a story file...');
  
  const storyContent = `---
StoryContract:
  version: "1.0"
  story_id: "4.1"
  epic_id: "epic-4"
  apiEndpoints:
    - method: POST
      path: /api/users
      description: Create a new user
      requestBody:
        type: object
        properties:
          email:
            type: string
          password:
            type: string
        required:
          - email
          - password
      successResponse:
        type: object
        properties:
          id:
            type: string
          email:
            type: string
          createdAt:
            type: string
  filesToModify:
    - path: src/controllers/userController.js
      reason: Add user creation endpoint
    - path: src/models/User.js
      reason: Define user model schema
  acceptanceCriteriaLinks:
    - AC-1
    - AC-2
    - AC-3
---

# Epic 4 - Story 1: User Registration

## Status
Draft

## Story
As a new user, I want to register for an account so that I can access the application.

## Acceptance Criteria
1. User can register with email and password
2. Email must be unique
3. Password must meet security requirements

## Dev Notes
Implementation details from architecture documents...

## Tasks
1. Create user model
2. Implement registration endpoint
3. Add validation
4. Write tests
`;

  const tempStoryFile = path.join(__dirname, 'temp-test-story.md');
  fs.writeFileSync(tempStoryFile, storyContent);

  try {
    const fileResult = validator.validateStoryFile(tempStoryFile);
    
    if (fileResult.valid) {
      console.log('✅ PASSED: Story file with embedded contract validated successfully');
      console.log(`Contract extracted: story_id=${fileResult.contract.story_id}, epic_id=${fileResult.contract.epic_id}`);
      console.log(`API endpoints: ${fileResult.contract.apiEndpoints.length}`);
      console.log(`Files to modify: ${fileResult.contract.filesToModify.length}`);
      console.log();
    } else {
      console.log('❌ FAILED: Story file validation failed');
      console.log('Errors:', validator.formatErrors(fileResult.errors));
      console.log();
    }
  } finally {
    // Cleanup
    if (fs.existsSync(tempStoryFile)) {
      fs.unlinkSync(tempStoryFile);
    }
  }

  // Test 4: Workflow simulation
  console.log('Test 4: Simulating workflow validation halt...');
  
  // This simulates what happens in the TaskRunner when validation fails
  function simulateWorkflowStep(stepName, contract) {
    console.log(`\nExecuting step: ${stepName}`);
    
    const result = validator.validateContract(contract);
    
    if (!result.valid) {
      const errorMessage = `Step "${stepName}" validation failed:\n${validator.formatErrors(result.errors)}`;
      console.log(`❌ WORKFLOW HALTED: ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    console.log(`✅ Step "${stepName}" completed successfully`);
    return result;
  }

  try {
    simulateWorkflowStep('Parse Story Requirements - Valid', validStoryContract);
    simulateWorkflowStep('Parse Story Requirements - Invalid', invalidStoryContract);
  } catch (error) {
    console.log('\n✅ PASSED: Workflow correctly halted on validation error');
  }

  console.log('\n=== All validation tests completed ===');
}

// Run the tests
testValidation().catch(console.error);