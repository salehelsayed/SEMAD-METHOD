# SEMAD-METHOD Architecture Documentation

## System Architecture Overview

SEMAD-METHOD is a structured engineering framework for multi-agent AI development that orchestrates specialized agents through a two-phase workflow, ensuring context-rich development with minimal hallucination.

## Core Architecture Principles

### 1. Two-Phase Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PHASE 1: PLANNING                          │
├─────────────────────────────────────────────────────────────────┤
│   Analyst → PM → Architect                                      │
│     ↓        ↓       ↓                                         │
│   Brief    PRD   Architecture                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 2: DEVELOPMENT                         │
├─────────────────────────────────────────────────────────────────┤
│   Scrum Master → Developer → QA Engineer                        │
│        ↓             ↓           ↓                             │
│    Stories    Implementation  Validation                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Agent Communication Architecture

Agents communicate through structured artifacts:
- **Planning Phase**: Markdown documents (Brief, PRD, Architecture)
- **Development Phase**: Story files with embedded StoryContracts
- **Validation**: JSON schemas ensure artifact integrity

### 3. File-Based State Management

```
Project Root/
├── .ai/                    # Session state and tracking
│   ├── progress/          # Agent progress logs
│   ├── observations/      # Decision tracking
│   └── workflows/         # Active workflow state
├── docs/                  # Project documentation
│   ├── prd.md            # Product Requirements
│   ├── architecture.md   # Technical Architecture
│   └── stories/          # Development stories
└── outputs/              # Generated artifacts
```

## Component Architecture

### Agent System

Each agent is defined by:
- **YAML Configuration**: Agent definition and capabilities
- **Dependencies**: Required templates, tasks, checklists
- **Activation Commands**: Direct invocation patterns
- **Memory Interface**: Simple file-based tracking

```yaml
# Example Agent Structure
name: developer
role: Implementation specialist
dependencies:
  templates:
    - implementation-template
  tasks:
    - implement-feature
    - write-tests
  checklists:
    - code-review
```

### Task System Architecture

#### Structured Task Definition
```yaml
task:
  id: implement-feature
  type: development
  inputs:
    - name: story_file
      type: file_path
      required: true
  outputs:
    - name: implementation
      type: code_files
  steps:
    - action: read_story_contract
    - action: implement_requirements
    - action: write_tests
    - action: validate_implementation
```

#### Task Tracking System
- **Simple Task Tracker**: In-memory workflow state
- **Progress Logger**: Persistent file-based observations
- **No Database Dependencies**: All state in filesystem

### Contract System Architecture

#### StoryContract Structure
```yaml
StoryContract:
  id: story-001
  requirements:
    functional:
      - FR001: User authentication
      - FR002: Session management
    technical:
      - TR001: JWT tokens
      - TR002: Redis session store
  implementation:
    components:
      - AuthService
      - SessionManager
    tests:
      - Unit tests for auth
      - Integration tests
  validation:
    acceptance_criteria:
      - User can login
      - Session persists
```

### Validation Architecture

```
Input → Schema Validation → Processing → Output Validation
  ↓           ↓                ↓            ↓
Files    JSON Schema      Agent Logic   Contract Check
```

#### Validation Layers:
1. **Input Validation**: Schema validation for all inputs
2. **Process Validation**: Task step verification
3. **Output Validation**: Contract fulfillment checks
4. **Integration Validation**: Cross-component verification

## Memory System Architecture

### Simplified Memory Design
```
┌─────────────────────────────────────────┐
│         Simple Task Tracker             │
├─────────────────────────────────────────┤
│  • In-memory task state                 │
│  • Workflow progress tracking           │
│  • No external dependencies            │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         Progress Logger                  │
├─────────────────────────────────────────┤
│  • File-based observations             │
│  • Decision tracking                   │
│  • Persistent across sessions          │
└─────────────────────────────────────────┘
```

### Memory Operations
1. **Task Registration**: Track task initiation
2. **Progress Updates**: Log step completion
3. **Observation Recording**: Capture decisions
4. **State Persistence**: Save to `.ai/` directory

## Dynamic Plan Adaptation

### Complexity Analysis
```javascript
// Automatic threshold detection
if (taskCount > 5 || fileCount > 7 || complexity > threshold) {
  activateDynamicPlanAdaptation();
}
```

### Adaptation Strategy
1. **Decomposition**: Break complex tasks into subtasks
2. **Prioritization**: Order tasks by dependency
3. **Batching**: Group related operations
4. **Progressive Execution**: Complete in manageable chunks

## Build System Architecture

### Bundle Generation
```
Source Files → Dependency Resolution → Bundle Creation → Validation
     ↓               ↓                      ↓              ↓
  Agents/Tasks    Resolve Deps          Web Bundle    Schema Check
```

### Build Pipeline
1. **Agent Bundle**: Combine agent + dependencies
2. **Team Bundle**: Multiple agents + shared resources
3. **Expansion Bundle**: Domain-specific extensions
4. **Web Bundle**: Browser-compatible packages

## Extension Architecture

### Expansion Pack Structure
```
expansion-pack/
├── agents/           # Domain-specific agents
├── templates/        # Custom templates
├── tasks/           # Specialized tasks
├── workflows/       # Domain workflows
└── manifest.yaml    # Pack metadata
```

### Integration Points
- **Agent Extensions**: New capabilities
- **Template Extensions**: Domain templates
- **Task Extensions**: Specialized operations
- **Workflow Extensions**: Custom processes

## Security Architecture

### Security Layers
1. **Input Sanitization**: Clean all user inputs
2. **Schema Validation**: Strict type checking
3. **File System Isolation**: Controlled file access
4. **No Code Execution**: Templates don't execute code
5. **Audit Logging**: Track all operations

## Performance Optimizations

### Caching Strategy
- **Template Caching**: Reuse parsed templates
- **Schema Caching**: Cache validation schemas
- **Dependency Caching**: Cache resolved dependencies

### Lazy Loading
- **On-Demand Loading**: Load agents when needed
- **Progressive Enhancement**: Load features as required
- **Minimal Core**: Small initial footprint

## Error Handling Architecture

### Error Categories
1. **Validation Errors**: Schema violations
2. **Runtime Errors**: Execution failures
3. **Integration Errors**: Cross-component issues
4. **Recovery Errors**: Rollback failures

### Error Recovery
```javascript
try {
  executeTask();
} catch (error) {
  logError(error);
  attemptRecovery();
  if (!recovered) {
    rollback();
  }
}
```

## Testing Architecture

### Test Levels
1. **Unit Tests**: Component isolation
2. **Integration Tests**: Component interaction
3. **Contract Tests**: StoryContract validation
4. **End-to-End Tests**: Full workflow validation

### Test Coverage
- **284 Tests**: Comprehensive coverage
- **100% Pass Rate**: All tests passing
- **Continuous Validation**: Build-time checks

## Deployment Architecture

### Installation Methods
1. **NPX Install**: `npx bmad-method install`
2. **Git Clone**: Direct repository clone
3. **Package Manager**: npm/yarn installation

### Configuration Management
```yaml
# .bmad-config.yaml
structuredTasks: true
useStoryContracts: true
dynamicPlanAdaptation: true
simpleTaskTracking: true
```

## Monitoring & Observability

### Logging System
- **Progress Logs**: Task completion tracking
- **Decision Logs**: Agent decision recording
- **Error Logs**: Failure documentation
- **Audit Logs**: Security tracking

### Metrics Collection
- **Task Metrics**: Completion rates
- **Performance Metrics**: Execution times
- **Quality Metrics**: Validation pass rates
- **Usage Metrics**: Feature utilization

## Future Architecture Considerations

### Planned Enhancements
1. **Semantic Search**: AI-powered documentation search
2. **Cloud Sync**: Optional cloud state storage
3. **Real-time Collaboration**: Multi-user support
4. **Plugin System**: Third-party extensions
5. **API Gateway**: REST/GraphQL interfaces

### Scalability Path
- **Horizontal Scaling**: Multiple agent instances
- **Distributed Execution**: Cloud-based processing
- **Event-Driven Architecture**: Async operations
- **Microservices**: Decomposed services

## Architecture Decision Records (ADRs)

### ADR-001: File-Based State Management
**Decision**: Use filesystem for all state management
**Rationale**: Simplicity, no external dependencies, easy debugging
**Consequences**: Limited to single-machine execution

### ADR-002: YAML Task Definitions
**Decision**: Use YAML for task definitions
**Rationale**: Human-readable, schema-validatable, LLM-friendly
**Consequences**: Requires YAML parsing, schema maintenance

### ADR-003: StoryContract Specification
**Decision**: Embed formal contracts in story files
**Rationale**: Eliminate interpretation errors, ensure traceability
**Consequences**: More verbose stories, requires validation

### ADR-004: Two-Phase Workflow
**Decision**: Separate planning and development phases
**Rationale**: Clear separation of concerns, better context management
**Consequences**: Longer initial setup, more structured process