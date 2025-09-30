# Agent Best Practices

## Memory and State Management
- Working memory lives under `.ai/progress/` (task tracking) and `.ai/observations/` (decisions, blockers, key facts).
- Observations are JSON documents; keep them succinct and evidence-based.
- Agents should run `npm run validate:contracts` or equivalent checks before marking stories as ready when contracts change.

## Operational Guidelines
1. **Start with the Orchestrator** – ensures context is primed and workflows run in the right order.
2. **Respect the two-phase flow** – finish planning artifacts before generating stories or code.
3. **Lean on StoryContracts** – developers implement exactly what’s declared; QA validates against the same contract.
4. **Track Progress** – update `.ai` progress records and capture key decisions or blockers for future handoffs.
5. **Handle Errors Deliberately** – surface issues with actionable guidance and escalate when blocked.

## Performance Metrics and Optimization
- Monitor task completion time, error rates, retry counts, and validation pass rates.
- Cache frequently accessed templates or context files when possible.
- Batch related operations to minimize file I/O.
- Keep `.ai/` cleaned via the built-in hygiene routines (see `core-config.yaml` retention policies).

