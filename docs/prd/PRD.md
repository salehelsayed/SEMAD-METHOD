---
id: PRD-001
version: "1.0.0"
features:
  - id: F-001
    name: Orchestrator Gates
    description: Add planning/dev/qa gates with validations
    priority: high
userStories:
  - id: US-001
    as: Orchestrator
    want: Enforce gates across phases
    so: Prevent ungrounded progress
acceptanceCriteria:
  - id: AC-PRD-1
    criteria: Gates block when validations fail
    testable: true
---

# Product Requirements Document (PRD)
# SEMAD-METHOD: Structured Engineering Method for AI Development

## 1. Executive Summary

SEMAD-METHOD is an enhanced fork of BMAD-METHOD that introduces structured, schema-driven workflows to minimize AI hallucination and improve code quality in AI-assisted software development. By converting free-form instructions to YAML/JSON schemas, implementing working memory systems, and establishing formal contracts between planning and implementation phases, SEMAD-METHOD ensures deterministic, traceable, and high-quality code generation.

## 2. Problem Statement

### Current Challenges with BMAD-METHOD

1. **Free-form Instructions**: Markdown-based tasks and checklists force LLMs to infer structure, leading to misinterpretation
2. **Context Loss**: Agents lack persistent memory between tasks, causing information drift
3. **Hallucination Risk**: Prose-based summaries between PRD and story creation introduce interpretation errors
4. **Monolithic Task Processing**: Large tasks are processed as single units without systematic decomposition
5. **Validation Gaps**: No automated validation between planning artifacts and implementation
6. **Workflow Rigidity**: Fixed linear workflows without options for iterative development
7. **User Input Loss**: Workflows proceeding without capturing critical user decisions
8. **Role Confusion**: Agents performing tasks outside their designated responsibilities
9. **Path Inconsistencies**: Hardcoded paths not matching actual file locations
10. **Limited Visibility**: Insufficient feedback about system operations

### Impact
- Inconsistent code quality
- Implementation drift from original requirements
- Increased debugging and rework cycles
- Reduced developer confidence in AI-generated code

## 3. Solution Overview

SEMAD-METHOD addresses these challenges through comprehensive improvements:

### Core Structural Enhancements
1. **Structured Task System**: YAML/JSON schemas replace markdown for deterministic execution
2. **Working Memory Protocol**: Persistent scratchpad and vector-based long-term memory with health monitoring
3. **Dependency Analysis**: Qdrant-based tracking of code dependencies for impact assessment
4. **Automated Validation**: Schema-based validation at every handoff point with mandatory story validation

### Workflow and Process Improvements
5. **Flexible Development Flows**: Choice between linear Dev→QA and iterative Dev↔QA workflows
6. **User Input Elicitation**: Systematic capture of user decisions across all workflows
7. **Epic Automation**: Complete epic processing through all stories without manual intervention
8. **Enhanced Transparency**: Verbose orchestrator logging and standardized messaging

### Advanced Features (In Development)
9. **Dynamic Plan Adaptation**: Automatic task decomposition using divide-and-conquer strategies
10. **Search Tool Generation**: Automated discovery of relevant documentation from PRDs
11. **StoryContract System**: Formal specification replacing prose summaries

## 4. Target Users

### Primary Users
- **Software Development Teams** using AI assistants for code generation
- **Technical Leads** managing AI-assisted development workflows
- **DevOps Engineers** implementing CI/CD with AI agents
- **Scrum Masters** orchestrating agile workflows with AI agents

### Secondary Users
- **Product Managers** defining requirements for AI implementation
- **QA Engineers** validating AI-generated code through review-only workflows
- **Enterprise Teams** requiring traceable, auditable AI workflows
- **Analysts** working with AI to create comprehensive requirements

## 5. Core Features

### 5.1 Structured Task & Checklist System

**Description**: Convert all tasks and checklists from markdown to YAML/JSON with explicit schemas

**Key Components**:
- Task schema with `id`, `name`, `purpose`, `steps`, `inputs`, `outputs`
- Checklist schema with `categories`, `items`, `result` tracking
- Automatic validation using JSON Schema
- Backward compatibility with existing markdown files

**Benefits**:
- Eliminates structural ambiguity
- Enables automated validation
- Supports tooling integration

### 5.2 Working Memory & Scratchboard

**Description**: Implement persistent memory system for agent sessions

**Key Components**:
- Session-based working memory files (`.ai/working_memory_*.json`)
- Scratchpad with `taskId`, `plan`, `currentStep`, `context`, `observations`
- Vector database integration (Qdrant) for long-term memory
- Helper tasks: `update-working-memory.yaml`, `retrieve-context.yaml`

**Benefits**:
- Maintains context across complex workflows
- Provides debugging trail
- Enables learning from past tasks

### 5.3 Dynamic Plan Adaptation

**Description**: Automatic decomposition of complex tasks using divide-and-conquer

**Key Components**:
- Dynamic planner module analyzing task complexity
- Sub-task generation with threshold rules (e.g., >5 steps)
- Real-time plan adjustment
- Configurable rules in `dynamic-plan-rules.yaml`

**Benefits**:
- Prevents monolithic processing errors
- Improves task completion rates
- Enables parallel sub-task execution

### 5.4 Automated Search Tool Generation

**Description**: Generate contextual search queries from PRD content

**Key Components**:
- Keyword extraction from PRD
- Domain-to-tool mapping (`tool-mappings.yaml`)
- Search connector configuration
- Integration with vector database ingestion

**Benefits**:
- Automatic documentation discovery
- Reduced manual research overhead
- Context-aware knowledge base building

### 5.5 StoryContract System

**Description**: Replace prose summaries with structured contracts

**Key Components**:
- JSON Schema for story contracts
- Fields: `apiEndpoints`, `filesToModify`, `acceptanceCriteriaLinks`
- Validation at story creation
- Contract-driven development workflow

**Benefits**:
- Eliminates interpretation errors
- Creates traceable requirements
- Enables automated test generation

### 5.6 Automated Validation Framework

**Description**: Schema-based validation at every workflow transition

**Key Components**:
- JSON Schemas for all artifacts
- Build-time validation (`npm run validate:contracts`)
- Test generation from contracts
- Continuous validation in CI/CD
- Automatic story validation before creation

**Benefits**:
- Early error detection
- Guaranteed schema compliance
- Automated quality gates

### 5.7 Enhanced Workflow Management

**Description**: Flexible workflow options and improved agent coordination

**Key Components**:
- User input elicitation for all workflows
- Choice between linear Dev→QA flow and iterative Dev↔QA loop
- Epic-level automated processing through all stories
- Improved orchestrator verbosity and transparency
- Direct file location knowledge from configuration

**Benefits**:
- Reduced hallucination through consistent user input
- Flexible development workflows to match team preferences
- Automated epic completion without manual oversight
- Better user visibility into system operations

### 5.8 Agent Role Clarification

**Description**: Clear separation of responsibilities between agents

**Key Components**:
- QA agent limited to review and feedback only
- Dev agent handles all code implementations
- Proper status updates at correct workflow stages
- "Implement next story" command for efficiency

**Benefits**:
- Clear accountability and traceability
- Prevents unauthorized code changes
- Streamlined developer workflow

### 5.9 Dependency Analysis System

**Description**: Track and analyze code dependencies for impact assessment

**Key Components**:
- Dependency graph stored in Qdrant vector database
- Automatic extraction of classes, functions, and imports
- Impact analysis before code changes
- Dependency warnings during implementation and review

**Benefits**:
- Reduced risk of breaking changes
- Comprehensive impact assessment
- Proactive dependency management

## 6. Technical Architecture

### 6.1 Directory Structure
```
SEMAD-METHOD/
├── bmad-core/
│   ├── structured-tasks/      # YAML task definitions
│   ├── structured-checklists/ # YAML checklist definitions
│   ├── schemas/              # JSON Schema definitions
│   ├── utils/                # Memory and validation utilities
│   └── errors/               # Error handling modules
├── tests/
│   ├── datamodel-test-generator.test.js
│   ├── story-contract-validation.test.js
│   └── dev-agent-datamodel-integration.test.js
└── scripts/
    ├── validate-schemas.js
    └── validate-story-contract.js
```

### 6.2 Key Technologies
- **Node.js v20+**: Runtime environment
- **YAML/JSON**: Structured data formats
- **JSON Schema**: Validation framework
- **Qdrant**: Vector database for memory
- **js-yaml**: YAML parsing
- **ajv**: JSON Schema validation

### 6.3 Integration Points
- **Git Hooks**: Pre-commit validation
- **CI/CD**: Automated schema validation
- **Vector Database**: Memory persistence
- **External APIs**: Search tool connectors

## 7. Implementation Roadmap

### Phase 1: Foundation (Completed)
- ✅ Convert tasks to YAML structure
- ✅ Create JSON Schema definitions
- ✅ Implement validation framework
- ✅ Set up test infrastructure
- ✅ Remove duplicated tasks and unify on structured-tasks (Story 3)
- ✅ Fix incorrect core-config path (Story 4)
- ✅ Use YAML story template instead of markdown (Story 9)

### Phase 2: Memory System (Completed)
- ✅ Working memory implementation
- ✅ Memory transaction handling
- ✅ Qdrant integration for long-term memory (Story 14)
- ✅ Context retrieval optimization
- ✅ Consistent use of short-term and long-term memory across agents (Story 15)
- ✅ Unified memory utilization and hygiene (Story 16)
- ✅ Memory health monitoring and reporting (Story 18)
- ✅ Memory hygiene and maintenance (Story 19)

### Phase 3: Workflow Enhancements (Completed)
- ✅ Ensure all workflows elicit user input (Story 1)
- ✅ Dev↔QA iterative loop option (Story 2)
- ✅ Implement next story command for Dev agent (Story 5)
- ✅ Prevent QA agent from implementing changes (Story 6)
- ✅ Correct QA status update location (Story 7)
- ✅ Automatic story validation (Story 8)
- ✅ Increased orchestrator verbosity (Story 10)
- ✅ Standardized output messages (Story 11)
- ✅ Improved file location knowledge (Story 12)
- ✅ Epic loop processing (Story 13)
- ✅ Improved user-agent interaction accuracy (Story 17)

### Phase 4: Advanced Features (In Progress)
- ⏳ Dynamic plan adaptation rules
- ⏳ Search tool generation from PRD
- ⏳ StoryContract full implementation
- ⏳ Automated test generation

### Phase 5: Production Readiness (Upcoming)
- Performance optimization
- Error recovery mechanisms
- Monitoring and observability
- Documentation and training

## 8. Success Metrics

### Quality Metrics
- **Hallucination Rate**: <5% interpretation errors (baseline: ~20%)
- **Implementation Accuracy**: >95% match to StoryContract
- **Validation Pass Rate**: >98% on first attempt
- **User Input Capture**: 100% of required inputs elicited
- **Memory Persistence**: >99% context retention across sessions

### Efficiency Metrics
- **Task Completion Time**: 30% reduction
- **Rework Rate**: <10% (baseline: ~35%)
- **Context Retrieval Speed**: <100ms average
- **Epic Completion**: 100% automated story processing
- **Dev-QA Cycle Time**: 40% reduction with iterative flow

### Adoption Metrics
- **Developer Satisfaction**: >4.5/5 rating
- **Tool Usage**: >80% of eligible workflows
- **Error Recovery Success**: >90% automatic recovery
- **Workflow Transparency**: >95% user understanding of system actions

## 9. Risk Mitigation

### Technical Risks
- **Schema Evolution**: Versioning strategy for backward compatibility
- **Memory Growth**: Automatic pruning and archival policies
- **Performance Impact**: Lazy loading and caching strategies

### Adoption Risks
- **Learning Curve**: Comprehensive documentation and examples
- **Migration Effort**: Automated conversion tools
- **Tool Resistance**: Gradual rollout with feedback loops

## 10. Implemented Enhancements

### 10.1 Workflow and User Interaction Improvements
- **Story 1**: Universal user input elicitation across all workflows
- **Story 2**: Optional Dev↔QA iterative loop alongside linear flow
- **Story 10**: Increased orchestrator verbosity for transparency
- **Story 11**: Standardized output messages across workflows
- **Story 13**: Automated epic processing through all stories
- **Story 17**: Enhanced user-agent interaction accuracy

### 10.2 Technical and Path Corrections
- **Story 3**: Unified task directory structure (structured-tasks only)
- **Story 4**: Corrected core-config.yaml path references
- **Story 9**: Migrated to YAML story templates
- **Story 12**: Direct file location resolution from config

### 10.3 Agent Role and Process Refinements
- **Story 5**: "Implement next story" command for Dev agent
- **Story 6**: QA agent restricted to review-only mode
- **Story 7**: Proper QA status updates at correct stages
- **Story 8**: Mandatory automatic story validation

### 10.4 Memory and Dependency Systems
- **Story 14**: Qdrant-based dependency analysis and impact checking
- **Story 15**: Consistent memory usage across all agents
- **Story 16**: Unified memory utilization with hygiene protocols
- **Story 18**: Memory health monitoring and reporting
- **Story 19**: Automated memory cleaning to prevent hallucination

## 11. Conclusion

SEMAD-METHOD transforms AI-assisted development from an unpredictable art to a structured engineering discipline. By addressing the root causes of hallucination and context loss, it enables teams to confidently leverage AI for complex software development while maintaining quality, traceability, and control.

The structured approach ensures that every artifact, from PRD to implementation, follows a validated schema, creating a chain of trust that significantly reduces errors and improves overall development velocity.
