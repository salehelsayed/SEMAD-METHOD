# 5. Core Features


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
