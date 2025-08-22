# BMad Method Guiding Principles

The BMad Method is a natural language framework for AI-assisted software development. These principles ensure contributions maintain the method's effectiveness.

## Core Principles

### 1. Dev Agents Must Be Lean

- **Minimize dev agent dependencies**: Development agents that work in IDEs must have minimal context overhead
- **Save context for code**: Every line counts - dev agents should focus on coding, not documentation
- **Web agents can be larger**: Planning agents (PRD Writer, Architect) used in web UI can have more complex tasks and dependencies
- **Small files, loaded on demand**: Multiple small, focused files are better than large files with many branches

### 2. Natural Language First

- **Everything is markdown**: Agents, tasks, templates - all written in plain English
- **No code in core**: The framework itself contains no programming code, only natural language instructions
- **Self-contained templates**: Templates are defined as YAML files with structured sections that include metadata, workflow configuration, and detailed instructions for content generation

### 3. Agent and Task Design

- **Agents define roles**: Each agent is a persona with specific expertise (e.g., Frontend Developer, API Developer)
- **Tasks are procedures**: Step-by-step instructions an agent follows to complete work
- **Templates are outputs**: Structured documents with embedded instructions for generation
- **Dependencies matter**: Explicitly declare only what's needed

## Practical Guidelines

### When to Add to Core

- Universal software development needs only
- Doesn't bloat dev agent contexts
- Follows existing agent/task/template patterns

### When to Create Expansion Packs

- Domain-specific needs beyond software development
- Non-technical domains (business, wellness, education, creative)
- Specialized technical domains (games, infrastructure, mobile)
- Heavy documentation or knowledge bases
- Anything that would bloat core agents

See [Expansion Packs Guide](../docs/expansion-packs.md) for detailed examples and ideas.

### Agent Design Rules

1. **Web/Planning Agents**: Can have richer context, multiple tasks, extensive templates
2. **Dev Agents**: Minimal dependencies, focused on code generation, lean task sets
3. **All Agents**: Clear persona, specific expertise, well-defined capabilities

### Task Writing Rules

1. Write clear step-by-step procedures
2. Use markdown formatting for readability
3. Keep dev agent tasks focused and concise
4. Planning tasks can be more elaborate
5. **Prefer multiple small tasks over one large branching task**
   - Instead of one task with many conditional paths
   - Create multiple focused tasks the agent can choose from
   - This keeps context overhead minimal
6. **Reuse common tasks** - Don't create new document creation tasks
   - Use the existing `create-doc` task
   - Pass the appropriate YAML template with structured sections
   - This maintains consistency and reduces duplication

### Template Rules

Templates follow the [BMad Document Template](common/utils/bmad-doc-template.md) specification using YAML format:

1. **Structure**: Templates are defined in YAML with clear metadata, workflow configuration, and section hierarchy
2. **Separation of Concerns**: Instructions for LLMs are in `instruction` fields, separate from content
3. **Reusability**: Templates are agent-agnostic and can be used across different agents
4. **Key Components**:
   - `template` block for metadata (id, name, version, output settings)
   - `workflow` block for interaction mode configuration
   - `sections` array defining document structure with nested subsections
   - Each section has `id`, `title`, and `instruction` fields
5. **Advanced Features**:
   - Variable substitution using `{{variable_name}}` syntax
   - Conditional sections with `condition` field
   - Repeatable sections with `repeatable: true`
   - Agent permissions with `owner` and `editors` fields
   - Examples arrays for guidance (never included in output)
6. **Clean Output**: YAML structure ensures all processing logic stays separate from generated content

## Remember

- The power is in natural language orchestration, not code
- Dev agents code, planning agents plan
- Keep dev agents lean for maximum coding efficiency
- Expansion packs handle specialized domains

## Deterministic Generation Principles (AH-007)

### Core Philosophy
BMAD emphasizes predictable, traceable, and consistent code generation to ensure reliability and maintainability of AI-generated artifacts.

### Deterministic Templates
All generation must use structured templates with explicit placeholders:

- **Required Placeholders**: Must be filled for valid output
- **Optional Placeholders**: Can be omitted based on context
- **Traceability Fields**: Link generated content to source requirements
- **Metadata Fields**: Track generation process and versioning

### Low-Temperature Generation
- **Primary Temperature**: 0.1 (highly deterministic)
- **Fallback Temperature**: 0.2 (slightly more creative if needed)
- **Seed Values**: Fixed seeds (42) for reproducible results
- **Token Limits**: Conservative limits to maintain focus

### Template Structure Requirements
1. **Version Control**: All templates must include version numbers
2. **Traceability**: Explicit links to parent artifacts
3. **Validation**: Built-in placeholders for validation criteria
4. **Metadata**: Generation timestamp, agent, and settings

### Generation Process
1. **Load Configuration**: Use `scripts/generation/config.json`
2. **Validate Input**: Ensure all required data is present
3. **Apply Template**: Fill placeholders deterministically
4. **Validate Output**: Check for completeness and consistency
5. **Generate Metadata**: Include traceability information

### When to Deviate
Deterministic generation should be the default, but deviations are acceptable when:

- **Creative Exploration**: Initial brainstorming or research phases
- **Edge Case Handling**: Unusual requirements need adaptive solutions
- **User Preference**: Explicit user request for more creative output
- **Emergency Fixes**: Critical issues requiring rapid, non-standard solutions

### Quality Assurance
- **Template Validation**: Regular checks for template integrity
- **Output Consistency**: Compare outputs across multiple generations
- **Traceability Verification**: Ensure all links are valid and current
- **Metadata Completeness**: Verify all required metadata is present

### Integration Points
- **Story Creation**: Use deterministic story templates
- **Test Generation**: Apply consistent test patterns
- **Documentation**: Maintain structured documentation templates
- **Code Generation**: Follow predictable code patterns

### Tools and Commands
```bash
# Generate story with deterministic template
node scripts/generation/deterministic-generator.js story input.json output.md

# Generate test with template
node scripts/generation/deterministic-generator.js test test-data.json test-output.js

# Validate template completeness
npm run templates:validate

# Check generation configuration
npm run generation:config:check
```

### Configuration Management
- **Central Config**: `scripts/generation/config.json` for all settings
- **Template Registry**: Track all available templates and versions
- **Model Settings**: Consistent model parameters across agents
- **Seed Management**: Maintain seed values for reproducibility

### Monitoring and Metrics
- **Generation Consistency**: Track output variations across runs
- **Template Usage**: Monitor which templates are most/least used
- **Error Rates**: Identify common generation failures
- **Traceability Coverage**: Ensure all outputs have proper links

### Best Practices
1. **Always use templates** for structured output
2. **Set low temperature** for consistent results
3. **Include traceability** in all generated content
4. **Validate outputs** against expected structure
5. **Version templates** and track changes
6. **Document deviations** from deterministic approach
7. **Regular template reviews** for improvements
8. **Seed management** for reproducible results

