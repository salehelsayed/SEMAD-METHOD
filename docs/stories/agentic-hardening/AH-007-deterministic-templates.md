---
StoryContract:
  version: "1.0"
  story_id: "AH-007"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: bmad-core/templates/story-tmpl.yaml
      reason: Ensure placeholders for storyId, pre/post conditions, tests
    - path: bmad-core/templates/test-tmpl.md
      reason: Deterministic unit test template with traceability fields
    - path: docs/GUIDING-PRINCIPLES.md
      reason: Add deterministic generation guidance
    - path: scripts/generation/config.json
      reason: Low-temperature generation config and seeds
  acceptanceCriteriaLinks:
    - "AC1: Templates include explicit placeholders and traceability"
    - "AC2: Generation config sets low randomness and seeds"
    - "AC3: Docs updated with usage rules"
---

# Story AH-007: Deterministic Templates & Low-Temperature Generation

## Status
Draft

## Story
As a Dev agent, I want deterministic templates and low-randomness generation settings so outputs are predictable and consistently structured.

## Acceptance Criteria
1. Story, test, and doc templates include placeholders for `storyId`, `acceptanceCriteria`, `pre/postConditions`, and traceability markers.
2. A generation config sets low temperature and fixed seeds where applicable.
3. Documentation outlines deterministic practices and when to deviate.

## Tasks / Subtasks
- [ ] Update templates (AC: 1)
  - [ ] Add explicit fields and comments in templates
- [ ] Add generation config (AC: 2)
  - [ ] `scripts/generation/config.json` with model/temperature/seed
- [ ] Documentation (AC: 3)
  - [ ] Update `docs/GUIDING-PRINCIPLES.md`

## Dev Notes
Integrate with AH-005’s patch plan to include template references.

