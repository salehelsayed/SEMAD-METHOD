# Elicit Implementation Fixes Summary

## Issues Addressed

### 1. Improved Error Message in task-runner.js (Line 669)
**Before:**
```javascript
console.warn(`⚠️  Action requires user input but no handler provided: "${action.description}"`);
```

**After:**
```javascript
console.warn(`⚠️  Action requires user input but no handler provided:
  Step: ${step.name} (ID: ${step.id})
  Action: "${action.description}"
  
  To resolve this, either:
  - Provide a userInputHandler in the context when calling runTask()
  - Set allowMissingUserInput: true in the context to suppress this warning`);
```

**Improvement:** Now includes step name, step ID, and helpful hints for resolution.

### 2. Standardized Elicit Flags in create-next-story.yaml
**Changed from `elicit: true` to `elicit: false` for the following actions:**
- Line 314: "**`Tasks / Subtasks` section:**" - This is a section header, not user input
- Line 318: "Generate detailed, sequential list..." - Automated content generation
- Line 322: "Each task must reference..." - Automated requirement
- Line 326: "Include unit testing..." - Automated requirement
- Line 330: "Link tasks to acceptance criteria..." - Automated requirement
- Line 352: "Verify all source references..." - Automated verification
- Line 356: "Ensure tasks align..." - Automated verification
- Line 364: "Execute checklist" - Changed to false as it's an automated execution
- Line 392: "Next steps: For Complex stories..." - Informational suggestion

**Kept as `elicit: true`:**
- Line 64: Alert about incomplete story - requires user decision
- Line 68: Select next sequential story - requires user choice
- Line 72: Epic complete prompt - requires user decision
- Line 254: Execute validate-story-contract - may require user intervention if validation fails

### 3. Created Guidelines Document
Created `/Users/I560101/Project-Sat/SEMAD-METHOD/docs/elicit-flag-guidelines.md` with:
- Clear criteria for when to use `elicit: true` vs `elicit: false`
- Examples of correct usage
- Best practices for consistency

## Rationale for Changes

The elicit flag should only be `true` when:
1. User must make a decision or choice
2. User needs to provide input data
3. A validation/check might fail and require user intervention
4. Critical warnings need user acknowledgment

The flag should be `false` for:
1. Automated operations (file reading, content generation)
2. Informational messages or instructions
3. Internal processing steps
4. Section headers or formatting elements

These changes ensure consistent behavior across all YAML task files and provide better debugging information when user input is required but not available.