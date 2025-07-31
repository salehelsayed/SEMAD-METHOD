# Elicit Flag Usage Guidelines

## Overview
The `elicit` flag in YAML task definitions indicates whether an action requires user input or interaction during task execution.

## When to use `elicit: true`

Use `elicit: true` for actions that:

1. **Require user decisions or choices**
   - Prompting for which story to work on
   - Asking for confirmation to override warnings
   - Selecting between multiple options

2. **Need user input or data**
   - Gathering information not available in the system
   - Requesting specific values or configurations
   - Collecting feedback or preferences

3. **Execute validation tasks that may require intervention**
   - Running validation commands that could fail and need user resolution
   - Executing checklists that might need user review

4. **Present critical warnings requiring acknowledgment**
   - Alerting about incomplete stories
   - Warning about potential risks or conflicts

## When to use `elicit: false`

Use `elicit: false` (the default) for actions that:

1. **Are purely informational**
   - Displaying status messages
   - Showing progress updates
   - Logging execution steps

2. **Perform automated operations**
   - Reading files
   - Processing data
   - Generating content based on existing information

3. **Execute internal logic**
   - Making calculations
   - Following predefined rules
   - Applying transformations

4. **Provide instructions or notes**
   - CRITICAL warnings that are informational only
   - Implementation notes
   - Technical guidelines

## Examples

### Correct usage of `elicit: true`:
```yaml
- description: 'If epic is complete, prompt user: "Epic {epicNum} Complete: Would you like to: 1) Begin next epic 2) Select specific story"'
  elicit: true  # User must make a choice

- description: Execute task `validate-story-contract` with storyFilePath
  elicit: true  # Validation may fail and require user intervention
```

### Correct usage of `elicit: false`:
```yaml
- description: Load `{root}/core-config.yaml` from the project root
  elicit: false  # Automated file reading

- description: Generate detailed list of technical tasks based on requirements
  elicit: false  # Automated content generation

- description: '**CRITICAL**: NEVER automatically skip to another epic'
  elicit: false  # Informational note/instruction
```

## Best Practices

1. **Be consistent** - Similar actions across different tasks should have the same elicit value
2. **Default to false** - Only use `elicit: true` when user interaction is genuinely required
3. **Consider the context** - Think about whether the task runner can proceed without user input
4. **Document the expectation** - Make it clear in the description what kind of input is expected when using `elicit: true`