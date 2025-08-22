---
StoryContract:
  version: "1.0"
  story_id: "AH-014"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: tools/orchestrator/snapshots.js
      reason: Snapshot relevant files before apply
    - path: tools/orchestrator/rollback.js
      reason: One-click revert to last snapshot
    - path: tools/orchestrator/drift-alarms.js
      reason: Detect patch touching files outside patch plan/bundle
    - path: docs/workflow-orchestrator.md
      reason: Document rollback and drift policies
  acceptanceCriteriaLinks:
    - "AC1: Snapshots created before apply with file list"
    - "AC2: Rollback restores previous state reliably"
    - "AC3: Drift alarms trigger when touching out-of-plan files"
---

# Story AH-014: Rollback Hooks & Drift Alarms

## Status
Draft

## Story
As the Orchestrator, I want automated snapshots, rollback hooks, and drift alarms to quickly recover from bad patches and prevent unintended changes.

## Acceptance Criteria
1. Snapshot utility saves copies/hashes of to-be-changed files before apply.
2. Rollback restores files and clears locks/bundles as needed.
3. Drift detection blocks patches that modify files outside the patch plan or bundle.

## Tasks / Subtasks
- [ ] Implement snapshots (AC: 1)
- [ ] Implement rollback (AC: 2)
- [ ] Implement drift alarms (AC: 3)
- [ ] Update docs

## Dev Notes
Record metadata in `.ai/progress/` for traceability.

