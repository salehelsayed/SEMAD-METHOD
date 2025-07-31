# BMad Method Validation System

## Overview

The BMad Method framework includes a comprehensive validation system for ensuring all tasks and checklists conform to their defined schemas. This system helps maintain consistency and quality across all BMad components.

## Schema Definitions

### Task Schema (`task-schema.json`)
Validates regular task files with the following structure:
- **Required fields**: `id`, `name`
- **Optional fields**: `description`, `type`, `priority`, `category`, `steps`, `inputs`, `outputs`, etc.
- **Steps format**: Supports both object (legacy) and array formats

### Structured Task Schema (`structured-task-schema.json`)
Validates structured task files with enhanced features:
- **Required fields**: `id`
- **Optional fields**: `name`, `purpose`, `steps`, `inputs`, `outputs`, `metadata`, etc.
- **Steps format**: Array of step objects with actions or action
- **Additional features**: Support for rules, dependencies, complexity levels

### Checklist Schema (`checklist-schema.json`)
Validates checklist files with:
- **Required fields**: `id`, `name`, `categories`, `result`
- **Categories**: Array of category objects with items
- **Result status**: `pending`, `pass`, `partial`, or `fail`

## Validation Commands

### Validate Everything
```bash
npm run validate:all
```
Validates all tasks (regular and structured) and checklists in the project.

### Validate Specific Types
```bash
npm run validate:tasks      # Validate only task files
npm run validate:checklists  # Validate only checklist files
npm run validate:schemas     # Validate using the legacy validator
```

### Validate Story Contracts
```bash
npm run validate:story       # Validate a specific story
npm run validate:contracts   # Validate all story contracts
```

## Validation Scripts

### `scripts/validate-all.js`
The main comprehensive validation script that:
- Loads schemas using ModuleResolver
- Validates files against their appropriate schemas
- Provides detailed error reporting
- Supports command-line flags for selective validation
- Returns appropriate exit codes for CI/CD integration

### `scripts/validate-schemas.js`
The original validation script, updated to support:
- Regular tasks
- Structured tasks
- Checklists
- Schema resolution via ModuleResolver

## Directory Structure

```
bmad-core/
├── schemas/
│   ├── task-schema.json           # Regular task schema
│   ├── structured-task-schema.json # Structured task schema
│   └── checklist-schema.json      # Checklist schema
├── tasks/                         # Regular task files
├── structured-tasks/              # Structured task files
└── structured-checklists/         # Checklist files
```

## Schema Resolution

The validation system uses the `ModuleResolver` utility to find schemas:
1. Checks `core-config.yaml` for schema paths
2. Falls back to default locations if not configured
3. Supports both project-level and framework-level schemas

## Error Reporting

When validation fails, the system provides:
- File path that failed validation
- Type of validation (task, structured-task, checklist)
- Detailed error messages including:
  - Missing required fields
  - Type mismatches
  - Invalid enum values
  - Structural issues

Example error output:
```
File: bmad-core/structured-tasks/example.yaml
Type: task
Errors:
  • must have required property 'id'
  • /priority: must be equal to one of the allowed values
    {"allowedValues":["low","medium","high"]}
```

## Testing

The validation system includes comprehensive test coverage:

### Unit Tests
- `tests/validation.test.js` - Tests schema validation logic
- `tests/schema-structure.test.js` - Tests schema structure validity

### Integration Tests
- `tests/integration/validation-integration.test.js` - Tests full validation workflow

Run tests with:
```bash
npm test                    # Run all tests
npm test validation         # Run validation-specific tests
```

## CI/CD Integration

The validation system is designed for CI/CD pipelines:
- Returns exit code 0 when all files are valid
- Returns exit code 1 when validation errors are found
- Provides clear console output for build logs

Example GitHub Actions usage:
```yaml
- name: Validate BMad Files
  run: npm run validate:all
```

## Extending the Validation System

To add a new schema:
1. Create the schema JSON file in `bmad-core/schemas/`
2. Add the schema reference to `core-config.yaml`
3. Update `ModuleResolver` schema mapping if needed
4. Add validation logic to `validate-all.js`
5. Create corresponding tests

## Best Practices

1. **Run validation before commits**: Use git hooks or manually run validation
2. **Fix validation errors immediately**: Don't let invalid files accumulate
3. **Update schemas carefully**: Changes can break existing files
4. **Document schema changes**: Update this documentation when schemas change
5. **Test schema updates**: Ensure all existing files still validate