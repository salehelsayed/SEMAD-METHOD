# SEMAD-METHOD Workflow Documentation

## Overview

SEMAD-METHOD implements a structured two-phase workflow system that orchestrates multiple AI agents to deliver complete software development projects with minimal hallucination and maximum efficiency.

## Core Workflow Philosophy

### Key Principles

1. **Separation of Concerns**: Planning and development are distinct phases
2. **Context Preservation**: No information loss between phases
3. **Formal Contracts**: StoryContracts eliminate ambiguity
4. **Progressive Refinement**: Each phase builds on the previous
5. **Validation Gates**: Quality checks at each transition

## The Two-Phase Workflow

### Phase 1: Planning

```
┌──────────────────────────────────────────────────┐
│              PLANNING PHASE                       │
├──────────────────────────────────────────────────┤
│  User Requirements                                │
│         ↓                                        │
│  1. Analyst → Brief                              │
│         ↓                                        │
│  2. PM → PRD                                     │
│         ↓                                        │
│  3. Architect → Technical Design                 │
│         ↓                                        │
│  [Optional: UX → UI/UX Designs]                  │
│         ↓                                        │
│  Planning Artifacts Complete                     │
└──────────────────────────────────────────────────┘
```

**Duration**: Typically 1-3 hours for medium projects

**Outputs**:
- Project Brief (`docs/brief.md`)
- Product Requirements Document (`docs/prd.md`)
- Technical Architecture (`docs/architecture.md`)
- Optional: UX Designs (`docs/ux/`)

**Validation**: All documents are validated against schemas

### Phase 2: Development

```
┌──────────────────────────────────────────────────┐
│            DEVELOPMENT PHASE                      │
├──────────────────────────────────────────────────┤
│  Planning Artifacts                              │
│         ↓                                        │
│  1. Scrum Master → Stories + Contracts           │
│         ↓                                        │
│  2. Developer → Implementation                   │
│         ↓                                        │
│  3. QA Engineer → Validation                     │
│         ↓                                        │
│  [Loop if issues found]                          │
│         ↓                                        │
│  Deployment Ready                                │
└──────────────────────────────────────────────────┘
```

**Duration**: Varies by project complexity

**Outputs**:
- Development Stories (`docs/stories/`)
- Source Code Implementation
- Test Suites
- Validation Reports

## Workflow Types

### 1. Linear Workflow

```
Story 1 → Dev → QA → ✓
Story 2 → Dev → QA → ✓
Story 3 → Dev → QA → ✓
```

**Characteristics**:
- Sequential story completion
- Clear progress tracking
- Suitable for well-defined projects
- Minimal context switching

**Configuration**:
```yaml
workflow:
  type: linear
  autoProgress: true
```

### 2. Iterative Workflow

```
Story 1 → Dev → QA
           ↑      ↓
           ← Fix ←
           ↓
           ✓
```

**Characteristics**:
- Immediate feedback loops
- Rapid issue resolution
- Suitable for complex projects
- Higher quality output

**Configuration**:
```yaml
workflow:
  type: iterative
  maxIterations: 3
  autoFix: true
```

### 3. Parallel Workflow

```
Story 1 → Dev ─┐
Story 2 → Dev ─┼→ QA Batch → Fixes
Story 3 → Dev ─┘
```

**Characteristics**:
- Multiple stories in progress
- Batch validation
- Faster delivery
- Requires careful coordination

**Configuration**:
```yaml
workflow:
  type: parallel
  maxParallel: 3
  batchValidation: true
```

## Workflow Components

### 1. Workflow Triggers

**Manual Triggers**:
```
/orchestrator
create comprehensive plan
start development phase
```

**Automatic Triggers**:
- Document completion
- Validation success
- Story approval

### 2. Workflow States

```yaml
states:
  - initialized
  - planning
  - planning_complete
  - development
  - validation
  - completed
  - failed
```

### 3. Workflow Transitions

**Planning → Development**:
- Requirements: PRD and Architecture complete
- Validation: Schema validation passed
- Approval: User confirmation

**Story → Implementation**:
- Requirements: StoryContract defined
- Assignment: Developer activated
- Context: Full story loaded

### 4. Workflow Artifacts

**Planning Artifacts**:
```
docs/
├── brief.md              # Analyst output
├── prd.md               # PM output
├── architecture.md      # Architect output
└── ux/                  # UX output (optional)
```

**Development Artifacts**:
```
docs/stories/           # Scrum Master output
src/                   # Developer output
tests/                 # QA output
.ai/progress/          # Workflow tracking
```

## StoryContract Workflow

### Contract Creation (SM Phase)

```yaml
StoryContract:
  id: "STORY-001"
  title: "User Authentication"
  requirements:
    functional:
      - FR001: "User registration with email"
      - FR002: "Password reset functionality"
    technical:
      - TR001: "JWT token implementation"
      - TR002: "Bcrypt password hashing"
```

### Contract Implementation (Dev Phase)

1. **Read Contract**: Developer reads story file
2. **Parse Requirements**: Extract all FR/TR items
3. **Implement**: Code exactly to specification
4. **Self-Validate**: Check against contract

### Contract Validation (QA Phase)

1. **Load Contract**: QA reads story contract
2. **Check Implementation**: Verify each requirement
3. **Run Tests**: Execute test suite
4. **Report Results**: Pass/Fail with details

## Dynamic Plan Adaptation

### Activation Triggers

```yaml
# dynamic-plan-config.yaml
thresholds:
  taskComplexity: 5
  fileCount: 7
  dependencies: 10
  estimatedHours: 40
```

### Adaptation Process

1. **Complexity Analysis**:
```javascript
analyzeComplexity(plan) {
  return {
    tasks: countTasks(plan),
    files: estimateFiles(plan),
    complexity: calculateComplexity(plan)
  };
}
```

2. **Decomposition**:
```javascript
if (complexity > threshold) {
  decomposedTasks = breakDownTasks(plan);
  prioritizedTasks = prioritize(decomposedTasks);
  return createAdaptedPlan(prioritizedTasks);
}
```

3. **Progressive Execution**:
- Execute high-priority tasks first
- Validate after each batch
- Adjust plan based on results

## Task Tracking Workflow

### Simple Task Tracker

**Initialization**:
```javascript
tracker.init({
  project: "my-project",
  workflow: "iterative",
  phase: "development"
});
```

**Progress Tracking**:
```javascript
tracker.startTask("implement-auth");
tracker.updateProgress(50);
tracker.completeTask("implement-auth");
```

**Persistence**:
```json
// .ai/progress/current.json
{
  "workflow": "development",
  "currentTask": "implement-auth",
  "progress": 50,
  "completed": ["setup", "design"],
  "remaining": ["auth", "tests"]
}
```

### Progress Logger

**Observation Recording**:
```javascript
logger.observe({
  agent: "developer",
  action: "implementing JWT",
  decision: "using RS256 algorithm",
  rationale: "better security for distributed systems"
});
```

**Decision Tracking**:
```json
// .ai/observations/2024-01-20.json
{
  "timestamp": "2024-01-20T10:30:00Z",
  "observations": [
    {
      "agent": "developer",
      "decision": "chose PostgreSQL",
      "impact": "better ACID compliance"
    }
  ]
}
```

## Workflow Customization

### Custom Workflow Definition

Create `.bmad-workflow.yaml`:
```yaml
name: "Custom Development Flow"
type: "hybrid"

phases:
  - name: "discovery"
    agents: ["analyst", "ux"]
    duration: "2h"
    
  - name: "planning"
    agents: ["pm", "architect"]
    duration: "3h"
    
  - name: "implementation"
    agents: ["dev", "qa"]
    type: "iterative"
    
transitions:
  discovery->planning:
    requires: ["brief", "ux-research"]
    validation: true
    
  planning->implementation:
    requires: ["prd", "architecture"]
    approval: true
```

### Workflow Hooks

```yaml
hooks:
  prePhase:
    - validateRequirements
    - checkDependencies
    
  postPhase:
    - generateReport
    - notifyStakeholders
    
  onError:
    - logError
    - attemptRecovery
    - notifyTeam
```

## Workflow Validation

### Validation Points

1. **Phase Transitions**:
   - Document completeness
   - Schema validation
   - User approval

2. **Story Completion**:
   - Contract fulfillment
   - Test passage
   - Code review

3. **Workflow Completion**:
   - All stories complete
   - Integration tests pass
   - Deployment ready

### Validation Commands

```bash
# Validate workflow configuration
npm run validate:workflow

# Check workflow state
npm run workflow:status

# Validate transitions
npm run workflow:check-transition
```

## Error Handling in Workflows

### Error Recovery Strategies

1. **Automatic Retry**:
```yaml
errorHandling:
  autoRetry: true
  maxRetries: 3
  retryDelay: 5000
```

2. **Rollback**:
```yaml
errorHandling:
  rollbackOnError: true
  saveCheckpoints: true
```

3. **Manual Intervention**:
```yaml
errorHandling:
  pauseOnError: true
  notifyUser: true
```

### Error Types and Responses

| Error Type | Response | Recovery |
|------------|----------|----------|
| Validation Error | Block transition | Fix and retry |
| Agent Error | Retry with different approach | Manual intervention |
| System Error | Log and notify | Restart workflow |
| Contract Violation | Return to Dev | Fix implementation |

## Workflow Optimization

### Performance Tips

1. **Batch Operations**:
   - Group related stories
   - Validate in batches
   - Parallel processing where possible

2. **Caching**:
   - Cache planning documents
   - Reuse templates
   - Store common patterns

3. **Progressive Loading**:
   - Load only needed artifacts
   - Lazy load templates
   - Stream large files

### Workflow Metrics

Track and optimize:
- Phase duration
- Story completion time
- Error rates
- Iteration counts
- Validation pass rates

## Advanced Workflows

### Multi-Project Workflow

```yaml
multiProject:
  projects:
    - frontend
    - backend
    - mobile
  coordination: "synchronized"
  sharedArtifacts: ["prd", "architecture"]
```

### Continuous Deployment Workflow

```yaml
cd:
  trigger: "story-complete"
  pipeline:
    - test
    - build
    - deploy
  environments:
    - staging
    - production
```

### A/B Testing Workflow

```yaml
abTesting:
  variants: 2
  workflow:
    - implement-variant-a
    - implement-variant-b
    - deploy-both
    - analyze-metrics
```

## Workflow Best Practices

### 1. Start with Planning
- Never skip planning phase
- Ensure complete requirements
- Validate before proceeding

### 2. Use Contracts
- Every story needs a contract
- Contracts drive implementation
- Validate against contracts

### 3. Track Everything
- Monitor progress continuously
- Record all decisions
- Maintain audit trail

### 4. Validate Often
- Check at phase boundaries
- Validate each story
- Run integration tests

### 5. Handle Errors Gracefully
- Plan for failures
- Implement recovery strategies
- Learn from errors

## Workflow Commands Reference

### Orchestrator Commands
```
# Start workflow
/orchestrator
create comprehensive plan
start development phase

# Control workflow
pause workflow
resume workflow
restart workflow

# Query workflow
show workflow status
show current phase
list pending tasks
```

### Phase Commands
```
# Planning phase
start planning
complete planning
validate planning

# Development phase
start development
create next story
implement story
validate implementation
```

### Utility Commands
```
# Validation
validate workflow
check requirements
verify contracts

# Reporting
generate progress report
show metrics
export workflow log
```

## Troubleshooting Workflows

### Common Issues

**Workflow Stuck**:
- Check current state: `workflow:status`
- Review logs: `.ai/logs/`
- Restart if needed: `restart workflow`

**Phase Won't Transition**:
- Validate requirements: `validate:phase`
- Check artifacts exist
- Ensure approval given

**Contract Validation Fails**:
- Review contract: `validate:contract`
- Check implementation
- Fix and retry

**Progress Not Tracked**:
- Verify tracker running
- Check file permissions
- Review `.ai/progress/`

## Future Workflow Enhancements

### Planned Features
- Visual workflow designer
- Real-time collaboration
- Cloud workflow execution
- Custom workflow marketplace
- AI-powered optimization

### Research Areas
- Predictive workflow planning
- Automatic error resolution
- Cross-team coordination
- Workflow learning/improvement

## Conclusion

SEMAD-METHOD's workflow system provides structure and reliability to AI-powered development. By separating planning from implementation and using formal contracts, teams achieve consistent, high-quality results. The flexible workflow system adapts to different project needs while maintaining the core benefits of structured development.

For specific workflow configurations, see `.bmad-workflow.yaml` in your project root.