---
StoryContract:
  version: "1.0"
  story_id: "AH-004"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: orchestrator-config-example.js
      reason: Add gates for phase transitions
    - path: tools/orchestrator/gates.js
      reason: Implement gate checks invoking preflight and schema validation
    - path: docs/workflow-orchestrator.md
      reason: Document gate conditions and failure handling
  acceptanceCriteriaLinks:
    - "AC1: Planning→Development gate verifies brief/PRD/architecture schema validity"
    - "AC2: Dev→QA gate requires preflight:all green and valid patch plan"
    - "AC3: QA→Done gate requires acceptance tests pass and postConditions verified"
    - "AC4: Gate failures produce actionable messages"
---

# Story AH-004: Orchestrator Gates

## Status
Draft

## Story
As the Orchestrator, I want hard gates at each workflow transition so that incomplete or ungrounded work cannot proceed.

## Acceptance Criteria
1. Planning→Development: `schema:check` passes for brief, PRD, and architecture artifacts; versions aligned.
2. Dev→QA: `preflight:all` passes and a signed patch plan exists for the story.
3. QA→Done: Acceptance tests pass; StoryContract `postConditions` verified.
4. Failures provide clear actionable error messages and halt progression.

## Tasks / Subtasks
- [ ] Update config (AC: 1,2,3)
  - [ ] `orchestrator-config-example.js` to include gate hooks
- [ ] Implement gate helper (AC: 1-4)
  - [ ] `tools/orchestrator/gates.js` with `checkPlanningGate`, `checkDevGate`, `checkQAGate`
  - [ ] Invoke scripts from AH-003
- [ ] Document (AC: 4)
  - [ ] Update `docs/workflow-orchestrator.md`

## Dev Notes
Use exit codes and structured JSON outputs for CI.

