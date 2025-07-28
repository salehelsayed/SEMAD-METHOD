# BMad Workflow Patterns

## Overview
This document describes common workflow patterns used in the BMad-Method system for multi-agent coordination and task execution.

## Basic Patterns

### Sequential Workflow
Agents execute tasks one after another in a defined sequence.

```yaml
pattern: sequential
agents:
  - analyst: gather-requirements
  - architect: design-system
  - dev: implement-solution
  - qa: validate-implementation
```

### Parallel Workflow
Multiple agents work simultaneously on independent tasks.

```yaml
pattern: parallel
agents:
  concurrent:
    - ux-expert: design-ui
    - architect: design-api
  merge: pm
```

### Conditional Workflow
Workflow branches based on conditions or outcomes.

```yaml
pattern: conditional
decision_point: requirement-complexity
branches:
  simple: [dev, qa]
  complex: [architect, dev, qa]
  critical: [analyst, architect, dev, qa, po]
```

## Advanced Patterns

### Iterative Refinement
Agents collaborate in cycles to refine outputs.

```yaml
pattern: iterative
cycles:
  - agents: [analyst, pm]
    until: requirements-clear
  - agents: [architect, dev]
    until: design-approved
```

### Hub and Spoke
Central coordinator manages distributed agents.

```yaml
pattern: hub-spoke
hub: bmad-orchestrator
spokes:
  - agent: analyst
    trigger: new-requirement
  - agent: dev
    trigger: story-ready
  - agent: qa
    trigger: code-complete
```

### Pipeline Pattern
Continuous flow with buffering between stages.

```yaml
pattern: pipeline
stages:
  - name: analysis
    agent: analyst
    buffer: requirement-queue
  - name: development
    agent: dev
    buffer: story-queue
  - name: testing
    agent: qa
    buffer: test-queue
```

## Context Management Patterns

### Context Accumulation
Each agent adds to a growing context.

```yaml
context_strategy: accumulate
agents:
  - analyst:
      adds: [requirements, constraints]
  - architect:
      adds: [design, technical-decisions]
  - dev:
      adds: [implementation-details, test-results]
```

### Context Transformation
Agents transform context for next agent.

```yaml
context_strategy: transform
transformations:
  - from: analyst
    to: architect
    transform: requirements-to-specs
  - from: architect
    to: dev
    transform: specs-to-tasks
```

### Context Filtering
Only relevant context passed between agents.

```yaml
context_strategy: filter
rules:
  - from: analyst
    to: dev
    include: [acceptance-criteria, api-specs]
    exclude: [market-research, competitor-analysis]
```

## Error Handling Patterns

### Retry with Backoff
Automatic retry with increasing delays.

```yaml
error_strategy: retry
max_attempts: 3
backoff: exponential
base_delay: 1000
```

### Circuit Breaker
Prevent cascading failures.

```yaml
error_strategy: circuit-breaker
threshold: 5
timeout: 30000
recovery: gradual
```

### Compensating Transaction
Rollback on failure with compensation.

```yaml
error_strategy: compensate
rollback_sequence:
  - agent: dev
    action: revert-changes
  - agent: architect
    action: update-design
  - agent: pm
    action: notify-stakeholders
```

## Performance Patterns

### Resource Pooling
Reuse agent instances across workflows.

```yaml
optimization: pooling
pool_size: 5
idle_timeout: 300000
warm_start: true
```

### Lazy Loading
Load agents only when needed.

```yaml
optimization: lazy-load
preload: [bmad-orchestrator]
on_demand: [analyst, architect, dev, qa]
```

### Caching Strategy
Cache frequently accessed contexts.

```yaml
optimization: caching
cache_strategy: lru
max_size: 100
ttl: 3600000
```

## Best Practices

1. **Start Simple**: Begin with sequential patterns and evolve as needed
2. **Monitor Performance**: Track workflow execution times and bottlenecks
3. **Handle Failures Gracefully**: Always include error recovery strategies
4. **Document Decisions**: Record why specific patterns were chosen
5. **Test Workflows**: Validate workflows with different scenarios
6. **Version Control**: Track workflow changes over time
7. **Security First**: Ensure context doesn't leak sensitive data between agents