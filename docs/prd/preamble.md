# Preamble

---
id: PRD-001
version: "1.0.0"
features:
  - id: F-001
    name: Orchestrator Gates
    description: Add planning/dev/qa gates with validations
    priority: high
userStories:
  - id: US-001
    as: Orchestrator
    want: Enforce gates across phases
    so: Prevent ungrounded progress
acceptanceCriteria:
  - id: AC-PRD-1
    criteria: Gates block when validations fail
    testable: true
---

# Product Requirements Document (PRD)
# SEMAD-METHOD: Structured Engineering Method for AI Development
