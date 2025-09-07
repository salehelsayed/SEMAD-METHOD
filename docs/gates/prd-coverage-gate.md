# PRD Coverage Gate

Purpose: prevent context loss by enforcing that every PRD requirement is mapped through Architecture → Epics → Stories before work starts and before merges.

- Gatekeeper: QA. Accountable: PM. Contributors: Architect, SM.
- Evidence: `docs/coverage.md`, `docs/architecture/architecture.md`, Epic/Story contracts, `.ai/reports/*`.

## Entry Criteria (Gate 0 → 3)
- PRD IDs present and stable; acceptance defined (PM)
- Architecture coverage table filled for each PRD ID (Architect)
- Epics list PRD IDs in `prdTraceability.prdReqs` (PM/Architect)
- Stories pass DoR: `traceability.prdReqIds`, `archRefs`, `acceptanceRef`, `qaHooks` (SM)

## Validation Steps (Gate 4/5)
1) Run reverse alignment
   - `node tools/workflow-orchestrator.js reverse-align`
2) Run QA alignment
   - `/qa *validate-docs-code-alignment`
3) Inspect `.ai/reports/*` and `docs/coverage.md`
   - 100% PRD rows have Epic + Story
   - No story lacks `traceability.prdReqIds`
   - Acceptance mirrors PRD (checked by sampling or tool support)

## Exit Criteria
- Coverage = 100%
- No orphans or mismatches
- NFRs validated (if applicable)

Block sprint start and merges until exit criteria are met.

