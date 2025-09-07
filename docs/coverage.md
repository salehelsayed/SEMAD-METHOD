# PRD → Epic → Story Coverage Matrix

Purpose: single-page, sprint-gating matrix proving 100% decomposition and alignment. Treat as a hard gate: development does not start and merges do not land until every PRD row is fully mapped.

- Owner: PM (accountable). Contributors: Architect, SM, QA.
- Source of truth: PRD requirement IDs (use your canonical prefix, e.g., PRD-REQ-### or REQ-### consistently).
- Validation: Orchestrator reverse‑alignment + QA alignment checks.

## Matrix

| PRD ID       | Epic ID   | Story IDs                          | Acceptance Ref             | QA Hook IDs                       | Arch Refs                      | Status       |
|--------------|-----------|------------------------------------|----------------------------|-----------------------------------|--------------------------------|-------------|
| PRD-REQ-001  | EP-RESET  | ST-RESET-REQUEST, ST-EMAIL-DISPATCH| PRD.md#PRD-REQ-001         | T-acc-PRD-REQ-001-1               | ARCH-COMP-auth-api, ADR-1      | planned      |
| PRD-REQ-002  | EP-RESET  | ST-RESET-RATE                      | PRD.md#PRD-REQ-002         | T-acc-PRD-REQ-002-1               | ARCH-COMP-auth-api             | planned      |
| PRD-REQ-003  | EP-STRUCT | ST-YAML-TASKS, ST-JSON-SCHEMAS     | PRD.md#PRD-REQ-003         | T-acc-PRD-REQ-003-1               | ARCH-COMP-task-engine          | planned      |
| PRD-REQ-004  | EP-MEMORY | ST-WORKING-MEM, ST-SCRATCHPAD      | PRD.md#PRD-REQ-004         | T-acc-PRD-REQ-004-1               | ARCH-COMP-memory-manager       | planned      |
| PRD-REQ-005  | EP-ADAPT  | ST-DYNAMIC-PLAN, ST-DECOMPOSER     | PRD.md#PRD-REQ-005         | T-acc-PRD-REQ-005-1               | ARCH-COMP-planner              | planned      |
| PRD-REQ-006  | EP-SEARCH | ST-SEARCH-GEN, ST-TOOL-MAP         | PRD.md#PRD-REQ-006         | T-acc-PRD-REQ-006-1               | ARCH-COMP-search-tools         | planned      |
| PRD-REQ-007  | EP-CONTRACT| ST-CONTRACT-SCHEMA, ST-VALIDATION  | PRD.md#PRD-REQ-007         | T-acc-PRD-REQ-007-1               | ARCH-COMP-contracts            | planned      |
| PRD-REQ-008  | EP-VALID  | ST-AUTO-VALID, ST-CI-GATES         | PRD.md#PRD-REQ-008         | T-acc-PRD-REQ-008-1               | ARCH-COMP-validator            | planned      |
| PRD-REQ-009  | EP-WORKFLOW| ST-FLEX-FLOW, ST-EPIC-AUTO         | PRD.md#PRD-REQ-009         | T-acc-PRD-REQ-009-1               | ARCH-COMP-orchestrator         | planned      |
| PRD-REQ-010  | EP-ROLES  | ST-ROLE-SEP, ST-QA-LIMITS          | PRD.md#PRD-REQ-010         | T-acc-PRD-REQ-010-1               | ARCH-COMP-agents               | planned      |

Status: planned | in_progress | done

## Operating Rules

- Every PRD row must list ≥1 Epic and ≥1 Story.
- Story contracts must reference the same PRD IDs in `traceability.prdReqIds` and include `acceptanceRef` and `qaHooks`.
- Epic contracts must list PRD IDs in `prdTraceability.prdReqs` and provide a `coverage` map of PRD → [Story IDs].
- Architecture references must use stable component/decision IDs (e.g., ARCH-COMP-*, ADR-*).
- QA uses these QA Hook IDs to assert coverage in alignment checks.

## Gates

- Planning gate (PM): This matrix exists and includes all PRD IDs in scope for the sprint.
- Design gate (Architect): Each PRD ID has at least one architecture reference.
- Story gate (SM): All planned stories exist and pass Definition of Ready.
- Validation gates (QA): Alignment report shows 100% PRD coverage; merges blocked until green.

## How to Update

- Add new rows when PRD adds new requirements; do not repurpose IDs.
- Keep IDs immutable; if a requirement changes materially, add a new PRD ID and deprecate the old one with a note.
- Reflect status transitions as work progresses.

