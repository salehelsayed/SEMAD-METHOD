# Story Workflow Migration (Enhanced Dev Flow)

This guide helps migrate existing stories to the enhanced Dev workflow so they benefit from dependency gates, red/green story‑scoped tests, and acceptance evidence handoffs.

## When to Migrate
- You plan to continue work on a story and want guardrails.
- QA expects `.ai/dev/acceptance/<story>.json` evidence.
- You want to run `/dev *implement-next-story` or `/dev *devx3` safely.

## Quick Steps
1) Ensure the story has a valid StoryContract (XML pointer preferred). In XML-first projects, the story frontmatter includes a pointer to the external XML file:
   - `StoryContractXml: docs/stories/contracts/story-<id>.xml`
   - If still on YAML, the contract appears under `StoryContract:` in frontmatter — migration helpers are provided below.
2) Generate a dependency plan (gates In Progress):
   - `node tools/dev/run-dependency-plan.js --story <docs/stories/your-story.md>`
   - Confirms filesToModify and quality gates; writes `.ai/dev/dependency/<story>.json`.
3) Create an acceptance checklist from the story:
   - `node tools/dev/generate-acceptance-checklist.js --story <docs/stories/your-story.md>`
   - Writes `.ai/dev/checklists/<story>.json`.
4) Generate or scaffold tests from the contract (optional if you maintain tests manually):
   - `node tools/dev/generate-tests-from-contract.js --story <docs/stories/your-story.md>`
   - Creates or preserves tests under `tests/acceptance/<story>/`.
5) Implement with the enhanced flow:
   - Activate the Dev agent (`codex "/dev"` or equivalent) and run `*implement-next-story`.
   - Respond to the guardrail prompts with the JSON template provided (list each `mustDo`, declare `outOfScopeBreaches`, provide measured `performance.p95/p99`, and summarize integration/rollback results).
   - Auto-acknowledged responses are rejected; the workflow will halt until the JSON confirmation is supplied.
6) Verify acceptance evidence exists and is valid:
   - `node tools/qa/validate-acceptance-evidence.js --story <docs/stories/your-story.md>`
   - Confirm `.ai/dev/acceptance/<story>.json` entries and the companion guardrail logs in `.ai/history/dev_log.jsonl`.

## XML StoryContracts Migration

If your stories still embed YAML `StoryContract` in frontmatter, migrate to XML contracts with a single command:

1) Dry run to preview changes:
   - `npm run migrate:stories:xml -- --dry-run`
2) Migrate and remove YAML (xml-only):
   - `npm run migrate:stories:xml -- --xml-only`
3) Auto-repair common schema gaps (e.g., missing `linkedArtifacts.version`):
   - `npm run fix:stories`
4) Validate all stories (XML-aware):
   - `node scripts/validate-story-contract.js --all`

Configuration toggles (`bmad-core/core-config.yaml`):
- `storyContract.format`: `yaml | xml | both` (set to `xml` after migration)
- `storyContract.pathPattern`: controls where XML files are written (supports `{filebase}` and `{id}` tokens)

## Marking Legacy Stories
If you won’t retrofit a story yet:
- Add a brief note in the story’s Dev Notes indicating “legacy workflow”.
- Skip gating by running `tools/dev-next-story.js` with `--guard never` when appropriate.
- Plan a future sub‑task to add acceptance tests and evidence before closing the epic.

## Artifacts (Enhanced Workflow)
- `.ai/dev/dependency/<story>.json` – pre‑implementation dependency plan
- `.ai/dev/checklists/<story>.json` – acceptance checklist with evidence slots
- `.ai/dev/test-reports/<story>-red.json` / `<story>-green.json` – story-scoped Jest runs
- `.ai/dev/acceptance/<story>.json` – verified evidence for QA handoff
- `.ai/dev/logs/gate-events.jsonl` – dependency/acceptance gate results
- `.ai/history/dev_log.jsonl` – guardrail expectation + compliance entries for manual audit trails

## Tips
- Keep `filesToModify` accurate; dependency plan gates status changes.
- Prefer acceptanceTestMatrix with explicit `test_files` for deterministic runs.
- If tests are flaky, run `npm test -- --runTestsByPath <file>` until stable, then re-run the flow.
- Capture real performance telemetry—provide measured p95/p99 values (or traces) in the guardrail JSON so the workflow clears the budget gate.
