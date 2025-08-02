# Dependency Analysis Storage Guide

## Overview

The BMad framework now includes a consistent storage system for dependency impact analyses performed by the dev agent before implementation and compared by the QA agent during review.

## Storage Structure

All dependency analyses are stored under `.ai/dependency-analyses/` with the following structure:

```
.ai/dependency-analyses/
├── dev-analysis/        # Pre-implementation analyses by dev agent
│   ├── dep-analysis-{storyId}-{taskId}-{timestamp}.md
│   └── latest-{storyId}.md -> (symlink to most recent)
├── qa-comparison/       # QA comparison analyses
│   ├── dep-analysis-{storyId}-{taskId}-{timestamp}.md
│   └── latest-{storyId}.md -> (symlink to most recent)
└── archive/             # Analyses from completed stories
```

## File Naming Convention

Files follow a consistent naming pattern:
- Format: `dep-analysis-{storyId}-{taskId}-{timestamp}.md`
- Example: `dep-analysis-story-16-implement-auth-2025-01-15T10-30-45.md`
- Latest symlink: `latest-{storyId}.md` points to the most recent analysis

## Dev Agent Usage

When running the `check-dependencies-before-commit` task, the dev agent will:

1. Perform dependency impact analysis
2. Generate a comprehensive report
3. Save the analysis using `saveDependencyAnalysis()`
4. Add the file location to the story's Debug Log
5. Include key metrics (risk level, impacted symbols count)

Example Debug Log entry:
```
Dependency Analysis Location: .ai/dependency-analyses/dev-analysis/dep-analysis-story-16-full-story-2025-01-15T10-30-45.md
Analysis Timestamp: 2025-01-15T10:30:45.123Z
Risk Assessment: MEDIUM
High-Risk Files: 2
Total Impacted Symbols: 47
```

## QA Agent Usage

During the `analyze-dependency-impacts-qa` task, the QA agent will:

1. Retrieve the dev's original analysis using `getLatestDependencyAnalysis()`
2. Perform its own post-implementation analysis
3. Compare predicted vs actual impacts
4. Save a comparison report with references to the dev analysis
5. Flag any discrepancies or new impacts discovered

## API Reference

### Save Analysis
```javascript
const { saveDependencyAnalysis } = require('./dependency-analysis-storage');

const result = await saveDependencyAnalysis(
  'story-16',                    // storyId
  'implement-auth',              // taskId (or 'full-story')
  analysisContent,               // The markdown report
  {                              // metadata
    agent: 'dev',
    riskLevel: 'medium',
    totalImpactedSymbols: 47
  },
  'dev'                          // type: 'dev' or 'qa'
);
```

### Retrieve Analysis
```javascript
const { getLatestDependencyAnalysis } = require('./dependency-analysis-storage');

const analysis = await getLatestDependencyAnalysis(
  'story-16',    // storyId
  null,          // taskId (null for any)
  'dev'          // type: 'dev' or 'qa'
);

if (analysis) {
  console.log(analysis.content);    // The full markdown content
  console.log(analysis.filepath);   // Path to the file
}
```

### List All Analyses
```javascript
const { listDependencyAnalyses } = require('./dependency-analysis-storage');

const analyses = await listDependencyAnalyses('story-16', 'all');
// Returns array of analysis metadata sorted by date
```

### Archive Completed Story
```javascript
const { archiveDependencyAnalyses } = require('./dependency-analysis-storage');

const result = await archiveDependencyAnalyses('story-16');
// Moves all analyses to archive folder
```

## Benefits

1. **Traceability**: Complete history of dependency predictions vs actual impacts
2. **Learning**: QA can verify if dev's impact predictions were accurate
3. **Consistency**: Standardized location and format for all analyses
4. **Accessibility**: Both agents know exactly where to find analyses
5. **Archival**: Completed stories' analyses are preserved for future reference

## Best Practices

1. Always include the story ID when saving analyses
2. Use descriptive task IDs or 'full-story' for complete analyses
3. Include key metrics in metadata (risk level, impact counts)
4. Reference the saved file location in the story's Debug Log
5. Archive analyses when stories are completed to keep active directories clean