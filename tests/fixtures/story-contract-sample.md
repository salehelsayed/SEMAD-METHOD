---
StoryContract:
  version: '1.0'
  schemaVersion: '1.0'
  story_id: SAMPLE-1
  epic_id: SAMPLE
  acceptanceTestMatrix:
    items:
      - id: AC-MATRIX
        description: cover matrix scenario
        test_files:
          - path: tests/fixtures/sample-acceptance.test.js
  filesToModify:
    - path: src/example.js
      reason: update example implementation
    - path: docs/example.md
      reason: document changes
---

# Story Sample

## Status
Approved

## Acceptance Criteria
- Matrix coverage remains intact
- Documentation updated alongside code

