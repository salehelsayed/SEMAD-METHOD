const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const TaskRunner = require('../tools/task-runner');
const { resolveBmadModule } = require('./helpers/module-path-helper');

const StoryContractValidator = require(resolveBmadModule('utils/story-contract-validator', __dirname));

describe('Story Creation Integration Test', () => {
  let tempDir;
  let taskRunner;
  let validator;

  beforeEach(() => {
    // Create temporary directory structure
    tempDir = path.join(__dirname, 'temp-test-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Find source bmad-core directory dynamically
    const possibleSourceDirs = [
      path.join(__dirname, '..', 'bmad-core'),
      path.join(__dirname, '..', '.bmad-core'),
      process.cwd()
    ];
    
    let sourceBmadCore = null;
    for (const dir of possibleSourceDirs) {
      if (fs.existsSync(path.join(dir, 'core-config.yaml')) || 
          fs.existsSync(path.join(dir, 'bmad-core', 'core-config.yaml'))) {
        sourceBmadCore = fs.existsSync(path.join(dir, 'bmad-core')) ? 
          path.join(dir, 'bmad-core') : dir;
        break;
      }
    }
    
    if (!sourceBmadCore) {
      throw new Error('Could not find source bmad-core directory');
    }
    
    // Create bmad-core directory structure in temp
    const bmadCoreDir = path.join(tempDir, 'bmad-core');
    fs.mkdirSync(path.join(bmadCoreDir, 'structured-tasks'), { recursive: true });
    fs.mkdirSync(path.join(bmadCoreDir, 'schemas'), { recursive: true });
    
    // Copy necessary files from dynamic source
    const filesToCopy = [
      { src: 'core-config.yaml', dest: 'core-config.yaml' },
      { src: path.join('structured-tasks', 'create-next-story.yaml'), 
        dest: path.join('structured-tasks', 'create-next-story.yaml') },
      { src: path.join('schemas', 'story-contract-schema.json'), 
        dest: path.join('schemas', 'story-contract-schema.json') }
    ];
    
    for (const file of filesToCopy) {
      const srcPath = path.join(sourceBmadCore, file.src);
      const destPath = path.join(bmadCoreDir, file.dest);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
      } else {
        console.warn(`Warning: Source file not found: ${srcPath}`);
      }
    }
    
    // Create test PRD and architecture docs
    const docsDir = path.join(tempDir, 'docs');
    const prdDir = path.join(docsDir, 'prd');
    const archDir = path.join(docsDir, 'architecture');
    fs.mkdirSync(prdDir, { recursive: true });
    fs.mkdirSync(archDir, { recursive: true });
    
    // Create Epic file with story requirements
    const epicContent = `# Epic 1: User Management

## Overview
Build comprehensive user management system.

## Stories

### Story 1.1: User Registration API
**As a** system administrator  
**I want** users to be able to register accounts  
**So that** they can access the platform

**Acceptance Criteria:**
1. API endpoint accepts email, password, and name
2. Email validation is performed
3. Password meets security requirements (min 8 chars, 1 upper, 1 lower, 1 number)
4. Duplicate email addresses are rejected
5. Successful registration returns user ID and auth token

**Technical Requirements:**
- REST API endpoint: POST /api/v1/users/register
- Request body: { email, password, name }
- Response: { userId, token, user: { id, email, name } }
- Store in PostgreSQL users table
- Hash passwords with bcrypt
`;
    fs.writeFileSync(path.join(prdDir, 'epic-1-user-management.md'), epicContent);
    
    // Create architecture docs
    const techStackContent = `# Technology Stack

## Backend
- Node.js 18.x
- Express 4.x
- PostgreSQL 15.x
- bcrypt for password hashing

## API Standards
- RESTful design
- JSON request/response
- JWT authentication
`;
    fs.writeFileSync(path.join(archDir, 'tech-stack.md'), techStackContent);
    
    const apiSpecContent = `# REST API Specification

## User Management APIs

### POST /api/v1/users/register
Register a new user account.

**Request:**
\`\`\`json
{
  "email": "string",
  "password": "string", 
  "name": "string"
}
\`\`\`

**Success Response (201):**
\`\`\`json
{
  "userId": "string",
  "token": "string",
  "user": {
    "id": "string",
    "email": "string",
    "name": "string"
  }
}
\`\`\`

**Error Responses:**
- 400: Invalid request data
- 409: Email already exists
`;
    fs.writeFileSync(path.join(archDir, 'rest-api-spec.md'), apiSpecContent);
    
    const projectStructureContent = `# Unified Project Structure

## Backend Structure
\`\`\`
src/
  api/
    controllers/
      userController.js
    routes/
      userRoutes.js
    middleware/
      validation.js
  models/
    User.js
  services/
    userService.js
  utils/
    passwordUtils.js
\`\`\`
`;
    fs.writeFileSync(path.join(archDir, 'unified-project-structure.md'), projectStructureContent);
    
    // Create stories directory
    fs.mkdirSync(path.join(docsDir, 'stories'), { recursive: true });
    
    taskRunner = new TaskRunner(tempDir);
    // Load core config so validation schemas are available
    taskRunner.loadCoreConfig();
    validator = new StoryContractValidator();
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should create story with valid StoryContract from real PRD', async () => {
    // Load the create-next-story task
    const taskPath = path.join(tempDir, 'bmad-core', 'structured-tasks', 'create-next-story.yaml');
    const taskResult = await taskRunner.taskLoader.loadTask(taskPath);
    expect(taskResult).toBeDefined();
    expect(taskResult.type).toBe('structured');
    expect(taskResult.data.id).toBe('create-next-story');
    
    // Simulate execution context with parsed story data
    const context = {
      epicNum: 1,
      storyNum: 1,
      storyTitle: 'User Registration API',
      
      // Simulate the parse-story step output
      storyContract: {
        version: '1.0',
        story_id: '1.1',
        epic_id: '1',
        apiEndpoints: [
          {
            method: 'POST',
            path: '/api/v1/users/register',
            description: 'Register a new user account',
            requestBody: {
              email: 'string',
              password: 'string',
              name: 'string'
            },
            successResponse: {
              status: 201,
              body: {
                userId: 'string',
                token: 'string',
                user: {
                  id: 'string',
                  email: 'string',
                  name: 'string'
                }
              }
            }
          }
        ],
        filesToModify: [
          {
            path: 'src/api/controllers/userController.js',
            reason: 'Create user registration controller'
          },
          {
            path: 'src/api/routes/userRoutes.js',
            reason: 'Create user API routes'
          },
          {
            path: 'src/models/User.js',
            reason: 'Create User model'
          },
          {
            path: 'src/services/userService.js',
            reason: 'Create user service layer'
          },
          {
            path: 'src/utils/passwordUtils.js',
            reason: 'Create password hashing utilities'
          }
        ],
        acceptanceCriteriaLinks: [
          'Epic 1, Story 1.1, AC 1',
          'Epic 1, Story 1.1, AC 2',
          'Epic 1, Story 1.1, AC 3',
          'Epic 1, Story 1.1, AC 4',
          'Epic 1, Story 1.1, AC 5'
        ]
      }
    };
    
    // Find the parse-story step
    const parseStoryStep = taskResult.data.steps.find(s => s.id === 'parse-story');
    expect(parseStoryStep).toBeDefined();
    expect(parseStoryStep.output).toBe('storyContract');
    expect(parseStoryStep.schema).toBe('storyContractSchema');
    
    // Validate the story contract
    const validationResult = await taskRunner.validateStepOutput(parseStoryStep, context);
    if (!validationResult.valid) {
      console.error('Validation errors:', validationResult.errors);
    }
    expect(validationResult.valid).toBe(true);
    expect(validationResult.errors).toEqual([]);
    
    // Create the story file with embedded contract
    const storyPath = path.join(tempDir, 'docs', 'stories', '1.1.story.md');
    const storyContent = `---
StoryContract:
  version: "1.0"
  story_id: "1.1"
  epic_id: "1"
  apiEndpoints:
    - method: POST
      path: /api/v1/users/register
      description: Register a new user account
      requestBody:
        email: string
        password: string
        name: string
      successResponse:
        status: 201
        body:
          userId: string
          token: string
          user:
            id: string
            email: string
            name: string
  filesToModify:
    - path: src/api/controllers/userController.js
      reason: Create user registration controller
    - path: src/api/routes/userRoutes.js
      reason: Create user API routes
    - path: src/models/User.js
      reason: Create User model
    - path: src/services/userService.js
      reason: Create user service layer
    - path: src/utils/passwordUtils.js
      reason: Create password hashing utilities
  acceptanceCriteriaLinks:
    - "Epic 1, Story 1.1, AC 1"
    - "Epic 1, Story 1.1, AC 2"
    - "Epic 1, Story 1.1, AC 3"
    - "Epic 1, Story 1.1, AC 4"
    - "Epic 1, Story 1.1, AC 5"
---

# Story 1.1: User Registration API

**Status:** Draft

## Story
**As a** system administrator  
**I want** users to be able to register accounts  
**So that** they can access the platform

## Acceptance Criteria
1. API endpoint accepts email, password, and name
2. Email validation is performed
3. Password meets security requirements (min 8 chars, 1 upper, 1 lower, 1 number)
4. Duplicate email addresses are rejected
5. Successful registration returns user ID and auth token

## Dev Notes

### Previous Story Insights
No previous stories in this epic.

### Data Models
**User Model** [Source: architecture/unified-project-structure.md]
- Located at: src/models/User.js
- Fields: id, email, password (hashed), name, createdAt, updatedAt

### API Specifications
**POST /api/v1/users/register** [Source: architecture/rest-api-spec.md]
- Request: { email, password, name }
- Success Response (201): { userId, token, user: { id, email, name } }
- Error Responses: 400 (invalid data), 409 (email exists)

### File Locations
Based on project structure [Source: architecture/unified-project-structure.md]:
- Controller: src/api/controllers/userController.js
- Routes: src/api/routes/userRoutes.js
- Model: src/models/User.js
- Service: src/services/userService.js
- Utils: src/utils/passwordUtils.js

### Technical Constraints
- Use bcrypt for password hashing [Source: architecture/tech-stack.md]
- PostgreSQL 15.x for data storage [Source: architecture/tech-stack.md]
- Express 4.x framework [Source: architecture/tech-stack.md]

## Tasks / Subtasks
1. Create User model (src/models/User.js) - AC: 1, 4
   - Define schema with email, password, name fields
   - Add unique constraint on email
   - Add timestamps

2. Create password utilities (src/utils/passwordUtils.js) - AC: 3
   - Implement password validation (min 8 chars, 1 upper, 1 lower, 1 number)
   - Implement bcrypt hashing function
   - Add unit tests for password validation

3. Create user service (src/services/userService.js) - AC: 1, 4, 5
   - Implement registerUser function
   - Check for duplicate emails
   - Hash password before saving
   - Generate JWT token
   - Add unit tests

4. Create user controller (src/api/controllers/userController.js) - AC: 1, 2, 5
   - Implement register endpoint handler
   - Validate request body (email format, required fields)
   - Call userService.registerUser
   - Format success/error responses
   - Add unit tests

5. Create user routes (src/api/routes/userRoutes.js) - AC: 1
   - Define POST /api/v1/users/register route
   - Apply validation middleware
   - Connect to controller

6. Integration testing - AC: 1-5
   - Test successful registration flow
   - Test duplicate email rejection
   - Test invalid password formats
   - Test missing required fields
`;
    
    fs.writeFileSync(storyPath, storyContent);
    
    // Validate the created story file
    const fileValidation = validator.validateStoryFile(storyPath);
    if (!fileValidation.valid) {
      console.error('File validation errors:', fileValidation.errors);
      console.error('Formatted errors:', validator.formatErrors(fileValidation.errors));
    }
    expect(fileValidation.valid).toBe(true);
    expect(fileValidation.contract).toBeDefined();
    expect(fileValidation.contract.story_id).toBe('1.1');
    expect(fileValidation.contract.epic_id).toBe('1');
    expect(fileValidation.contract.apiEndpoints).toHaveLength(1);
    expect(fileValidation.contract.filesToModify).toHaveLength(5);
    expect(fileValidation.contract.acceptanceCriteriaLinks).toHaveLength(5);
  });

  test('should handle missing PRD gracefully', async () => {
    // Remove PRD directory
    const prdDir = path.join(tempDir, 'docs', 'prd');
    fs.rmSync(prdDir, { recursive: true, force: true });
    
    // Attempt to load task should still work
    const taskPath = path.join(tempDir, 'bmad-core', 'structured-tasks', 'create-next-story.yaml');
    const taskResult = await taskRunner.taskLoader.loadTask(taskPath);
    expect(taskResult).toBeDefined();
    expect(taskResult.type).toBe('structured');
    expect(taskResult.data).toBeDefined();
    expect(taskResult.data.id).toBe('create-next-story');
    
    // The actual execution would fail when trying to read PRD files
    // but the task structure and validation setup should be intact
  });
});