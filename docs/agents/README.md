# SEMAD Agents Overview

SEMAD-METHOD coordinates specialized AI agents to cover the full software delivery lifecycle. This guide explains how those agents fit together and where to find detailed activation instructions.

## Core Agent Architecture

### Agent Structure
Every agent definition describes:
- **Identity** – name, role, and persona guidance
- **Capabilities** – supported workflows and competencies
- **Dependencies** – templates, structured tasks, and checklists it relies on
- **Activation** – how you invoke the agent from the Codex CLI or orchestrator
- **Workflow Integration** – where it sits inside the two-phase development flow

### Agent Communication
- Agents exchange information via repository artifacts (Markdown, YAML, JSON)
- Direct agent-to-agent conversation is intentionally avoided; the orchestrator coordinates handoffs
- StoryContracts provide the structured requirements that keep implementation and validation in sync, including slice metadata, integration verification, rollback plans, and explicit guardrails that separate must-do work from out-of-scope changes

## How the Workflow Fits Together

SEMAD-METHOD runs in two major phases, with the orchestrator managing transitions.

### Planning Phase
```
User Request → Orchestrator
    ↓
Analyst (Brief)
    ↓
PM (PRD)
    ↓
Architect (Technical Design)
    ↓
[Optional: UX (Designs)]
```

### Development Phase
```
Planning Artifacts → Orchestrator
    ↓
Scrum Master (Stories with Contracts)
    ↓
Developer (Implementation)
    ↓
QA Engineer (Validation)
    ↓
[Loop if issues found]
```

### Iterative Development Loop
```
Story → Dev → QA
  ↑           ↓
  ←─ Issues ──┘
```

## Where to Find Agent Definitions

Each agent’s full activation contract (persona, commands, workflows, dependencies) lives in `semad-core/agents/<agent>.md` (symlinked to `bmad-core/agents/<agent>.md`). Treat those files as the single source of truth. The new `AGENTS.md` index links directly to them.

Additional references:
- Codex CLI usage: `docs/codex-integration.md`
- Reverse alignment workflow: `docs/reverse-alignment.md`
- Story contracts and implementation guidance: `docs/stories/` and `bmad-core/core-config.yaml`
- Story workflow migration (enhanced Dev flow): `docs/migration/story-workflow-migration.md`

## StoryContracts (XML)

- Storage model: each story’s contract is stored as an external XML file and referenced from the story frontmatter via a pointer:
  - `StoryContractXml: docs/stories/contracts/story-<id>.xml`
- Backward compatibility: during migration, YAML frontmatter `StoryContract:` is still supported. Readers use a pointer‑first dual‑read strategy (XML > YAML).
- Validation: XML is parsed and normalized to the existing JS object shape and validated against the JSON Schema with AJV — no XSD required.
- Configuration (in `bmad-core/core-config.yaml`):
  - `storyContract.format`: `yaml | xml | both` (set to `xml` once migration is complete)
  - `storyContract.pathPattern`: e.g., `docs/stories/contracts/{filebase}.xml` (tokens: `{filebase}`, `{id}`)
- Helper APIs:
  - Loader: `semad-core/utils/story-contract.js` (format-agnostic)
  - Validator: `bmad-core/utils/story-contract-validator.js`
  - Resolver: `bmad-core/utils/file-path-resolver.js#getStoryContractPathFromFile` and `#getStoryContractPathFromId`

Validate in CI and locally:
- `node scripts/validate-story-contract.js --all` (XML-aware)
- GitHub Actions workflow `validate-storycontracts.yml` runs this on PRs.

## Extending the Agent Set

To add a custom agent:
1. Create a definition file under `agents/` (for example, `agents/my-agent.md`) describing the identity, commands, and workflow integration.
2. Add supporting templates, structured tasks, or checklists as needed.
3. Register the agent in configuration (`.bmad-config.yaml`) and update any orchestrator workflows that should trigger it.
4. Test through the orchestrator or Codex CLI to ensure activation instructions behave as expected.
