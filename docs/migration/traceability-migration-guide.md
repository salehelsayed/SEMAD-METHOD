# Traceability Migration Guide

## Overview
This guide helps migrate existing projects to the full traceability system with unlimited story generation and comprehensive coverage validation.

## Phase 1: Inventory & Assessment (Week 1)

### Step 1.1: Assess Current State
```bash
# Generate initial coverage report to identify gaps
npm run validate:coverage

# Review the gaps report
cat .ai/reports/feature-coverage.md
```

### Step 1.2: Document Existing Features
1. Open `docs/prd/PRD.md`
2. Add FeatureContract section with FEAT-* IDs:
```yaml
features:
  - id: FEAT-auth-session
    title: User Authentication
    acceptanceCriteria:
      - id: AC-auth-session-1
        description: Users can log in
      - id: AC-auth-session-2
        description: Sessions expire after 24h
```

### Step 1.3: Map Existing Epics
For each epic in `docs/epics/`:
1. Add `featureId: FEAT-XXX`
2. Add `acceptanceCriteriaMap: [AC-XXX-1, AC-XXX-2]`
3. Run validation: `node scripts/validate-epic-contract.js --file <epic-file>`

## Phase 2: Story Enhancement (Week 2)

### Step 2.1: Update Existing Stories
For each story in `docs/stories/`:
```yaml
story:
  storyId: ST-auth-001  # Add if missing
  featureId: FEAT-auth-session  # Link to feature
  epicId: EPIC-auth-session-oauth  # Link to epic

traceability:
  featureId: FEAT-auth-session
  acceptanceCriteriaCovered:
    - AC-auth-session-1
  codeTouchpoints:
    - src/auth/AuthManager.js
  testExpectations:
    - tests/auth/login.test.js
```

### Step 2.2: Generate Missing Stories
```bash
# Identify features without stories
npm run validate:coverage

# For each gap, generate stories
pm: *validate-feature-coverage
sm: *brownfield-create-epic --from ./codebase --auto-split --max-stories -1 --link-feature FEAT-XXX
```

## Phase 3: Code Annotation (Week 3)

### Step 3.1: Add Annotations to Implementation Files
```javascript
// FEAT: FEAT-auth-session | STORY: ST-auth-001
class AuthenticationManager {
  // Implementation
}
```

### Step 3.2: Add AC Tags to Tests
```javascript
describe('Authentication', () => {
  it('should allow login [AC-auth-session-1]', () => {
    // Test
  });
});
```

### Step 3.3: Enable Lint Rules
1. Install ESLint plugin:
```bash
npm install --save-dev ./eslint-plugin-semad
```

2. Update `.eslintrc.json`:
```json
{
  "plugins": ["semad"],
  "rules": {
    "semad/traceability-annotations": "warn",
    "semad/test-ac-tags": "warn"
  }
}
```

## Phase 4: CI/CD Integration (Week 4)

### Step 4.1: Add GitHub Actions
Copy `.github/workflows/coverage-validation.yml` to your project

### Step 4.2: Configure Coverage Thresholds
Update `.bmad-config.yaml`:
```yaml
agentSettings:
  pm:
    coverageThreshold: 80  # Start conservative
  qa:
    minTestCoverage: 70  # Start conservative
```

### Step 4.3: Add Pre-commit Hooks
```bash
cp .husky/prepare-commit-msg-traceability .husky/prepare-commit-msg
chmod +x .husky/prepare-commit-msg
```

## Phase 5: Rollout & Enforcement

### Step 5.1: Team Training
1. Share this guide with the team
2. Demo the coverage validation workflow
3. Show how to use auto-split for story generation

### Step 5.2: Gradual Enforcement
```yaml
# Week 1-2: Warning only
features:
  coverageValidation:
    enforceInCI: false  # Just warn

# Week 3-4: Enforce for new code
features:
  coverageValidation:
    enforceInCI: true
    threshold: 80

# Week 5+: Full enforcement
features:
  coverageValidation:
    enforceInCI: true
    threshold: 100
```

### Step 5.3: Create Coverage Ignore List
For legacy code that shouldn't be tracked:
```json
// .ai/coverage-ignore.json
{
  "features": ["FEAT-legacy-auth"],
  "stories": ["ST-deprecated-001"],
  "tests": ["AC-old-feature-1"]
}
```

## Automation Scripts

### Bulk Feature ID Addition
```javascript
// scripts/add-feature-ids.js
const fs = require('fs');
const path = require('path');

// Read PRD
const prd = fs.readFileSync('docs/prd/PRD.md', 'utf8');

// Extract requirements
const requirements = prd.match(/FR\d+:.*/g) || [];

// Generate feature IDs
requirements.forEach((req, idx) => {
  const slug = req.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
  console.log(`- id: FEAT-${slug}`);
  console.log(`  title: ${req}`);
  console.log(`  acceptanceCriteria: []`);
});
```

### Bulk Story Annotation
```bash
# Find all files modified in a story branch
git diff main --name-only | while read file; do
  if [[ "$file" == *.js ]]; then
    # Add annotation at top of file
    sed -i '1i// FEAT: FEAT-XXX | STORY: ST-XXX' "$file"
  fi
done
```

## Validation Checklist

- [ ] All PRD features have FEAT-* IDs
- [ ] All acceptance criteria have AC-* IDs
- [ ] All epics have featureId field
- [ ] All stories have featureId and acceptanceCriteriaCovered
- [ ] Implementation files have FEAT/STORY annotations
- [ ] Test files have AC-* tags
- [ ] Coverage validation passes at threshold
- [ ] CI/CD workflow is active
- [ ] Team is trained on new workflow

## Troubleshooting

### Problem: Coverage score is low
**Solution**: Run `sm: *brownfield-create-epic --auto-split --max-stories -1`

### Problem: Too many false positives
**Solution**: Update `.ai/coverage-ignore.json` with legacy patterns

### Problem: Annotation burden too high
**Solution**: Use commit hooks and batch annotation scripts

### Problem: Stories being over-split
**Solution**: Adjust `--complexity-budget` parameter (default 5)

## Success Metrics

Track these weekly:
- Coverage percentage trend
- Number of orphan stories/features
- CI build success rate
- Time to identify coverage gaps
- Developer feedback score

## Support

- Documentation: `docs/traceability-guide.md`
- Coverage Reports: `.ai/reports/feature-coverage.md`
- Validation: `npm run validate:coverage`
- Help: `/pm *validate-feature-coverage`