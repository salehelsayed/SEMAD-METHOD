# Traceability Guide — PRD → Architecture → Epics → Stories → Code → Tests

This guide explains how to use SEMAD-METHOD's comprehensive traceability system for end-to-end coverage tracking.

## ID Conventions

### Primary ID Formats
- **Features**: `FEAT-<slug>` (e.g., `FEAT-auth-session`, `FEAT-payment-gateway`)
- **Acceptance Criteria**: `AC-<feat>-<n>` (e.g., `AC-auth-session-1`)
- **Epics**: `EPIC-<feat>-<slug>` (e.g., `EPIC-auth-session-oauth`)
- **Stories**: `ST-<epic>-<n>` (e.g., `ST-auth-001`)

### Legacy ID Support
- PRD requirement IDs: `PRD-REQ-###` or `REQ-###`
- Architecture IDs: `ARCH-COMP-*`, `ADR-*`
- Contract IDs: `EP-*`, `ST-*`

## Where to Put IDs
- **PRD**: Define features with `FEAT-*` IDs and acceptance criteria with `AC-*` IDs
- **Architecture**: Add PRD→Architecture coverage table with feature mappings
- **Epics**: Include `featureId`, `epicId`, and `acceptanceCriteriaMap`
- **Stories**: Include `storyId`, `epicId`, `featureId`, and `acceptanceCriteriaCovered`
- **Code**: Add annotations `// FEAT: FEAT-xxx | STORY: ST-xxx`
- **Tests**: Include AC references in test names `[AC-xxx]`
## Coverage Tracking

### Coverage Commands
- **PM Coverage Validation**: `/pm *validate-feature-coverage --threshold 100 --report .ai/reports/feature-coverage.json`
- **QA Test Coverage**: `/qa *validate-feature-coverage`
- **SM Brownfield Epic**: `/sm *brownfield-create-epic --auto-split --max-stories -1 --link-feature FEAT-xxx`
- **Orchestrator Pipeline**: `node tools/workflow-orchestrator.js reverse-align --coverage-threshold 100 --auto-split-stories`

### Coverage Metrics
- **Feature Coverage**: % of features linked to epics + stories (target: 100%)
- **AC Coverage**: % of acceptance criteria with stories + tests (target: 100%)
- **Implementation Coverage**: % of stories with code references (target: 100%)
- **Test Evidence**: Tests referencing AC-* pass rate (target: 100%)

### Coverage Reports
- **JSON Report**: `.ai/reports/feature-coverage.json`
- **Markdown Report**: `.ai/reports/feature-coverage.md`
- **Documentation Manifest**: `.ai/documentation-manifest.json`

Adopt the checklists under `docs/checklists/` and the gate under `docs/gates/` to make this operational for every sprint.

## Rollout Plan

- Week 0: Establish ID schemes; create `docs/coverage.md`; seed the Architecture coverage table; update Epic/Story templates.
- Sprint 1 (Pilot): Apply gates to one epic; enforce Story DoR; run daily reverse‑align; capture metrics in `.ai/progress/traceability-metrics.json`.
- Sprint 2 (Scale): Expand to all epics; add the QA gate to the PR template; baseline PRD for the sprint.
- Ongoing: Treat any new PRD item as a new matrix row; block until mapped through Architecture → Epic → Story.

## Implementation Guide

### Code Annotations
Add traceability comments in implementation files:
```javascript
// FEAT: FEAT-auth-session | STORY: ST-auth-001
class AuthenticationManager {
  // Implementation
}
```

### Test Annotations
Include AC references in test names:
```javascript
test('User login [AC-auth-session-1]', () => {
  // Test implementation
});
```

### Brownfield Story Generation (Unlimited)
Generate stories until 100% coverage:
```bash
# PM creates epic with auto-split
pm: *create-epic --auto-split --max-stories -1 --complexity-budget 5 --link-feature FEAT-auth

# SM creates brownfield epic
sm: *brownfield-create-epic --from ./codebase --auto-split --link-feature FEAT-payment
```

### ECM → Story Workflow (SM)

```bash
# Prefer ECM-driven story creation
/sm *create-story   # routes to create-story-from-ecm first

# If ECM rows have no Story IDs yet, auto-assign them
node tools/ecm-assign-story-ids.js docs/epics/<your-epic>.md --storiesDir docs/stories

# Ad‑hoc (no PRD/Epic link):
/sm *create-story --adhoc
```

Notes
- Story slicing order: Story 0 (feature flag + telemetry), Story 1 (probe/contract tests), then one INT × one flow per story.
- Stories touching INTs must include `integrationVerification`, `rollbackPlan`, `performanceBudget`, and `guardrails` with explicit must-do/out-of-scope instructions.

## Brownfield PM Steps (Integration‑First)

1) Create Brownfield PRD and run readiness checklist
```bash
/pm *create-brownfield-prd
# Complete PM Integration Readiness (contracts, SourceRef, ECM, rollout)
```

2) Create epic, validate ECM and EpicContract
```bash
/pm *create-epic
node tools/ecm-validate.js docs/epics/<epic>.md
npm run validate:epic -- docs/epics/<epic>.md
```

3) Enforce incremental slicing
- Story 0: feature flag + telemetry (no behavior change)
- Story 1: probe/contract tests (read‑only)
- Story 2+: one INT × one flow per story; include integration verification and rollback

## CI/CD Integration

### GitHub Actions Workflow
The framework includes `.github/workflows/coverage-validation.yml` that:
1. Validates coverage on every push/PR
2. Fails build if coverage < threshold
3. Comments PR with coverage metrics
4. Uploads coverage reports as artifacts

### NPM Scripts
```bash
# Check coverage (informational)
npm run validate:coverage

# Strict validation (fails on threshold)
npm run validate:coverage:strict
```

## Manual Validation Process

1) Define features in PRD with `FEAT-*` IDs and `AC-*` acceptance criteria
2) Create epics with `featureId` linking: `/pm *create-epic --link-feature FEAT-auth`
3) Generate stories with auto-split: `/sm *brownfield-create-epic --auto-split --max-stories -1`
4) Add code annotations: `// FEAT: FEAT-auth | STORY: ST-auth-001`
5) Tag tests with AC references: `test('Login [AC-auth-1]', ...)`
6) Run coverage validation: `npm run validate:coverage`
7) Review gaps in `.ai/reports/feature-coverage.md`
8) Use auto-split to generate missing stories until 100% coverage
