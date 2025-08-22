---
StoryContract:
  version: "1.0"
  story_id: "AH-006"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: tools/reference-checker/check-references.js
      reason: Extract and validate file/symbol references from diffs
    - path: tools/reference-checker/parsers/
      reason: Language-specific parsers (ts/js/md/yaml)
    - path: package.json
      reason: Add npm script reference:check
    - path: docs/validation-system.md
      reason: Document reference checker behavior
  acceptanceCriteriaLinks:
    - "AC1: Reference checker scans diffs and finds new/used symbols"
    - "AC2: Checker fails on unresolved references unless created in same patch"
    - "AC3: npm run reference:check integrates with preflight"
---

# Story AH-006: Static Reference Checker

## Status
Draft

## Story
As QA, I want a static checker that flags references to non-existent files/symbols so hallucinated code cannot be merged.

## Acceptance Criteria
1. Tool extracts references from patch/diff and compares to repo and patch-created set.
2. Fails when references are unresolved; passes when all are resolvable.
3. `npm run reference:check` exists and is invoked by `preflight:all`.

## Tasks / Subtasks
- [ ] Implement parser framework (AC: 1)
  - [ ] Add basic TS/JS import/export and symbol detection
  - [ ] Parse markdown/yaml code fences for file paths
- [ ] Implement resolution logic (AC: 2)
  - [ ] Build an in-memory set of to-be-created files from patch plan
  - [ ] Compare against filesystem + bundle
- [ ] Wire NPM and docs (AC: 3)

## Dev Notes
Start with conservative rules to minimize false negatives.

