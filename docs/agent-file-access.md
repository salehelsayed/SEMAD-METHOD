# Agent File Access Reference

This reference summarizes which files each agent reads, and from where. All agents greet on activation and wait for explicit commands before reading files.

- Startup rule: On activation, agents only greet (no file reads).
- Core lookup order: Prefer `.semad-core/` if specified below; otherwise `semad-core/` is used. Some tools read `semad-core/` directly.
- Project docs: PRD under `docs/prd.md` or `docs/prd/PRD.md`, Architecture under `docs/architecture*.md`, Stories under `docs/stories/**/*.md`.

## Scrum Master (`/sm`)
- Activation: Greeting only.
- `*create-story`
  - Project: `docs/prd*.md`, `docs/architecture*.md`, `docs/stories/`
  - Core: `.semad-core/structured-tasks/create-next-story.yaml` (fallback `semad-core/...`), `.semad-core/templates/story-tmpl.yaml`, `.semad-core/templates/acceptance-test-matrix.example.yaml`
- `*story-checklist`
  - Project: target story under `docs/stories/`
  - Core: `.semad-core/structured-tasks/execute-checklist.yaml`, `.semad-core/structured-checklists/story-draft-checklist.yaml`
- `*correct-course`
  - Core: `.semad-core/structured-tasks/correct-course.yaml`
- `*update-story-templates`
  - Core/Templates: `.semad-core/templates/*` (applies to stories in `docs/stories/`)
 - `*scope-split <story-path>`
  - Project: the given file in `docs/stories/` (groups by top-level directories)

## QA Engineer (`/qa`)
- Activation: Greeting only.
- `*review [story-file]`
  - Project: Story files in `docs/stories/` (reads/updates Status; appends QA findings)
  - Core: `.semad-core/core-config.yaml` (fallback `semad-core/core-config.yaml`), structured task `review-story.yaml` or `qa-dev-handoff.yaml` under `.semad-core/structured-tasks/`
- `*validate-feature-coverage [--prd --epics --stories --code --tests]`
  - Project: `docs/prd/PRD.md` (or `--prd`), `docs/epics/` (if exists), `docs/stories/`, `src/`, `tests/`
  - Output: `.ai/reports/feature-coverage.{json,md}`
- `*analyze-code-quality` / `*analyze-dependencies` / `*cleanup`
  - Core: corresponding structured tasks under `.semad-core/structured-tasks/`
  - Project: scans repo code, respects ignore patterns

## Developer (`/dev`)
- Activation: Greeting only.
- `*implement-next-story`
  - Project: `docs/stories/` (finds next Approved), updates Status; may read `docs/architecture/coding-standards.md`, `docs/architecture/tech-stack.md`, `docs/architecture/source-tree.md` per core config
  - Core: `semad-core/core-config.yaml` (dev settings), `semad-core/utils/find-next-story.js`, `semad-core/structured-tasks/implement-next-story.yaml`
- `*adhoc` / `*adhoc-debug`
  - Core: `semad-core/utils/adhoc-runner.js` or `.semad-core/utils/adhoc-runner.js` (debug variant accordingly)
  - Project: only paths specified via `--paths`

## Product Manager (`/pm`)
- Activation: Greeting only.
- `*create-prd` / `*create-brownfield-prd`
  - Core: `.semad-core/templates/{prd-tmpl.yaml|brownfield-prd-tmpl.yaml}`, `.semad-core/structured-tasks/create-doc.yaml`
  - Project: writes `docs/prd.md`
- `*validate-epic <path>`
  - Project: the provided epic file
  - Scripts/Schemas: `scripts/validate-epic-contract.js` (uses schemas from core)
- `*validate-feature-coverage`
  - Same reads as QA coverage (PRD, epics, stories, code, tests)

## Analyst (`/analyst`)
- Activation: Greeting only.
- `*analyze-codebase-changes` / `*extract-implemented-features`
  - Project: scans repo (code, docs) and emits `.ai/reverse/analysis.json`
  - Core: structured tasks via TaskRunner flags resolved under `.semad-core/` or `semad-core/`

## Architect (`/architect`)
- Activation: Greeting only.
- `*reverse-engineer-architecture` / `*document-design-decisions`
  - Project: scans codebase; updates `docs/architecture/architecture.md` and related docs
  - Core: structured tasks under `.semad-core/structured-tasks/` if used

## Orchestrator (`/orchestrator`)
- Activation: Greeting only.
- Reverse-alignment and docs flows
  - Project: `docs/` (PRD, architecture, stories), `src/`, `tests/`
  - Core: utilities under `semad-core/utils/*`, uses `semad-core/core-config.yaml` to preserve `devLoadAlwaysFiles`
  - Output: `.ai/reverse/*`, `.ai/reports/*`, `.ai/documentation-manifest.json`, updates to `docs/*`

## Product Owner (`/po`)
- Activation: Greeting only.
- `*validate-epic <path>`
  - Project: specified epic file
  - Scripts/Schemas: same path as PM validate-epic

## Infrastructure/Integration Auditor (`/in`)
- Activation: Greeting only.
- `*audit-integration` / `*verify-contracts` / `*generate-report`
  - Core: structured tasks under `.semad-core/structured-tasks/` (if present)
  - Project: StoryContracts in `docs/stories/`, schemas in core, outputs in `.ai/reports/`

## Resolution & Precedence
- Structured tasks/templates/utils: prefer `.semad-core/...` when tool supports it; fallback to `semad-core/...`.
- Core config: `.semad-core/core-config.yaml` preferred where supported; otherwise `semad-core/core-config.yaml`.
- Teams config (if used): `teams.yaml` at repo root.
