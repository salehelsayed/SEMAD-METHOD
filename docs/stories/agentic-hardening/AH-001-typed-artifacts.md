---
StoryContract:
  version: "1.0"
  story_id: "AH-001"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: bmad-core/schemas/brief-schema.json
      reason: Define strict schema for project briefs
    - path: bmad-core/schemas/prd-schema.json
      reason: Define strict schema for PRDs
    - path: bmad-core/schemas/architecture-schema.json
      reason: Define strict schema for architecture docs
    - path: bmad-core/schemas/sprint-plan-schema.json
      reason: Define strict schema for sprint plans
    - path: bmad-core/schemas/task-bundle-schema.json
      reason: Define schema for Task Bundle manifests
    - path: bmad-core/schemas/story-contract-schema.json
      reason: Extend with schemaVersion, pre/post conditions, linkedArtifacts
    - path: scripts/schema-check.js
      reason: Add JSON Schema validation utility for artifacts
    - path: package.json
      reason: Add npm scripts for schema:check
    - path: docs/architecture/source-tree.md
      reason: Document artifact schemas and usage
  acceptanceCriteriaLinks:
    - "AC1: Schemas exist for brief, PRD, architecture, sprint plan, task bundle"
    - "AC2: StoryContract schema extended with schemaVersion, pre/post/linkedArtifacts"
    - "AC3: schema-check script validates all artifacts and reports per-file results"
    - "AC4: npm run schema:check passes on valid examples and fails on invalid ones"
    - "AC5: Documentation updated to explain typed artifacts and gate usage"
---

# Story AH-001: Typed Artifacts via JSON Schemas

## Status
Draft

## Story
As the Orchestrator team, I want all planning and execution artifacts to be strictly typed with JSON Schemas so that downstream agents consume consistent, validated inputs, reducing ambiguity and hallucinations.

## Acceptance Criteria
1. JSON Schemas exist for `docs/brief.md`, `docs/prd/PRD.md`, `docs/architecture/*.md` (structured frontmatter), sprint plans, and task bundle manifests.
2. `bmad-core/schemas/story-contract-schema.json` is extended to include `schemaVersion`, `preConditions`, `postConditions`, and `linkedArtifacts`.
3. `scripts/schema-check.js` validates artifacts against their schemas and prints a per-file PASS/FAIL summary.
4. `npm run schema:check` runs the validator across repo examples and CI-ready sample files.
5. `docs/architecture/source-tree.md` documents schemas, field meanings, and the gate where they are enforced.

## Tasks / Subtasks
- [ ] Create schema files (AC: 1)
  - [ ] `bmad-core/schemas/brief-schema.json` with required fields: `id`, `version`, `stakeholders`, `successCriteria`, `scope`, `nonFunctional`
  - [ ] `bmad-core/schemas/prd-schema.json` with fields: `id`, `version`, `features[]`, `userStories[]`, `acceptanceCriteria[]`
  - [ ] `bmad-core/schemas/architecture-schema.json` with fields: `id`, `version`, `components[]`, `apis[]`, `dataModels[]`, `decisions[]`
  - [ ] `bmad-core/schemas/sprint-plan-schema.json` with fields: `id`, `version`, `stories[]`, `capacity`, `risks[]`
  - [ ] `bmad-core/schemas/task-bundle-schema.json` with fields: `id`, `version`, `artifacts[]`, `files[]`, `tests[]`, `checksum`
- [ ] Extend StoryContract schema (AC: 2)
  - [ ] Add fields: `schemaVersion` (string), `preConditions[]`, `postConditions[]`, `linkedArtifacts[]`
  - [ ] Update description and examples
- [ ] Implement validator (AC: 3)
  - [ ] Create `scripts/schema-check.js` using `ajv` to validate known artifacts
  - [ ] Produce machine-readable JSON report to `.ai/test-logs/schema-check.json`
- [ ] Wire npm scripts (AC: 4)
  - [ ] Add `schema:check` script in `package.json`
  - [ ] Ensure CI can run it (document in README)
- [ ] Document usage (AC: 5)
  - [ ] Update `docs/architecture/source-tree.md` with schema overview and enforcement gate

## Dev Notes
### File Locations
- Schemas: `bmad-core/schemas/*.json`
- Validator: `scripts/schema-check.js`
- Docs: `docs/architecture/source-tree.md`

### Testing Requirements
- Add minimal valid/invalid examples under `docs/examples/` and verify `schema:check` PASS/FAIL behavior.

### Constraints
- Use JSON Schema draft-07 (ajv already available in repo).

