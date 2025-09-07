# Story Definition of Ready (DoR) — Traceability Edition

Purpose: ensure every StoryContract carries PRD and Architecture context before entering a sprint.

- Required fields present and valid:
  - `traceability.prdReqIds` (≥1; exists in PRD and EpicContract)
  - `traceability.flowIds`, `traceability.integrationPointIds`
  - `traceability.archRefs` (≥1 ARCH-COMP-* or ADR-*)
  - `acceptanceRef.prdReqIds` present; acceptance mirrors PRD
  - `qaHooks.acceptanceTestIds` present
- Links:
  - `story.storyId`, `story.epicId` valid and resolvable
  - `links.relatedADRs` when architectural changes are expected
- Test readiness:
  - `testPlan` includes unit, integration, and E2E (as applicable)
  - Test data defined and realistic
- Flags/telemetry (if applicable):
  - Feature flag declared; default state set
  - Telemetry events enumerated when success criteria apply
 - Integration (brownfield slices):
   - Integration verification steps listed (IV1/IV2/IV3)
   - Rollback plan present when story touches INTs

Block the story from sprint planning if any required item above is missing.
