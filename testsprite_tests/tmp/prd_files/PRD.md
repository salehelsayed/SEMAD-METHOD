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

### Impact
- Inconsistent code quality
- Implementation drift from original requirements
- Increased debugging and rework cycles
- Reduced developer confidence in AI-generated code

## 3. Solution Overview

SEMAD-METHOD addresses these challenges through six core improvements:

1. **Structured Task System**: YAML/JSON schemas replace markdown for deterministic execution
2. **Working Memory Protocol**: Persistent scratchpad and vector-based long-term memory
3. **Dynamic Plan Adaptation**: Automatic task decomposition using divide-and-conquer strategies
4. **Search Tool Generation**: Automated discovery of relevant documentation from PRDs
5. **StoryContract System**: Formal specification replacing prose summaries
6. **Automated Validation**: Schema-based validation at every handoff point

## 4. Target Users

### Primary Users
- **Software Development Teams** using AI assistants for code generation
- **Technical Leads** managing AI-assisted development workflows
- **DevOps Engineers** implementing CI/CD with AI agents

### Secondary Users
- **Product Managers** defining requirements for AI implementation
- **QA Engineers** validating AI-generated code
- **Enterprise Teams** requiring traceable, auditable AI workflows

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

**Benefits**:
- Early error detection
- Guaranteed schema compliance
- Automated quality gates

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

### Phase 2: Memory System (In Progress)
- ✅ Working memory implementation
- ✅ Memory transaction handling
- ⏳ Qdrant integration for long-term memory
- ⏳ Context retrieval optimization

### Phase 3: Advanced Features (Upcoming)
- Dynamic plan adaptation rules
- Search tool generation from PRD
- StoryContract full implementation
- Automated test generation

### Phase 4: Production Readiness
- Performance optimization
- Error recovery mechanisms
- Monitoring and observability
- Documentation and training

## 8. Success Metrics

### Quality Metrics
- **Hallucination Rate**: <5% interpretation errors (baseline: ~20%)
- **Implementation Accuracy**: >95% match to StoryContract
- **Validation Pass Rate**: >98% on first attempt

### Efficiency Metrics
- **Task Completion Time**: 30% reduction
- **Rework Rate**: <10% (baseline: ~35%)
- **Context Retrieval Speed**: <100ms average

### Adoption Metrics
- **Developer Satisfaction**: >4.5/5 rating
- **Tool Usage**: >80% of eligible workflows
- **Error Recovery Success**: >90% automatic recovery

## 9. Risk Mitigation

### Technical Risks
- **Schema Evolution**: Versioning strategy for backward compatibility
- **Memory Growth**: Automatic pruning and archival policies
- **Performance Impact**: Lazy loading and caching strategies

### Adoption Risks
- **Learning Curve**: Comprehensive documentation and examples
- **Migration Effort**: Automated conversion tools
- **Tool Resistance**: Gradual rollout with feedback loops

## 10. Conclusion

SEMAD-METHOD transforms AI-assisted development from an unpredictable art to a structured engineering discipline. By addressing the root causes of hallucination and context loss, it enables teams to confidently leverage AI for complex software development while maintaining quality, traceability, and control.

The structured approach ensures that every artifact, from PRD to implementation, follows a validated schema, creating a chain of trust that significantly reduces errors and improves overall development velocity.