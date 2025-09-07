# SEMAD-METHOD Agent CLI Usage Guide

## Overview

The SEMAD-METHOD framework provides a unified CLI interface to invoke all agent commands through `node tools/agent.js`. This allows for both interactive and non-interactive execution of agent tasks.

## Basic Syntax

```bash
node tools/agent.js "/<agent> *<command> [args...]"
```

## Supported Agents

- **dev** - Developer agent for implementation tasks
- **qa** - Quality assurance agent for testing and validation
- **pm** - Product manager agent for requirements and PRDs
- **sm** - Scrum master agent for story creation and management
- **analyst** - Business analyst agent for analysis and research
- **architect** - System architect agent for architecture documentation
- **orchestrator** - Workflow orchestrator for coordinating agents

## Agent Commands

### Developer Agent (`/dev`)

```bash
# Implement the next story in the backlog
node tools/agent.js "/dev *implement-next-story"

# Develop a specific story
node tools/agent.js "/dev *develop-story docs/stories/story-1.md"

# Address QA feedback
node tools/agent.js "/dev *address-qa-feedback"

# Run tests
node tools/agent.js "/dev *run-tests"

# Ad-hoc development tasks
node tools/agent.js "/dev *adhoc 'Refactor authentication module' --paths src/auth"

# Debug with evidence bundle
node tools/agent.js "/dev *adhoc-debug 'Login fails intermittently'"
```

### QA Agent (`/qa`)

```bash
# Review a story implementation
node tools/agent.js "/qa *review docs/stories/story-1.md"

# Analyze code quality
node tools/agent.js "/qa *analyze-code-quality"

# Generate coverage report
node tools/agent.js "/qa *generate-coverage-report"

# Validate docs/code alignment
node tools/agent.js "/qa *validate-docs-code-alignment"

# Validate brownfield integration safety (INT stories)
node tools/agent.js "/qa *validate-integration-safety"

# Normalize QA outputs to .ai/reports/qa
node tools/agent.js "/qa *normalize-reports"

# Generate precise cleanup stories from QA reports
node tools/agent.js "/qa *generate-cleanup-stories --from .ai/reports/qa/cleanup-orphans-<ts>.json"
```

### Product Manager Agent (`/pm`)

```bash
# Create a new PRD
node tools/agent.js "/pm *create-prd"

# Create a brownfield PRD (for existing projects)
node tools/agent.js "/pm *create-brownfield-prd"

# Create a brownfield epic (includes incremental slicing guidance)
node tools/agent.js "/pm *create-epic"

# Update PRD from implementation
node tools/agent.js "/pm *update-prd-from-implementation"

# Document missing requirements
node tools/agent.js "/pm *document-missing-requirements"

# Validate an epic
node tools/agent.js "/pm *validate-epic docs/prd/epics/epic-1.md"

# Validate feature coverage (target 100%)
node tools/agent.js "/pm *validate-feature-coverage --threshold 100 --report .ai/reports/feature-coverage.json"
```

### Scrum Master Agent (`/sm`)

```bash
# Create the next story
node tools/agent.js "/sm *create-story"

# Ad‑hoc (independent story, no PRD/Epic link)
node tools/agent.js "/sm *create-story --adhoc"

# Run story quality checklist
node tools/agent.js "/sm *story-checklist"

# Course correction
node tools/agent.js "/sm *correct-course"

# Recreate stories from code (reverse engineering)
node tools/agent.js "/sm *recreate-stories-from-code"

# Update story templates
node tools/agent.js "/sm *update-story-templates"
```

### Analyst Agent (`/analyst`)

```bash
# Create project brief
node tools/agent.js "/analyst *create-project-brief"

# Perform market research
node tools/agent.js "/analyst *perform-market-research"

# Create competitor analysis
node tools/agent.js "/analyst *create-competitor-analysis"

# Analyze codebase changes
node tools/agent.js "/analyst *analyze-codebase-changes"

# Extract implemented features
node tools/agent.js "/analyst *extract-implemented-features"
```

### Architect Agent (`/architect`)

```bash
# Create full-stack architecture doc
node tools/agent.js "/architect *create-full-stack-architecture"

# Create backend architecture doc
node tools/agent.js "/architect *create-backend-architecture"

# Create frontend architecture doc
node tools/agent.js "/architect *create-front-end-architecture"

# Reverse engineer existing architecture
node tools/agent.js "/architect *reverse-engineer-architecture"

# Document design decisions
node tools/agent.js "/architect *document-design-decisions"
```

### Orchestrator Agent (`/orchestrator`)

```bash
# Reverse align documentation with code
node tools/agent.js "/orchestrator *reverse-align"

# Refresh command manifest
node tools/agent.js "/orchestrator *refresh-manifest"

# Generate stories
node tools/agent.js "/orchestrator *generate-stories"

# Run quality gates
node tools/agent.js "/orchestrator *reverse-quality-gate"

# Create documentation manifest
node tools/agent.js "/orchestrator *create-documentation-manifest"
```

## ECM Utilities (Helpers)

```bash
# Auto-assign Story IDs to ECM rows in an EpicContract
node tools/ecm-assign-story-ids.js docs/epics/<epic>.md --storiesDir docs/stories
```

## Natural Language Support

The CLI also supports natural language commands that are automatically mapped to the appropriate agent commands:

```bash
# These natural language commands work
node tools/agent.js "/dev implement next story"
node tools/agent.js "/qa review"
node tools/agent.js "/dev help"
node tools/agent.js "/sm create story"
```

## Getting Help

To see available commands for any agent:

```bash
node tools/agent.js "/<agent> *help"

# Examples:
node tools/agent.js "/dev *help"
node tools/agent.js "/qa *help"
node tools/agent.js "/sm *help"
```

## Non-Interactive Execution

For fully automated workflows, you can chain commands and pipe output:

```bash
# Run QA review and capture output
node tools/agent.js "/qa *review docs/stories/story-1.md" > qa-report.txt

# Chain multiple commands
node tools/agent.js "/dev *implement-next-story" && \
node tools/agent.js "/dev *run-tests" && \
node tools/agent.js "/qa *review"

# Use in CI/CD pipelines
if node tools/agent.js "/qa *analyze-code-quality"; then
  echo "Code quality check passed"
else
  echo "Code quality issues found"
  exit 1
fi
```

## Environment Variables

You can configure agent behavior with environment variables:

```bash
# Run in non-interactive mode
# Note: elicit steps are enforced by default. To allow bypass
# in headless CI, the caller must explicitly set context
# to { allowMissingUserInput: true, agentPolicy: 'override' }.
BMAD_NON_INTERACTIVE=true node tools/agent.js "/dev *implement-next-story"

# Specify story path
BMAD_STORY_PATH="docs/stories/story-1.md" node tools/agent.js "/qa *review"

# Enable verbose output
BMAD_VERBOSE=true node tools/agent.js "/dev *adhoc 'Debug issue'"
```

## Integration with Claude CLI

To use SEMAD agents with Claude CLI or similar AI assistants:

```bash
# Example: Have Claude use SEMAD to review a story
claude -p "Please use the SEMAD QA agent to review the story at docs/stories/story-1.md" \
  --allowedTools "Bash" \
  --bashCommand "node tools/agent.js '/qa *review docs/stories/story-1.md'"

# Example: Generate architecture documentation
claude -p "Create backend architecture documentation using SEMAD" \
  --allowedTools "Bash" \
  --bashCommand "node tools/agent.js '/architect *create-backend-architecture'"
```

## Implementation Status

### Fully Implemented
- ✅ All `/dev` commands
- ✅ All `/qa` commands  
- ✅ Core `/sm` commands
- ✅ `/pm *validate-epic`
- ✅ All `/orchestrator` commands
- ✅ Natural language mapping
- ✅ Help system

### Using Task Runner Fallback
- ⚠️ Some `/pm` commands
- ⚠️ Some `/sm` commands
- ⚠️ All `/analyst` commands
- ⚠️ All `/architect` commands

These commands route to the task-runner.js with appropriate flags and may require additional implementation for full functionality.

## Troubleshooting

If a command fails with "Unsupported routing", try:

1. Check the command spelling: `node tools/agent.js "/<agent> *help"`
2. Verify the agent name is correct (lowercase)
3. Ensure the command starts with `*`
4. Check if required files exist in bmad-core/structured-tasks/

## Examples

### Complete Development Workflow

```bash
# 1. Create a new story
node tools/agent.js "/sm *create-story"

# 2. Implement the story
node tools/agent.js "/dev *implement-next-story"

# 3. Run tests
node tools/agent.js "/dev *run-tests"

# 4. QA review
node tools/agent.js "/qa *review"

# 5. Address any feedback
node tools/agent.js "/dev *address-qa-feedback"

# 6. Final quality check
node tools/agent.js "/qa *analyze-code-quality"
```

### Reverse Engineering Workflow

```bash
# 1. Analyze existing codebase
node tools/agent.js "/analyst *analyze-codebase-changes"

# 2. Reverse engineer architecture
node tools/agent.js "/architect *reverse-engineer-architecture"

# 3. Update PRD from implementation
node tools/agent.js "/pm *update-prd-from-implementation"

# 4. Recreate stories from code
node tools/agent.js "/sm *recreate-stories-from-code"

# 5. Validate alignment
node tools/agent.js "/qa *validate-docs-code-alignment"
```

## Contributing

To add new agent commands:

1. Add the command to `bmad-core/agents/commands-manifest.json`
2. Create implementation in appropriate location
3. Add routing in `tools/agent.js`
4. Update natural language mappings in `bmad-core/agents/intent-manifest.json`
5. Test the command: `node tools/agent.js "/<agent> *<command>"`
