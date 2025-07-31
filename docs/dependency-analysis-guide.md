# Dependency Analysis and Impact Checking Guide

This guide explains the dependency analysis and impact checking system implemented in BMad-Method, which helps Dev and QA agents understand the potential impact of code changes before committing.

## Overview

The dependency analysis system consists of four main components:

1. **Dependency Scanner**: Analyzes repository code and extracts symbols (functions, classes, variables, etc.)
2. **Qdrant Integration**: Stores dependency relationships in a vector database for fast querying
3. **Impact Checker**: Provides functions to query what code might be affected by changes
4. **Agent Integration**: Structured tasks for Dev and QA agents to use dependency analysis

## Prerequisites

### Qdrant Setup

The system requires Qdrant vector database to be running:

```bash
# Using Docker
docker run -p 6333:6333 qdrant/qdrant

# Or using Docker Compose (if you have a docker-compose.yaml)
docker-compose up qdrant
```

### Required Dependencies

Ensure your project has the required npm packages:

```bash
npm install @qdrant/js-client-rest glob chokidar
```

## Initial Setup

### 1. Scan Repository Dependencies

Before using the dependency analysis features, you need to populate the Qdrant database with your repository's dependency information:

```bash
# Scan the entire repository
node tools/cli.js scan-dependencies

# Scan with specific options
node tools/cli.js scan-dependencies --include-tests --root /path/to/repo

# Show statistics after scanning
node tools/cli.js scan-dependencies --stats
```

### 2. Enable Watch Mode (Optional)

For continuous dependency tracking, you can run the scanner in watch mode:

```bash
# Watch for file changes and update dependencies automatically
node tools/cli.js scan-dependencies --watch
```

### 3. Check Database Status

Verify that dependencies were scanned successfully:

```bash
node tools/cli.js dependency-stats
```

## Usage for Dev Agents

### Manual Dependency Checking

Dev agents can manually check dependency impacts using the `*check-dependencies` command:

```
*check-dependencies
```

This will:
1. Analyze files that will be modified according to the story
2. Generate an impact report showing what symbols/files might be affected
3. Provide risk assessment and recommendations

### Automatic Integration in Development Workflow

The Dev agent's `develop-story` workflow now automatically includes dependency checking:

1. **Before Implementation**: Runs dependency impact analysis to understand potential impacts
2. **Risk Assessment**: Evaluates whether changes are high-risk and need special attention
3. **User Consultation**: For high-impact changes, prompts for confirmation before proceeding
4. **Documentation**: Records dependency analysis results in the story's Debug Log

### Story Implementation Process

When implementing a story, the Dev agent will:

```
1. Initialize working memory
2. ➤ Execute dependency impact analysis ← NEW STEP
3. Read tasks and implement
4. Write tests
5. Execute validations
6. Update story documentation
```

## Usage for QA Agents

### Manual Dependency Analysis

QA agents can run comprehensive dependency analysis using:

```
*analyze-dependencies {story-file}
```

### Integration in Review Process

The QA agent can now perform dependency impact analysis as part of the review:

1. **Impact Analysis**: Reviews all files modified in the story
2. **Cross-Reference**: Compares with any dependency analysis done during development
3. **Test Coverage Verification**: Ensures impacted code has adequate tests
4. **Risk Assessment**: Identifies high-risk changes that need special attention
5. **Documentation Review**: Verifies that impacts are properly documented

### QA Results Enhancement

The QA Results section now includes a "Dependency Impact Analysis" subsection with:

- Risk assessment summary
- List of impacted files and symbols
- Test coverage gaps for impacted code
- Recommendations for addressing dependency concerns

## Understanding Impact Reports

### Report Structure

Dependency impact reports include:

```markdown
# Dependency Impact Analysis Report

## Summary
- Files analyzed: 3/3
- Total impacted symbols: 15
- Total impacted files: 8
- High-risk changes: 1 files
- Critical impacts detected: 2 files

## ⚠️ High-Risk Changes
- src/core/database.js: 23 impacted symbols across 12 files

## 🚨 Critical Impacts
### src/utils/auth.js
- validateUser (function) in src/controllers/userController.js - 8 dependencies
- hashPassword (function) in src/services/authService.js - 5 dependencies

## Recommendations
🚨 High impact detected. Consider breaking changes into smaller pieces...
```

### Risk Levels

- **Low Impact** (< 5 affected symbols): Minor changes, standard testing sufficient
- **Medium Impact** (5-15 affected symbols): Moderate risk, review affected areas
- **High Impact** (> 15 affected symbols): Significant risk, comprehensive testing required

### Critical Symbols

The system identifies critical symbols based on:
- Classes or main functions
- Symbols with many dependencies
- Configuration or initialization functions
- Public API interfaces

## File Types Supported

The dependency parser supports:

- **JavaScript/TypeScript**: `.js`, `.ts`, `.jsx`, `.tsx`
- **Python**: `.py`
- **Java**: `.java`

For each language, it extracts:
- Function declarations and arrow functions
- Class definitions and methods
- Variable declarations
- Import/require statements
- Module exports

## Configuration Options

### Scanner Configuration

The dependency scanner can be configured with:

```javascript
const config = {
  // File patterns to include
  include: ['**/*.js', '**/*.ts', '**/*.py'],
  
  // File patterns to exclude
  exclude: ['node_modules/**', 'dist/**', '*.test.js'],
  
  // Maximum file size to process (bytes)
  maxFileSize: 1024 * 1024, // 1MB
  
  // Whether to include test files
  includeTests: false,
  
  // Whether to show progress
  showProgress: true,
  
  // Repository root directory
  rootDir: process.cwd()
};
```

### Qdrant Configuration

The system uses these Qdrant settings:

- **Collection Name**: `bmad_code_dependencies`
- **Vector Size**: 384 dimensions
- **Distance Metric**: Cosine similarity
- **Embedding Method**: Hash-based (with OpenAI fallback if API key available)

## Troubleshooting

### Common Issues

1. **"Qdrant collection initialization failed"**
   - Ensure Qdrant is running on localhost:6333
   - Check Docker container status
   - Verify network connectivity

2. **"No symbols found in database"**
   - Run the dependency scanner first
   - Check that your code files are in supported formats
   - Verify file patterns in configuration

3. **"High memory usage during scanning"**
   - Exclude large directories (node_modules, dist)
   - Reduce maxFileSize setting
   - Process files in smaller batches

### Performance Optimization

For large repositories:

1. **Exclude unnecessary files**: Update exclude patterns to skip generated code, dependencies
2. **Limit file size**: Set appropriate maxFileSize to skip large minified files
3. **Use incremental scanning**: Run initial scan once, then use watch mode for updates
4. **Regular cleanup**: Periodically rescan to remove stale dependencies

## Advanced Usage

### Custom Dependency Queries

You can use the dependency utilities directly in custom scripts:

```javascript
const { checkFileImpact, analyzeBatchImpact } = require('./bmad-core/utils/dependency-impact-checker');

// Check impact of a single file
const impact = await checkFileImpact('src/utils/helpers.js');

// Analyze multiple files (e.g., from git diff)
const batchImpact = await analyzeBatchImpact([
  'src/models/user.js',
  'src/controllers/authController.js'
]);
```

### Integration with Git Hooks

You can integrate dependency checking with git pre-commit hooks:

```bash
#!/bin/sh
# Pre-commit hook to check dependency impacts

# Get list of modified files
MODIFIED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)

# Run dependency impact analysis
node -e "
const { analyzeBatchImpact } = require('./bmad-core/utils/dependency-impact-checker');
const files = process.argv[1].split('\n').filter(f => f.length > 0);

analyzeBatchImpact(files).then(result => {
  if (result.impactSummary.totalImpactedSymbols > 20) {
    console.error('High-impact changes detected. Consider breaking into smaller commits.');
    process.exit(1);
  }
});
" "$MODIFIED_FILES"
```

## Best Practices

### For Developers

1. **Run dependency analysis early**: Check impacts before starting implementation
2. **Review high-impact changes**: Pay special attention to changes affecting many symbols
3. **Update tests proactively**: Ensure impacted code has adequate test coverage
4. **Document breaking changes**: Note any changes that affect public APIs

### For QA Engineers

1. **Include dependency analysis in reviews**: Always check dependency impacts during story review
2. **Verify test coverage**: Ensure all impacted symbols are adequately tested
3. **Flag architectural concerns**: Identify changes that create tight coupling or circular dependencies
4. **Recommend incremental changes**: Suggest breaking large impacts into smaller stories

### For Teams

1. **Regular database updates**: Keep dependency database current with automated scanning
2. **Establish impact thresholds**: Define team standards for acceptable impact levels
3. **Review dependency reports**: Include impact analysis in code review process
4. **Monitor architectural health**: Use dependency analysis to identify architectural issues

## Migration and Maintenance

### Database Maintenance

- **Regular rescans**: Run full repository scans periodically to ensure accuracy
- **Clean stale data**: Remove dependencies for deleted or moved files
- **Monitor performance**: Watch Qdrant resource usage and optimize as needed

### System Updates

When updating the dependency analysis system:

1. Test with a subset of your codebase first
2. Backup existing Qdrant data if needed
3. Update agent configurations gradually
4. Monitor impact on development workflow
5. Gather feedback from team members

This dependency analysis system provides comprehensive impact assessment capabilities to help development teams make informed decisions about code changes and ensure thorough testing of affected components.