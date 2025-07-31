# Dev↔QA Flow Options

## Overview

The BMad Method now supports two different workflow flow types for the development and QA phases:

1. **Linear Dev→QA Flow** (Default): The traditional approach where Dev implements once and QA reviews once
2. **Iterative Dev↔QA Flow**: A new approach where Dev and QA iterate until the story is approved

## Flow Types

### Linear Flow (Dev→QA)

In the linear flow:
- Dev agent implements the story completely
- QA agent reviews the implementation once
- If QA finds issues, they are documented but not automatically fixed
- This is the existing behavior and remains the default

```
SM → Dev (implement) → QA (review) → Done
```

### Iterative Flow (Dev↔QA)

In the iterative flow:
- Dev agent implements the story
- QA agent reviews the implementation
- If QA finds issues, control returns to Dev
- Dev addresses the QA feedback
- This cycle continues until QA approves
- Maximum iterations can be configured (default: 5)

```
SM → Dev (implement) → QA (review) ↗
      ↖ Dev (fix) ← QA (issues found) ↙
```

## Usage

### Command Line Interface

#### Using the Orchestrator

```bash
# Run with interactive flow selection
npm run orchestrate

# Run with specific flow type
npm run orchestrate -- --flow-type iterative

# Run with verbose output (normal level)
npm run orchestrate -- --verbose normal

# Run with detailed verbose output
npm run orchestrate -- --verbose detailed

# Run with minimal output
npm run orchestrate -- --verbose minimal

# Disable verbose output entirely
npm run orchestrate -- --no-verbose

# Check orchestrator status
npm run orchestrate:status
```

#### Direct CLI Usage

```bash
# Run orchestrator for a specific story
npx bmad-orchestrator run --story-file story.md --flow-type iterative

# Run with story metadata
npx bmad-orchestrator run --story-id PROJ-001 --story-name "Add user authentication" --flow-type linear

# Run with verbose logging enabled
npx bmad-orchestrator run --story-file story.md --verbose detailed

# Run with verbose logging disabled
npx bmad-orchestrator run --story-file story.md --no-verbose

# Check current status
npx bmad-orchestrator status
```

### Configuration

You can configure the workflow behavior using a configuration file. Create a `.bmad-workflow.yaml` or `.bmad-workflow.json` file in your project root:

#### YAML Configuration

```yaml
# .bmad-workflow.yaml
flowType: iterative  # or 'linear'
maxIterations: 5
autoApproveOnNoIssues: true
persistIterationHistory: true
notifyOnIterationComplete: false

qaReviewCriteria:
  checkCodeStyle: true
  checkTestCoverage: true
  checkDocumentation: true
  checkPerformance: false
  checkSecurity: false

devFixStrategy: fix-all  # or 'fix-critical', 'fix-by-priority'

# Verbosity settings (new)
verbosity: true  # Enable/disable verbose logging
verbosityLevel: normal  # 'minimal', 'normal', or 'detailed'
```

#### JSON Configuration

```json
{
  "flowType": "iterative",
  "maxIterations": 5,
  "autoApproveOnNoIssues": true,
  "persistIterationHistory": true,
  "qaReviewCriteria": {
    "checkCodeStyle": true,
    "checkTestCoverage": true,
    "checkDocumentation": true
  },
  "verbosity": true,
  "verbosityLevel": "normal"
}
```

### Programmatic Usage

```javascript
const WorkflowExecutor = require('bmad-method/bmad-core/utils/workflow-executor');

// Create executor with iterative flow
const executor = new WorkflowExecutor(rootDir, {
  flowType: 'iterative',
  maxIterations: 5,
  callbacks: {
    dev: async (step, context) => {
      // Custom dev implementation
    },
    qa: async (step, context) => {
      // Custom QA review
    },
    onMaxIterationsReached: async (iteration, issues) => {
      // Handle max iterations
      return confirm('Continue iterating?');
    }
  }
});

// Execute workflow
const result = await executor.execute('greenfield-fullstack', {
  storyId: 'PROJ-001',
  storyName: 'User Authentication'
});
```

## Metadata and State

The orchestrator maintains metadata about workflow execution in `.bmad-orchestrator-metadata.json`:

```json
{
  "flowType": "iterative",
  "storyId": "PROJ-001",
  "lastRun": "2024-01-20T10:30:00Z",
  "lastResult": {
    "success": true,
    "iterations": 3
  }
}
```

This metadata is used to:
- Remember the last selected flow type
- Track execution history
- Resume with the same settings

## Verbosity Configuration

The orchestrator now supports configurable verbosity levels to help users understand what's happening during workflow execution and debug issues.

### Verbosity Levels

1. **minimal**: Only critical messages
   - Errors and warnings
   - Major phase completions
   - Final results

2. **normal** (default): Major tasks and transitions
   - Phase starts and completions
   - Agent actions
   - Task starts and completions
   - Workflow transitions

3. **detailed**: All activities with context
   - Everything from normal level
   - Detailed context for each operation
   - Internal operations and simulations
   - File operations and configurations

### Configuration Methods

#### 1. Command Line
```bash
# Set verbosity level
npm run orchestrate -- --verbose detailed

# Disable verbosity
npm run orchestrate -- --no-verbose
```

#### 2. Configuration File
```yaml
# .bmad-workflow.yaml
verbosity: true
verbosityLevel: normal
```

#### 3. Environment Variable (Future)
```bash
BMAD_VERBOSITY=detailed npm run orchestrate
```

### Example Output

#### Minimal Level:
```
🎼 BMad Workflow Orchestrator
⚠️  Warning: Maximum iterations (5) reached
✅ Completed Dev↔QA Workflow
```

#### Normal Level:
```
🎼 [10:15:23] 🚀 Starting Dev↔QA Workflow
   Executing iterative flow for story: User Authentication

🎼 [10:15:24] 👨‍💻 dev agent: Starting story implementation
🎼 [10:15:26] ✓ Dev implementation complete
   3 files modified, 150 lines added, 5 tests added

🎼 [10:15:27] 🧪 qa agent: Starting implementation review
🎼 [10:15:29] ⚠️  QA review complete: 2 issues found

🎼 [10:15:30] 🔄 Iteration 2: Starting iteration
🎼 [10:15:31] 👨‍💻 dev agent: Implementing QA recommendations
```

#### Detailed Level:
```
🎼 [10:15:23] 📂 Loading core configuration...
   Path: /project/.bmad-workflow.yaml
🎼 [10:15:23] ✓ Loading core configuration completed
   Configuration loaded successfully

🎼 [10:15:23] 🚀 Starting Dev↔QA Workflow
   Executing iterative flow for story: User Authentication
   Context: {"storyId": "PROJ-001", "estimatedTime": "2 hours", "complexity": "medium"}

🎼 [10:15:24] 👨‍💻 dev agent: Starting story implementation
   Context: {"storyId": "PROJ-001"}
🎼 [10:15:24] 📋 Simulating dev agent work...
   Action: implement
```

## Best Practices

### When to Use Linear Flow

Use the linear flow when:
- You have experienced developers who rarely need revisions
- The story is well-defined with clear requirements
- Time constraints require a single-pass approach
- QA findings will be addressed in a separate story/sprint

### When to Use Iterative Flow

Use the iterative flow when:
- Quality is paramount and issues must be fixed immediately
- Working on critical features that need to be perfect
- Training junior developers who benefit from immediate feedback
- The team prefers continuous improvement within the same story

### Configuration Tips

1. **Max Iterations**: Set based on story complexity
   - Simple stories: 3-5 iterations
   - Complex stories: 5-10 iterations
   - Critical features: 10+ iterations

2. **QA Review Criteria**: Enable checks based on project needs
   - Always enable: `checkCodeStyle`, `checkTestCoverage`
   - For web apps: Enable `checkPerformance`
   - For APIs/backends: Enable `checkSecurity`

3. **Dev Fix Strategy**:
   - `fix-all`: Address all QA findings (recommended)
   - `fix-critical`: Only fix critical issues
   - `fix-by-priority`: Fix issues in priority order

## Integration with Existing Workflows

The flow type selection integrates seamlessly with existing BMad workflows:

1. All planning phases (Analyst, PM, Architect) remain unchanged
2. The flow type only affects the Dev↔QA interaction
3. Post-QA steps continue normally after approval
4. Story sharding and epic management work the same way

### When to Use Different Verbosity Levels

1. **Use `minimal` when**:
   - Running in CI/CD pipelines
   - Processing many stories in batch
   - Only interested in final results

2. **Use `normal` when**:
   - Daily development work
   - Want to understand workflow progress
   - Need to see what agents are doing

3. **Use `detailed` when**:
   - Debugging issues
   - Learning how the system works
   - Need full execution trace
   - Troubleshooting configuration problems

## Troubleshooting

### Common Issues

1. **Infinite loops**: If QA keeps finding issues
   - Check if requirements are clear
   - Review QA criteria configuration
   - Consider increasing max iterations

2. **Flow type not remembered**
   - Ensure `.bmad-orchestrator-metadata.json` is not in `.gitignore`
   - Check file permissions

3. **Configuration not loading**
   - Verify configuration file name and location
   - Check YAML/JSON syntax
   - Run with `--flow-type` to override

### Debug Mode

Set `DEBUG=bmad:*` to see detailed execution logs:

```bash
DEBUG=bmad:* npm run orchestrate
```

## Future Enhancements

Planned improvements for the Dev↔QA flow feature:

1. **Parallel QA**: Multiple QA agents reviewing different aspects
2. **Smart Iteration**: AI-powered decision on when to stop iterating
3. **Metrics Dashboard**: Track iteration patterns and improvement rates
4. **Custom Flow Types**: Define your own agent interaction patterns
5. **Webhook Integration**: Notify external systems on iteration events