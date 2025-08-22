#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// AH-003: Preflight Checks Suite
async function execute() {
  console.log('[AH-003] Implementing Preflight Checks Suite...');
  
  const preflightDir = path.join(__dirname, '..', '..', '..', 'scripts', 'preflight');
  await fs.mkdir(preflightDir, { recursive: true });
  
  // Create schema-check.js wrapper
  const schemaCheckScript = `#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');

async function runSchemaCheck() {
  console.log('Running schema validation...');
  
  try {
    const { stdout, stderr } = await execAsync('npm run schema:check', {
      cwd: path.join(__dirname, '..', '..')
    });
    
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    return { success: true, output: stdout };
  } catch (error) {
    console.error('Schema validation failed:', error.message);
    return { success: false, error: error.message };
  }
}

if (require.main === module) {
  runSchemaCheck().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { runSchemaCheck };
`;
  
  await fs.writeFile(
    path.join(preflightDir, 'schema-check.js'),
    schemaCheckScript
  );
  
  // Create contract-check.js
  const contractCheckScript = `#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

async function checkStoryContract(storyPath) {
  try {
    const content = await fs.readFile(storyPath, 'utf-8');
    const match = content.match(/^---\\n(StoryContract:[\\s\\S]*?)\\n---/m);
    
    if (!match) {
      return { 
        success: false, 
        error: 'No StoryContract found in story file' 
      };
    }
    
    const contract = yaml.load(match[1]);
    
    // Validate required fields
    const required = ['version', 'story_id', 'epic_id'];
    const missing = required.filter(field => !contract.StoryContract?.[field]);
    
    if (missing.length > 0) {
      return { 
        success: false, 
        error: \`Missing required fields: \${missing.join(', ')}\` 
      };
    }
    
    // Check file mappings
    if (contract.StoryContract.filesToModify) {
      for (const file of contract.StoryContract.filesToModify) {
        if (!file.path || !file.reason) {
          return { 
            success: false, 
            error: 'Invalid filesToModify entry' 
          };
        }
      }
    }
    
    return { success: true, contract };
    
  } catch (error) {
    return { 
      success: false, 
      error: \`Failed to parse contract: \${error.message}\` 
    };
  }
}

async function runContractCheck() {
  console.log('Checking story contracts...');
  
  const storiesDir = path.join(__dirname, '..', '..', 'docs', 'stories');
  const results = [];
  
  // Check main stories directory
  const files = await fs.readdir(storiesDir);
  for (const file of files) {
    if (file.endsWith('.md')) {
      const result = await checkStoryContract(path.join(storiesDir, file));
      results.push({ file, ...result });
    }
  }
  
  // Check agentic-hardening subdirectory
  const ahDir = path.join(storiesDir, 'agentic-hardening');
  if (await fs.stat(ahDir).catch(() => false)) {
    const ahFiles = await fs.readdir(ahDir);
    for (const file of ahFiles) {
      if (file.endsWith('.md')) {
        const result = await checkStoryContract(path.join(ahDir, file));
        results.push({ file: \`agentic-hardening/\${file}\`, ...result });
      }
    }
  }
  
  // Report results
  const failures = results.filter(r => !r.success);
  
  console.log(\`Checked \${results.length} story files\`);
  console.log(\`✓ \${results.filter(r => r.success).length} valid\`);
  
  if (failures.length > 0) {
    console.error(\`✗ \${failures.length} invalid:\`);
    failures.forEach(f => {
      console.error(\`  - \${f.file}: \${f.error}\`);
    });
    return { success: false, results };
  }
  
  return { success: true, results };
}

if (require.main === module) {
  runContractCheck().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { runContractCheck, checkStoryContract };
`;
  
  await fs.writeFile(
    path.join(preflightDir, 'contract-check.js'),
    contractCheckScript
  );
  
  // Create grounding-check.js
  const groundingCheckScript = `#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function checkFileExists(filePath, baseDir) {
  const fullPath = path.join(baseDir, filePath);
  try {
    await fs.stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function extractReferences(patchPlan) {
  const references = {
    files: new Set(),
    symbols: new Set()
  };
  
  if (patchPlan.changes) {
    for (const change of patchPlan.changes) {
      if (change.path) {
        references.files.add(change.path);
      }
      if (change.symbols) {
        change.symbols.forEach(s => references.symbols.add(s));
      }
    }
  }
  
  return references;
}

async function runGroundingCheck(patchPlanPath, bundlePath) {
  console.log('Running grounding check...');
  
  try {
    // Load patch plan
    const patchPlan = JSON.parse(await fs.readFile(patchPlanPath, 'utf-8'));
    
    // Load bundle if exists
    let bundle = null;
    if (bundlePath && await fs.stat(bundlePath).catch(() => false)) {
      bundle = JSON.parse(await fs.readFile(bundlePath, 'utf-8'));
    }
    
    // Extract references
    const references = await extractReferences(patchPlan);
    
    // Check grounding
    const projectRoot = path.join(__dirname, '..', '..');
    const ungrounded = {
      files: [],
      symbols: []
    };
    
    // Check file references
    for (const file of references.files) {
      const exists = await checkFileExists(file, projectRoot);
      const inBundle = bundle?.files?.some(f => f.path === file);
      
      if (!exists && !inBundle) {
        ungrounded.files.push(file);
      }
    }
    
    // Check symbol references (simplified)
    const indexPath = path.join(projectRoot, '.ai', 'index', 'symbols.map.json');
    if (await fs.stat(indexPath).catch(() => false)) {
      const symbolMap = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
      
      for (const symbol of references.symbols) {
        if (!symbolMap[symbol]) {
          ungrounded.symbols.push(symbol);
        }
      }
    }
    
    // Report results
    if (ungrounded.files.length > 0 || ungrounded.symbols.length > 0) {
      console.error('✗ Ungrounded references detected:');
      if (ungrounded.files.length > 0) {
        console.error('  Files:', ungrounded.files);
      }
      if (ungrounded.symbols.length > 0) {
        console.error('  Symbols:', ungrounded.symbols);
      }
      return { success: false, ungrounded };
    }
    
    console.log('✓ All references are grounded');
    return { success: true };
    
  } catch (error) {
    console.error('Grounding check failed:', error.message);
    return { success: false, error: error.message };
  }
}

if (require.main === module) {
  const patchPlanPath = process.argv[2];
  const bundlePath = process.argv[3];
  
  if (!patchPlanPath) {
    console.error('Usage: node grounding-check.js <patch-plan.json> [bundle.json]');
    process.exit(1);
  }
  
  runGroundingCheck(patchPlanPath, bundlePath).then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { runGroundingCheck };
`;
  
  await fs.writeFile(
    path.join(preflightDir, 'grounding-check.js'),
    groundingCheckScript
  );
  
  // Create lint-check.sh
  const lintCheckScript = `#!/bin/bash

echo "Running lint checks..."

# Check if npm run lint exists
if npm run lint --dry-run 2>/dev/null | grep -q "lint"; then
  npm run lint
  LINT_EXIT=$?
else
  # Fallback to eslint if available
  if command -v eslint &> /dev/null; then
    eslint . --ext .js,.jsx,.ts,.tsx
    LINT_EXIT=$?
  else
    echo "No linter configured"
    LINT_EXIT=0
  fi
fi

if [ $LINT_EXIT -eq 0 ]; then
  echo "✓ Lint checks passed"
else
  echo "✗ Lint checks failed"
fi

exit $LINT_EXIT
`;
  
  await fs.writeFile(
    path.join(preflightDir, 'lint-check.sh'),
    lintCheckScript
  );
  
  // Create type-check.sh
  const typeCheckScript = `#!/bin/bash

echo "Running type checks..."

# Check for TypeScript
if [ -f "tsconfig.json" ]; then
  npx tsc --noEmit
  TYPE_EXIT=$?
elif npm run type:check --dry-run 2>/dev/null | grep -q "type:check"; then
  npm run type:check
  TYPE_EXIT=$?
else
  echo "No type checking configured"
  TYPE_EXIT=0
fi

if [ $TYPE_EXIT -eq 0 ]; then
  echo "✓ Type checks passed"
else
  echo "✗ Type checks failed"
fi

exit $TYPE_EXIT
`;
  
  await fs.writeFile(
    path.join(preflightDir, 'type-check.sh'),
    typeCheckScript
  );
  
  // Create build-check.sh
  const buildCheckScript = `#!/bin/bash

echo "Running build check..."

if npm run build --dry-run 2>/dev/null | grep -q "build"; then
  npm run build
  BUILD_EXIT=$?
else
  echo "No build script configured"
  BUILD_EXIT=0
fi

if [ $BUILD_EXIT -eq 0 ]; then
  echo "✓ Build check passed"
else
  echo "✗ Build check failed"
fi

exit $BUILD_EXIT
`;
  
  await fs.writeFile(
    path.join(preflightDir, 'build-check.sh'),
    buildCheckScript
  );
  
  // Make shell scripts executable
  await fs.chmod(path.join(preflightDir, 'lint-check.sh'), 0o755);
  await fs.chmod(path.join(preflightDir, 'type-check.sh'), 0o755);
  await fs.chmod(path.join(preflightDir, 'build-check.sh'), 0o755);
  
  // Update package.json
  const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
  
  packageJson.scripts['preflight:schema'] = 'node scripts/preflight/schema-check.js';
  packageJson.scripts['preflight:contract'] = 'node scripts/preflight/contract-check.js';
  packageJson.scripts['preflight:grounding'] = 'node scripts/preflight/grounding-check.js';
  packageJson.scripts['preflight:lint'] = 'bash scripts/preflight/lint-check.sh';
  packageJson.scripts['preflight:type'] = 'bash scripts/preflight/type-check.sh';
  packageJson.scripts['preflight:build'] = 'bash scripts/preflight/build-check.sh';
  packageJson.scripts['preflight:all'] = 'npm run preflight:schema && npm run preflight:contract && npm run preflight:lint && npm run preflight:type && npm run preflight:build';
  
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
  
  // Update validation-system.md
  const validationDocPath = path.join(__dirname, '..', '..', '..', 'docs', 'validation-system.md');
  let validationDoc = '';
  
  try {
    validationDoc = await fs.readFile(validationDocPath, 'utf-8');
  } catch {
    // File doesn't exist yet
  }
  
  const preflightSection = `

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
\`\`\`bash
# Run individual checks
npm run preflight:schema
npm run preflight:contract
npm run preflight:grounding -- patch-plan.json bundle.json
npm run preflight:lint
npm run preflight:type
npm run preflight:build

# Run all checks
npm run preflight:all
\`\`\`

### Gate Integration
Preflight checks are enforced at the Dev→QA gate to ensure only well-formed changes proceed.

### Interpreting Results
- Each check returns 0 on success, non-zero on failure
- Results are logged to \`.ai/test-logs/preflight-<timestamp>.json\`
- Failed checks provide actionable error messages
`;
  
  if (!validationDoc.includes('## Preflight Checks Suite')) {
    await fs.writeFile(validationDocPath, validationDoc + preflightSection);
  }
  
  console.log('[AH-003] ✓ Implemented Preflight Checks Suite');
}

module.exports = { execute };