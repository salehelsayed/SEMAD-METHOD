# 6. Technical Architecture


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
