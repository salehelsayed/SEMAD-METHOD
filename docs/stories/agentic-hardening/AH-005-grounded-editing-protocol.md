---
StoryContract:
  version: "1.0"
  story_id: "AH-005"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: docs/examples/patch-plan-example.md
      reason: Provide canonical patch plan template with examples
    - path: tools/patch-plan/validate-patch-plan.js
      reason: Validate patch plans against schema and bundle
    - path: bmad-core/schemas/patch-plan-schema.json
      reason: Define schema for patch plans
    - path: package.json
      reason: Add npm scripts to validate patch plans
  acceptanceCriteriaLinks:
    - "AC1: Patch plan schema defines files/functions/rationale/test mapping"
    - "AC2: Validator rejects plans referencing out-of-bundle assets"
    - "AC3: Example patch plan published for devs"
    - "AC4: Orchestrator requires valid plan before apply (see AH-004)"
---

# Story AH-005: Grounded Editing Protocol (GEP)

## Status
Draft

## Story
As a Developer, I want to propose a grounded patch plan that maps each change to StoryContract requirements and tests, so changes remain traceable and verifiable before application.

## Acceptance Criteria
1. Patch Plan JSON Schema exists with required fields and constraints.
2. `tools/patch-plan/validate-patch-plan.js` validates and cross-references against the Task Bundle.
3. `docs/examples/patch-plan-example.md` shows a filled-in example.
4. `npm run patch-plan:validate -- <file>` validates a patch plan file.

## Tasks / Subtasks
- [ ] Schema (AC: 1)
  - [ ] `bmad-core/schemas/patch-plan-schema.json` with fields: `storyId`, `changes[] { path, operations[], symbols[], rationale, mappedACs[] }`, `tests[]`, `riskLevel`
- [ ] Validator (AC: 2,4)
  - [ ] Implement symbol/file existence check against bundle
  - [ ] Ensure mapped ACs exist in StoryContract
- [ ] Example (AC: 3)
  - [ ] Provide a realistic example including rationale mapped to ACs

## Dev Notes
Integrate validator into `preflight:all` in AH-003.

