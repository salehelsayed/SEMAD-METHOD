---
StoryContract:
  version: "1.0"
  story_id: "4.1"
  epic_id: "4"
  story:
    storyId: "ST-4-1"
    title: "Introduce StoryContract Parsing and Validation"
    epicId: "EPIC-4"
    featureId: "FEAT-structured-contracts"
    status: draft
    sliceType: flag
    owner: "Dev Team"
    links:
      design: []
      relatedADRs:
        - docs/adr/ADR-001.md
  traceability:
    featureId: "FEAT-structured-contracts"
    acceptanceCriteriaCovered:
      - AC1
      - AC2
    codeTouchpoints:
      - bmad-core/schemas/story-contract-schema.json
      - bmad-core/core-config.yaml
    testExpectations:
      - tests/story-contracts/schema.test.ts
    integrationPointIds:
      - "INT-StoryContracts"
    archRefs:
      - ARCH-StoryContracts
  apiEndpoints:
    - method: POST
      path: /api/story-contracts
      description: Create a new story contract validation endpoint
      requestBody:
        type: object
        properties:
          contract:
            type: object
        required:
          - contract
      successResponse:
        type: object
        properties:
          valid:
            type: boolean
          errors:
            type: array
  filesToModify:
    - path: bmad-core/schemas/story-contract-schema.json
      reason: Create a JSON Schema that defines the required structure of a StoryContract
    - path: bmad-core/core-config.yaml
      reason: Register the new StoryContract schema for validation
    - path: bmad-core/structured-tasks/create-next-story.yaml
      reason: Add parse-story step that builds a StoryContract block
    - path: bmad-core/agents/sm.md
      reason: Update the Scrum Master's core principles for contract parsing
    - path: bmad-core/templates/story-tmpl.yaml
      reason: Ensure the story template can embed a StoryContract block at the top
  acceptanceCriteriaLinks:
    - "AC1: StoryContract schema exists and defines required structure"
    - "AC2: core-config.yaml lists storyContractSchema in validationSchemas"
    - "AC3: create-next-story task includes parse-story step"
    - "AC4: SM agent enforces parsing and rejects summarisation"
    - "AC5: Stories with invalid contracts halt workflow"
  integrationVerification:
    - "IV1: Verify story creation workflow still passes existing regression tests"
    - "IV2: Verify API contract for POST /api/story-contracts"
  rollbackPlan:
    steps:
      - "Revert story template changes"
      - "Remove schema registration"
    verification: "Run legacy story creation workflow to ensure prior behavior restored"
  performanceBudget:
    p95: "< 300ms"
    p99: "< 600ms"
  guardrails:
    mustDo:
      - "Keep new schema backwards compatible with existing stories"
    outOfScope:
      - "Do not modify unrelated orchestrator tasks"
    notes:
      - "Coordinate with QA before toggling new validation in CI"
---

# Story 4.1: Introduce StoryContract Parsing and Validation

## Status
Draft

## Story
**As a** Development Team,
**I want** structured story contracts instead of free-form summaries,
**so that** AI developers receive precise, validated requirements without hallucinations

## Acceptance Criteria
1. `bmad-core/schemas/story-contract-schema.json` exists and defines the required structure for a StoryContract
2. `core-config.yaml` lists `storyContractSchema` in its `validationSchemas`
3. `create-next-story` has been converted to a YAML task that includes a `parse-story` step and writes the StoryContract into story files
4. The SM's agent file enforces parsing of the PRD/architecture and rejects free-form summarisation
5. The SM's `create-story` command generates stories with a valid `StoryContract` block at the top
6. Stories with invalid or missing contracts cause the workflow to halt for corrections

## Tasks / Subtasks
- [ ] Create JSON Schema for StoryContract validation (AC: 1)
  - [ ] Define schema with required fields: version, story_id, epic_id, story.sliceType, traceability.integrationPointIds, apiEndpoints, filesToModify, acceptanceCriteriaLinks, integrationVerification, rollbackPlan, performanceBudget, guardrails
  - [ ] Ensure apiEndpoints have proper subfield validation
- [ ] Update core-config.yaml (AC: 2)
  - [ ] Add validationSchemas section with storyContractSchema entry
- [ ] Enhance create-next-story task (AC: 3)
  - [ ] Add parse-story step to extract requirements from PRD/Architecture
  - [ ] Implement StoryContract YAML block generation
  - [ ] Add validation step using JSON Schema
- [ ] Update Scrum Master agent (AC: 4, 5)
  - [ ] Add core principles for contract parsing
  - [ ] Rename draft command to create-story
  - [ ] Ensure verbatim extraction without summarization
- [ ] Implement validation integration (AC: 6)
  - [ ] Create validation utility using ajv
  - [ ] Integrate validation into story creation workflow
  - [ ] Halt on validation failures with clear error messages

## Dev Notes
### Previous Story Insights
First story implementing StoryContract feature - no previous context.

### Data Models
**StoryContract Structure** [Source: requirements specification]
- version: string (required)
- story_id: string (required)
- epic_id: string (required)
- story.sliceType: enum flag|probe|int-flow|adhoc (required)
- traceability.integrationPointIds: array of strings (required when touching INTs)
- apiEndpoints: array of endpoint objects (required, can be empty)
- filesToModify: array of file modification objects (required, can be empty)
- acceptanceCriteriaLinks: array of strings (required, can be empty)
- integrationVerification: array of verification steps (required when touching INTs)
- rollbackPlan: structured rollback steps + verification (required when touching INTs)
- performanceBudget: latency targets (required when defined by PRD)
- guardrails: mustDo/outOfScope lists (required)

### API Specifications
No external APIs - this is an internal validation feature.

### File Locations
- Schema: `bmad-core/schemas/story-contract-schema.json`
- Config: `bmad-core/core-config.yaml`
- Task: `bmad-core/structured-tasks/create-next-story.yaml`
- Agent: `bmad-core/agents/sm.md`
- Template: `bmad-core/templates/story-tmpl.yaml`
- Validator: `bmad-core/utils/story-contract-validator.js`

### Testing Requirements
- Unit tests for schema validation
- Integration tests for story creation workflow
- Test both valid and invalid contracts
- Ensure validation errors are properly reported

### Technical Constraints
- Must use ajv for JSON Schema validation (already in dependencies)
- Validation must halt workflow on failure
- Error messages must be clear and actionable
