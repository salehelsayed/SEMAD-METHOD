# Elicit Flag Implementation Summary

## Overview
This document summarizes the implementation of the `elicit` flag functionality in the SEMAD-METHOD workflow system, which ensures that workflows requiring user input properly pause and wait for responses.

## Story Requirements (from story.md)
**User Story**: As a user interacting with any SEMAD workflow, I want the system to ask me for necessary information rather than skipping over prompts, so that my answers guide the agents and hallucination is minimized.

**Acceptance Criteria**:
1. ✅ For every structured task that involves user-specific details, actions that depend on user input are marked with `elicit: true`
2. ✅ The orchestrator respects the `elicit` flag across all workflows
3. ✅ User-driven questions are phrased clearly and cover all fields where agents would otherwise guess

## Implementation Details

### 1. YAML Files Audit (Completed)
- Created `scripts/audit-elicit-flags.js` to systematically review all YAML files in `bmad-core/structured-tasks/`
- Identified actions requiring user input based on keywords like "ask", "prompt", "choose", "verify", etc.
- Updated 14 files with appropriate `elicit: true` flags
- Created `scripts/review-elicit-changes.js` to fix false positives and ensure accuracy

### 2. Task Runner Enhancement (Completed)
Enhanced `tools/task-runner.js` with the following features:

#### New Methods:
- `getActionsRequiringInput(task)`: Identifies all actions in a task that have `elicit: true`
- `validateElicitRequirements(task, context)`: Validates that a userInputHandler is provided when needed

#### Modified Methods:
- `executeTask()`: Now checks elicit requirements before executing and returns early if user input is needed but no handler is provided
- `executeStepActions()`: Detects elicit actions, calls userInputHandler when available, and logs warnings when missing

#### Key Features:
- **Blocking Behavior**: Tasks with `elicit: true` actions will fail execution unless:
  - A `userInputHandler` is provided in the context, OR
  - `allowMissingUserInput: true` is set in the context
- **User Input Collection**: When a userInputHandler is provided, all elicit actions are collected and passed to the handler
- **Response Storage**: User responses are stored in `context.userResponses[stepId]` for later use

### 3. Unit Tests (Completed)
Created comprehensive tests in `tests/elicit-handler.test.js`:
- Tests for identifying elicit actions
- Tests for validation logic
- Tests for task execution with and without handlers
- Tests for user input collection and storage
- All 11 tests passing

## Usage Examples

### Basic Usage with User Input Handler
```javascript
const taskRunner = new TaskRunner(projectRoot);

const userInputHandler = async (actionsRequiringInput, step) => {
  // Display prompts to user and collect responses
  const responses = {};
  for (const action of actionsRequiringInput) {
    responses[action.description] = await getUserInput(action.description);
  }
  return responses;
};

const result = await taskRunner.executeTask('agent-name', 'path/to/task.yaml', {
  userInputHandler: userInputHandler
});
```

### Bypassing User Input (Testing/Automation)
```javascript
const result = await taskRunner.executeTask('agent-name', 'path/to/task.yaml', {
  allowMissingUserInput: true  // Proceed without user input
});
```

## Files Modified

### Core Implementation:
- `/tools/task-runner.js` - Added elicit handling logic
- `/scripts/audit-elicit-flags.js` - Created audit script
- `/scripts/review-elicit-changes.js` - Created review/correction script
- `/tests/elicit-handler.test.js` - Created unit tests

### YAML Files Updated:
- `advanced-elicitation.yaml`
- `correct-course.yaml`
- `create-brownfield-story.yaml`
- `create-deep-research-prompt.yaml`
- `create-next-story.yaml`
- `document-project.yaml`
- `execute-checklist.yaml`
- `generate-ai-frontend-prompt.yaml`
- `generate-search-tools.yaml`
- `kb-mode-interaction.yaml`
- `manage-memory.yaml`
- `review-story.yaml`
- `shard-doc.yaml`
- `validate-next-story.yaml`

## Integration with Orchestrator

The BMad Orchestrator (defined in `bmad-core/agents/bmad-orchestrator.md`) includes the following instruction:

> MANDATORY INTERACTION RULE: Tasks with elicit=true require user interaction using exact specified format - never skip elicitation for efficiency

This implementation ensures that this rule is enforced at the task execution level, preventing agents from bypassing user input requirements.

## Next Steps

1. **Web UI Integration**: The web-based orchestrator UI should implement a userInputHandler that displays prompts in a user-friendly interface
2. **CLI Integration**: Command-line tools should implement a userInputHandler that uses readline or inquirer for terminal-based input
3. **Agent Updates**: Individual agents should be updated to check for user responses in context when executing tasks

## Testing the Implementation

To verify the implementation works correctly:

1. Run the unit tests: `npm test tests/elicit-handler.test.js`
2. Try executing a task with elicit actions without providing a handler - it should fail
3. Try executing the same task with a handler - it should collect input and proceed

The implementation successfully meets all acceptance criteria and provides a robust foundation for ensuring user input is properly collected in SEMAD workflows.