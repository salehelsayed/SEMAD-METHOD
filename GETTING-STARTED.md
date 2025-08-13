# Getting Started with SEMAD-METHOD

This guide will walk you through setting up and using SEMAD-METHOD for your first AI-powered development project.

## Prerequisites

Before starting, ensure you have:

### Required Software
- **Node.js v20+**: [Download Node.js](https://nodejs.org)
- **Git**: For version control
- **Code Editor**: VS Code, Cursor, Windsurf, or similar
- **Claude.ai Account**: For running AI agents

### System Requirements
- **OS**: Windows, macOS, or Linux
- **RAM**: 4GB minimum (8GB recommended)
- **Disk Space**: 200MB for SEMAD + project space

## Installation Options

### Option 1: Quick Install (Recommended)

Install SEMAD directly into your project:

```bash
# Create your project directory
mkdir my-project
cd my-project

# Install SEMAD-METHOD
npx bmad-method install
```

This command:
- ✅ Sets up the complete framework
- ✅ Installs all dependencies
- ✅ Creates project structure
- ✅ Configures agents and workflows

### Option 2: Clone and Build

For development or customization:

```bash
# Clone the repository
git clone https://github.com/your-fork/SEMAD-METHOD.git
cd SEMAD-METHOD

# Install dependencies
npm install

# Build the framework
npm run build

# Install to your project
npm run install:bmad
```

### Option 3: Web UI Setup

For browser-based usage without installation:

1. Download the [full stack team bundle](dist/teams/team-fullstack.txt)
2. Create a new AI assistant (Gemini Gem, CustomGPT, etc.)
3. Upload the bundle file
4. Set instructions: "Your critical operating instructions are attached, do not break character as directed"
5. Start with `*help` to see available commands

## Project Structure

After installation, your project will have:

```
my-project/
├── .ai/                    # Session state and tracking
│   ├── progress/          # Task progress logs
│   └── observations/      # Decision tracking
├── .bmad/                 # SEMAD framework files
│   ├── agents/           # AI agent definitions
│   ├── tasks/            # Structured task definitions
│   ├── templates/        # Document templates
│   └── workflows/        # Workflow definitions
├── docs/                  # Project documentation
│   ├── stories/          # Development stories
│   ├── prd.md           # Product requirements
│   └── architecture.md   # Technical design
└── src/                   # Your source code
```

## Configuration

### Basic Configuration

Create or edit `.bmad-config.yaml`:

```yaml
# Enable SEMAD features
structuredTasks: true          # Use YAML task definitions
useStoryContracts: true       # Use formal contracts
dynamicPlanAdaptation: true   # Auto task decomposition
simpleTaskTracking: true      # File-based tracking

# Project settings
projectName: "My Project"
primaryLanguage: "javascript"
framework: "react"

# Workflow settings
workflow:
  type: "iterative"           # or "linear"
  autoValidation: true
```

### Environment Variables

Optional environment configuration:

```bash
# For future semantic search features
export OPENAI_API_KEY="your-api-key"

# Custom paths
export BMAD_HOME="/path/to/bmad"
export BMAD_WORKSPACE="/path/to/workspace"
```

## Your First Project

### Step 1: Start the Orchestrator

In your IDE (VS Code, Cursor, etc.), start a chat with Claude and begin:

```
/orchestrator
```

The orchestrator will guide you through the entire process.

### Step 2: Create a Project Brief

Tell the orchestrator about your project:

```
I want to build a task management application with:
- User authentication
- Task CRUD operations
- Due date tracking
- Priority levels
- Team collaboration
```

### Step 3: Planning Phase

The orchestrator will activate planning agents:

1. **Analyst** creates a detailed brief
2. **PM** develops the PRD (Product Requirements Document)
3. **Architect** designs the technical architecture

Example interaction:
```
Orchestrator: "I'll start the planning phase. Let me activate the Analyst..."
*analyst agent creates brief*
*pm agent creates PRD*
*architect agent creates architecture*
```

### Step 4: Review Planning Documents

Check the generated documents:
- `docs/brief.md` - Project brief
- `docs/prd.md` - Product requirements
- `docs/architecture.md` - Technical design

### Step 5: Development Phase

Start development:

```
start development phase
```

The orchestrator will:
1. **Scrum Master** creates development stories
2. **Developer** implements features
3. **QA Engineer** validates implementation

### Step 6: Monitor Progress

Track progress using:

```bash
# View current tasks
cat .ai/progress/current-tasks.json

# Check observations
ls .ai/observations/

# Review completed work
git status
```

## Working with Agents

### Direct Agent Activation

You can work with specific agents directly:

```
# Activate developer agent
/dev

# With immediate command
/dev *implement-next-story

# Activate QA agent
/qa *run-tests
```

### Agent Commands

Common agent commands:

| Agent | Command | Purpose |
|-------|---------|---------|
| `/orchestrator` | Start orchestrator | Manage entire workflow |
| `/analyst` | Start analyst | Create project brief |
| `/pm` | Start PM | Create PRD |
| `/architect` | Start architect | Design architecture |
| `/sm` | Start Scrum Master | Create stories |
| `/dev` | Start developer | Implement features |
| `/qa` | Start QA | Test and validate |

### Agent Workflow Examples

#### Creating a New Feature

```
# 1. Tell orchestrator about the feature
"Add user profile management"

# 2. Orchestrator coordinates:
#    - PM updates PRD
#    - Architect updates design
#    - SM creates story
#    - Dev implements
#    - QA validates
```

#### Fixing a Bug

```
# Direct approach
/dev *fix-authentication-bug

# Or through orchestrator
"There's a bug in authentication, fix it"
```

## Story Contracts

SEMAD uses formal contracts in stories to eliminate ambiguity:

```yaml
# Example story with contract
Story: USER-001
Title: Implement User Authentication

StoryContract:
  requirements:
    functional:
      - FR001: Users can register with email
      - FR002: Users can login with credentials
    technical:
      - TR001: Use JWT for sessions
      - TR002: Bcrypt for passwords
  
  implementation:
    files:
      - src/auth/AuthService.js
      - src/auth/LoginComponent.jsx
    tests:
      - Unit tests for AuthService
      - Integration tests for login flow
```

## Task Tracking

### Simple Task Tracking

SEMAD uses lightweight file-based tracking:

```javascript
// Tasks are tracked in .ai/progress/
{
  "currentTask": "implement-authentication",
  "status": "in-progress",
  "subtasks": [
    { "id": "1", "name": "Create auth service", "status": "completed" },
    { "id": "2", "name": "Add login component", "status": "in-progress" },
    { "id": "3", "name": "Write tests", "status": "pending" }
  ]
}
```

### Viewing Progress

```bash
# Check current progress
node .bmad/utils/track-progress.js --status

# View observations
cat .ai/observations/latest.json
```

## Validation and Testing

### Running Validation

Validate your project structure and contracts:

```bash
# Validate all configurations
npm run validate

# Validate specific components
npm run validate:stories
npm run validate:contracts
npm run validate:tasks
```

### Testing Your Implementation

```bash
# Run tests (if configured)
npm test

# Run SEMAD validation tests
npm run test:contracts
```

## Common Workflows

### Workflow 1: Full Project Development

1. Start orchestrator: `/orchestrator`
2. Describe project requirements
3. Review generated PRD and Architecture
4. Approve and start development
5. Monitor story implementation
6. Review QA validation

### Workflow 2: Adding Features

1. Describe new feature to orchestrator
2. Let PM update PRD
3. Architect updates design if needed
4. SM creates story
5. Dev implements
6. QA validates

### Workflow 3: Bug Fixes

1. Report bug: "Fix issue with user logout"
2. Dev investigates and fixes
3. QA validates fix
4. Commit changes

## Troubleshooting

### Common Issues

#### Node Version Error
```bash
Error: Node.js version 20+ required
Solution: Update Node.js from nodejs.org
```

#### Installation Fails
```bash
Solution: Clear npm cache
npm cache clean --force
npm install
```

#### Agents Not Responding
```bash
Solution: Restart orchestrator
/orchestrator *restart
```

#### Validation Errors
```bash
Solution: Run validation to identify issues
npm run validate
Fix identified schema violations
```

### Getting Help

1. **Documentation**: Check other guides in this repository
2. **Discord Community**: [Join Discord](https://discord.gg/gk8jAdXWmj)
3. **GitHub Issues**: Report bugs and request features
4. **Logs**: Check `.ai/logs/` for detailed error information

## Best Practices

### 1. Always Start with Planning
- Don't skip the PRD and Architecture phases
- Good planning = smooth development

### 2. Use Story Contracts
- Ensure all stories have contracts
- Validate contracts before implementation

### 3. Track Progress
- Monitor task completion
- Review observations regularly

### 4. Validate Often
- Run validation after major changes
- Fix issues immediately

### 5. Commit Regularly
- Commit completed features
- Use meaningful commit messages

## Next Steps

Now that you're set up:

1. **Read the [User Guide](bmad-core/user-guide.md)** for detailed workflows
2. **Explore [Agent Documentation](AGENTS.md)** to understand each agent
3. **Learn about [Workflows](WORKFLOWS.md)** for advanced usage
4. **Check [Architecture](ARCHITECTURE.md)** for technical details
5. **Try [Expansion Packs](expansion-packs/)** for domain-specific features

## Quick Reference

### Essential Commands

```bash
# Installation
npx bmad-method install

# Build
npm run build

# Validation
npm run validate

# Testing
npm test

# Agent activation
/orchestrator
/dev *implement-next-story
/qa *validate-implementation
```

### File Locations

- **Agents**: `.bmad/agents/`
- **Tasks**: `.bmad/tasks/`
- **Stories**: `docs/stories/`
- **Progress**: `.ai/progress/`
- **Logs**: `.ai/logs/`

### Configuration Files

- **Framework**: `.bmad-config.yaml`
- **Workflow**: `.bmad-workflow.yaml`
- **Dynamic Plan**: `.bmad/config/dynamic-plan-config.yaml`

## Conclusion

You're now ready to use SEMAD-METHOD for AI-powered development! The framework handles the complexity of multi-agent coordination while you focus on your project requirements. Remember: good planning leads to successful implementation.

Happy coding with SEMAD-METHOD! 🚀