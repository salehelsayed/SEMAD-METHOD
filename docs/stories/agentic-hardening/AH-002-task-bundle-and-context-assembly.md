---
StoryContract:
  version: "1.0"
  story_id: "AH-002"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: bmad-core/schemas/task-bundle-schema.json
      reason: Define schema for task bundles
    - path: tools/context/build-task-bundle.js
      reason: Script to assemble deterministic context bundles
    - path: tools/context/index-artifacts.js
      reason: Index artifacts and code symbols for retrieval
    - path: package.json
      reason: Add npm scripts: context:bundle, context:index
    - path: docs/workflow-orchestrator.md
      reason: Document bundle lifecycle and invalidation rules
    - path: .ai/progress/
      reason: Bundle statuses and invalidation records
  acceptanceCriteriaLinks:
    - "AC1: Task Bundle schema exists and is validated"
    - "AC2: build-task-bundle.js outputs bundle file with pinned versions"
    - "AC3: Bundles invalidate on artifact version changes"
    - "AC4: npm run context:bundle and context:index work end-to-end"
    - "AC5: Orchestrator docs updated with bundle flow"
---

# Story AH-002: Task Bundle Manifest & Deterministic Context Assembly

## Status
Draft

## Story
As the Orchestrator, I want a deterministic Task Bundle that pins exact artifact versions, file paths, and tests so that Dev/QA agents operate on consistent, non-stale context with clear invalidation rules.

## Acceptance Criteria
1. Task Bundle schema exists and validates bundles written to `.ai/bundles/<storyId>.bundle.json`.
2. `tools/context/build-task-bundle.js` assembles bundles from PRD/Architecture/StoryContract and resolves relevant files/tests.
3. If any input artifact version changes, existing bundles are marked invalid and rebuilt.
4. `npm run context:index` builds an index for retrieval; `npm run context:bundle -- <storyId>` creates/updates the bundle.
5. Documentation explains lifecycle, invalidation, and consumer expectations.

## Tasks / Subtasks
- [ ] Implement bundle schema (AC: 1)
  - [ ] Ensure fields: `id`, `storyId`, `artifactRefs[]` (id, path, version, checksum), `files[]`, `tests[]`, `createdAt`, `schemaVersion`
- [ ] Implement bundle builder (AC: 2)
  - [ ] Read StoryContract → gather linked artifacts
  - [ ] Resolve files by code ownership or paths listed in contract
  - [ ] Compute checksums and write to `.ai/bundles/`
- [ ] Add invalidation logic (AC: 3)
  - [ ] Compare checksums/version stamps; mark `invalidatedAt` and reason in bundle
- [ ] Add scripts (AC: 4)
  - [ ] `context:index` → `tools/context/index-artifacts.js`
  - [ ] `context:bundle` → `tools/context/build-task-bundle.js`
- [ ] Document (AC: 5)
  - [ ] Update `docs/workflow-orchestrator.md` with steps and commands

## Dev Notes
### File Locations
- Bundles: `.ai/bundles/*.bundle.json`
- Tools: `tools/context/`
- Schemas: `bmad-core/schemas/task-bundle-schema.json`

### Testing Requirements
- Create a fake story and confirm bundle builds, then change PRD version and verify invalidation.

