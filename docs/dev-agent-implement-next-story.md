# Dev Agent - Implement Next Story Command

**Note:** This is the user documentation for the implement-next-story feature. For the implementation story, see `/docs/stories/5.1.implement-next-story-command.md`.

## Overview
The Dev agent now supports an `*implement-next-story` command that automatically finds and begins implementing the most recent approved story from the stories directory. Guardrails, performance budgets, integration verification, and rollback plans are enforced as blocking gates—automation will halt unless you provide the required confirmations during the session.

## Usage

1. Activate the Dev agent:
   ```
   BMad dev
   ```

2. Once the Dev agent is active, use the command:
   ```
   *implement-next-story
   ```

3. The agent will:
   - Search for approved stories in `docs/stories/`
   - Find the most recently modified story with status "Approved"
   - Display the story title and ask for confirmation
   - Validate the StoryContract
   - Begin implementation if everything is valid
    - Prompt for guardrail/performance confirmation and require a JSON compliance report before finalizing

## How It Works

### Story Discovery
- Stories are located in the directory specified by `devStoryLocation` in `core-config.yaml` (default: `docs/stories`)
- Only markdown files matching the pattern `{epic}.{story}*.md` are considered
- Stories must have `Status: Approved` to be eligible
- The most recent story is determined by file modification time

### Error Handling
The command provides specific feedback for different scenarios:
- No stories directory exists
- No story files in the directory
- No stories with "Approved" status
- Invalid or missing StoryContract

### StoryContract Validation
Before implementation begins, the command validates that the story has a complete StoryContract with:
- `version`, `story_id`, and `epic_id`
- `story.sliceType` so the workflow applies the correct thin-slice policy
- `traceability.integrationPointIds` (and other traceability anchors when provided)
- `apiEndpoints` (array) and `filesToModify` (array)
- `acceptanceCriteriaLinks` (array)
- `integrationVerification` checks and a `rollbackPlan`
- `performanceBudget` targets and `guardrails` outlining must-do vs. out-of-scope work

### Structured Task Flow
Once the Dev agent takes ownership, the workflow enforces guardrails before and after implementation:
1. **Guardrail Gate** – validates `guardrails.mustDo/outOfScope`, `integrationVerification`, `rollbackPlan`, and `performanceBudget`. Acknowledgement (and the current policy snapshot) is logged to `.ai/history/dev_log.jsonl`.
2. **Derive Workplan** – writes `.ai/dev/workplans/<story>.json` including acceptance criteria, impacted files, and per-criterion worklist.
3. **Prepare Execution Artifacts** – seeds checklist, dependency, and test-report destinations so evidence lands in the correct `.ai/dev/` folders.
4. **Dependency Plan** – records `.ai/dev/dependency/<story>.json`; status transitions stay blocked until this succeeds.
5. **Acceptance Checklist** – generates `.ai/dev/checklists/<story>.json`; update it as you satisfy criteria.
6. **Scoped Tests** – runs red/green passes and stores reports in `.ai/dev/test-reports/`.
7. **Guardrail Enforcement** – after implementation you must provide a JSON report confirming every must-do action, declaring any out-of-scope touches, and supplying measured performance data. The result is logged to `.ai/history/dev_log.jsonl`; failure halts the workflow.
8. **Acceptance Evidence** – validates that every checklist item has concrete evidence before writing `.ai/dev/acceptance/<story>.json`.
9. **Validation Guard** – the Dev command calls `tools/qa/validate-acceptance-evidence.js` and reverts the story if any criteria remain unmet.

### Artifact Summary
- `.ai/dev/dependency/<story>.json` – dependency map and quality gates
- `.ai/dev/checklists/<story>.json` – acceptance checklist with evidence entries
- `.ai/dev/test-reports/<story>-red.json` / `<story>-green.json` – Jest summaries for story-scoped tests
- `.ai/dev/acceptance/<story>.json` – verified acceptance evidence consumed by QA
- `.ai/dev/logs/gate-events.jsonl` – chronological log of dependency and acceptance gate results
- `.ai/history/dev_log.jsonl` – session log entries for `guardrail_expectations` and `guardrail_compliance` (useful for audits and regressions)

## Manual / LLM-Only Sessions
- To run the workflow manually, activate the Dev agent (for example `codex "/dev"`) and pass `--manual` or export `SEMAD_AGENT_DISABLE_RUNNERS=1` so automation doesn’t spawn the CLI runners.
- The guardrail gate and enforcement steps require a structured JSON response. Use the template shown in the prompt (include each `guardrails.mustDo`, note any `outOfScopeBreaches`, and supply measured `performance.p95/p99` values).
- Auto-acknowledgements are rejected with a hard stop (the workflow fails with `Reason: auto_ack`). Always provide the JSON confirmation during manual or collaborative LLM sessions before continuing.

## Example Workflow

1. Scrum Master creates and approves a story:
   ```
   BMad sm
   *create-story
   # ... story creation process ...
   # Set status to "Approved"
   ```

2. Developer implements the story:
   ```
   BMad dev
   *implement-next-story
   # Found approved story: Epic 5 - Story 1: Add user authentication
   # File: 5.1.user-authentication.md
   # Would you like to begin implementation? (yes/no)
   yes
   # Successfully loaded story 5.1. Beginning implementation...
   ```

## Testing

To test the command:

1. Create a test story with "Approved" status in `docs/stories/`
2. Run the Dev agent and execute `*implement-next-story`
3. Verify the correct story is loaded, the guardrail gate prompts for confirmation, and the compliance JSON is recorded to `.ai/history/dev_log.jsonl`

## Implementation Details

### Files Modified
- `bmad-core/agents/dev.md` - Added command and implementation instructions
- `bmad-core/utils/find-next-story.js` - Utility for finding approved stories

### Dependencies
The implementation uses:
- `fs` and `path` for file operations
- `js-yaml` for parsing YAML frontmatter
- Existing `StoryContractValidator` for validation

## Migration Notes
If you have existing stories created before the enhanced Dev workflow, see:
- `docs/migration/story-workflow-migration.md` – step‑by‑step migration to enable dependency gates, red/green story‑scoped tests, and acceptance evidence.
