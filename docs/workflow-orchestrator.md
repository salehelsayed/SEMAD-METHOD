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