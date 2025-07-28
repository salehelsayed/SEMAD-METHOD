# Schema Loading Update Summary

## Overview
Updated all JavaScript scripts in the codebase to use ModuleResolver for loading schemas instead of hard-coded paths. The ModuleResolver is now the primary method for schema resolution, with hard-coded paths kept only as secondary fallbacks.

## Files Updated

### 1. `/scripts/validate-story-contract.js`
- **Change**: Removed try-catch block for ModuleResolver import, now imports it directly
- **Change**: Modified `loadSchema()` function to use ModuleResolver as primary method
- **Fallback**: Hard-coded paths remain as secondary fallback only if ModuleResolver fails

### 2. `/scripts/validate-schemas.js`
- **Change**: Removed try-catch block for ModuleResolver import, now imports it directly
- **Change**: Modified schema loading to use ModuleResolver first for both task and checklist schemas
- **Fallback**: Direct paths used only if ModuleResolver returns null

### 3. `/tests/story-contract-validation.test.js`
- **Change**: Removed try-catch block for ModuleResolver import, now imports it directly
- **Change**: Updated `beforeAll()` to use ModuleResolver as primary method
- **Fallback**: Direct path used only if ModuleResolver fails

### 4. `/tools/task-runner.js`
- **Change**: Added ModuleResolver import using the existing `resolveModule` helper
- **Change**: Modified `validateStepOutput()` method to try ModuleResolver first before checking core-config
- **Enhancement**: Now supports both ModuleResolver and core-config validation schemas

## Files Already Using ModuleResolver Correctly
- `/bmad-core/utils/story-contract-validator.js` - Already uses ModuleResolver as primary method with proper fallbacks

## Files Not Requiring Updates
- `/tests/story-creation-integration.test.js` - Only copies schema files for test setup
- `/bmad-core/scripts/convert-checklists.js` - Does not load schemas
- `/bmad-core/scripts/convert-tasks.js` - Does not load schemas
- `/tools/lib/structured-task-loader.js` - Does not load schemas

## Key Benefits
1. **Centralized Configuration**: Schema paths are now resolved through the core-config.yaml file via ModuleResolver
2. **Flexibility**: Supports different installation locations (bmad-core, .bmad-core, npm packages)
3. **Maintainability**: Easier to update schema locations by modifying core-config.yaml
4. **Backward Compatibility**: Hard-coded fallbacks ensure existing setups continue to work

## Testing Recommendations
1. Test schema loading in different installation scenarios:
   - Standard bmad-core directory
   - Hidden .bmad-core directory
   - NPM package installation
2. Verify validation still works correctly for:
   - Story contracts
   - Tasks
   - Checklists
3. Ensure error messages are clear when schemas cannot be found