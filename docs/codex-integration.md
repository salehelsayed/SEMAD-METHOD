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
npx bmad-method install
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
   - Global instructions for BMad projects
   - Applied to all Codex sessions

4. **`~/.codex/config.toml`** (Global)
   - Codex CLI configuration
   - Model selection and approval policies

## Usage

### Activating Agents

Use natural language to activate specific agents:

```bash
# Activate the dev agent
codex "activate dev agent"
codex "as dev agent, help me understand this code"

# Switch to QA agent
codex "switch to qa agent and review the implementation"

# Use Scrum Master agent
codex "use sm agent to create a new story"
```

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

Verification
- Check `.ai/history/dev_log.jsonl` for “Ad-hoc task started/completed”.
- Check `.ai/adhoc/` for the generated report, which includes a “Baseline Context (devLoadAlwaysFiles)” section.

Notes
- Always activate: start commands with “as dev agent …”.
- The Dev agent respects `bmad-core/core-config.yaml` (e.g., `devStartup: idle`, `devLoadAlwaysFiles`, `devStoryLocation`).
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

## Templates and Touchpoints

- EpicContract template: `docs/templates/epic-contract-template.md`
- StoryContract template: `docs/templates/story-contract-template.yaml`
- Workflow touchpoints: `docs/workflow-touchpoints.md`

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

Notes
- QA agents must update the story’s `## Status` header to `Done` when ready.
- Logs and artifacts are in `.ai/`.
