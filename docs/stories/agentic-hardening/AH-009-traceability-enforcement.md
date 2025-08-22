---
StoryContract:
  version: "1.0"
  story_id: "AH-009"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: tools/traceability/commit-hook.sh
      reason: Enforce storyId in commits
    - path: tools/traceability/test-naming-check.js
      reason: Ensure tests contain storyId
    - path: .husky/
      reason: Hook registration
    - path: docs/versioning-and-releases.md
      reason: Document traceability requirements
  acceptanceCriteriaLinks:
    - "AC1: Commits must include [storyId] tag"
    - "AC2: Test names include storyId (e.g., test_AH-001_*)"
    - "AC3: Hooks and checks block non-compliant changes"
---

# Story AH-009: Traceability Enforcement

## Status
Draft

## Story
As a Release Manager, I want all code and tests to reference the storyId for traceability from requirements to implementation.

## Acceptance Criteria
1. Commit messages must include `[AH-###]` or `[story:<ID>]`.
2. Test files or test names include the storyId.
3. Non-compliant commits/tests are blocked by hooks and CI.

## Tasks / Subtasks
- [ ] Commit hook (AC: 1)
  - [ ] `tools/traceability/commit-hook.sh` + `.husky` integration
- [ ] Test naming check (AC: 2)
  - [ ] `tools/traceability/test-naming-check.js` with CI script
- [ ] Docs (AC: 3)

## Dev Notes
Allow override with `[skip-traceability]` for exceptional cases.

