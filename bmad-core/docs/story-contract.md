# StoryContract Documentation

## Overview

The StoryContract is a structured YAML block that replaces free-form summarization in story creation. It ensures that the Scrum Master extracts requirements directly from PRDs and Architecture documents without interpretation or hallucination.

## Important Note about Validation

The `validate-story-contract.js` script validates StoryContracts in story files. If no StoryContract is found, it will show a warning message but still return success (exit code 0) because not all stories require a StoryContract. This is intentional behavior to support different story types and maintain backward compatibility.

## Purpose

- **Eliminate hallucinations**: Force verbatim extraction of requirements
- **Provide formal specification**: Developers work from a structured contract
- **Enable validation**: Ensure all required fields are present before story creation

## Structure

Every story file now begins with a StoryContract block:

```yaml
---
StoryContract:
  version: "1.0"
  story_id: "4.1"
  epic_id: "4"
  apiEndpoints:
    - method: POST
      path: /api/users
      description: Create a new user
      requestBody: { schema details }
      successResponse: { response schema }
  filesToModify:
    - path: src/controllers/user.controller.js
      reason: Add createUser endpoint handler
    - path: src/routes/user.routes.js
      reason: Register new POST /api/users route
  acceptanceCriteriaLinks:
    - "AC1: User can register with email"
    - "AC2: System validates email format"
---
```

## Required Fields

- **version**: StoryContract format version (currently "1.0")
- **story_id**: Unique story identifier (e.g., "4.1" for Epic 4, Story 1)
- **epic_id**: The epic this story belongs to
- **apiEndpoints**: Array of API endpoints (can be empty [])
  - method: HTTP method (GET, POST, PUT, DELETE, PATCH)
  - path: Endpoint path
  - description: What the endpoint does
  - requestBody: Request schema
  - successResponse: Success response schema
- **filesToModify**: Array of files to create/modify (can be empty [])
  - path: File path relative to project root
  - reason: Why this file needs modification
- **acceptanceCriteriaLinks**: Array of acceptance criteria (can be empty [])

## Validation

The StoryContract is validated against `bmad-core/schemas/story-contract-schema.json` using JSON Schema validation. If validation fails, the story creation process halts and reports the specific errors.

## Integration with Story Creation

1. The Scrum Master's `create-story` command triggers the `create-next-story.yaml` task
2. The task includes a `parse-story` step that:
   - Extracts endpoints from architecture docs
   - Identifies files to modify
   - Links acceptance criteria
   - Builds the StoryContract YAML block
3. The contract is embedded at the top of the story file
4. Validation ensures completeness before finalizing the story

## Important Notes

- The Scrum Master must NOT summarize or interpret requirements
- If information is missing from the PRD/Architecture, leave fields empty (use [] for arrays)
- The StoryContract is the authoritative source for implementation details
- Story prose sections supplement but do not override the contract