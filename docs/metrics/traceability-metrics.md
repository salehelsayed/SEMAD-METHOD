# Traceability Metrics (Track in `.ai/progress/`)

Track these during pilot and scale-up. Update a JSON file (see skeleton) after each gate.

- prdCoveragePercent: % of PRD IDs with Epic + Story coverage (target 100%)
- orphanPrdCount: PRD IDs without any Epic/Story
- orphanStoryCount: Stories without `traceability.prdReqIds`
- acceptanceMismatchCount: Stories whose acceptance diverges from PRD
- gateFailureCount: Number of failed gates in the sprint
- meanTimeToCloseHours: Avg hours to resolve a gate failure
- reworkStoriesCount: Stories reopened post-merge due to drift

How to collect
- Run `node tools/workflow-orchestrator.js reverse-align` daily and before merges
- Run `/qa *validate-docs-code-alignment` for alignment
- Record results to `.ai/progress/traceability-metrics.json`

