# SEMAD-METHOD Agent Documentation

This document provides comprehensive documentation for all agents in the SEMAD-METHOD framework.

## Agent Overview

SEMAD-METHOD uses specialized AI agents, each with specific roles and responsibilities in the software development lifecycle. Agents work collaboratively through structured artifacts and formal contracts.

## Using With Codex CLI

You can drive these agents from the terminal using OpenAI Codex CLI. This keeps work local while leveraging SEMAD’s agent workflows.

- Install: `npm install -g @openai/codex`
- Activation phrases: “as dev agent …”, “activate qa agent …”, “switch to sm agent …”.
- Use the `*` prefix for commands (e.g., `*help`, `*implement-next-story`).
- Quick examples:
  - `codex "as dev agent, *help"`
  - `codex "as sm agent, *create-story"`
  - `codex "as qa agent, *review"`
  - `codex "as dev agent, execute *implement-next-story"`
  - `codex "as dev agent, execute *adhoc 'Fix lint errors in utils' --paths src/utils/index.ts"`

Outputs and logs are written to `.ai/`:
- Progress/history: `.ai/history/*_log.jsonl`
- Ad‑hoc reports: `.ai/adhoc/*.md`
- Story location: `docs/stories` (only read during story workflows)

See `docs/codex-integration.md` for a full guide.

## Core Agent Architecture

### Agent Structure
Each agent consists of:
- **Identity**: Name, role, and persona
- **Capabilities**: What the agent can do
- **Dependencies**: Required templates, tasks, and checklists
- **Activation**: How to invoke the agent
- **Workflow Integration**: How it fits in the two-phase workflow

### Agent Communication
- Agents communicate through files (markdown, YAML, JSON)
- No direct agent-to-agent communication
- Orchestrator manages agent coordination
- StoryContracts ensure clear requirements

## Primary Agents

### 1. BMad Orchestrator (`/orchestrator`)

**Role**: Master coordinator managing the entire development workflow

**Responsibilities**:
- Coordinate all other agents
- Manage workflow transitions
- Track project progress
- Handle user requests
- Ensure proper sequencing

**Key Commands**:
- `/orchestrator` - Start orchestrator
- `*help` - Show available commands
- `*status` - Show project status
- `create comprehensive plan` - Start planning phase
- `start development phase` - Begin implementation

**Workflow Position**: Controls both planning and development phases

**Dependencies**:
- All other agents
- Workflow definitions
- Progress tracking system

**Reverse Alignment Quick Links**:
- Full pipeline: `node tools/workflow-orchestrator.js reverse-align`
- Steps: `cleanup-docs`, `analyst-analyze`, `architect-rewrite`, `pm-update-prd`, `sm-recreate-stories`, `validate-story-consistency`, `qa-validate-alignment`, `generate-alignment-report`, `create-documentation-manifest`
- Guide: `docs/reverse-alignment.md`

---

### 2. Analyst (`/analyst`)

**Role**: Requirements gathering and analysis specialist

**Responsibilities**:
- Gather project requirements
- Create detailed project briefs
- Identify stakeholders
- Define success criteria
- Analyze feasibility

**Key Commands**:
- `/analyst` - Activate analyst
- `*create-project-brief` - Generate project brief
- `*perform-market-research` - Deep requirements/market analysis
- `*create-competitor-analysis` - Competitive analysis

**Reverse Alignment Quick Links**:
- `/analyst *analyze-codebase-changes`
- `/analyst *extract-implemented-features`

**Workflow Position**: First agent in planning phase

**Outputs**:
- `docs/brief.md` - Project brief
- Requirements analysis
- Stakeholder mapping

**Templates Used**:
- `brief-template.md`
- `requirements-template.md`

---

### 3. Product Manager (`/pm`)

**Role**: Product requirements and feature prioritization

**Responsibilities**:
- Create Product Requirements Document (PRD)
- Define user stories
- Prioritize features
- Set acceptance criteria
- Manage product vision

**Key Commands**:
- `/pm` - Activate PM
- `*create-prd` - Generate PRD
- `*create-brownfield-prd` - PRD for existing systems
- `*update-prd-from-implementation` - Align PRD to implementation
 - `*validate-epic <path>` - Validate an EpicContract file (runs `npm run validate:epic -- <path>`) 

**Reverse Alignment Quick Links**:
- `/pm *update-prd-from-implementation`
- `/pm *document-missing-requirements`

**Workflow Position**: Second agent in planning phase (after Analyst)

**Outputs**:
- `docs/prd.md` - Product Requirements Document
- Feature prioritization matrix
- User journey maps

**Templates Used**:
- `prd-template.md`
- `user-story-template.md`

---

### 4. Architect (`/architect`)

**Role**: Technical design and system architecture

**Responsibilities**:
- Design system architecture
- Define technical stack
- Create component diagrams
- Establish design patterns
- Document technical decisions

**Key Commands**:
- `/architect` - Activate architect
- `*create-full-stack-architecture` - Full-stack architecture doc
- `*create-backend-architecture` - Backend architecture
- `*create-front-end-architecture` - Frontend architecture
- `*reverse-engineer-architecture` - From implementation

**Reverse Alignment Quick Links**:
- `/architect *reverse-engineer-architecture --from-implementation`
- `/architect *document-design-decisions`

**Workflow Position**: Third agent in planning phase (after PM)

**Outputs**:
- `docs/architecture.md` - Technical architecture
- Component diagrams
- API specifications
- Database schemas

**Templates Used**:
- `architecture-template.md`
- `api-spec-template.md`
- `database-schema-template.md`

---

### 5. Scrum Master (`/sm`)

**Role**: Story creation and sprint management

**Responsibilities**:
- Create development stories with StoryContracts
- Manage sprint planning
- Track progress
- Remove blockers
- Facilitate development flow

**Key Commands**:
- `/sm` - Activate Scrum Master
- `*create-story` - Create the next story
- `*story-checklist` - Validate story quality
- `*correct-course` - Process corrections

**Reverse Alignment Quick Links**:
- `/sm *recreate-stories-from-code`
- `/sm *update-story-templates`

**Workflow Position**: First agent in development phase

**Outputs**:
- `docs/stories/` - Development stories
- Sprint plans
- Burndown tracking

**Special Features**:
- Embeds StoryContracts in stories
- Ensures full context in each story
- Links requirements to implementation

**Templates Used**:
- `story-template.md`
- `story-contract-template.yaml`
- `sprint-plan-template.md`

---

### 6. Developer (`/dev`)

**Role**: Implementation specialist

**Responsibilities**:
- Implement features from stories
- Write clean, maintainable code
- Follow StoryContract specifications
- Create unit tests
- Document code

**Key Commands**:
- `/dev` - Activate developer
- `*implement-next-story` - Start next story
- `*run-tests` - Linting and tests
- `*adhoc` - One-off tasks

**Workflow Position**: Second agent in development phase (after SM)

**Outputs**:
- Source code implementation
- Unit tests
- Code documentation
- Technical notes

**Working Process**:
1. Read story with StoryContract
2. Implement requirements exactly
3. Write tests
4. Validate against contract

**Templates Used**:
- `implementation-checklist.md`
- `test-template.md`

---

### 7. QA Engineer (`/qa`)

**Role**: Quality assurance and validation

**Responsibilities**:
- Validate implementations
- Run test suites
- Check contract fulfillment
- Report issues
- Ensure quality standards

**Key Commands**:
- `/qa` - Activate QA
- `*review` - Review story implementation
- `*analyze-code-quality` - Analyze quality
- `*validate-docs-code-alignment` - Docs/Code alignment

**Reverse Alignment Quick Links**:
- `/qa *validate-docs-code-alignment`
- `/qa *generate-coverage-report`

**Workflow Position**: Third agent in development phase (after Dev)

**Outputs**:
- Test results
- Validation reports
- Bug reports
- Quality metrics

**Validation Process**:
1. Check StoryContract requirements
2. Run automated tests
3. Validate acceptance criteria
4. Report findings

**Templates Used**:
- `test-report-template.md`
- `bug-report-template.md`
- `validation-checklist.md`

---

### 8. UX Expert (`/ux`)

**Role**: User experience and interface design

**Responsibilities**:
- Design user interfaces
- Create wireframes and mockups
- Define interaction patterns
- Ensure usability
- Create design systems

**Key Commands**:
- `/ux` - Activate UX expert
- `*create-front-end-spec` - Frontend spec
- `*generate-ui-prompt` - AI UI prompt

**Workflow Position**: Optional in planning phase (parallel with Architect)

**Outputs**:
- UI/UX designs
- Wireframes
- Style guides
- Interaction specifications

**Templates Used**:
- `ux-design-template.md`
- `style-guide-template.md`

---

### 9. Product Owner (`/po`)

**Role**: Business requirements and stakeholder management

**Responsibilities**:
- Define business requirements
- Manage stakeholder expectations
- Approve deliverables
- Prioritize backlog
- Make business decisions

Note: Story/Epic creation is deprecated for PO. Use SM for standard story creation and PM for brownfield story/epic creation.

**Key Commands**:
- `/po` - Activate Product Owner
- `*execute-checklist-po` - PO master checklist
- `*shard-doc` - Shard documents
- `*validate-story-draft` - Validate story draft
 - `*validate-epic <path>` - Validate an EpicContract file against the template (runs `npm run validate:epic -- <path>`)

**Workflow Position**: Advisory role throughout both phases

---

### 10. Infrastructure Engineer (`/in`)

**Role**: DevOps and infrastructure management

**Responsibilities**:
- Set up CI/CD pipelines
- Configure deployment
- Manage cloud resources
- Monitor systems
- Handle scaling

**Key Commands**:
- `/in` - Activate Integration Auditor
- `*audit-integration` - System integration audit
- `*verify-contracts` - Verify StoryContracts
- `*generate-report` - Generate audit report

**Workflow Position**: Parallel with development phase

## Agent Interaction Patterns

### Reverse Alignment Flow
- Purpose: Rebuild and validate core docs and stories from the codebase to ensure documentation reflects reality.
- Involved agents: 
  - Orchestrator: runs the pipeline and validations
  - Analyst: analyze codebase changes, extract implemented features
  - Architect: reverse-engineer architecture from implementation
  - PM: update PRD from implementation, document missing requirements
  - SM: recreate stories from code (mark as implemented)
  - QA: validate docs-code alignment and generate coverage
- Orchestrator commands:
  - Single-shot: `node tools/workflow-orchestrator.js reverse-align`
  - Steps: `cleanup-docs`, `analyst-analyze`, `architect-rewrite`, `pm-update-prd`, `sm-recreate-stories`, `validate-story-consistency`, `qa-validate-alignment`, `generate-alignment-report`, `create-documentation-manifest`
- Agent actions (when invoked directly):
  - `/analyst *analyze-codebase-changes`, `/analyst *extract-implemented-features`
  - `/architect *reverse-engineer-architecture`, `/architect *document-design-decisions`
  - `/pm *update-prd-from-implementation`, `/pm *document-missing-requirements`
  - `/sm *recreate-stories-from-code`, `/sm *update-story-templates`
  - `/qa *validate-docs-code-alignment`, `/qa *generate-coverage-report`
- Outputs: `docs/architecture/architecture.md`, `docs/prd/PRD.md`, `docs/stories/*`, `.ai/reports/*`, `.ai/documentation-manifest.json`.
- See the full guide: `docs/reverse-alignment.md`.

### Planning Phase Flow
```
User Request → Orchestrator
    ↓
Analyst (Brief)
    ↓
PM (PRD)
    ↓
Architect (Technical Design)
    ↓
[Optional: UX (Designs)]
```

### Development Phase Flow
```
Planning Artifacts → Orchestrator
    ↓
Scrum Master (Stories with Contracts)
    ↓
Developer (Implementation)
    ↓
QA Engineer (Validation)
    ↓
[Loop if issues found]
```

### Iterative Development
```
Story → Dev → QA
  ↑           ↓
  ←─ Issues ──┘
```

## Agent Configuration

### Enabling/Disabling Agents

In `.bmad-config.yaml`:
```yaml
agents:
  analyst:
    enabled: true
    autoActivate: false
  pm:
    enabled: true
    autoActivate: true
  architect:
    enabled: true
    autoActivate: true
  # ... other agents
```

### Custom Agent Settings

```yaml
agentSettings:
  developer:
    language: "typescript"
    framework: "react"
    testRunner: "jest"
  qa:
    testCoverage: 80
    strictMode: true
```

## Agent Commands Reference

### Global Commands
- `*help` - Show help for current agent
- `*status` - Show agent status
- `*reset` - Reset agent state
- `*exit` - Exit current agent

### Orchestrator Commands
- `create comprehensive plan` - Full planning phase
- `start development phase` - Begin implementation
- `show progress` - Display project progress
- `activate [agent]` - Switch to specific agent

### Development Commands
- `implement next story` - Dev starts next story
- `validate implementation` - QA checks work
- `create hotfix` - Emergency fix workflow
- `run retrospective` - Team retrospective

## Agent Memory and State

### Simple Task Tracking
Agents use file-based tracking:
- **Location**: `.ai/progress/`
- **Format**: JSON files
- **Persistence**: Across sessions

### Observation Recording
Decision tracking in `.ai/observations/`:
```json
{
  "agent": "developer",
  "timestamp": "2024-01-20T10:00:00Z",
  "action": "implement-authentication",
  "decision": "Using JWT for session management",
  "rationale": "Specified in StoryContract TR001"
}
```

## Agent Best Practices

### 1. Always Start with Orchestrator
- Ensures proper workflow
- Maintains context
- Coordinates agents

### 2. Follow the Workflow
- Don't skip planning phase
- Complete stories before moving on
- Validate before marking complete

### 3. Use Story Contracts
- Dev agents must follow contracts exactly
- QA validates against contracts
- Contracts prevent drift

### 4. Track Progress
- Agents should update task status
- Record important decisions
- Maintain audit trail

### 5. Handle Errors Gracefully
- Report issues clearly
- Attempt recovery
- Escalate when blocked

## Extending Agents

### Creating Custom Agents

1. Create agent definition:
```markdown
# agents/my-agent.md
## Identity
Name: My Custom Agent
Role: Specialized task handler

## Commands
- *custom-action

## Workflow
[Define workflow integration]
```

2. Add templates and tasks
3. Register in configuration
4. Test with orchestrator

### Agent Expansion Packs

See [Expansion Packs Documentation](expansion-packs/) for domain-specific agents:
- Game Development Agents
- DevOps Agents
- Creative Writing Agents
- Business Strategy Agents

## Troubleshooting Agents

### Common Issues

**Agent Not Responding**
- Check activation command
- Verify agent is enabled
- Restart orchestrator

**Wrong Agent Activated**
- Use explicit activation: `/agent-name`
- Check workflow configuration

**Context Lost Between Agents**
- Ensure files are saved
- Validate artifacts exist
- Check file paths

**Contract Validation Failures**
- Run validation: `npm run validate:contracts`
- Fix schema violations
- Regenerate story

## Agent Performance Metrics

### Tracking Metrics
- Task completion time
- Error rates
- Retry counts
- Validation pass rates

### Optimization Tips
- Cache frequently used templates
- Batch related operations
- Minimize file I/O
- Use progress tracking

## Future Agent Enhancements

### Planned Features
- Real-time collaboration
- Parallel agent execution
- Cloud-based agents
- AI model selection per agent
- Custom training per role

### Research Areas
- Multi-modal agents (voice, visual)
- Autonomous agent teams
- Self-improving agents
- Cross-project learning

## Conclusion

SEMAD-METHOD agents provide specialized expertise for every aspect of software development. By following the structured workflow and using formal contracts, teams achieve consistent, high-quality results with minimal hallucination and maximum efficiency.

For more details on specific agents, check their individual documentation in `bmad-core/agents/`.
