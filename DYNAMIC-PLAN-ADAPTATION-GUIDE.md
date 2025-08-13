# Dynamic Plan Adaptation - Threshold-Based Automatic Activation

## Overview

The Dev agent now implements **threshold-based automatic activation** of dynamic plan adaptation. Instead of requiring manual decision-making, the agent automatically analyzes story complexity and applies adaptation when needed.

## How It Works

### 1. Automatic Analysis
When agents start working on a story or task, they:
1. Load the story/task and any associated contracts
2. Analyze complexity metrics against configured thresholds
3. Automatically decide whether to apply dynamic plan adaptation
4. Log the decision with clear reasoning

**Supported Agents:**
- **Dev Agent**: Analyzes story complexity for implementation tasks
- **QA Agent**: Analyzes review scope, test coverage complexity, and dependency chains

### 2. Threshold Configuration
Configuration file: `bmad-core/config/dynamic-plan-config.yaml`

**Default Dev Thresholds:**
- **Tasks**: > 5 tasks triggers adaptation
- **Files**: > 7 files to modify
- **API Endpoints**: > 5 endpoints to implement
- **Data Models**: > 2 models involved
- **Total Fields**: > 20 fields across all models
- **Acceptance Criteria**: > 8 criteria

**QA-Specific Thresholds:**
- **Files to Review**: > 10 files
- **Test Coverage Analysis**: > 15 test files
- **Dependency Chain Depth**: > 5 levels
- **Quality Metrics**: > 12 metrics
- **Components to Review**: > 8 components

### 3. Complexity Indicators
The system also detects patterns that indicate complexity:
- "and then" - Sequential complexity
- "multiple components" - Multi-component work
- "migrate/migration" - Database migrations
- "refactor existing" - Refactoring work
- "integrate with" - Integration complexity

## User Experience

### Complex Story (Adaptation Applied)
```
📊 Story complexity detected (tasks: 8/5). Applying dynamic plan adaptation...
Thresholds exceeded:
  - taskCount: 8/5
  - fileCount: 10/7
  - apiEndpointCount: 6/5
```

### Simple Story (Direct Implementation)
```
✅ Story is simple enough. Proceeding with direct implementation.
```

## Benefits

1. **Consistency** - Every story gets analyzed the same way
2. **No Missed Complexity** - Agent can't forget to apply adaptation
3. **Efficiency** - Simple stories aren't over-engineered
4. **Transparency** - Clear reasoning for every decision
5. **Trackability** - All decisions logged to `.ai/adaptation_decisions.log`

## Customization

### Override with Tags
Stories can include tags to override automatic decisions:

**Force Adaptation:**
```yaml
tags: ["complex", "force-adaptation"]
```

**Skip Adaptation:**
```yaml
tags: ["simple", "trivial", "no-adaptation"]
```

### Skip Conditions
Adaptation is automatically skipped for:
- Pure documentation stories
- Simple bug fixes (≤3 tasks)
- Stories marked "Needs Fixes" (QA feedback)

## Manual Control

You can still use `*execute-task` command to force dynamic plan adaptation for any individual task, regardless of thresholds.

## Implementation Details

### Files Created/Modified:
1. `bmad-core/config/dynamic-plan-config.yaml` - Threshold configuration
2. `bmad-core/utils/story-complexity-analyzer.js` - Analysis logic
3. `bmad-core/agents/dev.md` - Updated workflow to check thresholds

### Workflow Changes:
The `develop-story` workflow now includes:
```
Read story → Load config → Analyze complexity → Apply/Skip adaptation → Continue
```

## Monitoring

Adaptation decisions are logged to `.ai/adaptation_decisions.log` with:
- Timestamp
- Decision (APPLY/SKIP)
- Reasons
- Metrics
- Complexity score

## Testing

Test the analyzer directly:
```bash
node bmad-core/utils/story-complexity-analyzer.js
```

This will run example stories through the analyzer and show the decision process.

## Best Practices

1. **Trust the Thresholds** - They're based on cognitive load research
2. **Use Tags Sparingly** - Only override when truly necessary
3. **Monitor Logs** - Review adaptation decisions to tune thresholds
4. **Adjust for Your Team** - Modify thresholds in config if needed

## Conclusion

This implementation provides the best of both worlds:
- **Automatic** for most cases (threshold-based)
- **Flexible** when needed (tags and overrides)
- **Transparent** always (clear logging and reasoning)

The dev agent now intelligently adapts to story complexity without requiring manual intervention, while still allowing control when needed.