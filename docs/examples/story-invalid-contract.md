---
StoryContract:
  version: "1.0"
  story_id: "4.2"
  # Missing epic_id
  story: {}
  traceability: {}
  apiEndpoints:
    - method: "INVALID_METHOD"  # Invalid HTTP method
      path: /api/test
      # Missing description, requestBody, successResponse
  filesToModify:
    - reason: "Some change"
      # Missing path
  # Missing acceptanceCriteriaLinks
  # Missing integrationVerification / rollbackPlan / performanceBudget / guardrails
---

# Story 4.2: Example Invalid Story

This story has an invalid StoryContract for testing purposes.
