## Traceability & Coverage (QA Gate)

Check all items before requesting review. Link evidence in each checkbox when applicable.

- [ ] Reverse alignment run: `node tools/workflow-orchestrator.js reverse-align` (attach `.ai/reports/*`)
- [ ] QA alignment run: `/qa *validate-docs-code-alignment` (attach summary)
- [ ] `docs/coverage.md` shows 100% PRD→Epic→Story coverage for scope
- [ ] Updated StoryContracts include `traceability.prdReqIds`, `traceability.archRefs`, `acceptanceRef`, `qaHooks`
- [ ] Affected EpicContracts updated with `prdTraceability.coverage`
- [ ] Architecture table (`docs/architecture/architecture.md`) references the PRD IDs touched
- [ ] NFRs (if any) have QA hooks

If any item is unchecked, label the PR as `blocked:traceability` and assign SM/PM.

