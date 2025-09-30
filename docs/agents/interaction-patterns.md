# Agent Interaction Patterns

This document captures the structured ways SEMAD-METHOD agents collaborate during higher-level workflows.

## Reverse Alignment Flow
- **Goal:** Rebuild and validate core documentation directly from the implementation so planning artifacts always reflect reality.
- **Outputs:** `docs/architecture/architecture.md`, `docs/prd/PRD.md`, `docs/stories/*`, `.ai/reports/*`, `.ai/documentation-manifest.json`
- **Reference:** `docs/reverse-alignment.md`

### Orchestrator Entry Points
- Full pipeline: `node tools/workflow-orchestrator.js reverse-align`
- Individual gated steps:
  - `cleanup-docs`
  - `analyst-analyze`
  - `architect-rewrite`
  - `pm-update-prd`
  - `sm-recreate-stories`
  - `validate-story-consistency`
  - `qa-validate-alignment`
  - `generate-alignment-report`
  - `create-documentation-manifest`

### Direct Agent Commands
- `/analyst *analyze-codebase-changes`
- `/analyst *extract-implemented-features`
- `/architect *reverse-engineer-architecture`
- `/architect *document-design-decisions`
- `/pm *update-prd-from-implementation`
- `/pm *document-missing-requirements`
- `/sm *recreate-stories-from-code`
- `/sm *update-story-templates`
- `/qa *validate-docs-code-alignment`
- `/qa *generate-coverage-report`

## Driver Flows

### Planning Phase Handoff
1. User request enters via orchestrator.
2. Analyst produces the brief (`docs/brief.md`).
3. Product Manager authors and prioritizes the PRD (`docs/prd/PRD.md`).
4. Architect delivers technical design artifacts (`docs/architecture/architecture.md`).
5. UX (optional) supplies UI specifications when requested.

### Development Phase Handoff
1. Scrum Master generates stories with StoryContracts (`docs/stories/`).
2. Developer executes the structured implementation task: derive workplan + dependency plan, generate acceptance checklist (`.ai/dev/checklists/<story>.json`), run red/green scoped tests (`.ai/dev/test-reports/`), and capture evidence (`.ai/dev/acceptance/<story>.json`) before moving the story to `Implemented`.
3. QA runs validations, reports findings, and enforces coverage.
4. Integration Auditor (`/in`) can run in parallel to confirm system completeness and brownfield safety.

### Feedback and Iteration
- QA issues feed back to the Developer (and SM if contracts need adjustments).
- Integration findings feed into PM/Architect for scope adjustments.
- Retrospective or hotfix workflows trigger via orchestrator or PO tasks when configured.
