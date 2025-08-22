#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// AH-002: Task Bundle Manifest & Deterministic Context Assembly
async function execute() {
  console.log('[AH-002] Implementing Task Bundle and Context Assembly...');
  
  const contextDir = path.join(__dirname, '..', '..', '..', 'tools', 'context');
  await fs.mkdir(contextDir, { recursive: true });
  
  // Create build-task-bundle.js
  const buildTaskBundleScript = `#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

async function computeChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function readStoryContract(storyId) {
  const storiesDir = path.join(__dirname, '..', '..', 'docs', 'stories');
  const files = await fs.readdir(storiesDir);
  
  for (const file of files) {
    if (file.includes(storyId)) {
      const content = await fs.readFile(path.join(storiesDir, file), 'utf-8');
      const match = content.match(/^---\\n(StoryContract:[\\s\\S]*?)\\n---/m);
      if (match) {
        return yaml.load(match[1]);
      }
    }
  }
  
  // Check agentic-hardening subdirectory
  const ahDir = path.join(storiesDir, 'agentic-hardening');
  if (await fs.stat(ahDir).catch(() => false)) {
    const ahFiles = await fs.readdir(ahDir);
    for (const file of ahFiles) {
      if (file.includes(storyId)) {
        const content = await fs.readFile(path.join(ahDir, file), 'utf-8');
        const match = content.match(/^---\\n(StoryContract:[\\s\\S]*?)\\n---/m);
        if (match) {
          return yaml.load(match[1]);
        }
      }
    }
  }
  
  throw new Error(\`Story contract not found for \${storyId}\`);
}

async function gatherArtifacts(storyContract) {
  const artifacts = [];
  
  // Check for PRD
  const prdPath = path.join(__dirname, '..', '..', 'docs', 'prd', 'PRD.md');
  if (await fs.stat(prdPath).catch(() => false)) {
    const content = await fs.readFile(prdPath, 'utf-8');
    artifacts.push({
      type: 'prd',
      path: 'docs/prd/PRD.md',
      version: '1.0.0', // Extract from frontmatter if available
      checksum: await computeChecksum(content)
    });
  }
  
  // Check for architecture docs
  const archDir = path.join(__dirname, '..', '..', 'docs', 'architecture');
  if (await fs.stat(archDir).catch(() => false)) {
    const archFiles = await fs.readdir(archDir);
    for (const file of archFiles) {
      if (file.endsWith('.md')) {
        const content = await fs.readFile(path.join(archDir, file), 'utf-8');
        artifacts.push({
          type: 'architecture',
          path: \`docs/architecture/\${file}\`,
          version: '1.0.0',
          checksum: await computeChecksum(content)
        });
      }
    }
  }
  
  // Add linked artifacts from story contract
  if (storyContract.StoryContract?.linkedArtifacts) {
    for (const artifact of storyContract.StoryContract.linkedArtifacts) {
      artifacts.push(artifact);
    }
  }
  
  return artifacts;
}

async function resolveFiles(storyContract) {
  const files = [];
  
  if (storyContract.StoryContract?.filesToModify) {
    for (const fileInfo of storyContract.StoryContract.filesToModify) {
      const filePath = path.join(__dirname, '..', '..', fileInfo.path);
      
      // Check if file exists
      const exists = await fs.stat(filePath).catch(() => false);
      
      if (exists) {
        const content = await fs.readFile(filePath, 'utf-8');
        files.push({
          path: fileInfo.path,
          checksum: await computeChecksum(content),
          exists: true
        });
      } else {
        files.push({
          path: fileInfo.path,
          checksum: null,
          exists: false
        });
      }
    }
  }
  
  return files;
}

async function resolveTests(storyContract) {
  const tests = [];
  
  // Look for test files related to the story
  const storyId = storyContract.StoryContract?.story_id;
  if (storyId) {
    // Common test directories
    const testDirs = ['tests', 'test', '__tests__', 'spec'];
    
    for (const dir of testDirs) {
      const testPath = path.join(__dirname, '..', '..', dir);
      if (await fs.stat(testPath).catch(() => false)) {
        const files = await fs.readdir(testPath);
        for (const file of files) {
          if (file.includes(storyId) || file.includes('test')) {
            tests.push(\`\${dir}/\${file}\`);
          }
        }
      }
    }
  }
  
  return tests;
}

async function buildTaskBundle(storyId) {
  console.log(\`Building task bundle for \${storyId}...\`);
  
  try {
    // Read story contract
    const storyContract = await readStoryContract(storyId);
    
    // Gather all components
    const artifacts = await gatherArtifacts(storyContract);
    const files = await resolveFiles(storyContract);
    const tests = await resolveTests(storyContract);
    
    // Create bundle
    const bundle = {
      id: \`bundle-\${storyId}-\${Date.now()}\`,
      storyId,
      version: '1.0.0',
      schemaVersion: '1.0',
      artifactRefs: artifacts,
      files,
      tests,
      createdAt: new Date().toISOString(),
      checksum: ''
    };
    
    // Compute overall checksum
    const bundleContent = JSON.stringify(bundle);
    bundle.checksum = await computeChecksum(bundleContent);
    
    // Save bundle
    const bundlesDir = path.join(__dirname, '..', '..', '.ai', 'bundles');
    await fs.mkdir(bundlesDir, { recursive: true });
    
    const bundlePath = path.join(bundlesDir, \`\${storyId}.bundle.json\`);
    await fs.writeFile(bundlePath, JSON.stringify(bundle, null, 2));
    
    console.log(\`✓ Bundle created: \${bundlePath}\`);
    
    // Check for invalidation
    await checkInvalidation(storyId, bundle);
    
    return bundle;
    
  } catch (error) {
    console.error(\`Failed to build bundle for \${storyId}: \${error.message}\`);
    throw error;
  }
}

async function checkInvalidation(storyId, newBundle) {
  const bundlesDir = path.join(__dirname, '..', '..', '.ai', 'bundles');
  const oldBundlePath = path.join(bundlesDir, \`\${storyId}.bundle.old.json\`);
  
  try {
    const oldBundle = JSON.parse(await fs.readFile(oldBundlePath, 'utf-8'));
    
    // Compare checksums
    const invalidations = [];
    
    for (const newArtifact of newBundle.artifactRefs) {
      const oldArtifact = oldBundle.artifactRefs.find(a => a.path === newArtifact.path);
      if (oldArtifact && oldArtifact.checksum !== newArtifact.checksum) {
        invalidations.push({
          path: newArtifact.path,
          reason: 'checksum_mismatch',
          old: oldArtifact.checksum,
          new: newArtifact.checksum
        });
      }
    }
    
    if (invalidations.length > 0) {
      newBundle.invalidatedAt = new Date().toISOString();
      newBundle.invalidationReasons = invalidations;
      
      console.log(\`⚠ Bundle invalidated due to \${invalidations.length} changes\`);
      
      // Save current as old for next comparison
      await fs.rename(
        path.join(bundlesDir, \`\${storyId}.bundle.json\`),
        oldBundlePath
      );
    }
    
  } catch (error) {
    // No old bundle exists, save current for future comparison
    const currentPath = path.join(bundlesDir, \`\${storyId}.bundle.json\`);
    if (await fs.stat(currentPath).catch(() => false)) {
      await fs.copyFile(currentPath, oldBundlePath);
    }
  }
}

// Main execution
if (require.main === module) {
  const storyId = process.argv[2];
  
  if (!storyId) {
    console.error('Usage: npm run context:bundle -- <storyId>');
    process.exit(1);
  }
  
  buildTaskBundle(storyId).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { buildTaskBundle, readStoryContract };
`;
  
  await fs.writeFile(
    path.join(contextDir, 'build-task-bundle.js'),
    buildTaskBundleScript
  );
  
  // Create index-artifacts.js
  const indexArtifactsScript = `#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

async function indexDirectory(dirPath, baseDir = '') {
  const index = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.join(baseDir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        
        // Recursively index subdirectories
        const subIndex = await indexDirectory(fullPath, relativePath);
        index.push(...subIndex);
        
      } else if (entry.isFile()) {
        // Index relevant file types
        const ext = path.extname(entry.name);
        const relevantExts = ['.js', '.ts', '.jsx', '.tsx', '.md', '.yaml', '.yml', '.json'];
        
        if (relevantExts.includes(ext)) {
          const content = await fs.readFile(fullPath, 'utf-8');
          const checksum = crypto.createHash('sha256').update(content).digest('hex');
          
          // Extract symbols for code files
          const symbols = extractSymbols(content, ext);
          
          index.push({
            path: relativePath,
            type: ext.substring(1),
            size: content.length,
            checksum,
            symbols,
            indexed: new Date().toISOString()
          });
        }
      }
    }
    
  } catch (error) {
    console.error(\`Error indexing \${dirPath}: \${error.message}\`);
  }
  
  return index;
}

function extractSymbols(content, extension) {
  const symbols = {
    functions: [],
    classes: [],
    exports: [],
    imports: []
  };
  
  if (['.js', '.ts', '.jsx', '.tsx'].includes(extension)) {
    // Extract function names
    const functionRegex = /(?:function|const|let|var)\\s+(\\w+)\\s*(?:=\\s*)?(?:\\([^)]*\\)\\s*=>|function)/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      symbols.functions.push(match[1]);
    }
    
    // Extract class names
    const classRegex = /class\\s+(\\w+)/g;
    while ((match = classRegex.exec(content)) !== null) {
      symbols.classes.push(match[1]);
    }
    
    // Extract exports
    const exportRegex = /export\\s+(?:default\\s+)?(\\w+)|export\\s*{([^}]+)}/g;
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) {
        symbols.exports.push(match[1]);
      } else if (match[2]) {
        symbols.exports.push(...match[2].split(',').map(e => e.trim()));
      }
    }
    
    // Extract imports
    const importRegex = /import\\s+(?:{([^}]+)}|([\\w*]+))\\s+from/g;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        symbols.imports.push(...match[1].split(',').map(i => i.trim()));
      } else if (match[2]) {
        symbols.imports.push(match[2]);
      }
    }
  }
  
  return symbols;
}

async function buildIndex() {
  console.log('Building artifact index...');
  
  const projectRoot = path.join(__dirname, '..', '..');
  const index = [];
  
  // Index key directories
  const dirsToIndex = [
    'bmad-core',
    'docs',
    'tools',
    'scripts'
  ];
  
  for (const dir of dirsToIndex) {
    const dirPath = path.join(projectRoot, dir);
    if (await fs.stat(dirPath).catch(() => false)) {
      console.log(\`Indexing \${dir}...\`);
      const dirIndex = await indexDirectory(dirPath, dir);
      index.push(...dirIndex);
    }
  }
  
  // Save index
  const indexDir = path.join(projectRoot, '.ai', 'index');
  await fs.mkdir(indexDir, { recursive: true });
  
  const indexPath = path.join(indexDir, 'artifacts.index.json');
  await fs.writeFile(indexPath, JSON.stringify({
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    totalFiles: index.length,
    files: index
  }, null, 2));
  
  console.log(\`✓ Index created with \${index.length} files: \${indexPath}\`);
  
  // Create symbol map for quick lookups
  const symbolMap = {};
  
  for (const file of index) {
    if (file.symbols) {
      for (const func of file.symbols.functions) {
        symbolMap[func] = symbolMap[func] || [];
        symbolMap[func].push(file.path);
      }
      for (const cls of file.symbols.classes) {
        symbolMap[cls] = symbolMap[cls] || [];
        symbolMap[cls].push(file.path);
      }
    }
  }
  
  const symbolMapPath = path.join(indexDir, 'symbols.map.json');
  await fs.writeFile(symbolMapPath, JSON.stringify(symbolMap, null, 2));
  
  console.log(\`✓ Symbol map created: \${symbolMapPath}\`);
}

// Main execution
if (require.main === module) {
  buildIndex().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { buildIndex, indexDirectory };
`;
  
  await fs.writeFile(
    path.join(contextDir, 'index-artifacts.js'),
    indexArtifactsScript
  );
  
  // Update package.json
  const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
  
  packageJson.scripts['context:bundle'] = 'node tools/context/build-task-bundle.js';
  packageJson.scripts['context:index'] = 'node tools/context/index-artifacts.js';
  
  // Ensure js-yaml is in dependencies
  packageJson.dependencies = packageJson.dependencies || {};
  if (!packageJson.dependencies['js-yaml']) {
    packageJson.dependencies['js-yaml'] = '^4.1.0';
  }
  
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
  
  // Update workflow-orchestrator.md
  const orchestratorDocPath = path.join(__dirname, '..', '..', '..', 'docs', 'workflow-orchestrator.md');
  const orchestratorDoc = await fs.readFile(orchestratorDocPath, 'utf-8');
  
  const bundleSection = `

## Task Bundle Lifecycle

Task bundles provide deterministic context assembly for story execution:

### Bundle Creation
1. Run \`npm run context:bundle -- <storyId>\` to create a bundle
2. Bundle includes:
   - Linked artifacts (PRD, Architecture, etc.) with versions and checksums
   - Files to be modified with current checksums
   - Related test files
   - Overall bundle checksum

### Bundle Invalidation
Bundles are automatically invalidated when:
- Any linked artifact version changes
- File checksums don't match
- New dependencies are added to the story

### Bundle Usage
1. Dev agents read bundles to understand context
2. QA agents verify bundle completeness
3. Orchestrator gates check bundle validity

### Commands
- \`npm run context:index\` - Build artifact index
- \`npm run context:bundle -- <storyId>\` - Create/update task bundle
`;
  
  if (!orchestratorDoc.includes('## Task Bundle Lifecycle')) {
    await fs.writeFile(orchestratorDocPath, orchestratorDoc + bundleSection);
  }
  
  // Create progress tracking
  const progressDir = path.join(__dirname, '..', '..', '..', '.ai', 'progress');
  await fs.mkdir(progressDir, { recursive: true });
  
  console.log('[AH-002] ✓ Implemented Task Bundle and Context Assembly system');
}

module.exports = { execute };