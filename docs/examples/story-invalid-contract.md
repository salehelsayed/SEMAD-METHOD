---
StoryContract:
  version: "1.0"
  story_id: "4.2"
  # Missing epic_id
  apiEndpoints:
    - method: "INVALID_METHOD"  # Invalid HTTP method
      path: /api/test
      # Missing description, requestBody, successResponse
  filesToModify:
    - reason: "Some change"
      # Missing path
  # Missing acceptanceCriteriaLinks
---

# Story 4.2: Example Invalid Story

This story has an invalid StoryContract for testing purposes.