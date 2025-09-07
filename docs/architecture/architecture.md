---
id: ARCH-001
version: "1.0.0"
components:
  - name: Orchestrator
    type: Service
    responsibilities: ["Coordinate agents", "Enforce gates"]
    dependencies: ["Preflight Suite", "Schemas"]
apis:
  - name: GateControl
    protocol: internal
    endpoints:
      - "POST /gate/check"
dataModels:
  - name: Story
    fields:
      id: string
      title: string
      status: string
decisions:
  - id: ADR-1
    decision: Use JSON Schemas for artifacts
    rationale: Enforce structure and reduce ambiguity
    alternatives: ["Free-form markdown", "Ad-hoc parsing"]
---

# Architecture Overview

Minimal schema-compliant architecture document for Planning gate validation.

## PRD → Architecture Coverage Table

Each PRD requirement must be anchored to at least one architecture component or decision to prevent design‑stage drift and should link to the Epic(s) expected to implement it.

| PRD ID       | Epic IDs     | Components                    | Decisions | Notes |
|--------------|--------------|-------------------------------|-----------|-------|
| PRD-REQ-001  | EP-RESET     | ARCH-COMP-auth-api, email-svc | ADR-1     | Reset request flow, email dispatch |
| PRD-REQ-002  | EP-RESET     | ARCH-COMP-auth-api            | ADR-1     | Rate limiting at gateway/middleware |
| PRD-REQ-003  | EP-STRUCT    | ARCH-COMP-task-engine         | ADR-1     | Structured YAML/JSON tasks and checklists |
| PRD-REQ-004  | EP-MEMORY    | ARCH-COMP-memory-manager      | ADR-2     | Working memory and scratchpad system |
| PRD-REQ-005  | EP-ADAPT     | ARCH-COMP-planner             | ADR-3     | Dynamic plan adaptation with thresholds |
| PRD-REQ-006  | EP-SEARCH    | ARCH-COMP-search-tools        | ADR-1     | Automated search tool generation |
| PRD-REQ-007  | EP-CONTRACT  | ARCH-COMP-contracts           | ADR-1     | StoryContract schema system |
| PRD-REQ-008  | EP-VALID     | ARCH-COMP-validator           | ADR-1     | Automated validation framework |
| PRD-REQ-009  | EP-WORKFLOW  | ARCH-COMP-orchestrator        | ADR-2     | Enhanced workflow management |
| PRD-REQ-010  | EP-ROLES     | ARCH-COMP-agents              | ADR-2     | Agent role clarification |

### ID Scheme
- Components: `ARCH-COMP-*` (e.g., `ARCH-COMP-auth-api`, `ARCH-COMP-email-service`)
- Decisions: `ADR-*` stored under `docs/adr/`
- PRD requirements: `PRD-REQ-*` (or adopt your canonical `REQ-*` consistently)

### NFR Mapping
When PRD includes NFRs (performance, security, compliance, operability), tag them with PRD IDs and reference affected components/decisions here to ensure downstream flow into Epics and Stories.
