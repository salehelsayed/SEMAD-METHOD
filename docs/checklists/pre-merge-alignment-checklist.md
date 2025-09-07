# Pre‑Merge Alignment Checklist (QA Gate)

Goal: block merges that would introduce PRD→Epic→Story traceability gaps or acceptance drift.

- Alignment reports:
  - Reverse alignment run: `node tools/workflow-orchestrator.js reverse-align`
  - QA validation run: `/qa *validate-docs-code-alignment`
  - Reports archived under `.ai/reports/` and manifest updated
- PRD coverage:
  - 100% of PRD IDs in `docs/coverage.md` map to ≥1 Epic and ≥1 Story
  - No unmatched PRD rows; no orphans
- Story contracts:
  - `traceability.prdReqIds` present and valid
  - `acceptanceRef` mirrors PRD acceptance (no paraphrasing)
  - `qaHooks.acceptanceTestIds` present and implemented in tests
- Architecture anchoring:
  - `traceability.archRefs` present and plausible against `docs/architecture/architecture.md`
- NFRs:
  - If PRD includes NFR IDs, they appear in epics/stories and have QA hooks

Result: If any item fails, mark the PR as blocked and assign SM/PM to resolve.

