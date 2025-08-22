---
StoryContract:
  version: "1.0"
  story_id: "AH-015"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: bmad-core/agents/bmad-orchestrator.md
      reason: Add instruction hierarchy and escalation rules
    - path: bmad-core/templates/structured-output-tmpl.json
      reason: Template enforcing machine-parseable agent outputs
    - path: docs/GUIDING-PRINCIPLES.md
      reason: Document guardrails and structured output policy
  acceptanceCriteriaLinks:
    - "AC1: Instruction hierarchy explicitly documented for all agents"
    - "AC2: Structured output template used across agent outputs"
    - "AC3: Escalation-on-uncertainty rule added"
---

# Story AH-015: Instruction Hierarchy & Structured Outputs

## Status
Draft

## Story
As the Orchestrator, I want agents to follow a strict instruction hierarchy and emit structured outputs so ambiguity is minimized and errors are caught early.

## Acceptance Criteria
1. Instruction hierarchy is documented and referenced in agent configs.
2. Machine-parseable templates are used for agent outputs.
3. Agents must escalate with a clarification request rather than inventing details.

## Tasks / Subtasks
- [ ] Update orchestrator and agent docs (AC: 1,3)
- [ ] Add structured output template(s) (AC: 2)
- [ ] Provide examples and quick-start guidance

## Dev Notes
Coordinate with AH-007 templates and AH-004 gates.

