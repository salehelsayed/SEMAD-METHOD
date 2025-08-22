---
StoryContract:
  version: "1.0"
  story_id: "AH-008"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: scripts/preflight/type-check.sh
      reason: Ensure type checks run for all packages
    - path: package.json
      reason: Add type-check scripts and CI integration
    - path: docs/validation-system.md
      reason: Document type-first policy
  acceptanceCriteriaLinks:
    - "AC1: type-check script runs TS/JS type checks across workspace"
    - "AC2: preflight:all includes type-check"
    - "AC3: Docs updated with type-first enforcement policy"
---

# Story AH-008: Type-First Enforcement

## Status
Draft

## Story
As a Dev team, I want type checks to block merges so type errors cannot slip through and mislead downstream agents.

## Acceptance Criteria
1. `npm run type:check` runs the project’s type checker(s) and exits non-zero on error.
2. `preflight:all` includes type checks.
3. Policy documented and referenced by orchestrator gates.

## Tasks / Subtasks
- [ ] Implement scripts (AC: 1)
  - [ ] Add `type:check` to `package.json` using `tsc -p . --noEmit` (or project default)
- [ ] Integrate preflight (AC: 2)
- [ ] Update docs (AC: 3)

## Dev Notes
Honor monorepo packages if present.

