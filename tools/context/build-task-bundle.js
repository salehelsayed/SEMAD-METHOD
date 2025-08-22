#!/usr/bin/env node

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
      const match = content.match(/^---\n(StoryContract:[\s\S]*?)\n---/m);
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
        const match = content.match(/^---\n(StoryContract:[\s\S]*?)\n---/m);
        if (match) {
          return yaml.load(match[1]);
        }
      }
    }
  }
  
  throw new Error(`Story contract not found for ${storyId}`);
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
          path: `docs/architecture/${file}`,
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
            tests.push(`${dir}/${file}`);
          }
        }
      }
    }
  }
  
  return tests;
}

async function buildTaskBundle(storyId) {
  console.log(`Building task bundle for ${storyId}...`);
  
  try {
    // Read story contract
    const storyContract = await readStoryContract(storyId);
    
    // Gather all components
    const artifacts = await gatherArtifacts(storyContract);
    const files = await resolveFiles(storyContract);
    const tests = await resolveTests(storyContract);
    
    // Create bundle
    const bundle = {
      id: `bundle-${storyId}-${Date.now()}`,
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
    
    const bundlePath = path.join(bundlesDir, `${storyId}.bundle.json`);
    await fs.writeFile(bundlePath, JSON.stringify(bundle, null, 2));
    
    console.log(`✓ Bundle created: ${bundlePath}`);
    
    // Check for invalidation
    await checkInvalidation(storyId, bundle);
    
    return bundle;
    
  } catch (error) {
    console.error(`Failed to build bundle for ${storyId}: ${error.message}`);
    throw error;
  }
}

async function checkInvalidation(storyId, newBundle) {
  const bundlesDir = path.join(__dirname, '..', '..', '.ai', 'bundles');
  const oldBundlePath = path.join(bundlesDir, `${storyId}.bundle.old.json`);
  
  try {
    const oldBundle = JSON.parse(await fs.readFile(oldBundlePath, 'utf-8'));
    
    // Compare checksums for all artifacts
    const invalidations = [];
    
    // Check artifact changes
    for (const newArtifact of newBundle.artifactRefs) {
      const oldArtifact = oldBundle.artifactRefs.find(a => a.path === newArtifact.path);
      if (oldArtifact) {
        if (oldArtifact.checksum !== newArtifact.checksum) {
          invalidations.push({
            type: 'artifact',
            path: newArtifact.path,
            reason: 'checksum_mismatch',
            old: oldArtifact.checksum,
            new: newArtifact.checksum
          });
        }
        if (oldArtifact.version !== newArtifact.version) {
          invalidations.push({
            type: 'artifact',
            path: newArtifact.path,
            reason: 'version_change',
            old: oldArtifact.version,
            new: newArtifact.version
          });
        }
      }
    }
    
    // Check file changes
    for (const newFile of newBundle.files) {
      const oldFile = oldBundle.files.find(f => f.path === newFile.path);
      if (oldFile && oldFile.checksum !== newFile.checksum) {
        invalidations.push({
          type: 'file',
          path: newFile.path,
          reason: 'file_modified',
          old: oldFile.checksum,
          new: newFile.checksum
        });
      }
    }
    
    if (invalidations.length > 0) {
      newBundle.invalidatedAt = new Date().toISOString();
      newBundle.invalidationReasons = invalidations;
      newBundle.previousVersion = oldBundle.id;
      
      console.log(`⚠ Bundle invalidated: ${invalidations.length} changes detected`);
      invalidations.forEach(inv => {
        console.log(`  - ${inv.type} ${inv.path}: ${inv.reason}`);
      });
      
      // Write invalidation record
      const invalidationLog = path.join(bundlesDir, 'invalidations.log');
      const logEntry = {
        timestamp: new Date().toISOString(),
        storyId,
        bundleId: newBundle.id,
        invalidations
      };
      
      let logs = [];
      try {
        logs = JSON.parse(await fs.readFile(invalidationLog, 'utf-8'));
      } catch {
        // File doesn't exist yet
      }
      logs.push(logEntry);
      await fs.writeFile(invalidationLog, JSON.stringify(logs, null, 2));
    }
    
    // Always save current as old for next comparison
    const currentPath = path.join(bundlesDir, `${storyId}.bundle.json`);
    await fs.writeFile(currentPath, JSON.stringify(newBundle, null, 2));
    await fs.copyFile(currentPath, oldBundlePath);
    
  } catch (error) {
    // No old bundle exists, save current for future comparison
    const currentPath = path.join(bundlesDir, `${storyId}.bundle.json`);
    await fs.writeFile(currentPath, JSON.stringify(newBundle, null, 2));
    await fs.copyFile(currentPath, oldBundlePath);
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
