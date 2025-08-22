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

## Preflight Checks Suite

The preflight suite validates all aspects of code changes before they progress through the pipeline:

### Available Checks
- **schema-check**: Validates artifacts against JSON schemas
- **contract-check**: Ensures story contracts are present and valid
- **grounding-check**: Verifies all referenced files/symbols exist
- **lint-check**: Runs project linters
- **type-check**: Runs TypeScript type checking
- **build-check**: Ensures the project builds successfully

### Running Checks
```bash
# Run individual checks
npm run preflight:schema
npm run preflight:contract
npm run preflight:grounding -- patch-plan.json bundle.json
npm run preflight:lint
npm run preflight:type
npm run preflight:build

# Run all checks
npm run preflight:all
```

### Gate Integration
Preflight checks are enforced at the Dev→QA gate to ensure only well-formed changes proceed.

### Interpreting Results
- Each check returns 0 on success, non-zero on failure
- Results are logged to `.ai/test-logs/preflight-<timestamp>.json`
- Failed checks provide actionable error messages

## Reference Checker (AH-006)

The static reference checker validates that all file and symbol references in patch plans are resolvable.

### Overview

The reference checker prevents "hallucinated" code from being merged by:
1. Scanning the repository for existing files and symbols
2. Analyzing patch plans to extract new files and symbols that will be created
3. Validating all references in changed code against known + to-be-created assets
4. Failing the check if any references are unresolvable

### Language Support

#### JavaScript/TypeScript
- Import/export statements (`require`, `import`, `module.exports`)
- Function declarations and calls
- Class declarations and usage
- Variable references
- TypeScript-specific: interfaces, types, enums

#### Markdown
- File links: `[text](path/to/file)`
- Image references: `![alt](path/to/image)`
- Code fence file references

#### YAML
- File path values in configuration
- Path arrays and lists

### Usage

```bash
# Check references in a patch plan
npm run reference:check

# Direct usage
node tools/reference-checker/check-references.js patch-plan.json

# With custom project directory
node tools/reference-checker/check-references.js patch-plan.json /path/to/project
```

### Integration

The reference checker is automatically invoked by:
- `npm run preflight:all` (see AH-003)
- Development → QA gate (see AH-004)

### Reference Types

#### File References
- Relative paths: `./utils/helper.js`, `../config/settings.json`
- Absolute project paths: `/src/components/Button.tsx`
- Direct file names: `package.json`, `README.md`

#### Import References
- Node modules: `require('express')` (assumed available)
- Local modules: `require('./utils')`, `import { helper } from '../lib'`
- Type imports: `import type { User } from './types'`

#### Symbol References
- Function calls: `calculateTotal()`, `user.getName()`
- Class usage: `new UserService()`
- Variable access: `config.apiUrl`

### Resolution Logic

1. **Known Assets**: Files and symbols currently in the repository
2. **Created Assets**: Files and symbols defined in the patch plan
3. **Resolution**: Reference is valid if it exists in known OR created assets

### Error Types

- **Unresolved Reference**: Symbol/file not found in known or created sets
- **Parse Error**: Unable to extract references from content
- **Module Resolution**: Cannot resolve local module imports

### Reports

Reference check results are saved to `.ai/reference-check.json`:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "summary": {
    "filesScanned": 150,
    "symbolsFound": 45,
    "referencesChecked": 12,
    "errorsFound": 0,
    "passed": true
  },
  "references": [...],
  "errors": [...]
}
```

### Configuration

The reference checker uses conservative rules to minimize false negatives:
- Unknown reference types are assumed valid
- External module imports are not validated
- Dynamic imports and eval statements are not checked

### Extending Support

To add support for new languages:

1. Create a parser in `tools/reference-checker/parsers/`
2. Implement `extractSymbols(content, filePath)` and `extractReferences(content, filePath)`
3. Register the parser in `check-references.js`

### Limitations

- Does not validate runtime-generated references
- Cannot check dynamic import paths
- May miss complex destructuring patterns
- Assumes well-formed code syntax

## Security Guardrails (AH-013)

The BMad Method includes automated security guardrails that run in CI/CD pipelines to detect and prevent security vulnerabilities from entering the codebase.

### Overview

Security guardrails provide two main protection layers:
1. **Secret Scanning**: Detects hardcoded secrets, API keys, and credentials
2. **Dependency Audit**: Identifies known vulnerabilities in npm packages

### GitHub Actions Integration

The security guardrails are automatically enforced via `.github/workflows/security-guardrails.yml`:

```yaml
name: Security Guardrails
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
```

### Security Override Mechanism

For authorized scenarios where security violations must be bypassed:

1. Add the `security-override` label to your pull request
2. The workflow will allow the PR to proceed with a warning
3. Ensure proper authorization before using this override

### Secret Scanning (`scripts/security/secret-scan.sh`)

#### Detected Secret Types

- **AWS Credentials**: Access keys, secret keys
- **GitHub Tokens**: Personal access tokens, fine-grained tokens
- **API Keys**: Generic API key patterns
- **Private Keys**: RSA, DSA, ECDSA, Ed25519 keys
- **JWT Tokens**: JSON Web Tokens
- **Database URLs**: Connection strings with credentials
- **Docker Registry Tokens**
- **Slack Tokens**
- **Terraform Tokens**

#### Secret File Detection

The scanner also detects common secret-containing files:
- `.env` files (all variants)
- `secrets.yml/yaml`
- `credentials.json`
- Private key files (`id_rsa`, etc.)

#### Remediation for Secret Violations

When secrets are detected:

1. **Remove the secret** from the code immediately
2. **Use environment variables** instead of hardcoded values:
   ```javascript
   // Bad
   const apiKey = "sk-1234567890abcdef";
   
   // Good
   const apiKey = process.env.API_KEY;
   ```
3. **Add secret files to .gitignore**:
   ```gitignore
   .env
   .env.local
   .env.production
   secrets.yml
   credentials.json
   ```
4. **Rotate compromised secrets** if they were committed
5. **Use secret management tools**:
   - AWS Secrets Manager
   - Azure Key Vault
   - HashiCorp Vault
   - GitHub Secrets for CI/CD

#### Manual Secret Scanning

Run secret scanning locally:
```bash
./scripts/security/secret-scan.sh
```

Results are logged to `.ai/security-scan.log`.

### Dependency Audit (`scripts/security/deps-audit.sh`)

#### Vulnerability Severity Levels

- **Critical**: Immediate action required, blocks pipeline
- **High**: Immediate action required, blocks pipeline
- **Moderate**: Should be fixed, generates warning
- **Low**: Optional fix, generates warning
- **Info**: Informational only

#### Remediation for Dependency Vulnerabilities

When vulnerabilities are detected:

1. **Automatic fixes** (try first):
   ```bash
   npm audit fix
   ```

2. **Force fixes** (may introduce breaking changes):
   ```bash
   npm audit fix --force
   ```

3. **Preview changes** before applying:
   ```bash
   npm audit fix --dry-run
   ```

4. **Update specific packages**:
   ```bash
   npm update <package-name>
   npm install package-name@latest
   ```

5. **Manual vulnerability review**:
   ```bash
   npm audit
   npm audit --audit-level=moderate  # Ignore low-severity
   ```

6. **For unfixable vulnerabilities**:
   - Find alternative packages
   - Implement workarounds
   - Accept risk with proper documentation

#### Manual Dependency Audit

Run dependency audit locally:
```bash
./scripts/security/deps-audit.sh
```

Results are logged to `.ai/deps-audit.log`.

### CI/CD Integration

Security guardrails integrate with the BMad validation pipeline:

1. **Triggered on**: Push to main/develop, pull requests
2. **Exit codes**:
   - `0`: All security checks passed
   - `1`: Security violations detected (blocks pipeline)
3. **Artifacts**: Security scan results uploaded for 30 days
4. **Override**: Use `security-override` label when authorized

### Security Scan Results

Both scripts generate detailed logs in the `.ai/` directory:

- `.ai/security-scan.log`: Secret scanning results
- `.ai/deps-audit.log`: Dependency audit results

These logs include:
- Violation details (with masked secrets)
- Remediation guidance
- Timestamps and exit codes

### Best Practices

1. **Run scans locally** before pushing code
2. **Never commit secrets** - use environment variables
3. **Keep dependencies updated** regularly
4. **Monitor security advisories** for your dependencies
5. **Use dependency scanning tools** in your IDE
6. **Implement pre-commit hooks** for secret scanning
7. **Rotate secrets immediately** if accidentally committed
8. **Document override usage** when bypassing security checks

### Integration with Other Validation

Security guardrails work alongside other BMad validation systems:
- **Preflight Checks** (AH-003): Include security as a gate
- **Reference Checker** (AH-006): Validates secure file references
- **Type Checker** (AH-008): Ensures type safety

### Extending Security Guardrails

To add new secret patterns:

1. Edit `scripts/security/secret-scan.sh`
2. Add pattern to `SECRET_PATTERNS` array:
   ```bash
   ["New Secret Type"]="regex-pattern-here"
   ```
3. Test the pattern locally
4. Update this documentation

To customize dependency audit rules:

1. Edit `scripts/security/deps-audit.sh`
2. Modify severity thresholds
3. Add custom vulnerability checks
4. Update remediation guidance

## Metrics & Monitoring (AH-012)

The BMad Method includes a comprehensive metrics collection and monitoring system to track quality metrics and process efficiency.

### Key Performance Indicators (KPIs)

#### Contract Pass Rate
**Definition:** Percentage of story contracts that complete successfully without validation errors.  
**Calculation:** (Successful Completions / Total Attempts) × 100  
**Target:** ≥95%  
**Critical Threshold:** <85%

This metric tracks how often story implementations fulfill their contracts completely, indicating the reliability of the development process.

#### Time to Green
**Definition:** Average time from code submission to successful validation completion.  
**Calculation:** Mean of all validation completion times  
**Target:** <5 minutes  
**Critical Threshold:** >15 minutes

Time to green measures the efficiency of the validation pipeline, helping identify bottlenecks in the development process.

#### Diff Churn
**Definition:** Average number of lines changed per story implementation.  
**Calculation:** Total lines added/modified/deleted per story  
**Target:** <500 lines per story  
**Critical Threshold:** >1000 lines per story

Diff churn indicates the complexity and scope of changes, helping identify stories that may need to be broken down further.

#### Reference Check Failure Rate
**Definition:** Percentage of reference checks that fail due to unresolved symbols or files.  
**Calculation:** (Failed Reference Checks / Total Reference Checks) × 100  
**Target:** <5%  
**Critical Threshold:** >15%

This metric tracks the quality of code references and helps identify issues with symbol resolution and file dependencies.

#### Drift Alarms
**Definition:** Count of system configuration drift alerts in the specified period.  
**Calculation:** Count of drift detection events  
**Target:** 0 per day  
**Critical Threshold:** >3 per day

Drift alarms indicate when the system state diverges from expected configurations, helping maintain system stability.

#### Rollback Count
**Definition:** Number of deployments or changes that were reverted due to issues.  
**Calculation:** Count of rollback operations  
**Target:** ≤1 per week  
**Critical Threshold:** >3 per week

Rollback count tracks system stability and the quality of changes being deployed.

### Metrics Collection

#### Usage
```bash
# Collect metrics and generate reports
npm run metrics:collect

# Collect with verbose output
npm run metrics:collect -- --verbose

# Generate only JSON report
npm run metrics:collect -- --format json

# Generate only Markdown report
npm run metrics:collect -- --format markdown
```

#### Data Sources
The metrics system aggregates data from:
- `.ai/test-logs/*` - Task execution and workflow logs
- Preflight check outputs - Schema, contract, and grounding validation results
- Gate enforcement logs - Planning, dev, and QA gate results
- Reference checker outputs - Symbol and file resolution results
- Rollback manager logs - System rollback events
- Drift detector alerts - Configuration drift notifications

#### Report Generation
Reports are automatically generated in two formats:
- **JSON**: Machine-readable data for integration with monitoring systems
- **Markdown**: Human-readable reports for teams and stakeholders

Reports are saved to `.ai/test-logs/metrics-<timestamp>.{md,json}` with timestamps in ISO format.

#### Gate Metrics
The system tracks success rates for each validation gate:
- **Planning Gate**: Validates architectural documents and PRDs
- **Dev Gate**: Ensures code changes meet quality standards  
- **QA Gate**: Verifies acceptance criteria are met

#### Preflight Check Metrics
Individual preflight check success rates are tracked:
- **Schema Check**: JSON schema validation
- **Contract Check**: Story contract validation
- **Grounding Check**: Reference resolution validation
- **Lint Check**: Code quality linting
- **Type Check**: TypeScript type validation
- **Build Check**: Project build validation

### Recommendations Engine

The metrics system provides automated recommendations based on current performance:
- Contract pass rate below 90%: Review story contracts and validation processes
- Time to green exceeding 5 minutes: Optimize build/test processes
- High reference check failure rate: Review code quality and reference resolution
- Multiple drift alarms: Investigate system stability
- Frequent rollbacks: Review deployment and testing procedures

### Integration

The metrics system integrates with:
- CI/CD pipelines for automated reporting
- Gate enforcement for quality thresholds
- Development workflows for continuous monitoring
- Team dashboards for visibility into process health

