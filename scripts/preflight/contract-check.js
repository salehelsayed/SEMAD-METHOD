#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

async function checkStoryContract(storyPath) {
  try {
    const content = await fs.readFile(storyPath, 'utf-8');
    const match = content.match(/^---\n(StoryContract:[\s\S]*?)\n---/m);
    
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
        error: `Missing required fields: ${missing.join(', ')}` 
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
      error: `Failed to parse contract: ${error.message}` 
    };
  }
}

async function runContractCheck() {
  console.log('Checking story contracts...');
  
  const storiesDir = path.join(__dirname, '..', '..', 'docs', 'stories');
  const storyFilter = process.env.STORY_ID || process.argv[2];
  const results = [];
  
  // Helper to maybe include a file by filter
  async function maybeCheck(filePath, displayName) {
    if (storyFilter && !displayName.includes(storyFilter)) return;
    const result = await checkStoryContract(filePath);
    results.push({ file: displayName, ...result });
  }
  
  // Check main stories directory
  if (await fs.stat(storiesDir).catch(() => false)) {
    const files = await fs.readdir(storiesDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        await maybeCheck(path.join(storiesDir, file), file);
      }
    }
  }
  
  // Check agentic-hardening subdirectory
  const ahDir = path.join(storiesDir, 'agentic-hardening');
  if (await fs.stat(ahDir).catch(() => false)) {
    const ahFiles = await fs.readdir(ahDir);
    for (const file of ahFiles) {
      if (file.endsWith('.md')) {
        await maybeCheck(path.join(ahDir, file), `agentic-hardening/${file}`);
      }
    }
  }
  
  // Report results
  const failures = results.filter(r => !r.success);
  
  console.log(`Checked ${results.length} story files`);
  console.log(`✓ ${results.filter(r => r.success).length} valid`);
  
  if (failures.length > 0) {
    console.error(`✗ ${failures.length} invalid:`);
    failures.forEach(f => {
      console.error(`  - ${f.file}: ${f.error}`);
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
