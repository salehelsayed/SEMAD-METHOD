---
StoryContract:
  version: "1.0"
  story_id: "AH-011"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: tools/orchestrator/locks.js
      reason: Provide file/module-level locking utilities
    - path: docs/workflow-orchestrator.md
      reason: Document locking policy and conflict resolution
    - path: .ai/progress/
      reason: Record active locks per story
  acceptanceCriteriaLinks:
    - "AC1: Locking utility prevents concurrent writes to same file/module"
    - "AC2: Orchestrator can queue or reject conflicting stories"
    - "AC3: Policy documented"
---

# Story AH-011: Concurrency Control

## Status
Draft

## Story
As the Orchestrator, I want to avoid conflicting edits by locking files/modules per story.

## Acceptance Criteria
1. Locking API exposes `acquire(path, storyId)`, `release(path, storyId)`, and `status()`.
2. Conflicts result in queueing or rejection with guidance.
3. Locks recorded for audit and visible under `.ai/progress/`.

## Tasks / Subtasks
- [ ] Implement locks.js (AC: 1)
- [ ] Integrate with orchestrator commands (AC: 2)
- [ ] Document policy (AC: 3)

## Dev Notes
Use atomic file creation as simplest lock primitive.

