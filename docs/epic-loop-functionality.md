# Epic Loop Functionality - Story 13 Implementation

This document describes the implementation of Story 13, which adds epic loop functionality to the BMad workflow orchestrator.

## Overview

The epic loop functionality allows the Scrum Master, Dev, and QA agents to process all stories in an epic sequentially until completion. This is an optional feature that users can select instead of the standard single-story workflow.

## Key Features

### 1. Epic-Aware Story Management
- Stories are automatically identified by their file naming pattern: `{epicId}.{storyId}.story-name.md`
- Example: `5.1.implement-authentication.md` belongs to Epic 5, Story 1
- The system groups stories by epic and tracks their completion status

### 2. Workflow Modes
Users can now choose between two workflow modes:
- **Single Story Mode**: Process one story (existing behavior)
- **Epic Loop Mode**: Process all stories in an epic sequentially

### 3. Flow Type Integration
Both linear and iterative Dev↔QA flows are supported within epic loop mode:
- **Linear Flow**: Dev implements once, QA reviews once
- **Iterative Flow**: Dev and QA iterate until approved

### 4. Automatic Status Tracking
The system automatically updates story statuses as they progress:
- `Approved` → `InProgress` (when story processing begins)
- `InProgress` → `Done` (when QA approves)
- `InProgress` → `Review` (when QA finds issues in linear mode)

## New CLI Commands

### Run Epic Loop
```bash
# Interactive mode - prompts for workflow mode and epic selection
node tools/workflow-orchestrator.js run

# Direct epic loop mode with specific epic
node tools/workflow-orchestrator.js run --workflow-mode epic-loop --epic-id 5 --flow-type iterative

# Command line options
node tools/workflow-orchestrator.js run --help
```

### List Available Epics
```bash
# Show all epics with their story counts and status
node tools/workflow-orchestrator.js list-epics
```

### Show Status
```bash
# Enhanced status command shows epic progress for epic loop mode
node tools/workflow-orchestrator.js status
```

## Usage Workflow

### 1. Prepare Stories
Ensure your stories are:
- Named with the pattern `{epicId}.{storyId}.story-name.md`
- Located in the configured `devStoryLocation` directory
- Have at least one story with status `Approved`

### 2. Run Epic Loop
```bash
node tools/workflow-orchestrator.js run
```

Select:
1. **Epic Loop Mode** when prompted for workflow mode
2. Your desired **flow type** (linear or iterative)
3. The **epic** you want to process

### 3. Monitor Progress
The system will:
- Show epic progress summary
- Process each approved story in order
- Execute SM validation → Dev implementation → QA review
- Automatically advance to the next story upon completion
- Continue until all stories in the epic are done

## Implementation Details

### New Utility Functions
Located in `bmad-core/utils/find-next-story.js`:

- `getStoriesForEpic(storiesDir, epicId)` - Get all stories for a specific epic
- `findNextApprovedStoryInEpic(storiesDir, epicId)` - Find next approved story in epic
- `getEpicStatus(storiesDir, epicId)` - Get epic completion status and statistics

### Enhanced Orchestrator
Located in `tools/workflow-orchestrator.js`:

- `selectWorkflowMode()` - Prompt for workflow mode selection
- `selectEpic()` - Prompt for epic selection with status information
- `executeEpicLoop(epicId, flowType)` - Main epic loop execution logic
- `updateStoryStatus(storyPath, newStatus)` - Update story status in files

### Metadata Tracking
Enhanced metadata now includes:
- `workflowMode` - 'single' or 'epic-loop'
- `epicId` - Current epic being processed
- Epic-specific execution results including processed story counts

## Example Output

```
🔄 Starting Epic Loop for Epic 5

📖 Processing Story 5.1: Implement Authentication
✅ Story 5.1 completed successfully!

📖 Processing Story 5.2: Add User Profile
⚠️  Story 5.2 needs further work

🎉 Epic Loop Complete!

Epic 5 Status:
  Total Stories: 3
  Completed Stories: 2
  Stories Processed: 2
  Total Iterations: 4
```

## Error Handling

The system gracefully handles:
- Missing or invalid epic IDs
- Stories with no approved status
- File system errors when reading/writing stories
- Interruptions during processing (maintains state via metadata)

## Backwards Compatibility

All existing functionality remains unchanged:
- Single story mode is the default
- Existing CLI commands and options continue to work
- Metadata structure is extended, not replaced
- Legacy flow type selection is maintained for single story mode

## Testing

A test script is provided at `test-epic-loop.js` to verify the epic loop functionality:

```bash
node test-epic-loop.js
```

This tests all the new utility functions without running the full orchestrator.