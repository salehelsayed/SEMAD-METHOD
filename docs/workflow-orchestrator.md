# BMad Workflow Orchestrator

The BMad Workflow Orchestrator provides flexible execution modes for the Dev→QA workflow, allowing teams to choose between linear and iterative development flows.

## Overview

The orchestrator offers two primary workflow modes:

1. **Linear Dev→QA Flow**: Traditional single-pass development where Dev implements once and QA reviews once
2. **Iterative Dev↔QA Flow**: Continuous loop where Dev and QA iterate until the implementation is approved

## Installation

The orchestrator is included with BMad Method and accessible via npm scripts or directly:

```bash
# Via npm script
npm run orchestrate

# Direct execution
node tools/workflow-orchestrator.js run

# Check status
npm run orchestrate:status
```

## Usage

### Running a Workflow

```bash
# Interactive mode - prompts for flow type selection
npm run orchestrate

# Specify flow type directly
npm run orchestrate -- --flow-type iterative

# Run with a specific story file
npm run orchestrate -- --story-file stories/feature-xyz.md --flow-type linear
```

### Command Line Options

- `--story-file <path>`: Path to the story file to implement
- `--story-id <id>`: Unique identifier for the story
- `--story-name <name>`: Human-readable story name
- `--flow-type <type>`: Workflow type (`linear` or `iterative`)
- `--directory <path>`: Project root directory (defaults to current directory)

### Reverse-Alignment Utilities

The orchestrator exposes helper commands for reverse-alignment workflows:

```bash
# Shard PRD and Architecture into component files (PO intent)
bmad-orchestrator po-shard-docs

# Full reverse-alignment pipeline (includes sharding when enabled)
bmad-orchestrator reverse-align

# Validate enriched docs and coverage (supports threshold)
bmad-orchestrator reverse-quality-gate --threshold 0.9

# Validate an EpicContract file (PO/PM shortcut)
bmad-orchestrator validate-epic docs/prd/epics/epic-5.md
```

- `po-shard-docs`: Splits `docs/prd/PRD.md` and `docs/architecture/architecture.md` by H2 sections when sharding is enabled in `bmad-core/core-config.yaml`, and writes per-epic summaries under `docs/prd/epics/epic-*.md`.
- `reverse-align`: Runs cleanup → analyze → rewrite → shard → recreate stories → validate → report → manifest.
- `reverse-quality-gate`: Emits `.ai/reports/reverse-align-gate.json` and fails if coverage is below the threshold.
- `validate-epic <path>`: Runs the EpicContract validator and emits a PO report in `.ai/adhoc/*` and a JSON artifact in `.ai/reports/*`.

### Story Consistency & QA Findings
- Story creation uses a deterministic structure aligned with the project story template (StoryContract as the single source of truth at the top).
- QA reviews append findings into the same story file under `## QA Findings` (no new files created), including approval status, coverage, and issue list per iteration.

### Configuration

The orchestrator persists metadata in `.bmad-orchestrator-metadata.json`:

```json
{
  "flowType": "iterative",
  "storyId": "STORY-001",
  "lastRun": "2024-01-15T10:30:00.000Z",
  "lastResult": {
    "success": true,
    "iterations": 3
  }
}
```

## Workflow Types

### Linear Dev→QA Flow

The traditional waterfall-style approach:

1. Dev implements the story
2. QA reviews the implementation
3. Process completes (with QA findings documented if any)

**Use when:**
- Requirements are well-defined and stable
- Implementation is straightforward
- Quick turnaround is needed
- Proof of concepts or prototypes

### Iterative Dev↔QA Flow

The agile feedback loop approach:

1. Dev implements the story
2. QA reviews and provides feedback
3. If issues found, Dev addresses them (loop back to step 2)
4. Process continues until QA approves or max iterations reached

**Use when:**
- Complex features requiring refinement
- High quality standards are critical
- Requirements may evolve during development
- Production-ready code is needed

## Integration with BMad Agents

The orchestrator integrates with BMad's agent system:

### Simulation Mode
By default, the orchestrator runs in simulation mode for testing and demonstration. Agent work is simulated with realistic delays and probabilistic outcomes.

### Production Mode
To integrate with actual agents, provide callbacks in the configuration:

```javascript
const orchestrator = new WorkflowOrchestrator(rootDir);
orchestrator.callbacks = {
  dev: async (step, context) => {
    // Call actual dev agent
    return await devAgent.execute(context);
  },
  qa: async (step, context) => {
    // Call actual QA agent
    return await qaAgent.execute(context);
  }
};
```

## Workflow Configuration

Workflows are defined in YAML files under `bmad-core/workflows/`. The orchestrator automatically detects Dev→QA workflows by looking for:

- Dev agent with `implement_story` action or `implementation_files` output
- QA agent with `review_implementation` or `review_story` action

Example workflow structure:

```yaml
workflow:
  id: dev-qa-example
  name: Development with QA Review
  sequence:
    - agent: dev
      action: implement_story
      creates: implementation_files
    
    - agent: qa
      action: review_implementation
      requires: implementation_files
```

## Best Practices

1. **Choose the Right Flow**
   - Use linear for simple, well-defined tasks
   - Use iterative for complex features or critical implementations

2. **Set Iteration Limits**
   - Default max iterations is 5
   - Orchestrator prompts to continue after reaching the limit
   - Consider project deadlines when allowing extended iterations

3. **Monitor Progress**
   - Use `orchestrate:status` to check current state
   - Review metadata file for historical performance
   - Track iteration counts to identify process bottlenecks

4. **Integration Tips**
   - Start with simulation mode to validate workflow
   - Gradually integrate real agents
   - Maintain clear story files with acceptance criteria

## Troubleshooting

### Common Issues

1. **Workflow Not Found**
   - Ensure workflow YAML files exist in `bmad-core/workflows/`
   - Check file naming matches workflow ID

2. **Metadata Persistence Issues**
   - Verify write permissions in project directory
   - Check `.bmad-orchestrator-metadata.json` is not corrupted

3. **Agent Integration Failures**
   - Confirm agent callbacks are properly configured
   - Check agent dependencies are installed
   - Review error logs for specific failure details

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
DEBUG=bmad:* npm run orchestrate
```

## Examples

### Example 1: Simple Feature Implementation

```bash
# Linear flow for a straightforward feature
npm run orchestrate -- \
  --story-file stories/add-user-profile.md \
  --flow-type linear \
  --story-id FEAT-001
```

### Example 2: Complex Feature with Iterations

```bash
# Iterative flow for a complex authentication system
npm run orchestrate -- \
  --story-file stories/oauth-integration.md \
  --flow-type iterative \
  --story-id FEAT-002
```

### Example 3: Checking Workflow Status

```bash
# View current orchestrator state
npm run orchestrate:status

# Output:
# 🎼 Orchestrator Status
# 
# Flow Type: iterative
# Last Story ID: FEAT-002
# Last Run: 2024-01-15T14:30:00.000Z
# Last Result: Success
# Iterations: 3
```

## API Reference

### WorkflowOrchestrator Class

```javascript
const orchestrator = new WorkflowOrchestrator(rootDir);

// Methods
orchestrator.run(options)           // Execute workflow
orchestrator.loadMetadata()         // Load saved metadata
orchestrator.saveMetadata(data)     // Persist metadata
orchestrator.selectFlowType()       // Interactive flow selection
```

## Reverse Alignment Commands

Use the orchestrator to align documentation and stories to the codebase:

```bash
# Full pipeline
node tools/workflow-orchestrator.js reverse-align

# Individual steps
node tools/workflow-orchestrator.js cleanup-docs
node tools/workflow-orchestrator.js analyst-analyze
node tools/workflow-orchestrator.js architect-rewrite
node tools/workflow-orchestrator.js pm-update-prd
node tools/workflow-orchestrator.js sm-recreate-stories
node tools/workflow-orchestrator.js validate-story-consistency
node tools/workflow-orchestrator.js qa-validate-alignment
node tools/workflow-orchestrator.js generate-alignment-report
node tools/workflow-orchestrator.js create-documentation-manifest
```

Validation helpers:

```bash
npm run preflight:schema
npm run reference:check
npm run gates:status
```

See the full guide: `docs/reverse-alignment.md`.

### Options Object

```javascript
{
  storyFile: string,    // Path to story file
  storyId: string,      // Story identifier
  storyName: string,    // Story display name
  flowType: string,     // 'linear' or 'iterative'
  directory: string     // Project root directory
}
```

## Contributing

When extending the orchestrator:

1. Maintain backward compatibility
2. Update tests for new features
3. Document configuration changes
4. Follow BMad coding standards

## Related Documentation

- [BMad Workflows Guide](../bmad-core/docs/workflows.md)
- [Agent Development Guide](../bmad-core/docs/agents.md)
- [Story Contract Specification](../bmad-core/docs/story-contract.md)

## Task Bundle Lifecycle

Task bundles provide deterministic context assembly for story execution:

### Bundle Creation
1. Run `npm run context:bundle -- <storyId>` to create a bundle
2. Bundle includes:
   - Linked artifacts (PRD, Architecture, etc.) with versions and checksums
   - Files to be modified with current checksums
   - Related test files
   - Overall bundle checksum

### Bundle Invalidation
Bundles are automatically invalidated when:
- Any linked artifact version changes
- File checksums don't match
- New dependencies are added to the story

### Bundle Usage
1. Dev agents read bundles to understand context
2. QA agents verify bundle completeness
3. Orchestrator gates check bundle validity

### Commands
- `npm run context:index` - Build artifact index
- `npm run context:bundle -- <storyId>` - Create/update task bundle


## Orchestrator Gates

Gates enforce quality checks at each workflow transition:

### Gate Types
1. **Planning → Development Gate**
   - Validates brief, PRD, and architecture schemas
   - Ensures version alignment
   - Checks completeness of planning artifacts

2. **Dev → QA Gate**
   - Runs preflight:all checks
   - Validates patch plan existence and signature
   - Ensures grounding of all changes

3. **QA → Done Gate**
   - Verifies acceptance test results
   - Checks post-conditions from story contract
   - Validates coverage requirements

### Gate Configuration
Gates are configured in `orchestrator-config-example.js` with hooks for:
- Before phase transition
- On gate failure
- Custom validation logic

### Failure Handling
When a gate fails:
1. Clear error message with actionable items
2. Workflow halts at current phase
3. Failure logged to `.ai/gates/failures.log`
4. Optional notifications sent

### CLI Usage
```bash
# Check specific gates
node tools/orchestrator/gates.js planning
node tools/orchestrator/gates.js dev STORY-123
node tools/orchestrator/gates.js qa STORY-123
```
