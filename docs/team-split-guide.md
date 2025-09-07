# Team Split Feature Guide

## Overview
The team-split feature allows the Scrum Master (SM) agent to split a single story into team-specific stories, enabling parallel development without collisions.

## Configuration
Teams are configured in `.semad-core/teams.yaml` (or `bmad-core/teams.yaml` in source). Edit this file to define your teams:

```yaml
teams:
  - frontend
  - backend
  - database
  - infrastructure
  - api
  - testing
```

## Usage

### Basic Command
```bash
# Activate SM agent
/sm

# Split a story into team-specific stories
*team-split docs/stories/story-99-1.md
```

### What Happens
1. SM reads the original story file
2. Analyzes each task and subtask
3. Assigns tasks to teams based on keywords and patterns
4. Creates separate story files using consistent naming:
   - If base is `X.Y.story.md` → `X.Y.<team>.story.md` (keeps `.story.md` suffix for tooling)
   - If base is `story-X-Y.md` → `story-X-Y-<team>.md` (legacy style)
   - Otherwise → `<base>-<team>.md`
   Examples:
   - `docs/stories/1.2.story.md` → `docs/stories/1.2.frontend.story.md`
   - `docs/stories/story-99-1.md` → `docs/stories/story-99-1-frontend.md`

### Important Notes
- **Single Source of Truth**: The frontmatter (StoryContract) is copied verbatim. Do not alter contracts in team files.
- **No Re-interpretation**: Requirements/ACs are not rewritten; only scope is narrowed.
- **No Duplication**: "Implementation Plan" tasks are filtered per team; a task appears in only one team story.
- **Scoped Files**: "Files to Modify" lists are filtered per team to reduce collisions.
- **Smart Assignment**: Tasks/files are assigned by patterns first, then keywords.
- **Default Fallback**: Unmatched items go to the configured default team.

### Schedule Output
- A simple schedule is generated at `.ai/adhoc/team-split-schedule-<base>.md` showing:
  - Parallel groups (teams that can work simultaneously)
  - Sequential hints (teams that should follow others due to shared directories)
  - Cross-team directories
- Each team story also includes a "Team Schedule" section summarizing its group and dependencies.

## Example Workflow

1. Create a comprehensive story:
```bash
/sm
*create-story
```

2. Split it for teams:
```bash
*team-split docs/stories/story-99-1.md
```

3. Launch parallel dev agents:
```bash
# Terminal 1
/dev --team frontend
*develop-story docs/stories/story-99-1-frontend.md

# Terminal 2
/dev --team backend
*develop-story docs/stories/story-99-1-backend.md

# Terminal 3
/dev --team database
*develop-story docs/stories/story-99-1-database.md
```

## Team Assignment Logic

Tasks are assigned based on:

1. **Keywords in task description**:
   - Frontend: UI, component, React, CSS, browser
   - Backend: API, server, endpoint, controller
   - Database: schema, migration, query, SQL
   
2. **File patterns**:
   - Frontend: `**/components/**`, `**/*.jsx`
   - Backend: `**/controllers/**`, `**/api/**`
   - Database: `**/migrations/**`, `**/*.sql`

3. **Default strategy**:
   - Unmatched tasks go to the team specified in `default_assignment_strategy`

## Benefits

- **Parallel Development**: Multiple teams can work simultaneously
- **No Collisions**: Each team only sees their tasks
- **Clear Ownership**: Tasks are clearly assigned to teams
- **Single Source of Truth**: Original story remains unchanged
- **No Hallucination**: No re-interpretation of requirements
