# SEMAD-METHOD Agents Index

SEMAD-METHOD relies on specialized AI agents that collaborate through StoryContracts, structured tasks, and orchestrated workflows. This index points you to the right references quickly without duplicating the authoritative agent definitions.

## Quick Documentation Links
- Overview of how agents fit together: `docs/agents/README.md`
- Interaction patterns and reverse-alignment steps: `docs/agents/interaction-patterns.md`
- Configuration reference (`.bmad-config.yaml`, `core-config.yaml`): `docs/agents/configuration.md`
- Operational best practices and metrics: `docs/agents/best-practices.md`
- Troubleshooting checklist: `docs/agents/troubleshooting.md`
- Codex CLI integration guide: `docs/codex-integration.md`
- Reverse-alignment workflow deep dive: `docs/reverse-alignment.md`

## Codex CLI Quick Start
- Install: `npm install -g @openai/codex`
- Activate agents with natural language, e.g. `codex "as dev agent, *help"`
- Short activation alias: `codex "/dev"`, `codex "/qa"`, etc. (the CLI treats `/[agent]` the same as “as [agent] agent”)
- After activation, send follow-up Codex prompts with `*` commands (`*help`, `*implement-next-story`, `*review`, etc.) without repeating the activation phrase
- Agent outputs and logs live under `.ai/` (history, adhoc reports) and stories stay in `docs/stories/`
- See the full CLI guide for detailed scenarios and automation tips

## Primary Delivery Agents

| Agent | Role Snapshot | Activation Example | Definition |
| --- | --- | --- | --- |
| `/orchestrator` | Master coordinator for planning and development phases | `codex "as bmad-orchestrator agent, *help"` | `semad-core/agents/bmad-orchestrator.md` |
| `/analyst` | Requirements discovery and stakeholder analysis | `codex "as analyst agent, *help"` | `semad-core/agents/analyst.md` |
| `/pm` | Product requirements, prioritisation, brownfield PRD alignment | `codex "as pm agent, *help"` | `semad-core/agents/pm.md` |
| `/architect` | Technical architecture and design decisions | `codex "as architect agent, *help"` | `semad-core/agents/architect.md` |
| `/ux` | UI/UX specifications and design systems (optional) | `codex "as ux-expert agent, *help"` | `semad-core/agents/ux-expert.md` |
| `/sm` | Story creation, StoryContracts, sprint coordination | `codex "as sm agent, *help"` | `semad-core/agents/sm.md` |
| `/dev` | Implementation specialist and test author | `codex "as dev agent, *help"` | `semad-core/agents/dev.md` |
| `/qa` | Quality assurance, cleanup analysis, coverage enforcement | `codex "as qa agent, *help"` | `semad-core/agents/qa.md` |
| `/in` | Integration auditor for system completeness and brownfield safety | `codex "as in agent, *help"` | `semad-core/agents/in.md` |
| `/po` | Product owner for stakeholder alignment and governance | `codex "as po agent, *help"` | `semad-core/agents/po.md` |

## Extended Utility Agents

| Agent | Purpose | Activation Example | Definition |
| --- | --- | --- | --- |
| `bmad-master` | Master task executor with knowledge-base toggles | `codex "as bmad-master agent, *help"` | `semad-core/agents/bmad-master.md` |

## Reverse Alignment at a Glance
- Run the entire pipeline with `node tools/workflow-orchestrator.js reverse-align`
- Trigger individual steps via the orchestrator commands listed in `docs/agents/interaction-patterns.md`
- Direct agent commands for reverse alignment are also captured in that document, keeping this index lightweight

## Compatibility Note
`semad-core/agents/` symlinks to `bmad-core/agents/`. Always treat those files as the source of truth for activation rules, personas, and command behaviour.
