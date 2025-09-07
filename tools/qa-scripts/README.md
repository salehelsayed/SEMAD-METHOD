# QA Review Scripts

These scripts provide automated and semi-automated QA review capabilities using Claude CLI.

## Prerequisites

- Claude CLI installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- Run `claude` once to authenticate with `/login`

## Available Scripts

### 1. Automated QA Review (`qa-auto-review.sh`)

Fully automated QA review that runs all checks and updates story status.

**Usage:**
```bash
npm run qa:auto docs/stories/story-0.1-emergency-security-fixes.md
# or directly:
./tools/qa-scripts/qa-auto-review.sh docs/stories/story-0.1-emergency-security-fixes.md
```

**Features:**
- Animated spinner while Claude processes
- Automatic status updates (In QA → QA Approved/Failed)
- Adds timestamped review entries to story
- Handles multiple review rounds
- Shows clear decision with blocking issues

### 2. Manual QA with Workflow Guidance (`qa-manual-with-workflow.sh`)

Provides step-by-step Claude commands based on actual QA agent workflow.

**Usage:**
```bash
npm run qa:manual docs/stories/story-0.1-emergency-security-fixes.md
# or directly:
./tools/qa-scripts/qa-manual-with-workflow.sh docs/stories/story-0.1-emergency-security-fixes.md
```

**Features:**
- Shows exact prompts from QA agent workflow
- Copy/paste Claude commands to run manually
- Full control over each step
- Based on `review-story.yaml` workflow

## How It Works

1. **Status Update**: Sets story status to "In QA"
2. **Acceptance Criteria Check**: Verifies all requirements are met
3. **Security Review**: Checks security issues are addressed
4. **Final Decision**: Determines pass/fail based on findings
5. **Results Recording**: Adds QA results to story file

## Benefits Over Agent System

- **No TTY Issues**: Claude runs directly in terminal (instant responses)
- **Visual Feedback**: Progress spinners show activity
- **Clean Output**: Structured, readable results
- **Multiple Rounds**: Handles repeated reviews without duplication
- **DEV Agent Compatible**: Updates status in correct location

## Troubleshooting

If Claude times out:
- Check Claude CLI is authenticated: `claude -p "test"`
- Simplify story files (very large stories may timeout)
- Use manual script for more control

## Environment Variables

- `CLAUDE_TIMEOUT`: Override default timeout (milliseconds)
  ```bash
  CLAUDE_TIMEOUT=120000 npm run qa:auto story.md
  ```