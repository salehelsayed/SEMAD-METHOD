# OpenAI Codex CLI Integration with SEMAD-METHOD

## Overview

SEMAD-METHOD now supports integration with OpenAI's Codex CLI, a lightweight coding agent that runs in your terminal. This integration allows you to use SEMAD's structured agents directly through natural language commands in your terminal.

## Installation

### Step 1: Install OpenAI Codex CLI

```bash
# Install via npm
npm install -g @openai/codex

# Or install via Homebrew (macOS)
brew install codex
```

### Step 2: Install SEMAD-METHOD with Codex Support

```bash
npx semad-method install
```

When prompted for IDE selection, choose **"OpenAI Codex CLI"** from the list (use SPACEBAR to select).

## What Gets Created

The installation creates several files to enable Codex integration:

1. **`AGENTS.md`** (Project Root)
   - Main configuration file that Codex reads
   - Contains all agent definitions and activation instructions
   - Lists available commands and workflows

2. **`AGENTS-[agent].md`** (Agent Directories)
   - Agent-specific instruction files
   - Detailed configuration for each agent

3. **`~/.codex/instructions.md`** (Global)
   - Global instructions for SEMAD projects
   - Applied to all Codex sessions

4. **`~/.codex/config.toml`** (Global)
   - Codex CLI configuration
   - Model selection and approval policies

## Usage

### Activating Agents

Use natural language to activate specific agents (or the shorthand `/[agent]` form):

```bash
# Activate the dev agent
codex "activate dev agent"
codex "as dev agent, help me understand this code"
codex "/dev"

# Switch to QA agent
codex "switch to qa agent and review the implementation"
codex "/qa"

# Use Scrum Master agent
codex "use sm agent to create a new story"
codex "/sm"
```

After the greeting, keep the same Codex session open and issue `*` commands (for example, `codex "*help"` or `codex "*implement-next-story"`) without repeating the activation phrase. Automation runners stay enabled unless you pass `--manual` or export `SEMAD_AGENT_DISABLE_RUNNERS`.

### Executing Agent Commands

All agent commands use the `*` prefix:

```bash
# Dev agent commands
codex "as dev agent, execute *implement-next-story"
codex "activate dev agent and run *check-dependencies"

# QA agent commands
codex "use qa agent to *review"
codex "as qa agent, execute *analyze-code-quality"
```

### Workflow Examples

#### Complete Development Cycle

```bash
# 1. Create a story
codex "activate sm agent and create a story for user authentication"

# 2. Implement the story
codex "switch to dev agent and implement the story"

# 3. Review the implementation
codex "use qa agent to review the implementation"

# 4. Address feedback
codex "as dev agent, address the qa feedback"
```

#### Planning Phase

```bash
# Use analyst to gather requirements
codex "activate analyst agent and help me create a PRD"

# Create architecture
codex "switch to architect agent and design the system"

### Ad‑hoc Mode (Dev)

Use the Dev agent for one-off tasks that don’t require a story. Ad‑hoc mode loads baseline project files from `devLoadAlwaysFiles` but does not scan `docs/stories`.

Examples

```bash
# Quick refactor across specific files
codex "as dev agent, execute *adhoc 'Refactor utils naming' --paths src/utils/legacy.ts src/index.ts"

# Run an ad-hoc dependency impact check for a module
codex "as dev agent, execute *adhoc 'Assess impact of auth service changes' --paths src/services/auth.ts"

# Housekeeping without specific paths (skips impact analysis)
codex "as dev agent, execute *adhoc 'Repository housekeeping'"
```

### Ad‑hoc Debug Mode (Dev)

Use when you have a concrete error or failure to investigate and want a thorough, root‑cause oriented capture with artifacts.

Examples

```bash
# Minimal (interactive-style capture)
codex "as dev agent, execute *adhoc-debug 'Login 500 on /api/auth'"

# With scope, paths, git window, and a deterministic repro run with profiling
codex "as dev agent, execute *adhoc-debug 'User deletion fails intermittently' --scope backend --paths src/api/users.ts src/services/user.ts --since origin/main --repro 'npm test -- users.spec.ts -t \"deletes user\"' --runs 25 --profile cpu,heap --nettrace --audit --dbcheck --ci"

# Custom output directory
codex "as dev agent, execute *adhoc-debug 'Payment timeout' --output .ai/adhoc/debug/payment-timeout"
```

Artifacts
- Summary at `.ai/adhoc/debug/<timestamp>/summary.md`
- Structured findings at `.ai/adhoc/debug/<timestamp>/findings.json`
- Evidence bundle under `logs/`, `reports/`, `profiles/`

Verification
- Check `.ai/history/dev_log.jsonl` for “Ad-hoc task started/completed”.
- Check `.ai/adhoc/` for the generated report, which includes a “Baseline Context (devLoadAlwaysFiles)” section.

Notes
- Always activate: start commands with “as dev agent …”.
- The Dev agent respects `semad-core/core-config.yaml` (e.g., `devStartup: idle`, `devLoadAlwaysFiles`, `devStoryLocation`).

### Natural Language Commands

You can omit the star command and just describe your intent; the CLI shim maps common phrases to commands using an intent manifest:

```bash
# Equivalent to: /dev *help
node tools/agent.js "/dev help"

# Equivalent to: /dev *implement-next-story
node tools/agent.js "/dev implement next story"

# Equivalent to: /dev *adhoc-debug "<error>"
node tools/agent.js "/dev debug 'Checkout timeout'"
```

Behind the scenes, `semad-core/agents/intent-manifest.json` defines alias → command mappings per agent. Update it to add your own phrases.

### Verify Installation

Run after installation to confirm all required files are present:

```bash
npm run install:semad && npm run install:verify
```
```

## Configuration

### Model Selection

Edit `~/.codex/config.toml` to change the model:

```toml
model = "o4-mini"  # Options: o4-mini, o3, gpt-4.1
```

### Approval Policy

Configure how much autonomy Codex has:

```toml
approval_policy = "auto-edit"  # Options: suggest, auto-edit, full-auto
```

### Sandbox Settings

Control execution environment:

```toml
sandbox = "directory"  # Options: none, directory, network-disabled
```

### Manual Simulation Mode

When you prefer the LLM to impersonate agents without invoking local automation scripts (for example, to keep `/dev *devx3` fully conversational), either pass `--manual` on the command or set the environment variable `SEMAD_AGENT_DISABLE_RUNNERS` to `1` (or `SEMAD_AGENT_SIM_MODE` to `manual`). This disables Node runner hand-offs and prompts the agent to reason through the workflow instead of spawning scripts.

```bash
# Inside Codex (no shell export needed)
codex "as dev agent, *devx3 --manual docs/stories/story.md"

# Temporarily disable runners for the current Codex session
export SEMAD_AGENT_DISABLE_RUNNERS=1

# Re-enable automation when you want the Node helpers back
unset SEMAD_AGENT_DISABLE_RUNNERS
```

The guard applies to Dev-focused commands (`*devx3`, `*implement-next-story`, `*develop-story`, `*adhoc`, etc.) and ensures the LLM owns the entire interaction. Leave the flag off (and the variable unset or set to `0`) to let the CLI run the Node-based helpers as before. With automation enabled, `/dev *devx3` now delegates to `tools/dev-x3.js`, which orchestrates up to three Dev agent passes, logs results to `.ai/dev/devx3-<story>.json`, enforces green story-scoped tests, and refuses to finish while acceptance checklist items remain unresolved.

## How It Works

1. **AGENTS.md Discovery**: Codex automatically reads `AGENTS.md` files in your project
2. **Agent Activation**: Natural language triggers agent persona changes
3. **Context Preservation**: Agent state and progress tracked in `.ai/` directory
4. **StoryContract Compliance**: Agents follow structured specifications in story files
5. **Workflow Execution**: Multi-step workflows execute with proper handoffs

## Best Practices

1. **Clear Activation**: Always explicitly activate agents before giving commands
2. **Use Commands**: Leverage agent-specific commands with `*` prefix
3. **Check Progress**: Review `.ai/` directory for task tracking
4. **Follow Workflows**: Use the structured SM→Dev→QA workflow for best results

## Advantages Over Other Integrations

- **Terminal-Native**: No need to switch to IDE or web interface
- **Privacy**: Code stays local, never leaves your machine
- **Speed**: Uses fast models like o4-mini by default
- **Flexibility**: Natural language interface allows creative agent usage
- **Multimodal**: Can pass screenshots or diagrams along with text

## Troubleshooting

### Codex Can't Find Agents

Ensure `AGENTS.md` exists in your project root:
```bash
ls -la AGENTS.md
```

### Agent Not Activating

Use explicit activation phrases:
- "activate [agent] agent"
- "as [agent] agent"
- "switch to [agent] agent"

### Commands Not Working

Ensure you're using the `*` prefix for agent commands:
```bash
codex "as dev agent, *help"  # Correct
codex "as dev agent, help"   # May not trigger command
```

## Model Costs

Codex CLI uses OpenAI's reasoning models. Default is `o4-mini` for cost efficiency:
- o4-mini: Fastest and most economical
- o3: More capable but slower
- gpt-4.1: Most capable but higher cost

## Security Notes

- Code remains local unless explicitly shared
- Use sandbox settings to control file system access
- Review approval_policy settings for your security needs

## Future Enhancements

- Deep integration with StoryContract validation
- Automatic progress synchronization
- Multi-agent orchestration support
- Visual workflow tracking

## Support

For issues or questions:
- SEMAD-METHOD: [GitHub Issues](https://github.com/your-repo/semad-method/issues)
- OpenAI Codex CLI: [OpenAI Support](https://help.openai.com)

## Traceability Gate (PRD → Epic → Story)

- Maintain `docs/coverage.md` as the one-page PRD coverage matrix.
- Use templates in `docs/templates/` to include PRD IDs and architecture refs in Epic/Story contracts.
- Validate alignment before planning/merges:
  - `node tools/workflow-orchestrator.js reverse-align`
  - `/qa *validate-docs-code-alignment`
- Apply checklists in `docs/checklists/` and the gate guide `docs/gates/prd-coverage-gate.md`.

## Templates and Touchpoints

- EpicContract template: `docs/templates/epic-contract-template.md`
- StoryContract template: `docs/templates/story-contract-template.yaml`
- Workflow touchpoints: `docs/workflow-touchpoints.md`

## Brownfield PM Workflow (CLI)

Recommended sequence for existing systems with small-to-medium enhancements:

```bash
# 1) Create a Brownfield PRD and run integration readiness
codex "as pm agent, *create-brownfield-prd"
# Follow the PM Integration Readiness checklist (contracts, SourceRef, ECM, rollout)

# 2) Create the epic with incremental slicing scaffolding
codex "as pm agent, *create-epic"

# 3) Validate ECM and the EpicContract before SM handoff
node tools/ecm-validate.js docs/epics/<your-epic>.md
npm run validate:epic -- docs/epics/<your-epic>.md

# 4) Validate feature coverage (target 100%)
codex "as pm agent, *validate-feature-coverage --threshold 100 --report .ai/reports/feature-coverage.json"
```

Notes
- The EpicContract must include `integrationPoints` with `ownerTeam`, `contract`, and `sourceRef` per INT.
- ECM must reach 100% coverage of REQ-* and INT-*, validated via `tools/ecm-validate.js`.
- Slicing pattern: Story 0 (flag), Story 1 (probe/contract tests), then one INT × one flow per story.

Use the Scrum Master agent to create stories that reference EpicContract IDs (`epicId`, `REQ-*`, `FLOW-*`, `INT-*`) and have QA validate traceability via reverse-alignment before closing the epic.

## Dev↔QA Orchestration (Loop)

Automate Dev→QA→Dev until QA sets the story Status to "Done".

Prerequisites
- Install Codex CLI: `npm install -g @openai/codex`

Run
```bash
# Accepts a story id (e.g., 1.3) or a story file path
npm run devqa:loop:codex -- -s docs/stories/1.3-some-story.md
# or
npm run devqa:loop:codex -- -s 1.3
```

What it does
- Dev: `codex "as dev agent, execute *develop-story @<story>"`
- QA: `codex "as qa agent, execute *review @<story>"`
- Dev: `codex "as dev agent, execute *address-qa-feedback @<story>"`
- Repeats until the story’s `## Status` equals `Done`.

### `*address-qa-feedback` quick reference
- Reads the story’s QA Results section, saves `.ai/qa_findings.json`, and regenerates `.ai/qa_fixes_checklist.json` via `QAFixTracker`.
- Runs dependency impact analysis for all files mentioned in QA findings or the StoryContract and stores `.ai/dependency_analysis_qa.json` and `.ai/dependency_impact_report_qa.md`.
- Marks fixes complete with `--complete <fixId[:note]>` flags (repeatable). Completion metadata is written back to the checklist and `.ai/qa_fix_report.json`.
- Re-runs tests (`npm test -- --runInBand` by default). Override with `--test-command "<cmd>"` or skip explicitly using `--skip-tests`.
- When every fix is recorded and tests pass, automatically updates the story’s `## Status`, `## Completion Notes`, and `## Change Log` sections with a fix summary and pointers to the generated report.

Example invocations:
```
codex "as dev agent, execute *address-qa-feedback @docs/stories/story-42.md"
codex "as dev agent, execute *address-qa-feedback @42 --complete critical-1:added-regression-test"
codex "as dev agent, execute *address-qa-feedback --story docs/stories/story-42.md --skip-tests"
```

If any fixes remain pending or tests fail, the command exits with a non-zero status and lists the outstanding work instead of hallucinating completion.

Notes
- QA agents must update the story’s `## Status` header to `Done` when ready.
- Logs and artifacts are in `.ai/`.
