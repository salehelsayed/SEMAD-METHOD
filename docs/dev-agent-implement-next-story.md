# Dev Agent - Implement Next Story Command

**Note:** This is the user documentation for the implement-next-story feature. For the implementation story, see `/docs/stories/5.1.implement-next-story-command.md`.

## Overview
The Dev agent now supports an `*implement-next-story` command that automatically finds and begins implementing the most recent approved story from the stories directory.

## Usage

1. Activate the Dev agent:
   ```
   BMad dev
   ```

2. Once the Dev agent is active, use the command:
   ```
   *implement-next-story
   ```

3. The agent will:
   - Search for approved stories in `docs/stories/`
   - Find the most recently modified story with status "Approved"
   - Display the story title and ask for confirmation
   - Validate the StoryContract
   - Begin implementation if everything is valid

## How It Works

### Story Discovery
- Stories are located in the directory specified by `devStoryLocation` in `core-config.yaml` (default: `docs/stories`)
- Only markdown files matching the pattern `{epic}.{story}*.md` are considered
- Stories must have `Status: Approved` to be eligible
- The most recent story is determined by file modification time

### Error Handling
The command provides specific feedback for different scenarios:
- No stories directory exists
- No story files in the directory
- No stories with "Approved" status
- Invalid or missing StoryContract

### StoryContract Validation
Before implementation begins, the command validates that the story has a valid StoryContract with:
- version
- story_id
- epic_id
- apiEndpoints (array)
- filesToModify (array)
- acceptanceCriteriaLinks (array)

## Example Workflow

1. Scrum Master creates and approves a story:
   ```
   BMad sm
   *create-story
   # ... story creation process ...
   # Set status to "Approved"
   ```

2. Developer implements the story:
   ```
   BMad dev
   *implement-next-story
   # Found approved story: Epic 5 - Story 1: Add user authentication
   # File: 5.1.user-authentication.md
   # Would you like to begin implementation? (yes/no)
   yes
   # Successfully loaded story 5.1. Beginning implementation...
   ```

## Testing

To test the command:

1. Create a test story with "Approved" status in `docs/stories/`
2. Run the Dev agent and execute `*implement-next-story`
3. Verify the correct story is loaded and implementation begins

## Implementation Details

### Files Modified
- `bmad-core/agents/dev.md` - Added command and implementation instructions
- `bmad-core/utils/find-next-story.js` - Utility for finding approved stories

### Dependencies
The implementation uses:
- `fs` and `path` for file operations
- `js-yaml` for parsing YAML frontmatter
- Existing `StoryContractValidator` for validation