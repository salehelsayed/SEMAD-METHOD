---
StoryContract:
  version: "1.0"
  story_id: "AH-003"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: scripts/preflight/schema-check.js
      reason: Schema validation wrapper
    - path: scripts/preflight/contract-check.js
      reason: Contract presence + mapping check
    - path: scripts/preflight/grounding-check.js
      reason: Verify referenced paths/symbols exist in bundle or patch
    - path: scripts/preflight/lint-check.sh
      reason: Lint wrapper
    - path: scripts/preflight/type-check.sh
      reason: Type checker wrapper
    - path: scripts/preflight/build-check.sh
      reason: Build wrapper
    - path: package.json
      reason: Add npm scripts: preflight:*, preflight:all
    - path: docs/validation-system.md
      reason: Document preflight suite and gating
  acceptanceCriteriaLinks:
    - "AC1: preflight scripts exist and run locally"
    - "AC2: preflight:all aggregates results and fails on any check"
    - "AC3: grounding-check fails when referencing missing files/symbols"
    - "AC4: docs updated with usage and gating"
---

# Story AH-003: Preflight Checks Suite

## Status
Draft

## Story
As a QA Engineer, I want a unified preflight suite that validates schemas, contracts, grounding, lint, types, and build so that only well-formed, grounded changes progress to QA.

## Acceptance Criteria
1. Scripts for `schema-check`, `contract-check`, `grounding-check`, `lint-check`, `type-check`, and `build-check` exist under `scripts/preflight/`.
2. `npm run preflight:all` runs all checks and fails fast on any error, with a summary report.
3. `grounding-check` detects references to missing files/symbols outside the current patch or bundle and fails.
4. Documentation explains how to run and interpret results.

## Tasks / Subtasks
- [ ] Implement Node wrappers (AC: 1)
  - [ ] `scripts/preflight/schema-check.js` → import `ajv` and validate known artifacts
  - [ ] `scripts/preflight/contract-check.js` → ensure StoryContract present and fields mapped to files/tests
  - [ ] `scripts/preflight/grounding-check.js` → parse patch plan and diff, verify existence in bundle
- [ ] Shell wrappers (AC: 1)
  - [ ] `lint-check.sh`, `type-check.sh`, `build-check.sh` → delegate to project linters/build
- [ ] npm orchestration (AC: 2)
  - [ ] Add `preflight:*` and `preflight:all` scripts
- [ ] Docs (AC: 4)
  - [ ] Update `docs/validation-system.md`

## Dev Notes
### Reports
- Emit JSON logs to `.ai/test-logs/preflight-<timestamp>.json` and human summaries to stdout.

