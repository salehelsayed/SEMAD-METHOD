---

# Story {{STORY_ID}}: {{STORY_TITLE}}

## Status
{{STORY_STATUS}}  # Draft, In Progress, Review, Done

## Priority
{{STORY_PRIORITY}}  # Critical, High, Medium, Low

## Story
As a {{PERSONA}}, I want {{FUNCTIONALITY}} so that {{BUSINESS_VALUE}}.

## Context
{{STORY_CONTEXT}}  # Background information and current state

## Acceptance Criteria
{{#ACCEPTANCE_CRITERIA_DETAILED}}
{{ID}}. **{{TITLE}}**
   - Given: {{GIVEN}}
   - When: {{WHEN}}
   - Then: {{THEN}}
   - Verification: {{VERIFICATION_METHOD}}
{{/ACCEPTANCE_CRITERIA_DETAILED}}

## Definition of Ready (DoR-Mini)
- [ ] Objective defined (single sentence)
- [ ] Interfaces listed (inbound/outbound)
- [ ] Data contracts specified (schemas for payloads)
- [ ] State changes identified (tables/keys, rules)
- [ ] Constraints stated (perf/platforms/protocols/versions)
- [ ] Acceptance tests listed (5–8 black-box checks)
- [ ] Assumptions frozen (A-IDs with change budget)
- [ ] Done signals specified (logs/telemetry/UI markers)
Target: {{DOR_TARGET}}

## Tasks / Subtasks
# This section is rendered from StoryContract.workBreakdown to ensure 1:1 human+machine alignment
{{#WB_TASKS}}
- [ ] {{ID}}: {{TITLE}} (AC: {{#AC_REFS}}{{.}} {{/AC_REFS}})(files: {{#CHANGES_FILES}}{{PATH}} {{/CHANGES_FILES}})(tests: {{#TESTS_MUST_ADD}}{{PATH}} {{/TESTS_MUST_ADD}})
  {{#SUBTASKS}}
  - [ ] {{ID}} {{DESCRIPTION}} → outcome: {{OUTCOME}}
  {{/SUBTASKS}}
{{/WB_TASKS}}

## Technical Requirements
### Dependencies
{{#DEPENDENCIES}}
- {{TYPE}}: {{IDENTIFIER}} ({{VERSION}})  # package, service, file
{{/DEPENDENCIES}}

### Performance Criteria
{{#PERFORMANCE_CRITERIA}}
- {{METRIC}}: {{TARGET_VALUE}}  # response_time, throughput, etc.
{{/PERFORMANCE_CRITERIA}}

### Security Requirements
{{#SECURITY_REQUIREMENTS}}
  - {{REQUIREMENT}}  # Authentication, authorization, data protection
{{/SECURITY_REQUIREMENTS}}

## Existing Capabilities & Reuse
- Reference: .ai/reports/sm/codebase-inventory.md
- Summary: {{REUSE_SUMMARY}}
- Relevant Utilities:
  {{#REUSE_UTILS}}
  - {{.}}
  {{/REUSE_UTILS}}
- Relevant Services/APIs:
  {{#REUSE_SERVICES}}
  - {{.}}
  {{/REUSE_SERVICES}}
- Relevant Components/Hooks:
  {{#REUSE_COMPONENTS}}
  - {{.}}
  {{/REUSE_COMPONENTS}}
- Scripts/Tools:
  {{#REUSE_TOOLS}}
  - {{.}}
  {{/REUSE_TOOLS}}
- Tests to Build On:
  {{#REUSE_TESTS}}
  - {{.}}
  {{/REUSE_TESTS}}

## Inputs
{{#STORY_INPUTS}}
- {{.}}
{{/STORY_INPUTS}}

## Outputs
{{#STORY_OUTPUTS}}
- {{.}}
{{/STORY_OUTPUTS}}

## Integration Touchpoints
{{#INTEGRATION_TOUCHPOINTS}}
- {{.}}  # service/protocol + exact endpoint/topic/path (e.g., REST GET /v1/users/:id; Kafka topic user.updates)
{{/INTEGRATION_TOUCHPOINTS}}

## Implementation Checklist
{{#IMPLEMENTATION_GROUPS}}
### {{GROUP_TITLE}}  # Keep groups tight (e.g., Migration, DAO Updates, Tests, Telemetry)
{{#ITEMS}}
- [ ] {{DESCRIPTION}}  # Format: Verb + concrete target + success signal (e.g., "Generate migration v15 dropping only from_peer_id FK and verify rollback restores it")
{{/ITEMS}}
{{/IMPLEMENTATION_GROUPS}}
{{^IMPLEMENTATION_GROUPS}}
### Migration
- [ ] Replace this placeholder with action-target-success items grouped by category
{{/IMPLEMENTATION_GROUPS}}

### Companion References
{{#IMPLEMENTATION_REFERENCES}}
- See {{PATH}}:{{SECTION}}  # Keep checklist in story and point to extended plan
{{/IMPLEMENTATION_REFERENCES}}
{{^IMPLEMENTATION_REFERENCES}}
- See docs/stories/<companion>.md:<section-name>
{{/IMPLEMENTATION_REFERENCES}}

## Implementation Plan (Detailed)
### Files to Create
{{#FILES_TO_CREATE}}
- `{{PATH}}`: {{PURPOSE}}
{{/FILES_TO_CREATE}}
{{^FILES_TO_CREATE}}
- N/A
{{/FILES_TO_CREATE}}

### Files to Modify
{{#FILES_TO_MODIFY_DETAILED}}
- `{{PATH}}`: {{MODIFICATION_TYPE}} - {{REASON}}
{{/FILES_TO_MODIFY_DETAILED}}
{{^FILES_TO_MODIFY_DETAILED}}
- N/A
{{/FILES_TO_MODIFY_DETAILED}}

### Test Requirements
{{#TEST_REQUIREMENTS}}
- {{TEST_TYPE}}: {{DESCRIPTION}}
  - File: `{{TEST_FILE}}`
  - Coverage: {{COVERAGE_TARGET}}%
{{/TEST_REQUIREMENTS}}
{{^TEST_REQUIREMENTS}}
- Document required tests with success signals (unit, integration, contract)
{{/TEST_REQUIREMENTS}}

## Flow Chart
### Existing Artifacts
- Files:
  {{#FC_EXISTING_FILES}}
  - {{.}}
  {{/FC_EXISTING_FILES}}
- Classes:
  {{#FC_EXISTING_CLASSES}}
  - {{.}}
  {{/FC_EXISTING_CLASSES}}
- Functions:
  {{#FC_EXISTING_FUNCTIONS}}
  - {{.}}
  {{/FC_EXISTING_FUNCTIONS}}

### New Work
- Files:
  {{#FC_NEW_FILES}}
  - {{.}}
  {{/FC_NEW_FILES}}
- Components/Modules:
  {{#FC_NEW_COMPONENTS}}
  - {{.}}
  {{/FC_NEW_COMPONENTS}}

### Execution Steps
{{#FC_STEPS}}
1. {{.}}
{{/FC_STEPS}}

### Output Sinks
{{#FC_OUTPUT_SINKS}}
- {{.}}  # e.g., logs, telemetry, DB tables, external endpoints
{{/FC_OUTPUT_SINKS}}

### ASCII Flow (optional)
```
[{{FC_ENTRY}}] -> [{{FC_STEP1}}] -> [{{FC_STEP2}}] -> [{{FC_OUTPUT}}]
```

## Sequence Diagram (ASCII)
```
{{SEQ_ACTOR_1}} -> {{SEQ_ACTOR_2}}: {{SEQ_MSG_1}}
{{SEQ_ACTOR_2}} -> {{SEQ_ACTOR_3}}: {{SEQ_MSG_2}}
{{SEQ_ACTOR_3}} --> {{SEQ_ACTOR_1}}: {{SEQ_RESP_1}}
```

## Debug Logging Requirements
- Naming: Use stable, namespaced event names (e.g., APP_FEATURE_ACTION)
- Purpose: Verify implementation progress and behavior via structured logs/telemetry

{{#DEBUG_LOG_EVENTS}}
- Event: {{NAME}}
  - Level: {{LEVEL}}  # debug|info|warn|error
  - When: {{WHEN}}    # precise trigger condition
  - Fields:
    {{#FIELDS}}
    - {{KEY}}: {{TYPE}}{{#REQUIRED}} (required){{/REQUIRED}}
    {{/FIELDS}}
  - Sample:
    ```json
    {{SAMPLE_JSON}}
    ```
{{/DEBUG_LOG_EVENTS}}

  ## Risk Assessment
  **Risk Level**: {{RISK_LEVEL}}  # Low, Medium, High, Critical

### Identified Risks
{{#RISKS}}
- **{{RISK_TYPE}}**: {{DESCRIPTION}}
  - Probability: {{PROBABILITY}}  # Low, Medium, High
  - Impact: {{IMPACT}}            # Low, Medium, High
  - Mitigation: {{MITIGATION}}
{{/RISKS}}

### Rollback Plan
{{ROLLBACK_PLAN}}

## Definition of Done
{{#DEFINITION_OF_DONE}}
- [ ] {{CRITERION}}  # Specific, measurable completion criteria
{{/DEFINITION_OF_DONE}}

## Traceability
- **Epic**: [{{EPIC_ID}}]({{EPIC_LINK}})
- **Requirements**: {{REQUIREMENTS_TRACEABILITY}}
- **Architecture**: [{{ARCHITECTURE_DOC}}]({{ARCHITECTURE_LINK}})
- **Tests**: {{TEST_TRACEABILITY}}

## Generation Metadata
- **Template Version**: {{TEMPLATE_VERSION}}
- **Generated At**: {{GENERATION_TIMESTAMP}}
- **Generated By**: {{GENERATOR_AGENT}}
- **Generation Seed**: {{GENERATION_SEED}}
- **Temperature**: {{GENERATION_TEMPERATURE}}

