# Story 12 Implementation Summary

**User Story:** As a developer, I want the orchestrator to know where files live (e.g., stories, PRDs, architecture) without excessive searching, so that workflows execute faster and with fewer errors.

## Implementation Overview

This implementation introduces centralized file path resolution to eliminate the need for agents to search for core documents throughout the repository. The solution reads file locations directly from `core-config.yaml` and passes resolved paths to agents.

## Key Components Implemented

### 1. FilePathResolver (`bmad-core/utils/file-path-resolver.js`)

A centralized utility that:
- Reads configuration from `bmad-core/core-config.yaml`
- Resolves all file paths to absolute locations
- Validates path configuration and file existence
- Provides utility methods for finding specific files
- Handles optional files gracefully (with warnings instead of errors)

**Key Methods:**
- `getAllResolvedPaths()` - Returns all resolved file paths for agent use
- `getStoryLocation()` - Returns absolute path to story directory
- `getPRDFile()/getPRDShardedLocation()` - Returns PRD file/directory paths
- `getArchitectureFile()/getArchitectureShardedLocation()` - Returns architecture paths
- `validatePaths()` - Validates all configured paths
- `findSpecificFile(type, params)` - Finds specific files by type
- `getNoSearchPaths()` - Lists patterns agents should NOT search for

### 2. Enhanced WorkflowOrchestrator (`tools/workflow-orchestrator.js`)

Updated to:
- Initialize `FilePathResolver` during startup
- Resolve and validate all file paths at initialization
- Pass resolved paths to all agent invocations
- Provide centralized path access through `getResolvedPaths()`
- Enhanced story loading to use resolved story location
- Added `executeTaskWithPaths()` method for structured tasks

### 3. Enhanced WorkflowExecutor (`bmad-core/utils/workflow-executor.js`)

Updated to:
- Initialize file path resolution during startup
- Pass resolved paths to all step executions
- Provide `executeStructuredTask()` method with path context
- Enhanced context includes direct path access methods

### 4. Updated find-next-story utility (`bmad-core/utils/find-next-story.js`)

Modified to:
- Accept pre-resolved story directory path
- Provide clear error messages when paths not configured
- No longer searches - uses provided directory path directly

## File Path Configuration

All file paths are read from `bmad-core/core-config.yaml`:

```yaml
devStoryLocation: docs/stories
prd:
  prdFile: docs/prd.md
  prdSharded: true
  prdShardedLocation: docs/prd
  epicFilePattern: epic-{n}*.md
architecture:
  architectureFile: docs/architecture.md
  architectureSharded: true
  architectureShardedLocation: docs/architecture
devLoadAlwaysFiles:
  - docs/architecture/coding-standards.md
  - docs/architecture/tech-stack.md
  - docs/architecture/source-tree.md
devDebugLog: .ai/debug-log.md
```

## Agent Context Enhancement

Agents now receive an enhanced context containing:

```javascript
{
  resolvedPaths: {
    storyLocation: "/absolute/path/to/docs/stories",
    prdFile: "/absolute/path/to/docs/prd.md",
    architectureFile: "/absolute/path/to/docs/architecture.md",
    // ... all other resolved paths
  },
  filePathResolver: {
    // Direct access methods
    getStoryLocation: () => "/absolute/path/to/docs/stories",
    getPRDFile: () => "/absolute/path/to/docs/prd.md",
    // ... other getter methods
    
    // Utility methods
    findStoryFile: (epicNum, storyNum) => "/path/to/story/file",
    findEpicFile: (epicNum) => "/path/to/epic/file",
    
    // Configuration flags
    isPRDSharded: () => true,
    isArchitectureSharded: () => true
  }
}
```

## Error Handling

The implementation provides explicit error handling:
- **Missing core-config.yaml**: Clear error with setup instructions
- **Invalid configuration**: Specific validation errors with file paths
- **Missing required directories**: Explicit errors with expected locations
- **Missing optional files**: Warnings instead of failures
- **File not found at expected location**: Clear error messages with full paths

## Benefits Achieved

### ✅ Faster Workflow Execution
- No more repository-wide file searching
- Direct path resolution at startup
- Immediate path availability to all agents

### ✅ Fewer Errors
- Explicit validation of file locations
- Clear error messages for missing files
- Graceful handling of optional files

### ✅ Centralized Configuration
- Single source of truth for file locations
- Easy to update file structure by changing config
- Consistent path resolution across all agents

### ✅ Better Developer Experience
- Clear error messages guide configuration fixes
- Validation reports show what's missing
- No guessing about where files should be located

## Acceptance Criteria Validation

### ✅ AC1: Orchestrator reads file locations from core-config.yaml
- `FilePathResolver` reads all paths from `bmad-core/core-config.yaml`
- Configuration includes `devStoryLocation`, `prd.prdFile`, `architecture.architectureFile`, etc.
- All configured paths are resolved to absolute locations

### ✅ AC2: No broad searches through repository
- Removed generic file search patterns
- Agents receive pre-resolved absolute paths
- `find-next-story.js` uses provided directory path instead of searching
- No `find`, `locate`, or `search` operations for core documents

### ✅ AC3: Explicit errors for missing files at expected locations
- `getAbsolutePath()` throws clear errors for missing required files
- Error messages include full expected file paths
- Validation distinguishes between missing required vs. optional files
- Configuration errors provide setup guidance

## Files Created/Modified

### New Files:
- `bmad-core/utils/file-path-resolver.js` - Core file path resolution utility
- `tests/file-path-resolver.test.js` - Unit tests for file path resolver

### Modified Files:
- `tools/workflow-orchestrator.js` - Enhanced with centralized file path resolution
- `bmad-core/utils/workflow-executor.js` - Enhanced to pass resolved paths to agents
- `bmad-core/utils/find-next-story.js` - Updated to use pre-resolved paths

## Testing

Comprehensive testing validates:
- Configuration loading from `core-config.yaml`
- Path resolution to absolute locations
- Validation of required vs. optional files
- Integration with orchestrator and executor
- Error handling for missing files
- Agent context enhancement

## Usage Example

```javascript
// Initialize orchestrator with file path resolution
const orchestrator = new WorkflowOrchestrator(rootDir);
await orchestrator.initialize(); // Resolves all paths from core-config.yaml

// Get resolved paths for agent use
const paths = orchestrator.getResolvedPaths();
console.log(paths.storyLocation); // "/absolute/path/to/docs/stories"

// Execute agent work with resolved paths
const result = await orchestrator.simulateAgentWork('dev', 'implement', {
  storyId: 'story-123'
  // Agent receives resolved paths in context automatically
});
```

## Conclusion

Story 12 has been successfully implemented with a robust, centralized file path resolution system that eliminates repository searching, provides clear error handling, and enhances workflow execution speed and reliability. The solution is backward-compatible and provides a foundation for improved agent performance across the BMad Method framework.