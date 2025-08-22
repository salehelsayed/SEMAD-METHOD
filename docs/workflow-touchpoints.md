# Workflow Touchpoints (Epic ↔ Stories ↔ Tests)

Purpose
- Make “done stories = working epic” provable via traceability, gates, and outcome validation.
- Align PM/PO, SM, Dev, QA around a single EpicContract and StoryContracts with required references.

Planning (Orchestrator → PM/PO → SM → QA)
- PM/PO: Publish an EpicContract (DoR met): successCriteria (SC-*), requirements (REQ-*), flows (FLOW-*), integrationPoints (INT-*), NFR budgets, assumptions/risks.
- SM: Slice into StoryContracts referencing epicId, reqIds, flowIds, integrationPointIds, successCriteriaRefs; add acceptanceCriteria and test plan.
- QA: Pre-validate coverage and consistency across docs; flag missing IDs or weak ACs.
- Orchestrator: Run validate-story-consistency and qa-validate-alignment checks on docs.

Development (SM → Dev → QA)
- SM: Start story only if Story DoR is satisfied (traceability fields present, test data, telemetry listed).
- Dev: Implement vertical slice; write AC tests and contract tests for each integrationPointId; respect nfrBudgets and securityControls.
- QA: Review against StoryContract; run tests; verify NFR impacts and security controls where applicable.

Integration & Reverse Alignment (Orchestrator)
- Run reverse-alignment pipeline to confirm docs ↔ code parity:
  cleanup-docs → analyst-analyze → architect-rewrite → pm-update-prd → sm-recreate-stories → validate-story-consistency → qa-validate-alignment → generate-alignment-report → create-documentation-manifest.
- Outputs: .ai/reports/* and .ai/documentation-manifest.json with traceability results.

Release & Epic Closure (PM/PO → QA → Orchestrator)
- QA: Validate epic acceptanceScenarios (E2E-*), negative/resiliency paths, NFR budgets; confirm no open P0/P1 in epic scope.
- PM/PO: Confirm successCriteria measured per method; ensure telemetry is emitting and dashboards/alerts live.
- Orchestrator: Final reverse-trace check (tests/commits → stories → epic → REQ/FLOW) before marking epic done.

Change Control
- IDs immutable once epic.status is active; changes via ADR with schemaVersion bump.
- Orchestrator re-runs alignment; QA re-validates impact.

Artifacts
- EpicContract template: docs/templates/epic-contract-template.md
- StoryContract template: docs/templates/story-contract-template.yaml
- Traceability report: .ai/reports/traceability.json (referenced by EpicContract.coverage.generatedBy)

