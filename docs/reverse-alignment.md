# Reverse Documentation Alignment

Reverse Alignment keeps your documentation and stories synchronized with the actual implementation by rebuilding core docs from the codebase and validating consistency.

## Why It Matters

- Reduced hallucination: Docs and stories reflect reality, not assumptions
- Faster onboarding: New contributors learn from up-to-date architecture and PRD
- Higher quality: Validation catches stale references and schema drift early
- Confidence: A canonical manifest records the current state of docs and implemented features

## Two Ways to Use

- Automated via Orchestrator (fastest)
- Manual via prompt (Claude) if you prefer a conversational workflow

## Automated: Orchestrator Commands

From the repo root:

```bash
# MVP commands (manifest-first)
node tools/workflow-orchestrator.js refresh-manifest
node tools/workflow-orchestrator.js reverse-align
node tools/workflow-orchestrator.js generate-stories --cap 10
node tools/workflow-orchestrator.js quality-gate --coverage 0.85 --delta-only

# Quick run (npm script)
npm run reverse:align

# Or with the CLI alias
bmad-orchestrator reverse-align

# Run the full pipeline
node tools/workflow-orchestrator.js reverse-align

# Or run step-by-step
node tools/workflow-orchestrator.js cleanup-docs
node tools/workflow-orchestrator.js analyst-analyze
node tools/workflow-orchestrator.js architect-rewrite
node tools/workflow-orchestrator.js pm-update-prd
node tools/workflow-orchestrator.js po-shard-docs
node tools/workflow-orchestrator.js sm-recreate-stories
node tools/workflow-orchestrator.js validate-story-consistency
node tools/workflow-orchestrator.js qa-validate-alignment
node tools/workflow-orchestrator.js generate-alignment-report
node tools/workflow-orchestrator.js create-documentation-manifest
```

Generated shards live under:
- `docs/architecture.generated/architecture.generated.md`
- `docs/prd.generated/PRD.generated.md`

You may link or transclude these into your human PRD/ARCH as appropriate.

### Quality Gate (Reverse-Align)

Use the built-in quality gate to verify enriched docs and analysis:

```bash
# NPM script
npm run reverse:gate

# Or directly
bmad-orchestrator reverse-quality-gate

# With minimum coverage threshold (e.g., 90%)
bmad-orchestrator reverse-quality-gate --threshold 0.9
```
Outputs `.ai/reports/reverse-align-gate.json` with pass/fail and detailed checks.

### Agent Consumption of Reverse Context

Before drafting new epics or stories, SM/Dev agents should read:
- `.ai/documentation-manifest.json` (decisions, coverage, features)
- `.ai/reports/alignment-report.json` (missingFeatures, docs coverage)

The orchestrator `run` command prints a quick summary from these files so agents consider deviations and the bigger picture when planning.

### What It Produces

- Rewritten `docs/architecture/architecture.md`
- Ensures sharded architecture docs exist (Dev agent preload):
  - `docs/architecture/coding-standards.md`
  - `docs/architecture/tech-stack.md`
  - `docs/architecture/source-tree.md`
- Rewritten `docs/prd/PRD.md`
- Sharded PRD/Architecture when enabled in `bmad-core/core-config.yaml`
- Per-epic summaries under `docs/prd/epics/epic-*.md`
- Recreated `docs/stories/*.md` (marked Implemented, referencing real files)
- Coverage and alignment reports in `.ai/reports/`
- Canonical manifest at `.ai/documentation-manifest.json`

### Validations

```bash
npm run preflight:schema
npm run reference:check
npm run gates:status
```

## Manual: Prompt for Claude

Paste this prompt into Claude, with file write access at repo root:

```
Using our installed BMad framework agents from bmad-core/agents/, please help update all documentation to match the current codebase. Since the BMad agents don't have built-in reverse-documentation commands, please work directly with the files and tools:

## Phase 1: Cleanup
1. Clean up the docs directory:
   - Remove all assessment/test markdown files under docs/ (keep only core docs)
   - Remove duplicates and temporary .md files
   - If present, remove the entire docs/stories/ directory (will be recreated)
   - Preserve only:
     - docs/prd/PRD.md
     - docs/architecture/architecture.md
     - docs/brief.md
     - docs/workflow-orchestrator.md

## Phase 2: Reverse Documentation (Manual Process)
2. Analyze the codebase yourself to understand implemented features:
   - Scan tools/orchestrator/gates/ for gate system implementation
   - Review tools/metrics/collect.js for metrics collection
   - Check .github/workflows/ for CI/CD setup
   - Review bmad-core/tools/dynamic-planner.js and bmad-core/structured-tasks/dynamic-plan-rules.yaml for dynamic plan adaptation
   - Examine scripts/preflight/ for validation systems

3. Update Architecture Document (docs/architecture/architecture.md):
   - Rewrite to reflect actual code structure (tools/, scripts/, bmad-core/, .github/workflows/)
   - Document real implementation patterns found (gates, metrics, dynamic planning, preflight/validation)
   - Remove references to deprecated features (e.g., Qdrant)

4. Update PRD (docs/prd/PRD.md):
   - Rewrite requirements to match what's actually built
   - Add requirements for implemented features (gates, metrics, CI/CD)
   - Remove unimplemented or deprecated features

## Phase 3: Story Recreation
5. Recreate stories in docs/stories/:
   - Use the story template from bmad-core/templates/story-tmpl.yaml
   - Make each story reflect actual implementation (as completed)
   - Include real file paths and implementation details as references
   - Set story status to “Implemented”

## Phase 4: Validation
6. Run validation commands from the repository root:
   - npm run preflight:schema     # Validate document schemas
   - npm run reference:check      # Check all references
   - npm run gates:status         # Check gate system status

7. Create documentation manifest at .ai/documentation-manifest.json:
   - Include presence and paths of core docs
   - List implemented feature areas with brief evidence (e.g., file paths)
   - Ensure no references to deprecated features (e.g., Qdrant) are present
```

## Safety & Tips

- Cleanup removes non-core docs and the entire `docs/stories/` folder; ensure you have backups or version control
- Cleanup now preserves files listed under `devLoadAlwaysFiles` in `bmad-core/core-config.yaml` so the Dev agent always has its required docs preloaded
- Treat the generated manifest as the source of truth for audits and tool integrations
- Schedule Reverse Alignment periodically or trigger on major merges to keep docs trustworthy

## Value Summary

- Consistency: Docs and stories accurately reflect code
- Traceability: Evidence links tie features to files and pipelines
- Quality: Schema and reference checks reduce runtime surprises
- Speed: Faster onboarding and lower cognitive load for developers
- Confidence: PRD and Architecture become living documents again
