# AH-015: Instruction Hierarchy and Structured Outputs Implementation

## Overview

This implementation adds instruction hierarchy enforcement and structured output validation to the SEMAD-METHOD framework, ensuring consistent agent behavior and traceable decision-making.

## Implementation Details

### 1. Instruction Hierarchy

**Priority Order**: system > gate rules > StoryContract > PRD/Architecture > templates

- **System instructions**: Immutable core framework rules
- **Gate rules**: State transition validation and workflow gates
- **StoryContract**: Specific story execution requirements
- **PRD/Architecture**: Context and implementation guidance
- **Templates**: Format and structure guidance

### 2. No-Invention Rule

Agents must never create information not explicitly provided or derivable from context. When requirements are ambiguous:
1. Document the ambiguity in structured output
2. Escalate to user rather than making assumptions
3. Include validation methods for all assumptions

### 3. Escalation Protocol

When instructions conflict:
1. Higher priority always wins
2. Document conflict in structured output decisions section
3. Escalate to user if system-level conflict
4. Never proceed with ambiguous instructions
5. Always validate instruction compliance before execution

## Files Created/Modified

### New Files

1. **`bmad-core/templates/structured-output-tmpl.json`**
   - Comprehensive JSON schema for all agent outputs
   - Required fields: type, storyId, inputs, outputs, decisions, assumptions, risks
   - Supports traceability and validation metadata

2. **`tools/instruction-hierarchy/validate-cli.js`**
   - CLI tool for validation and hierarchy management
   - Commands: init, validate-file, hierarchy, test

### Modified Files

1. **`bmad-core/agents/bmad-orchestrator.md`**
   - Added instruction hierarchy enforcement guidelines
   - Added escalation protocol documentation
   - Added structured-output-tmpl.json to dependencies

2. **`bmad-core/agents/sm.md`**
   - Added instruction hierarchy principles
   - Added structured output requirements
   - Added no-invention rule compliance

3. **`bmad-core/agents/dev.md`**
   - Added instruction hierarchy with StoryContract precedence
   - Added structured output for complex implementations
   - Added no-invention rule for implementation scope

4. **`bmad-core/agents/pm.md`**
   - Added instruction hierarchy for PRD creation
   - Added structured output for strategic documents
   - Added no-invention rule for requirements

5. **`tools/instruction-hierarchy/instruction-hierarchy-manager.js`**
   - Added structured_output schema to validation system
   - Enhanced schema validation capabilities

6. **`tools/instruction-hierarchy/structured-output-validator.js`**
   - Added instruction hierarchy validation
   - Added no-invention rule compliance checks
   - Enhanced escalation documentation validation

## Usage

### Initialize the System

```bash
node tools/instruction-hierarchy/validate-cli.js init
```

### Validate Structured Output

```bash
node tools/instruction-hierarchy/validate-cli.js validate-file <file.json>
```

### Test Validation

```bash
node tools/instruction-hierarchy/validate-cli.js test
```

### View Instruction Hierarchy

```bash
node tools/instruction-hierarchy/validate-cli.js hierarchy --resolve --agent sm
```

## Structured Output Schema

All agent outputs should follow the structured-output-tmpl.json schema:

```json
{
  "type": "story|prd|architecture_decision|...",
  "storyId": "AH-015",
  "inputs": {
    "sources": [...],
    "context": {...}
  },
  "outputs": {
    "primary": {...},
    "artifacts": [...],
    "validation_status": {...}
  },
  "decisions": [...],
  "assumptions": [...],
  "risks": [...]
}
```

## Key Features

### 1. Schema Validation
- JSON Schema validation for all structured outputs
- Type checking and required field validation
- Enum validation for controlled vocabularies

### 2. Instruction Compliance
- Hierarchy-aware instruction resolution
- No-invention rule enforcement
- Escalation documentation requirements

### 3. Traceability
- Complete input source tracking
- Decision rationale documentation
- Assumption validation requirements
- Risk mitigation strategies

### 4. Quality Assurance
- Automated validation reporting
- Compliance scoring
- Violation tracking and analysis

## Benefits

1. **Consistency**: All agents follow the same output structure
2. **Traceability**: Every decision is documented with rationale
3. **Quality**: Automated validation catches issues early
4. **Governance**: Clear instruction hierarchy prevents conflicts
5. **Compliance**: No-invention rule prevents hallucination
6. **Maintainability**: Structured outputs enable better tooling

## Integration with Existing Workflow

The instruction hierarchy and structured outputs integrate seamlessly with existing SEMAD-METHOD workflows:

- **Planning Phase**: Analyst, PM, and Architect outputs use structured format
- **Development Phase**: Story creation and implementation follow hierarchy
- **QA Phase**: Validation results use structured reporting
- **Handoff**: All agent transitions include structured context

## Future Enhancements

1. **Real-time Validation**: Integrate validation into agent execution
2. **Advanced Analytics**: Pattern analysis across structured outputs
3. **Automated Reporting**: Dashboard for compliance monitoring
4. **Integration Testing**: Validate cross-agent workflows
5. **Performance Optimization**: Caching and incremental validation