# Patch Plan Example

This document provides a comprehensive example of a grounded patch plan following the GEP (Grounded Editing Protocol).

## Example Patch Plan

```json
{
  "storyId": "FEAT-123",
  "version": "1.0.0",
  "bundleId": "bundle-feat-123-v1",
  "changes": [
    {
      "path": "src/services/user-service.js",
      "operations": [
        {
          "type": "add",
          "location": {
            "line": 45,
            "function": "createUser",
            "symbol": "createUser"
          },
          "content": "  // Validate email format\n  if (!isValidEmail(userData.email)) {\n    throw new Error('Invalid email format');\n  }"
        },
        {
          "type": "modify",
          "location": {
            "line": 23,
            "function": "validateUserData"
          },
          "oldContent": "function validateUserData(data) {\n  return data.name && data.email;\n}",
          "content": "function validateUserData(data) {\n  return data.name && data.email && isValidEmail(data.email);\n}"
        }
      ],
      "symbols": ["createUser", "validateUserData", "isValidEmail"],
      "rationale": "Add email validation to prevent invalid email addresses from being stored in the system. This addresses security concerns and data quality requirements specified in AC1 and AC3.",
      "mappedACs": ["AC1: Email validation must prevent invalid formats", "AC3: User creation must validate all required fields"],
      "impact": {
        "breakingChange": false,
        "affectedComponents": ["user-registration", "user-profile-update"],
        "rollbackPlan": "Remove email validation and revert to previous validation logic"
      }
    },
    {
      "path": "src/utils/validation.js",
      "operations": [
        {
          "type": "add",
          "location": {
            "line": 1,
            "symbol": "isValidEmail"
          },
          "content": "/**\n * Validates email format using RFC 5322 compliant regex\n * @param {string} email - Email address to validate\n * @returns {boolean} - True if email is valid\n */\nfunction isValidEmail(email) {\n  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n  return emailRegex.test(email);\n}\n\nmodule.exports = { isValidEmail };"
        }
      ],
      "symbols": ["isValidEmail"],
      "rationale": "Create reusable email validation utility to ensure consistent validation across the application. This centralizes validation logic and makes it testable.",
      "mappedACs": ["AC1: Email validation must prevent invalid formats"],
      "impact": {
        "breakingChange": false,
        "affectedComponents": ["user-service"],
        "rollbackPlan": "Remove validation.js file and inline validation in user-service.js"
      }
    }
  ],
  "tests": [
    {
      "path": "tests/services/user-service.test.js",
      "type": "unit",
      "description": "Test email validation in user creation and data validation",
      "coveredChanges": ["src/services/user-service.js"]
    },
    {
      "path": "tests/utils/validation.test.js",
      "type": "unit", 
      "description": "Test email validation utility with various email formats",
      "coveredChanges": ["src/utils/validation.js"]
    },
    {
      "path": "tests/integration/user-registration.test.js",
      "type": "integration",
      "description": "End-to-end test of user registration with email validation",
      "coveredChanges": ["src/services/user-service.js", "src/utils/validation.js"]
    }
  ],
  "riskLevel": "low",
  "riskMitigation": {
    "backupStrategy": "Database backup before deployment",
    "rollbackProcedure": "Revert to previous commit and redeploy",
    "monitoringPoints": ["user registration error rates", "email validation failures"]
  },
  "dependencies": [
    {
      "type": "file",
      "identifier": "src/services/user-service.js",
      "version": "current"
    },
    {
      "type": "package",
      "identifier": "jest",
      "version": "^29.0.0"
    }
  ],
  "signature": {
    "signedBy": "dev-agent",
    "timestamp": "2024-01-15T10:30:00Z",
    "checksum": "sha256:a1b2c3d4e5f6..."
  }
}
```

## Key Elements Explained

### Changes Structure
Each change includes:
- **Path**: Exact file path being modified
- **Operations**: Specific edit operations (add, modify, delete, move)
- **Symbols**: Functions, classes, or variables affected
- **Rationale**: Detailed explanation of why the change is needed
- **Mapped ACs**: Direct mapping to acceptance criteria from the story contract
- **Impact**: Assessment of breaking changes and affected components

### Test Coverage
Every change must be covered by appropriate tests:
- **Unit tests**: For individual functions and modules
- **Integration tests**: For component interactions
- **Acceptance tests**: For end-to-end behavior validation

### Risk Assessment
Risk levels are determined by:
- **Low**: Simple additions, no breaking changes
- **Medium**: Modifications to existing behavior, some risk of regression
- **High**: Breaking changes, complex refactoring
- **Critical**: Changes affecting core system functionality

### Signature Requirements
All patch plans must be signed:
- **SignedBy**: Agent or developer creating the plan
- **Timestamp**: When the plan was created and validated
- **Checksum**: Hash of the plan content to ensure integrity

## Validation Process

1. **Schema Validation**: Ensure the patch plan conforms to the JSON schema
2. **Bundle Validation**: Verify all referenced files exist in the task bundle
3. **Contract Validation**: Confirm mapped acceptance criteria exist in the story contract
4. **Cross-Reference Validation**: Ensure tests cover all changes and risk levels are appropriate

## Integration with Workflow

Patch plans are validated at the Development → QA gate:
1. Developer creates patch plan
2. Plan is validated against bundle and contract
3. If valid, plan is signed and stored
4. QA gate checks for signed patch plan before allowing progression

## CLI Usage

```bash
# Validate a patch plan
npm run patch-plan:validate -- patch-plan.json

# Validate with bundle and contract
node tools/patch-plan/validate-patch-plan.js patch-plan.json task-bundle.json story-contract.yaml

# Generate patch plan template
npm run patch-plan:template -- STORY-123
```
