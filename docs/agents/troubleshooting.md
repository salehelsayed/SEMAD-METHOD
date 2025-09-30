# Agent Troubleshooting

Use these checks when SEMAD agents do not behave as expected.

## Common Issues

**Agent not responding**
- Confirm the activation phrase (e.g., `codex "as dev agent, *help"`).
- Ensure the agent is enabled in `.bmad-config.yaml`.
- Restart the orchestrator to refresh session context.

**Wrong agent activated**
- Invoke the target agent explicitly (`/agent-name`).
- Review `.bmad-config.yaml` auto-activation flags.

**Context lost between agents**
- Verify recent artifacts (stories, PRD shards, architecture docs) are saved.
- Double-check path references in `core-config.yaml` for PRD or story locations.

**Contract validation failures**
- Run `npm run validate:contracts` or the specific validator mentioned in the error.
- Fix schema violations in StoryContracts or regenerate the story via the Scrum Master agent.

## Development Guardrails

**Dependency plan fails before In Progress**
- Check `StoryContract.filesToModify` paths are present and correct.
- Inspect `.ai/dev/dependency/<story>.json` for impact radius and quality gate notes.
- Re-run: `node tools/dev/run-dependency-plan.js --story <story.md>`.

**Acceptance evidence missing or invalid**
- Open `.ai/dev/checklists/<story>.json` and confirm each item has `verified: true` and non-empty `evidence`.
- Review test reports in `.ai/dev/test-reports/` (red/green JSON) and ensure mapped tests exist and pass.
- Validate: `node tools/qa/validate-acceptance-evidence.js --story <story.md>`.

**Flaky or mis-scoped tests**
- Run in isolation: `npm test -- --runTestsByPath <path/to/test.js>` until stable.
- Confirm acceptanceTestMatrix `test_files` paths are correct; prefer absolute repo-relative paths.
- If needed, re-generate skeletons: `node tools/dev/generate-tests-from-contract.js --story <story.md>`.

Artifacts to check for guard issues:
- `.ai/dev/logs/gate-events.jsonl` (dependency and acceptance gate events)
- `.ai/dev/dependency/<story>.json` (pre‑implementation plan)
- `.ai/dev/acceptance/<story>.json` (evidence consumed by QA)
